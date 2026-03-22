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


def test_update_queue_config(client: TestClient, db_session: Session):
    """Verifica que PUT /queues/{id} atualiza campos corretamente."""
    tenant = Tenant(name="Update Tenant")
    db_session.add(tenant)
    db_session.commit()
    token = create_mock_token(tenant.id)
    headers = {"x-tenant-token": token}

    create_resp = client.post(
        "/api/v1/b2b/queues",
        headers=headers,
        json={"name": "Original Name", "form_schema": {"nome": "string"}}
    )
    assert create_resp.status_code == 200
    queue_id = create_resp.json()["id"]

    # Update name and enable QR rotation
    update_resp = client.put(
        f"/api/v1/b2b/queues/{queue_id}",
        headers=headers,
        json={"name": "Updated Name", "qr_rotation_enabled": True, "qr_rotation_interval": 120}
    )
    assert update_resp.status_code == 200
    data = update_resp.json()
    assert data["name"] == "Updated Name"
    assert data["qr_rotation_enabled"] is True
    assert data["qr_rotation_interval"] == 120
    # form_schema unchanged
    assert data["form_schema"]["nome"] == "string"


def test_update_queue_config_not_found(client: TestClient, db_session: Session):
    """Verifica que PUT em queue inexistente retorna 404."""
    tenant = Tenant(name="Ghost Tenant")
    db_session.add(tenant)
    db_session.commit()
    token = create_mock_token(tenant.id)

    resp = client.put(
        "/api/v1/b2b/queues/00000000-0000-0000-0000-000000000000",
        headers={"x-tenant-token": token},
        json={"name": "Won't work"}
    )
    assert resp.status_code == 404


def test_update_queue_config_idor(client: TestClient, db_session: Session):
    """Verifica que tenant B não consegue atualizar a queue do tenant A."""
    t_a = Tenant(name="Owner Tenant")
    t_b = Tenant(name="Attacker Tenant")
    db_session.add_all([t_a, t_b])
    db_session.commit()

    token_a = create_mock_token(t_a.id)
    token_b = create_mock_token(t_b.id)

    create_resp = client.post(
        "/api/v1/b2b/queues",
        headers={"x-tenant-token": token_a},
        json={"name": "Private Queue", "form_schema": {}}
    )
    queue_id = create_resp.json()["id"]

    resp = client.put(
        f"/api/v1/b2b/queues/{queue_id}",
        headers={"x-tenant-token": token_b},
        json={"name": "Hijacked"}
    )
    assert resp.status_code == 404


# ── Fase 4B: Schema V2 na criação/update ─────────────────────────────────────

