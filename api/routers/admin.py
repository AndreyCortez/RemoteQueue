"""
Superadmin Portal — internal management API.
All routes require a JWT with role='superadmin' via x-tenant-token header.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import func
from passlib.context import CryptContext
from datetime import timedelta, datetime, timezone, date
from pydantic import BaseModel
from typing import Optional
import redis as redis_lib

from api.dependencies.security import get_current_admin_user_id, create_access_token
from api.database.postgres import get_db
from api.database.models import Tenant, B2BUser, QueueConfig, QueueEntry, AdminAuditLog
from api.database.redis import get_redis_client
from api.config import settings

router = APIRouter(prefix="/api/v1/admin", tags=["Superadmin"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ── Rate limiting helpers ─────────────────────────────────────────────────────

_RATE_LIMIT_WINDOW = 600   # 10 minutes
_RATE_LIMIT_MAX = 5


def _check_rate_limit(client: redis_lib.Redis, ip: str) -> None:
    key = f"admin_login_attempts:{ip}"
    count = client.incr(key)
    if count == 1:
        client.expire(key, _RATE_LIMIT_WINDOW)
    if count > _RATE_LIMIT_MAX:
        ttl = client.ttl(key)
        raise HTTPException(
            status_code=429,
            detail=f"Too many login attempts. Try again in {ttl}s."
        )


# ── Auth ──────────────────────────────────────────────────────────────────────

@router.post("/auth/login")
def admin_login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
    client=Depends(get_redis_client),
):
    """Superadmin-exclusive login. Rate-limited to 5 attempts / 10 min per IP."""
    client_ip = request.headers.get("X-Forwarded-For", request.client.host or "unknown").split(",")[0].strip()
    _check_rate_limit(client, client_ip)

    user = db.query(B2BUser).filter(
        B2BUser.email == form_data.username,
        B2BUser.is_superadmin == True,  # noqa: E712
    ).first()
    if not user or not pwd_context.verify(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect credentials or insufficient privileges")

    token = create_access_token(
        data={"user_id": user.id, "tenant_id": user.tenant_id, "role": "superadmin"},
        expires_delta=timedelta(hours=8),
    )
    return {"access_token": token, "token_type": "bearer"}


# ── Pydantic models ───────────────────────────────────────────────────────────

class CreateTenantRequest(BaseModel):
    name: str
    operator_email: str
    operator_password: str


class UpdateTenantRequest(BaseModel):
    name: Optional[str] = None


# ── Audit helper ──────────────────────────────────────────────────────────────

def _audit(db: Session, admin_id: str, action: str, tenant_id: str | None, detail: str | None = None):
    db.add(AdminAuditLog(
        admin_user_id=admin_id,
        action=action,
        target_tenant_id=tenant_id,
        detail=detail,
    ))
    db.commit()


# ── Tenant helpers ────────────────────────────────────────────────────────────

def _tenant_summary(tenant: Tenant, db: Session, redis_client) -> dict:
    """Builds the summary dict used in list responses."""
    from api.database.redis import QueueManager
    mgr = QueueManager(redis_client)

    active_members = sum(
        mgr.get_queue_size(tenant.id, q.id)
        for q in tenant.queues
    )
    return {
        "id": tenant.id,
        "name": tenant.name,
        "is_suspended": tenant.is_suspended,
        "created_at": tenant.created_at.isoformat() if tenant.created_at else None,
        "queue_count": len(tenant.queues),
        "active_members": active_members,
    }


# ── 5B.2 Tenant CRUD ─────────────────────────────────────────────────────────

@router.get("/tenants")
def list_tenants(
    admin_id: str = Depends(get_current_admin_user_id),
    db: Session = Depends(get_db),
    client=Depends(get_redis_client),
):
    """Lists all tenants with basic metrics."""
    tenants = db.query(Tenant).order_by(Tenant.created_at.desc()).all()
    return {
        "tenants": [_tenant_summary(t, db, client) for t in tenants],
        "total": len(tenants),
    }


@router.get("/tenants/{tenant_id}")
def get_tenant(
    tenant_id: str,
    admin_id: str = Depends(get_current_admin_user_id),
    db: Session = Depends(get_db),
    client=Depends(get_redis_client),
):
    """Full tenant details: queues, branding and call activity for the last 30 days."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    from api.database.redis import QueueManager
    mgr = QueueManager(client)

    queues_info = []
    for q in tenant.queues:
        queues_info.append({
            "id": q.id,
            "name": q.name,
            "active_members": mgr.get_queue_size(tenant.id, q.id),
        })

    # Calls per day — last 30 days from QueueEntry
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=30)
    rows = (
        db.query(
            func.date(QueueEntry.called_at).label("day"),
            func.count(QueueEntry.id).label("count"),
        )
        .filter(
            QueueEntry.tenant_id == tenant_id,
            QueueEntry.status == "called",
            QueueEntry.called_at >= cutoff,
        )
        .group_by(func.date(QueueEntry.called_at))
        .order_by(func.date(QueueEntry.called_at))
        .all()
    )
    calls_per_day = [{"date": str(r.day), "count": r.count} for r in rows]

    return {
        **_tenant_summary(tenant, db, client),
        "branding": tenant.branding,
        "queues": queues_info,
        "calls_per_day": calls_per_day,
    }


