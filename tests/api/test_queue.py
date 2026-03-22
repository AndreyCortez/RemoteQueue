import pytest
from fastapi.testclient import TestClient
from api.main import app
from api.database.redis import get_redis_client, QueueManager
from api.database.postgres import get_db
from api.database.models import Tenant, QueueConfig
import fakeredis

fake_redis = fakeredis.FakeRedis(decode_responses=True)
app.dependency_overrides[get_redis_client] = lambda: fake_redis

# Module-level client kept for backward compat with existing tests that reference
# it directly. New tests should prefer the `client` fixture from conftest.py.
client = TestClient(app)

@pytest.fixture(autouse=True)
def clean_redis():
    """Ensure a clean Redis state before each test."""
    fake_redis.flushall()
    yield
    fake_redis.flushall()

@pytest.fixture
def test_queue_config(db_session):
    """Creates a fresh Tenant and QueueConfig in the DB for the tests to use."""
    tenant = Tenant(name="Test B2C Tenant")
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    queue = QueueConfig(
        tenant_id=tenant.id,
        name="Test Public Queue",
        form_schema={"name": "string", "age": "integer"}
    )
    db_session.add(queue)
    db_session.commit()
    db_session.refresh(queue)
    return queue

# ── Fase 4: rich schema fixtures ──────────────────────────────────────────────

@pytest.fixture
def rich_schema_queue(db_session):
    """Queue com form_schema rico (Fase 4): label, required, pattern."""
    from api.database.models import Tenant, QueueConfig
    tenant = Tenant(name="Rich Schema Tenant")
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    queue = QueueConfig(
        tenant_id=tenant.id,
        name="Rich Schema Queue",
        form_schema={
            "nome": {
                "type": "string",
                "label": "Nome completo",
                "placeholder": "Ex: João Silva",
                "required": True,
            },
            "cpf": {
                "type": "string",
                "label": "CPF",
                "required": False,
                "pattern": r"^\d{3}\.\d{3}\.\d{3}-\d{2}$",
            },
            "idade": {
                "type": "integer",
                "label": "Idade",
                "required": True,
            },
        }
    )
    db_session.add(queue)
    db_session.commit()
    db_session.refresh(queue)
    return queue


def test_join_rich_schema_success(rich_schema_queue):
    """Campo opcional ausente e campo com pattern válido."""
    payload = {
        "queue_id": str(rich_schema_queue.id),
        "user_data": {"nome": "Maria", "cpf": "123.456.789-00", "idade": 28}
    }
    resp = client.post("/api/v1/queue/join", json=payload)
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"


def test_join_rich_schema_optional_field_absent(rich_schema_queue):
    """Campo 'cpf' é opcional — deve aceitar sem ele."""
    payload = {
        "queue_id": str(rich_schema_queue.id),
        "user_data": {"nome": "Carlos", "idade": 40}
    }
    resp = client.post("/api/v1/queue/join", json=payload)
    assert resp.status_code == 200


def test_join_rich_schema_required_field_missing(rich_schema_queue):
    """Campo 'nome' é obrigatório — deve rejeitar."""
    payload = {
        "queue_id": str(rich_schema_queue.id),
        "user_data": {"idade": 30}
    }
    resp = client.post("/api/v1/queue/join", json=payload)
    assert resp.status_code == 422
    assert "missing required field: nome" in resp.json()["detail"].lower()


def test_join_rich_schema_wrong_type(rich_schema_queue):
    """'idade' deve ser integer — string deve ser rejeitado."""
    payload = {
        "queue_id": str(rich_schema_queue.id),
        "user_data": {"nome": "Ana", "idade": "trinta"}
    }
    resp = client.post("/api/v1/queue/join", json=payload)
    assert resp.status_code == 422
    assert "integer" in resp.json()["detail"].lower()


def test_join_rich_schema_pattern_invalid(rich_schema_queue):
    """'cpf' com valor que não bate no pattern deve ser rejeitado."""
    payload = {
        "queue_id": str(rich_schema_queue.id),
        "user_data": {"nome": "Pedro", "cpf": "12345678900", "idade": 22}
    }
    resp = client.post("/api/v1/queue/join", json=payload)
    assert resp.status_code == 422
    assert "pattern" in resp.json()["detail"].lower()


