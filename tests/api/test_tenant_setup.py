import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
import jwt

from api.main import app
from api.database.models import Tenant
from api.config import settings

def create_mock_token(tenant_id: str) -> str:
    payload = {"tenant_id": tenant_id}
    return jwt.encode(payload, settings.tenant_secret_key, algorithm=settings.algorithm)


def test_create_and_list_queue_config(client: TestClient, db_session: Session):
    # 1. Provide a Tenant ID
    tenant = Tenant(name="Company Test")
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    # 2. Authenticate context
    token = create_mock_token(tenant.id)
    headers = {"x-tenant-token": token}
    
    # 3. Create Configuration Route Test
    create_resp = client.post(
        "/api/v1/b2b/queues",
        headers=headers,
        json={
            "name": "Main Entrance",
            "form_schema": {
                "nome": "string",
                "documento": "string"
            }
        }
    )
    
    assert create_resp.status_code == 200
    create_data = create_resp.json()
    assert create_data["name"] == "Main Entrance"
    assert create_data["form_schema"]["nome"] == "string"
    assert "id" in create_data

    # 4. List Configurations Route Test ensuring IDOR protection
    list_resp = client.get("/api/v1/b2b/queues", headers=headers)
    assert list_resp.status_code == 200
    list_data = list_resp.json()
    assert len(list_data) == 1
    assert list_data[0]["name"] == "Main Entrance"

def test_idor_queue_list_isolation(client: TestClient, db_session: Session):
    """Ensure tenant B cannot list tenant A's configs"""
    t_a = Tenant(name="Tenant A")
    t_b = Tenant(name="Tenant B")
    db_session.add_all([t_a, t_b])
    db_session.commit()
    
    token_a = create_mock_token(t_a.id)
    token_b = create_mock_token(t_b.id)
    
    # Tenant A creates config
    client.post(
        "/api/v1/b2b/queues",
        headers={"x-tenant-token": token_a},
        json={"name": "Queue A", "form_schema": {}}
    )
    
    # Tenant B tries to list queues
    list_b = client.get("/api/v1/b2b/queues", headers={"x-tenant-token": token_b})
    assert list_b.status_code == 200
    assert len(list_b.json()) == 0 # Isolated successfully

def test_qrcode_generation_and_headers(client: TestClient, db_session: Session):
    t_a = Tenant(name="Tenant QR")
    db_session.add(t_a)
    db_session.commit()
    token = create_mock_token(t_a.id)

    # 1. First create a valid queue to target
    create_resp = client.post(
        "/api/v1/b2b/queues",
        headers={"x-tenant-token": token},
        json={"name": "QR Target", "form_schema": {}}
    )
    queue_id = create_resp.json()["id"]

    # 2. Assert raw bytes stream works and header correctly declares PNG format
    qr_resp = client.get(f"/api/v1/b2b/queues/{queue_id}/qrcode", headers={"x-tenant-token": token})
    assert qr_resp.status_code == 200
    assert qr_resp.headers["content-type"] == "image/png"
    # Basic magic number check for PNG files starts with \x89PNG
    assert qr_resp.content.startswith(b'\x89PNG')

def test_qrcode_idor_protection(client: TestClient, db_session: Session):
    t_a = Tenant(name="Tenant A")
    t_b = Tenant(name="Tenant B")
    db_session.add_all([t_a, t_b])
    db_session.commit()
    
    token_a = create_mock_token(t_a.id)
    token_b = create_mock_token(t_b.id)

    # Tenant A creates queue
    create_resp = client.post(
        "/api/v1/b2b/queues",
        headers={"x-tenant-token": token_a},
        json={"name": "Queue A", "form_schema": {}}
    )
    queue_id_a = create_resp.json()["id"]

    # Tenant B maliciously tries to generate a QR code for Tenant A's queue
    qr_resp_b = client.get(f"/api/v1/b2b/queues/{queue_id_a}/qrcode", headers={"x-tenant-token": token_b})
    
    # Should block at 404 (Not Found in Tenant B's context) to hide enumeration
    assert qr_resp_b.status_code == 404
