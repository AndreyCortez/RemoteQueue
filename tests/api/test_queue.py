import pytest
from fastapi.testclient import TestClient
from api.main import app
from api.database.redis import get_redis_client, QueueManager
from api.database.postgres import get_db
from api.database.models import Tenant, QueueConfig
import fakeredis

fake_redis = fakeredis.FakeRedis(decode_responses=True)
app.dependency_overrides[get_redis_client] = lambda: fake_redis

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
