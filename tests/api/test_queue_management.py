"""
Unit tests for the B2B queue management endpoints.
Uses FakeRedis via FastAPI dependency_overrides so no live Redis is required.
"""
import pytest
import json
import time

import fakeredis
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from passlib.context import CryptContext

from api.main import app
from api.database.models import Tenant, B2BUser, QueueConfig, QueueEntry
from api.database.redis import get_redis_client
from api.dependencies.security import create_access_token

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

def make_tenant_and_queue(db: Session, queue_name: str = "Test Queue") -> tuple:
    tenant = Tenant(name="Test Corp")
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    user = B2BUser(
        tenant_id=tenant.id,
        email=f"op-{tenant.id[:8]}@test.com",
        hashed_password=pwd_context.hash("secret")
    )
    db.add(user)

    queue = QueueConfig(tenant_id=tenant.id, name=queue_name, form_schema={"nome": "string"})
    db.add(queue)
    db.commit()
    db.refresh(queue)
    return tenant, queue


def auth_headers(tenant_id: str) -> dict:
    token = create_access_token({"tenant_id": tenant_id})
    return {"x-tenant-token": token}


def setup_fake_redis(user_data_list: list[dict] = None) -> fakeredis.FakeRedis:
    """Creates a FakeRedis client and overrides the dependency on the FastAPI app."""
    fake = fakeredis.FakeRedis(decode_responses=True)
    app.dependency_overrides[get_redis_client] = lambda: fake
    return fake


def teardown_fake_redis():
    app.dependency_overrides.pop(get_redis_client, None)


def add_member(fake: fakeredis.FakeRedis, tenant_id: str, queue_id: str, user_data: dict, offset: float = 0):
    key = f"tenant:{tenant_id}:queue:{queue_id}"
    payload = json.dumps(user_data, sort_keys=True)
    fake.zadd(key, {payload: time.time() + offset})


# ──────────────────────────────────────────────
# Tests — List Members
# ──────────────────────────────────────────────

def test_list_members_empty_queue(client: TestClient, db_session: Session):
    fake = setup_fake_redis()
    try:
        tenant, queue = make_tenant_and_queue(db_session)
        resp = client.get(f"/api/v1/b2b/queue/{queue.id}/members", headers=auth_headers(tenant.id))
        assert resp.status_code == 200
        assert resp.json() == []
    finally:
        teardown_fake_redis()


def test_list_members_returns_all_in_order(client: TestClient, db_session: Session):
    fake = setup_fake_redis()
    try:
        tenant, queue = make_tenant_and_queue(db_session)
        for i, nome in enumerate(["Alice", "Bob", "Charlie"]):
            add_member(fake, tenant.id, queue.id, {"nome": nome}, offset=i * 0.001)

        resp = client.get(f"/api/v1/b2b/queue/{queue.id}/members", headers=auth_headers(tenant.id))
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 3
        assert [m["user_data"]["nome"] for m in data] == ["Alice", "Bob", "Charlie"]
    finally:
        teardown_fake_redis()


def test_list_members_idor_protection(client: TestClient, db_session: Session):
    """Tenant B cannot list Tenant A's queue."""
    fake = setup_fake_redis()
    try:
        tenant_a, queue_a = make_tenant_and_queue(db_session, "Queue A")
        tenant_b = Tenant(name="Corp B")
        db_session.add(tenant_b)
        db_session.commit()
        db_session.refresh(tenant_b)

        resp = client.get(f"/api/v1/b2b/queue/{queue_a.id}/members", headers=auth_headers(tenant_b.id))
        assert resp.status_code == 404
    finally:
        teardown_fake_redis()


# ──────────────────────────────────────────────
# Tests — Remove Member
# ──────────────────────────────────────────────

def test_remove_member_success(client: TestClient, db_session: Session):
    fake = setup_fake_redis()
    try:
        tenant, queue = make_tenant_and_queue(db_session)
        user_data = {"nome": "Alice"}
        add_member(fake, tenant.id, queue.id, user_data)

        resp = client.request(
            "DELETE",
            f"/api/v1/b2b/queue/{queue.id}/members",
            json={"user_data": user_data},
            headers=auth_headers(tenant.id)
        )
        assert resp.status_code == 200

        key = f"tenant:{tenant.id}:queue:{queue.id}"
        assert fake.zcard(key) == 0

        # Verify PostgreSQL persistence
        entry = db_session.query(QueueEntry).filter_by(queue_id=queue.id, status="removed").first()
        assert entry is not None
        assert entry.user_data == user_data
    finally:
        teardown_fake_redis()


