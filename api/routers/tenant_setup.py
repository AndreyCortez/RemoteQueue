from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
import qrcode
import io

from api.database.postgres import get_db
from api.database.models import QueueConfig, Tenant
from api.dependencies.security import get_current_tenant_id
from api.schemas.form_schema import validate_form_schema

router = APIRouter(prefix="/api/v1/b2b/queues", tags=["B2B Queue Setup"])

class QueueConfigCreate(BaseModel):
    name: str
    form_schema: Dict[str, Any]
    qr_rotation_enabled: bool = False
    qr_rotation_interval: int = 300

class QueueConfigResponse(BaseModel):
    id: str
    name: str
    form_schema: Dict[str, Any]
    qr_rotation_enabled: bool
    qr_rotation_interval: int

class QueueConfigUpdate(BaseModel):
    name: Optional[str] = None
    form_schema: Optional[Dict[str, Any]] = None
    qr_rotation_enabled: Optional[bool] = None
    qr_rotation_interval: Optional[int] = None

class BrandingUpdate(BaseModel):
    company_name: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    background_color: Optional[str] = None
    accent_color: Optional[str] = None


# ── Branding (defined before /{queue_id} routes to avoid path conflicts) ─────

@router.get("/branding")
def get_branding(
    tenant_id: str = Depends(get_current_tenant_id),
    db: Session = Depends(get_db)
):
    """Returns the current branding configuration for the calling tenant."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant.branding or {}


@router.put("/branding")
def update_branding(
    payload: BrandingUpdate,
    tenant_id: str = Depends(get_current_tenant_id),
    db: Session = Depends(get_db)
):
    """Updates the branding configuration for the calling tenant."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    current = dict(tenant.branding or {})
    update_data = payload.model_dump(exclude_none=True)
    current.update(update_data)
    tenant.branding = current  # reassign to trigger SQLAlchemy change detection

    db.commit()
    db.refresh(tenant)
    return tenant.branding


# ── Queue CRUD ───────────────────────────────────────────────────────────────

@router.post("", response_model=QueueConfigResponse)
def create_queue_config(
    payload: QueueConfigCreate,
    tenant_id: str = Depends(get_current_tenant_id),
    db: Session = Depends(get_db)
):
    """
    Creates a new queue configuration tightly bound to the calling tenant.
    """
    if payload.form_schema:
        validate_form_schema(payload.form_schema)

    new_queue = QueueConfig(
        tenant_id=tenant_id,
        name=payload.name,
        form_schema=payload.form_schema,
        qr_rotation_enabled=payload.qr_rotation_enabled,
        qr_rotation_interval=payload.qr_rotation_interval
    )
    db.add(new_queue)
    db.commit()
    db.refresh(new_queue)

    return new_queue

@router.get("", response_model=List[QueueConfigResponse])
def list_queues(
    tenant_id: str = Depends(get_current_tenant_id),
    db: Session = Depends(get_db)
):
    """
    Lists all queues STRICTLY BELONGING to the calling tenant.
    IDOR barrier applied.
    """
    queues = db.query(QueueConfig).filter(QueueConfig.tenant_id == tenant_id).all()
    return queues

@router.put("/{queue_id}", response_model=QueueConfigResponse)
def update_queue_config(
    queue_id: str,
    payload: QueueConfigUpdate,
    tenant_id: str = Depends(get_current_tenant_id),
    db: Session = Depends(get_db)
):
    """
    Updates an existing queue configuration for the calling tenant.
    """
    queue_config = db.query(QueueConfig).filter(
        QueueConfig.id == queue_id,
        QueueConfig.tenant_id == tenant_id
    ).first()

    if not queue_config:
        raise HTTPException(status_code=404, detail="Queue not found")

    if payload.name is not None:
        queue_config.name = payload.name
    if payload.form_schema is not None:
        if payload.form_schema:
            validate_form_schema(payload.form_schema)
        queue_config.form_schema = payload.form_schema
    if payload.qr_rotation_enabled is not None:
        queue_config.qr_rotation_enabled = payload.qr_rotation_enabled
    if payload.qr_rotation_interval is not None:
        queue_config.qr_rotation_interval = payload.qr_rotation_interval

    db.commit()
    db.refresh(queue_config)
    return queue_config

@router.get("/{queue_id}/qrcode")
def generate_queue_qrcode(
    queue_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    db: Session = Depends(get_db)
):
    """
    Validates tenant ownership of the queue and generates a PNG QR code
    that deep-links end users to the B2C Queue Join portal.
    """
    # 1. Verify existence and ownership strictly
    queue_config = db.query(QueueConfig).filter(
        QueueConfig.id == queue_id,
        QueueConfig.tenant_id == tenant_id
    ).first()

    if not queue_config:
        raise HTTPException(status_code=404, detail="Queue not found")

    # 2. Generate the payload deep-link (Example: https://app.remotequeue.com/join?q=uuid)
    deep_link_url = f"https://app.remotequeue.com/join?q={queue_id}"

    # 3. Create the QRCode image entirely in-memory using Pillow
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(deep_link_url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")

    # 4. Save to a byte stream to bypass physical I/O constraints
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    return StreamingResponse(buf, media_type="image/png")