def test_create_queue_v2_schema(client: TestClient, db_session: Session):
    """Criar fila com schema V2 válido deve funcionar."""
    tenant = Tenant(name="V2 Create Tenant")
    db_session.add(tenant)
    db_session.commit()
    token = create_mock_token(tenant.id)

    v2_schema = {
        "version": 2,
        "elements": [
            {"kind": "section", "id": "s1", "title": "Dados"},
            {"kind": "field", "id": "f1", "key": "nome", "type": "string", "label": "Nome", "required": True},
            {"kind": "field", "id": "f2", "key": "tipo", "type": "select", "label": "Tipo", "options": ["A", "B"], "required": True},
        ]
    }

    resp = client.post(
        "/api/v1/b2b/queues",
        headers={"x-tenant-token": token},
        json={"name": "V2 Queue", "form_schema": v2_schema}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["form_schema"]["version"] == 2
    assert len(data["form_schema"]["elements"]) == 3


def test_create_queue_v2_invalid_field_type(client: TestClient, db_session: Session):
    """Schema V2 com tipo de campo desconhecido deve retornar 422."""
    tenant = Tenant(name="V2 Invalid Tenant")
    db_session.add(tenant)
    db_session.commit()
    token = create_mock_token(tenant.id)

    bad_schema = {
        "version": 2,
        "elements": [
            {"kind": "field", "id": "f1", "key": "x", "type": "telefone", "label": "Tel"},
        ]
    }

    resp = client.post(
        "/api/v1/b2b/queues",
        headers={"x-tenant-token": token},
        json={"name": "Bad Queue", "form_schema": bad_schema}
    )
    assert resp.status_code == 422


def test_create_queue_v2_duplicate_keys(client: TestClient, db_session: Session):
    """Schema V2 com keys duplicadas deve retornar 422."""
    tenant = Tenant(name="Dup Key Tenant")
    db_session.add(tenant)
    db_session.commit()
    token = create_mock_token(tenant.id)

    dup_schema = {
        "version": 2,
        "elements": [
            {"kind": "field", "id": "f1", "key": "nome", "type": "string", "label": "Nome"},
            {"kind": "field", "id": "f2", "key": "nome", "type": "string", "label": "Nome 2"},
        ]
    }

    resp = client.post(
        "/api/v1/b2b/queues",
        headers={"x-tenant-token": token},
        json={"name": "Dup Queue", "form_schema": dup_schema}
    )
    assert resp.status_code == 422


def test_create_queue_v2_select_without_options(client: TestClient, db_session: Session):
    """Campo select sem options deve retornar 422."""
    tenant = Tenant(name="No Opts Tenant")
    db_session.add(tenant)
    db_session.commit()
    token = create_mock_token(tenant.id)

    bad_schema = {
        "version": 2,
        "elements": [
            {"kind": "field", "id": "f1", "key": "tipo", "type": "select", "label": "Tipo"},
        ]
    }

    resp = client.post(
        "/api/v1/b2b/queues",
        headers={"x-tenant-token": token},
        json={"name": "No Opts Queue", "form_schema": bad_schema}
    )
    assert resp.status_code == 422


def test_update_queue_v2_schema(client: TestClient, db_session: Session):
    """Atualizar schema de fila para V2 deve funcionar."""
    tenant = Tenant(name="Update V2 Tenant")
    db_session.add(tenant)
    db_session.commit()
    token = create_mock_token(tenant.id)
    headers = {"x-tenant-token": token}

    create_resp = client.post(
        "/api/v1/b2b/queues",
        headers=headers,
        json={"name": "Upgrade Queue", "form_schema": {"nome": "string"}}
    )
    queue_id = create_resp.json()["id"]

    v2_schema = {
        "version": 2,
        "elements": [
            {"kind": "field", "id": "f1", "key": "nome", "type": "string", "label": "Nome"},
            {"kind": "field", "id": "f2", "key": "cpf", "type": "cpf", "label": "CPF", "required": False},
        ]
    }

    resp = client.put(
        f"/api/v1/b2b/queues/{queue_id}",
        headers=headers,
        json={"form_schema": v2_schema}
    )
    assert resp.status_code == 200
    assert resp.json()["form_schema"]["version"] == 2


# ── Fase 4B: Branding endpoints ──────────────────────────────────────────────

def test_get_branding_empty(client: TestClient, db_session: Session):
    """Branding vazio retorna {}."""
    tenant = Tenant(name="No Brand")
    db_session.add(tenant)
    db_session.commit()
    token = create_mock_token(tenant.id)

    resp = client.get("/api/v1/b2b/queues/branding", headers={"x-tenant-token": token})
    assert resp.status_code == 200
    assert resp.json() == {}


def test_update_and_get_branding(client: TestClient, db_session: Session):
    """Atualizar branding e verificar que persiste."""
    tenant = Tenant(name="Branded Co")
    db_session.add(tenant)
    db_session.commit()
    token = create_mock_token(tenant.id)
    headers = {"x-tenant-token": token}

    resp = client.put(
        "/api/v1/b2b/queues/branding",
        headers=headers,
        json={
            "company_name": "Clínica São Lucas",
            "primary_color": "#0369a1",
            "logo_url": "https://example.com/logo.png"
        }
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["company_name"] == "Clínica São Lucas"
    assert data["primary_color"] == "#0369a1"

    get_resp = client.get("/api/v1/b2b/queues/branding", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["company_name"] == "Clínica São Lucas"


def test_update_branding_partial(client: TestClient, db_session: Session):
    """Atualizar branding parcialmente preserva campos existentes."""
    tenant = Tenant(name="Partial Brand", branding={"company_name": "Old", "primary_color": "#000"})
    db_session.add(tenant)
    db_session.commit()
    token = create_mock_token(tenant.id)

    resp = client.put(
        "/api/v1/b2b/queues/branding",
        headers={"x-tenant-token": token},
        json={"primary_color": "#fff"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["company_name"] == "Old"
    assert data["primary_color"] == "#fff"
