import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from passlib.context import CryptContext

from api.database.models import Tenant, B2BUser

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def seed_tenant_and_user(db: Session, email: str = "admin@test.com", password: str = "secret123"):
    tenant = Tenant(name="Auth Test Corp")
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    user = B2BUser(
        tenant_id=tenant.id,
        email=email,
        hashed_password=pwd_context.hash(password)
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return tenant, user


def test_login_success(client: TestClient, db_session: Session):
    seed_tenant_and_user(db_session)
    response = client.post("/api/v1/auth/login", data={"username": "admin@test.com", "password": "secret123"})
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_login_wrong_password(client: TestClient, db_session: Session):
    seed_tenant_and_user(db_session)
    response = client.post("/api/v1/auth/login", data={"username": "admin@test.com", "password": "wrong_password"})
    assert response.status_code == 401
    assert "Incorrect" in response.json()["detail"]


def test_login_nonexistent_user(client: TestClient, db_session: Session):
    seed_tenant_and_user(db_session)
    response = client.post("/api/v1/auth/login", data={"username": "nobody@test.com", "password": "secret123"})
    assert response.status_code == 401


def test_login_token_works_on_protected_route(client: TestClient, db_session: Session):
    seed_tenant_and_user(db_session)
    login_resp = client.post("/api/v1/auth/login", data={"username": "admin@test.com", "password": "secret123"})
    token = login_resp.json()["access_token"]
    protected_resp = client.get("/api/v1/secure-data", headers={"x-tenant-token": token})
    assert protected_resp.status_code == 200
    assert protected_resp.json()["message"] == "Access granted"
