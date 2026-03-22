"""
Tests for the Superadmin Portal API (5B).
Uses the standard fake-redis + SQLite in-memory fixtures from conftest.py.
"""
import pytest
from fastapi.testclient import TestClient
from passlib.context import CryptContext

from api.main import app
from api.database.redis import get_redis_client
from api.database.models import Tenant, B2BUser, QueueConfig
import fakeredis

fake_redis = fakeredis.FakeRedis(decode_responses=True)
app.dependency_overrides[get_redis_client] = lambda: fake_redis

client = TestClient(app)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@pytest.fixture(autouse=True)
def clean_redis():
    fake_redis.flushall()
    yield
    fake_redis.flushall()


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def admin_user(db_session):
    """Creates an internal admin tenant and a superadmin B2BUser."""
    tenant = Tenant(name="__remotequeue_admin__")
    db_session.add(tenant)
    db_session.flush()
    user = B2BUser(
        tenant_id=tenant.id,
        email="admin@rq.com",
        hashed_password=pwd_context.hash("adminpass"),
        is_superadmin=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def regular_user(db_session):
    """A normal B2B operator (not superadmin)."""
    tenant = Tenant(name="Regular Corp")
    db_session.add(tenant)
    db_session.flush()
    user = B2BUser(
        tenant_id=tenant.id,
        email="operator@corp.com",
        hashed_password=pwd_context.hash("pass123"),
        is_superadmin=False,
    )
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def admin_token(admin_user):
    """Generates a valid superadmin JWT directly (bypasses rate limiting)."""
    from api.dependencies.security import create_access_token
    from datetime import timedelta
    return create_access_token(
        data={"user_id": admin_user.id, "tenant_id": admin_user.tenant_id, "role": "superadmin"},
        expires_delta=timedelta(hours=1),
    )


@pytest.fixture
def admin_headers(admin_token):
    return {"x-tenant-token": admin_token}


@pytest.fixture
def sample_tenant(db_session):
    t = Tenant(name="Clinica Exemplo")
    db_session.add(t)
    db_session.flush()
    db_session.add(QueueConfig(tenant_id=t.id, name="Triagem", form_schema={}))
    db_session.add(B2BUser(tenant_id=t.id, email="op@clinica.com", hashed_password=pwd_context.hash("x")))
    db_session.commit()
    db_session.refresh(t)
    return t


# ── Auth tests ─────────────────────────────────────────────────────────────────

def test_admin_login_success(admin_user):
    resp = client.post(
        "/api/v1/admin/auth/login",
        data={"username": "admin@rq.com", "password": "adminpass"},
    )
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_admin_login_wrong_password(admin_user):
    resp = client.post(
        "/api/v1/admin/auth/login",
        data={"username": "admin@rq.com", "password": "wrongpass"},
    )
    assert resp.status_code == 401


def test_admin_login_non_superadmin(regular_user):
    """Regular users cannot log into the admin portal."""
    resp = client.post(
        "/api/v1/admin/auth/login",
        data={"username": "operator@corp.com", "password": "pass123"},
    )
    assert resp.status_code == 401


def test_admin_routes_require_superadmin_role(regular_user):
    """A B2B JWT (without role=superadmin) is rejected on admin routes."""
    b2b_resp = client.post(
        "/api/v1/auth/login",
        data={"username": "operator@corp.com", "password": "pass123"},
    )
    token = b2b_resp.json()["access_token"]
    resp = client.get("/api/v1/admin/tenants", headers={"x-tenant-token": token})
    assert resp.status_code == 403


def test_admin_routes_reject_no_token():
    resp = client.get("/api/v1/admin/tenants")
    assert resp.status_code == 422  # missing header


# ── Tenant CRUD ───────────────────────────────────────────────────────────────

def test_list_tenants(admin_headers, sample_tenant):
    resp = client.get("/api/v1/admin/tenants", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    names = [t["name"] for t in data["tenants"]]
    assert "Clinica Exemplo" in names


def test_get_tenant_detail(admin_headers, sample_tenant):
    resp = client.get(f"/api/v1/admin/tenants/{sample_tenant.id}", headers=admin_headers)
    assert resp.status_code == 200
    d = resp.json()
    assert d["name"] == "Clinica Exemplo"
    assert "queues" in d
    assert "calls_per_day" in d


def test_get_tenant_not_found(admin_headers):
    resp = client.get("/api/v1/admin/tenants/00000000-0000-0000-0000-000000000000", headers=admin_headers)
    assert resp.status_code == 404


def test_create_tenant(admin_headers):
    resp = client.post(
        "/api/v1/admin/tenants",
        json={"name": "Nova Clinica", "operator_email": "novo@clinica.com", "operator_password": "pw123456"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    d = resp.json()
    assert d["name"] == "Nova Clinica"
    assert d["operator_email"] == "novo@clinica.com"


def test_create_tenant_duplicate_email(admin_headers, sample_tenant):
    resp = client.post(
        "/api/v1/admin/tenants",
        json={"name": "Outro", "operator_email": "op@clinica.com", "operator_password": "pw123"},
        headers=admin_headers,
    )
    assert resp.status_code == 409


def test_update_tenant_name(admin_headers, sample_tenant):
    resp = client.put(
        f"/api/v1/admin/tenants/{sample_tenant.id}",
        json={"name": "Clinica Renomeada"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Clinica Renomeada"


def test_suspend_and_reactivate_tenant(admin_headers, sample_tenant):
    # Suspend
    resp = client.post(f"/api/v1/admin/tenants/{sample_tenant.id}/suspend", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["is_suspended"] is True

    # Reactivate
    resp2 = client.post(f"/api/v1/admin/tenants/{sample_tenant.id}/suspend", headers=admin_headers)
    assert resp2.status_code == 200
    assert resp2.json()["is_suspended"] is False


def test_suspended_tenant_cannot_login(admin_headers, sample_tenant, db_session):
    # Suspend the tenant
    client.post(f"/api/v1/admin/tenants/{sample_tenant.id}/suspend", headers=admin_headers)

    # Operator login should be blocked
    resp = client.post(
        "/api/v1/auth/login",
        data={"username": "op@clinica.com", "password": "x"},
    )
    assert resp.status_code == 403
    assert "suspended" in resp.json()["detail"]


def test_delete_tenant(admin_headers, sample_tenant):
    resp = client.delete(f"/api/v1/admin/tenants/{sample_tenant.id}", headers=admin_headers)
    assert resp.status_code == 200

    # Verify tenant is gone
    resp2 = client.get(f"/api/v1/admin/tenants/{sample_tenant.id}", headers=admin_headers)
    assert resp2.status_code == 404


# ── Global Stats ──────────────────────────────────────────────────────────────

def test_global_stats(admin_headers, sample_tenant):
    resp = client.get("/api/v1/admin/stats", headers=admin_headers)
    assert resp.status_code == 200
    d = resp.json()
    assert "total_tenants" in d
    assert "calls_today" in d
    assert "top_tenants" in d
    assert "busiest_queues" in d
    assert d["total_tenants"] >= 1