def test_remove_nonexistent_member_returns_404(client: TestClient, db_session: Session):
    fake = setup_fake_redis()
    try:
        tenant, queue = make_tenant_and_queue(db_session)
        resp = client.request(
            "DELETE",
            f"/api/v1/b2b/queue/{queue.id}/members",
            json={"user_data": {"nome": "Nobody"}},
            headers=auth_headers(tenant.id)
        )
        assert resp.status_code == 404
    finally:
        teardown_fake_redis()


# ──────────────────────────────────────────────
# Tests — Call Next
# ──────────────────────────────────────────────

def test_call_next_pops_first_member(client: TestClient, db_session: Session):
    fake = setup_fake_redis()
    try:
        tenant, queue = make_tenant_and_queue(db_session)
        add_member(fake, tenant.id, queue.id, {"nome": "First"}, offset=0)
        add_member(fake, tenant.id, queue.id, {"nome": "Second"}, offset=0.001)

        resp = client.post(f"/api/v1/b2b/queue/{queue.id}/call-next", headers=auth_headers(tenant.id))
        assert resp.status_code == 200
        data = resp.json()
        assert data["user_data"]["nome"] == "First"

        key = f"tenant:{tenant.id}:queue:{queue.id}"
        assert fake.zcard(key) == 1

        # Verify persistence
        entry = db_session.query(QueueEntry).filter_by(queue_id=queue.id, status="called").first()
        assert entry is not None
    finally:
        teardown_fake_redis()


def test_call_next_on_empty_queue_returns_404(client: TestClient, db_session: Session):
    fake = setup_fake_redis()
    try:
        tenant, queue = make_tenant_and_queue(db_session)
        resp = client.post(f"/api/v1/b2b/queue/{queue.id}/call-next", headers=auth_headers(tenant.id))
        assert resp.status_code == 404
        assert resp.json()["detail"] == "queue_is_empty"
    finally:
        teardown_fake_redis()


# ──────────────────────────────────────────────
# Tests — Clear Queue
# ──────────────────────────────────────────────

def test_clear_queue_removes_all_members(client: TestClient, db_session: Session):
    fake = setup_fake_redis()
    try:
        tenant, queue = make_tenant_and_queue(db_session)
        for i, nome in enumerate(["A", "B", "C"]):
            add_member(fake, tenant.id, queue.id, {"nome": nome}, offset=i * 0.001)

        resp = client.post(f"/api/v1/b2b/queue/{queue.id}/clear", headers=auth_headers(tenant.id))
        assert resp.status_code == 200
        assert resp.json()["removed_count"] == 3

        key = f"tenant:{tenant.id}:queue:{queue.id}"
        assert fake.zcard(key) == 0

        # All persisted as 'removed'
        entries = db_session.query(QueueEntry).filter_by(queue_id=queue.id, status="removed").all()
        assert len(entries) == 3
    finally:
        teardown_fake_redis()


# ──────────────────────────────────────────────
# Tests — Queue Size
# ──────────────────────────────────────────────

def test_get_queue_size(client: TestClient, db_session: Session):
    fake = setup_fake_redis()
    try:
        tenant, queue = make_tenant_and_queue(db_session)
        add_member(fake, tenant.id, queue.id, {"nome": "X"}, offset=0)
        add_member(fake, tenant.id, queue.id, {"nome": "Y"}, offset=0.001)

        resp = client.get(f"/api/v1/b2b/queue/{queue.id}/size", headers=auth_headers(tenant.id))
        assert resp.status_code == 200
        assert resp.json()["size"] == 2
    finally:
        teardown_fake_redis()


def test_get_queue_size_empty(client: TestClient, db_session: Session):
    fake = setup_fake_redis()
    try:
        tenant, queue = make_tenant_and_queue(db_session)
        resp = client.get(f"/api/v1/b2b/queue/{queue.id}/size", headers=auth_headers(tenant.id))
        assert resp.status_code == 200
        assert resp.json()["size"] == 0
    finally:
        teardown_fake_redis()