@router.post("/tenants")
def create_tenant(
    body: CreateTenantRequest,
    admin_id: str = Depends(get_current_admin_user_id),
    db: Session = Depends(get_db),
):
    """Creates a new tenant and an initial operator user."""
    if db.query(B2BUser).filter(B2BUser.email == body.operator_email).first():
        raise HTTPException(status_code=409, detail="Email already in use")

    tenant = Tenant(name=body.name)
    db.add(tenant)
    db.flush()

    user = B2BUser(
        tenant_id=tenant.id,
        email=body.operator_email,
        hashed_password=pwd_context.hash(body.operator_password),
    )
    db.add(user)
    db.commit()
    db.refresh(tenant)

    _audit(db, admin_id, "create_tenant", tenant.id, f"Created with operator {body.operator_email}")
    return {"id": tenant.id, "name": tenant.name, "operator_email": body.operator_email}


@router.put("/tenants/{tenant_id}")
def update_tenant(
    tenant_id: str,
    body: UpdateTenantRequest,
    admin_id: str = Depends(get_current_admin_user_id),
    db: Session = Depends(get_db),
):
    """Edits tenant name."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if body.name:
        tenant.name = body.name
    db.commit()
    return {"id": tenant.id, "name": tenant.name}


@router.post("/tenants/{tenant_id}/suspend")
def suspend_tenant(
    tenant_id: str,
    admin_id: str = Depends(get_current_admin_user_id),
    db: Session = Depends(get_db),
):
    """Toggles the suspended flag. Audited action."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    tenant.is_suspended = not tenant.is_suspended
    db.commit()
    action = "suspend_tenant" if tenant.is_suspended else "reactivate_tenant"
    _audit(db, admin_id, action, tenant_id)
    return {"id": tenant_id, "is_suspended": tenant.is_suspended}


@router.delete("/tenants/{tenant_id}")
def delete_tenant(
    tenant_id: str,
    admin_id: str = Depends(get_current_admin_user_id),
    db: Session = Depends(get_db),
    client=Depends(get_redis_client),
):
    """Deletes tenant and all related data (Redis + Postgres). Audited action."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Clean Redis keys for all queues
    from api.database.redis import QueueManager
    mgr = QueueManager(client)
    for q in tenant.queues:
        key = mgr.get_queue_key(tenant_id, q.id)
        client.delete(key)
        client.delete(mgr._intervals_key(tenant_id, q.id))

    _audit(db, admin_id, "delete_tenant", tenant_id, f"Deleted tenant: {tenant.name}")
    db.delete(tenant)
    db.commit()
    return {"status": "deleted", "tenant_id": tenant_id}


# ── 5B.3 Global Stats ─────────────────────────────────────────────────────────

@router.get("/stats")
def global_stats(
    admin_id: str = Depends(get_current_admin_user_id),
    db: Session = Depends(get_db),
    client=Depends(get_redis_client),
):
    """Global dashboard numbers for the superadmin portal."""
    from api.database.redis import QueueManager
    mgr = QueueManager(client)

    tenants = db.query(Tenant).all()
    total = len(tenants)
    suspended = sum(1 for t in tenants if t.is_suspended)

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=now.weekday())
    month_start = today_start.replace(day=1)

    def _count_calls(since: datetime) -> int:
        return db.query(func.count(QueueEntry.id)).filter(
            QueueEntry.status == "called",
            QueueEntry.called_at >= since,
        ).scalar() or 0

    calls_today = _count_calls(today_start)
    calls_week = _count_calls(week_start)
    calls_month = _count_calls(month_start)

    # Top 10 tenants by call volume this month
    top_rows = (
        db.query(QueueEntry.tenant_id, func.count(QueueEntry.id).label("calls"))
        .filter(QueueEntry.status == "called", QueueEntry.called_at >= month_start)
        .group_by(QueueEntry.tenant_id)
        .order_by(func.count(QueueEntry.id).desc())
        .limit(10)
        .all()
    )
    tenant_names = {t.id: t.name for t in tenants}
    top_tenants = [
        {"tenant_id": r.tenant_id, "name": tenant_names.get(r.tenant_id, "?"), "calls_this_month": r.calls}
        for r in top_rows
    ]

    # Live busiest queues
    all_queues = db.query(QueueConfig).all()
    busiest = []
    for q in all_queues:
        size = mgr.get_queue_size(q.tenant_id, q.id)
        if size > 0:
            busiest.append({
                "queue_id": q.id,
                "queue_name": q.name,
                "tenant_name": tenant_names.get(q.tenant_id, "?"),
                "active_members": size,
            })
    busiest.sort(key=lambda x: x["active_members"], reverse=True)

    return {
        "total_tenants": total,
        "active_tenants": total - suspended,
        "suspended_tenants": suspended,
        "calls_today": calls_today,
        "calls_this_week": calls_week,
        "calls_this_month": calls_month,
        "top_tenants": top_tenants,
        "busiest_queues": busiest[:10],
    }