def test_join_rich_schema_backwards_compat(db_session):
    """Schema simples antigo ainda deve funcionar ao lado do rico."""
    from api.database.models import Tenant, QueueConfig
    tenant = Tenant(name="Compat Tenant")
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    queue = QueueConfig(
        tenant_id=tenant.id,
        name="Legacy Schema Queue",
        form_schema={"nome": "string", "idade": "integer"}
    )
    db_session.add(queue)
    db_session.commit()
    db_session.refresh(queue)

    payload = {
        "queue_id": str(queue.id),
        "user_data": {"nome": "Legado", "idade": 50}
    }
    resp = client.post("/api/v1/queue/join", json=payload)
    assert resp.status_code == 200


# ── Testes originais ───────────────────────────────────────────────────────────

def test_get_queue_public_info_not_found():
    response = client.get("/api/v1/queue/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()

def test_get_queue_public_info_success(test_queue_config):
    response = client.get(f"/api/v1/queue/{test_queue_config.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Test Public Queue"
    assert "name" in data["form_schema"]

def test_join_queue_success(test_queue_config):
    # API schema says "age" is "integer" so we must pass an int in JSON
    payload = {
        "queue_id": str(test_queue_config.id),
        "user_data": {"name": "Andrey", "age": 30}
    }
    response = client.post("/api/v1/queue/join", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["position"] == 0  # First in line
    assert data["status"] == "success"

    # Second user
    payload2 = {
        "queue_id": str(test_queue_config.id),
        "user_data": {"name": "João", "age": 20}
    }
    res2 = client.post("/api/v1/queue/join", json=payload2)
    assert res2.status_code == 200
    assert res2.json()["position"] == 1

def test_join_queue_invalid_schema(test_queue_config):
    # Missing 'name' based on the schema
    payload = {
        "queue_id": str(test_queue_config.id),
        "user_data": {"age": 30}
    }
    response = client.post("/api/v1/queue/join", json=payload)
    assert response.status_code == 422
    assert "missing required field: name" in response.json()["detail"].lower()

def test_get_queue_status_public(test_queue_config):
    # Join one user first
    payload = {
        "queue_id": str(test_queue_config.id),
        "user_data": {"name": "Andrey", "age": 30}
    }
    client.post("/api/v1/queue/join", json=payload)

    # Check status
    response = client.get(f"/api/v1/queue/{test_queue_config.id}/status")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Test Public Queue"
    assert data["queue_size"] == 1  # Based on router implementation returning queue_size

def test_qrcode_public_success(test_queue_config):
    resp = client.get(f"/api/v1/queue/{test_queue_config.id}/qrcode-public")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/png"
    assert resp.content.startswith(b'\x89PNG')


def test_qrcode_public_not_found():
    resp = client.get("/api/v1/queue/00000000-0000-0000-0000-000000000000/qrcode-public")
    assert resp.status_code == 404


def test_get_current_qr_rotation_disabled(test_queue_config):
    response = client.get(f"/api/v1/queue/{test_queue_config.id}/current-qr")
    assert response.status_code == 200
    data = response.json()
    assert data["rotation_enabled"] is False
    assert f"/join?q={test_queue_config.id}" in data["url"]

def test_current_qr_and_join_with_rotation(db_session, test_queue_config):
    # Enable rotation
    test_queue_config.qr_rotation_enabled = True
    test_queue_config.qr_rotation_interval = 60
    db_session.commit()

    # 1. Ask for current QR
    response = client.get(f"/api/v1/queue/{test_queue_config.id}/current-qr")
    assert response.status_code == 200
    data = response.json()
    assert data["rotation_enabled"] is True
    assert "expires_in" in data
    assert "&code=" in data["url"]
    
    # Extract code from URL
    url_code = data["url"].split("&code=")[-1]
    
    # 2. Try to join WITHOUT code -> 403
    payload_no_code = {
        "queue_id": str(test_queue_config.id),
        "user_data": {"name": "Hacker", "age": 25}
    }
    r_no_code = client.post("/api/v1/queue/join", json=payload_no_code)
    assert r_no_code.status_code == 403
    assert "invalid or expired" in r_no_code.json()["detail"].lower()

    # 3. Try to join with WRONG code -> 403
    payload_wrong_code = {
        "queue_id": str(test_queue_config.id),
        "user_data": {"name": "Hacker", "age": 25},
        "access_code": "fake_code_123"
    }
    r_wrong = client.post("/api/v1/queue/join", json=payload_wrong_code)
    assert r_wrong.status_code == 403
    assert "invalid or expired" in r_wrong.json()["detail"].lower()

    # 4. Try to join with CORRECT code -> 200
    payload_correct = {
        "queue_id": str(test_queue_config.id),
        "user_data": {"name": "Andrey", "age": 30},
        "access_code": url_code
    }
    r_correct = client.post("/api/v1/queue/join", json=payload_correct)
    assert r_correct.status_code == 200
    assert r_correct.json()["status"] == "success"


# ── Fase 4B: Schema V2 — novos tipos de campo ───────────────────────────────

@pytest.fixture
def v2_schema_queue(db_session):
    """Queue com form_schema V2 contendo todos os tipos novos."""
    tenant = Tenant(name="V2 Schema Tenant")
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    queue = QueueConfig(
        tenant_id=tenant.id,
        name="V2 Queue",
        form_schema={
            "version": 2,
            "elements": [
                {
                    "kind": "section",
                    "id": "s1",
                    "title": "Dados Pessoais",
                    "description": "Preencha seus dados"
                },
                {
                    "kind": "field",
                    "id": "f1",
                    "key": "nome",
                    "type": "string",
                    "label": "Nome completo",
                    "required": True
                },
                {
                    "kind": "field",
                    "id": "f2",
                    "key": "cpf",
                    "type": "cpf",
                    "label": "CPF",
                    "required": True
                },
                {
                    "kind": "field",
                    "id": "f3",
                    "key": "data_nascimento",
                    "type": "date",
                    "label": "Data de Nascimento",
                    "required": False
                },
                {
                    "kind": "field",
                    "id": "f4",
                    "key": "convenio",
                    "type": "select",
                    "label": "Convênio",
                    "options": ["Particular", "Unimed", "SulAmérica"],
                    "required": True
                },
                {
                    "kind": "field",
                    "id": "f5",
                    "key": "urgente",
                    "type": "boolean",
                    "label": "Urgente?",
                    "required": True
                },
                {
                    "kind": "field",
                    "id": "f6",
                    "key": "como_conheceu",
                    "type": "poll",
                    "label": "Como conheceu?",
                    "options": ["Indicação", "Google", "Instagram"],
                    "required": False
                },
                {
                    "kind": "field",
                    "id": "f7",
                    "key": "idade",
                    "type": "integer",
                    "label": "Idade",
                    "required": True
                },
            ]
        }
    )
    db_session.add(queue)
    db_session.commit()
    db_session.refresh(queue)
    return queue


def test_join_v2_schema_all_fields(v2_schema_queue):
    """V2 schema com todos os campos preenchidos corretamente."""
    payload = {
        "queue_id": str(v2_schema_queue.id),
        "user_data": {
            "nome": "Maria Silva",
            "cpf": "529.982.247-25",
            "data_nascimento": "1990-05-15",
            "convenio": "Unimed",
            "urgente": False,
            "como_conheceu": "Google",
            "idade": 35
        }
    }
    resp = client.post("/api/v1/queue/join", json=payload)
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"


def test_join_v2_optional_fields_absent(v2_schema_queue):
    """Campos opcionais (data_nascimento, como_conheceu) podem ser omitidos."""
    payload = {
        "queue_id": str(v2_schema_queue.id),
        "user_data": {
            "nome": "Carlos",
            "cpf": "529.982.247-25",
            "convenio": "Particular",
            "urgente": True,
            "idade": 28
        }
    }
    resp = client.post("/api/v1/queue/join", json=payload)
    assert resp.status_code == 200


def test_join_v2_required_field_missing(v2_schema_queue):
    """Campo obrigatório 'nome' ausente deve retornar 422."""
    payload = {
        "queue_id": str(v2_schema_queue.id),
        "user_data": {
            "cpf": "529.982.247-25",
            "convenio": "Particular",
            "urgente": True,
            "idade": 30
        }
    }
    resp = client.post("/api/v1/queue/join", json=payload)
    assert resp.status_code == 422
    assert "nome" in resp.json()["detail"].lower()


def test_join_v2_cpf_valid(v2_schema_queue):
    """CPF com formato e dígitos verificadores válidos."""
    payload = {
        "queue_id": str(v2_schema_queue.id),
        "user_data": {
            "nome": "Ana",
            "cpf": "529.982.247-25",
            "convenio": "Particular",
            "urgente": False,
            "idade": 22
        }
    }
    resp = client.post("/api/v1/queue/join", json=payload)
    assert resp.status_code == 200


def test_join_v2_cpf_invalid_format(v2_schema_queue):
    """CPF sem formatação correta deve ser rejeitado."""
    payload = {
        "queue_id": str(v2_schema_queue.id),
        "user_data": {
            "nome": "Pedro",
            "cpf": "52998224725",
            "convenio": "Particular",
            "urgente": False,
            "idade": 30
        }
    }
    resp = client.post("/api/v1/queue/join", json=payload)
    assert resp.status_code == 422
    assert "cpf" in resp.json()["detail"].lower()


def test_join_v2_cpf_bad_checkdigit(v2_schema_queue):
    """CPF com formato correto mas dígito verificador errado."""
    payload = {
        "queue_id": str(v2_schema_queue.id),
        "user_data": {
            "nome": "João",
            "cpf": "529.982.247-99",
            "convenio": "Particular",
            "urgente": False,
            "idade": 25
        }
    }
    resp = client.post("/api/v1/queue/join", json=payload)
    assert resp.status_code == 422
    assert "cpf" in resp.json()["detail"].lower()


def test_join_v2_date_valid(v2_schema_queue):
    """Data em formato ISO válido."""
    payload = {
        "queue_id": str(v2_schema_queue.id),
        "user_data": {
            "nome": "Lucia",
            "cpf": "529.982.247-25",
            "data_nascimento": "2000-12-31",
            "convenio": "Particular",
            "urgente": False,
            "idade": 25
        }
    }
    resp = client.post("/api/v1/queue/join", json=payload)
    assert resp.status_code == 200


def test_join_v2_date_invalid(v2_schema_queue):
    """Data em formato inválido deve ser rejeitada."""
    payload = {
        "queue_id": str(v2_schema_queue.id),
        "user_data": {
            "nome": "Roberto",
            "cpf": "529.982.247-25",
            "data_nascimento": "31/12/2000",
            "convenio": "Particular",
            "urgente": False,
            "idade": 25
        }
    }
    resp = client.post("/api/v1/queue/join", json=payload)
    assert resp.status_code == 422
    assert "date" in resp.json()["detail"].lower()


def test_join_v2_select_valid(v2_schema_queue):
    """Valor de select dentro das opções definidas."""
    payload = {
        "queue_id": str(v2_schema_queue.id),
        "user_data": {
            "nome": "Fernanda",
            "cpf": "529.982.247-25",
            "convenio": "SulAmérica",
            "urgente": False,
            "idade": 40
        }
    }
    resp = client.post("/api/v1/queue/join", json=payload)
    assert resp.status_code == 200


def test_join_v2_select_invalid_option(v2_schema_queue):
    """Valor de select fora das opções deve ser rejeitado."""
    payload = {
        "queue_id": str(v2_schema_queue.id),
        "user_data": {
            "nome": "Marcos",
            "cpf": "529.982.247-25",
            "convenio": "Bradesco Saúde",
            "urgente": False,
            "idade": 33
        }
    }
    resp = client.post("/api/v1/queue/join", json=payload)
    assert resp.status_code == 422
    assert "must be one of" in resp.json()["detail"].lower()


def test_join_v2_poll_valid(v2_schema_queue):
    """Valor de poll dentro das opções."""
    payload = {
        "queue_id": str(v2_schema_queue.id),
        "user_data": {
            "nome": "Julia",
            "cpf": "529.982.247-25",
            "convenio": "Particular",
            "urgente": True,
            "como_conheceu": "Indicação",
            "idade": 29
        }
    }
    resp = client.post("/api/v1/queue/join", json=payload)
    assert resp.status_code == 200


def test_join_v2_poll_invalid_option(v2_schema_queue):
    """Valor de poll fora das opções deve ser rejeitado."""
    payload = {
        "queue_id": str(v2_schema_queue.id),
        "user_data": {
            "nome": "Rafael",
            "cpf": "529.982.247-25",
            "convenio": "Particular",
            "urgente": False,
            "como_conheceu": "TikTok",
            "idade": 20
        }
    }
    resp = client.post("/api/v1/queue/join", json=payload)
    assert resp.status_code == 422
    assert "must be one of" in resp.json()["detail"].lower()


def test_join_v2_sections_ignored_in_validation(v2_schema_queue):
    """Seções não devem criar requisitos de validação."""
    payload = {
        "queue_id": str(v2_schema_queue.id),
        "user_data": {
            "nome": "Test",
            "cpf": "529.982.247-25",
            "convenio": "Particular",
            "urgente": False,
            "idade": 18
        }
    }
    resp = client.post("/api/v1/queue/join", json=payload)
    assert resp.status_code == 200


def test_join_v2_backwards_compat_legacy(db_session):
    """Schema legado simples continua funcionando com o novo código."""
    tenant = Tenant(name="Legacy V2 Compat")
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    queue = QueueConfig(
        tenant_id=tenant.id,
        name="Legacy Queue",
        form_schema={"nome": "string", "idade": "integer"}
    )
    db_session.add(queue)
    db_session.commit()
    db_session.refresh(queue)

    payload = {
        "queue_id": str(queue.id),
        "user_data": {"nome": "Legado", "idade": 50}
    }
    resp = client.post("/api/v1/queue/join", json=payload)
    assert resp.status_code == 200


def test_get_queue_info_returns_branding(db_session):
    """GET /queue/{id} deve retornar branding do tenant."""
    tenant = Tenant(
        name="Branded Tenant",
        branding={"company_name": "Clínica São Lucas", "primary_color": "#0369a1"}
    )
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    queue = QueueConfig(
        tenant_id=tenant.id,
        name="Branded Queue",
        form_schema={"nome": "string"}
    )
    db_session.add(queue)
    db_session.commit()
    db_session.refresh(queue)

    resp = client.get(f"/api/v1/queue/{queue.id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["branding"]["company_name"] == "Clínica São Lucas"
    assert data["branding"]["primary_color"] == "#0369a1"


def test_get_queue_info_no_branding(db_session):
    """GET /queue/{id} sem branding retorna null."""
    tenant = Tenant(name="No Brand Tenant")
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    queue = QueueConfig(
        tenant_id=tenant.id,
        name="Plain Queue",
        form_schema={"nome": "string"}
    )
    db_session.add(queue)
    db_session.commit()
    db_session.refresh(queue)

    resp = client.get(f"/api/v1/queue/{queue.id}")
    assert resp.status_code == 200
    assert resp.json()["branding"] is None


# ── Fase 5: Wait Time Estimation via API ──────────────────────────────────────

def test_status_includes_wait_estimate_fields(test_queue_config):
    """GET /queue/{id}/status returns estimated_wait_seconds and sample_size."""
    resp = client.get(f"/api/v1/queue/{test_queue_config.id}/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "estimated_wait_seconds" in data
    assert "sample_size" in data
    # No call history → null estimate, 0 samples
    assert data["estimated_wait_seconds"] is None
    assert data["sample_size"] == 0
