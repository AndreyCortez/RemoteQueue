"""Tests for the /api/v1/test/seed-b2b endpoint (test_seed.py router)."""
import os
from unittest.mock import MagicMock, patch

import fakeredis
import pytest
from fastapi.testclient import TestClient

from api.database.models import QueueConfig, Tenant
from api.main import app

client = TestClient(app)

SEED_URL = "/api/v1/test/seed-b2b"
PAYLOAD = {"tenant_name": "Seed Corp", "email": "seed@test.com", "password": "pass123"}


@pytest.fixture
def fake_redis_instance():
    """Returns a fresh FakeRedis instance with the test_seed module patched."""
    r = fakeredis.FakeRedis(decode_responses=True)
    with patch("api.routers.test_seed.get_redis_client", return_value=r):
        yield r


def test_seed_creates_tenant_and_user(fake_redis_instance):
    """First call creates a new tenant+user and returns status=created."""
    resp = client.post(SEED_URL, json=PAYLOAD)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "created"
    assert data["email"] == PAYLOAD["email"]
    assert "tenant_id" in data
    assert "user_id" in data


def test_seed_idempotent_returns_already_exists(fake_redis_instance):
    """Second call with the same email returns status=already_exists and wipes queues."""
    # First seed
    first = client.post(SEED_URL, json=PAYLOAD)
    assert first.status_code == 200
    assert first.json()["status"] == "created"

    # Second seed with same email
    resp = client.post(SEED_URL, json=PAYLOAD)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "already_exists"
    assert data["email"] == PAYLOAD["email"]
    assert "tenant_id" in data


def test_seed_idempotent_wipes_queues(db_session, fake_redis_instance):
    """Re-seeding an existing user deletes their queue configs from the DB."""
    # First seed
    first = client.post(SEED_URL, json=PAYLOAD)
    tenant_id = first.json()["tenant_id"]

    # Manually add a queue for that tenant
    queue = QueueConfig(
        tenant_id=tenant_id,
        name="Old Queue",
        form_schema={"nome": "string"},
    )
    db_session.add(queue)
    db_session.commit()

    # Re-seed clears queues
    client.post(SEED_URL, json=PAYLOAD)

    remaining = db_session.query(QueueConfig).filter(
        QueueConfig.tenant_id == tenant_id
    ).all()
    assert remaining == []


def test_seed_idempotent_wipes_redis_keys(fake_redis_instance):
    """Re-seeding clears tenant redis keys."""
    first = client.post(SEED_URL, json=PAYLOAD)
    tenant_id = first.json()["tenant_id"]

    # Inject a fake Redis key for this tenant
    fake_redis_instance.set(f"tenant:{tenant_id}:queue:some_queue", "1")
    assert len(fake_redis_instance.keys(f"tenant:{tenant_id}:*")) == 1

    # Re-seed should delete those keys
    client.post(SEED_URL, json=PAYLOAD)
    assert len(fake_redis_instance.keys(f"tenant:{tenant_id}:*")) == 0


def test_seed_blocked_in_production(fake_redis_instance, monkeypatch):
    """Endpoint returns 403 when ENVIRONMENT=production."""
    monkeypatch.setenv("ENVIRONMENT", "production")
    resp = client.post(SEED_URL, json=PAYLOAD)
    assert resp.status_code == 403
    assert "production" in resp.json()["detail"].lower()
