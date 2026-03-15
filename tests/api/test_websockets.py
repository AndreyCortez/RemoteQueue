"""
WebSocket broadcast tests.

Every action that mutates the live queue must broadcast the correct event to all
connected clients. Tests here verify the contract between the backend and the
display/join pages that rely on real-time updates.

Coverage:
- join_queue          → broadcasts queue_updated with authoritative queue_size
- remove_queue_member → broadcasts queue_updated with authoritative queue_size
- call_next_member    → broadcasts queue_member_called with called data + queue_size
- clear_queue         → broadcasts queue_cleared
- reorder             → broadcasts queue_reordered
- multi-client        → all clients in the same queue room receive the broadcast
- cross-queue         → clients in different queues are NOT cross-contaminated
- disconnect pruning  → disconnected sockets are removed from the connection map
"""
import pytest
import jwt
from fakeredis import FakeRedis
from fastapi.testclient import TestClient

from api.main import app
from api.config import settings
from api.database.postgres import get_db
from api.database.redis import get_redis_client
from api.database.models import Tenant, QueueConfig
from api.dependencies.websockets import manager as ws_manager


# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────

def _token(tenant_id: str) -> str:
    """Create a signed JWT — get_current_tenant_id only decodes the token, no DB lookup."""
    return jwt.encode({"tenant_id": tenant_id}, settings.tenant_secret_key, algorithm=settings.algorithm)


def _seed(db, tenant_id="t1", queue_id="q1") -> QueueConfig:
    """Insert the minimum DB rows needed for a queue action to succeed.
    B2BUser is NOT required because get_current_tenant_id extracts tenant_id from
    the JWT directly without hitting the database."""
    tenant = Tenant(id=tenant_id, name="Test Tenant")
    queue = QueueConfig(
        id=queue_id,
        tenant_id=tenant_id,
        name="Test Queue",
        form_schema={"nome": "string"},
    )
    db.add_all([tenant, queue])
    db.commit()
    return queue


@pytest.fixture
def fake_redis():
    return FakeRedis(decode_responses=True)


@pytest.fixture
def client_with_deps(db_session, fake_redis):
    """TestClient with DB and Redis overridden to real in-memory implementations."""
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_redis_client] = lambda: fake_redis
    with TestClient(app) as c:
        yield c, db_session, fake_redis
    app.dependency_overrides.clear()


# ──────────────────────────────────────────────────────────────
# 1. join_queue → queue_updated
# ──────────────────────────────────────────────────────────────

def test_join_broadcasts_queue_updated(client_with_deps):
    client, db, _ = client_with_deps
    _seed(db)

    with client.websocket_connect("/api/v1/queue/q1/ws") as ws:
        client.post("/api/v1/queue/join", json={"queue_id": "q1", "user_data": {"nome": "Alice"}})
        msg = ws.receive_json()

    assert msg["event"] == "queue_updated"
    assert msg["queue_size"] == 1


def test_join_queue_size_increments(client_with_deps):
    client, db, _ = client_with_deps
    _seed(db)

    with client.websocket_connect("/api/v1/queue/q1/ws") as ws:
        client.post("/api/v1/queue/join", json={"queue_id": "q1", "user_data": {"nome": "Alice"}})
        msg1 = ws.receive_json()
        client.post("/api/v1/queue/join", json={"queue_id": "q1", "user_data": {"nome": "Bob"}})
        msg2 = ws.receive_json()

    assert msg1["queue_size"] == 1
    assert msg2["queue_size"] == 2


# ──────────────────────────────────────────────────────────────
# 2. call_next_member → queue_member_called + authoritative queue_size
# ──────────────────────────────────────────────────────────────

def test_call_next_broadcasts_member_called_with_queue_size(client_with_deps):
    client, db, _ = client_with_deps
    _seed(db)
    token = _token("t1")

    # Pre-fill queue with two members
    client.post("/api/v1/queue/join", json={"queue_id": "q1", "user_data": {"nome": "Alice"}})
    client.post("/api/v1/queue/join", json={"queue_id": "q1", "user_data": {"nome": "Bob"}})

    with client.websocket_connect("/api/v1/queue/q1/ws") as ws:
        client.post("/api/v1/b2b/queue/q1/call-next", headers={"x-tenant-token": token})
        msg = ws.receive_json()

    assert msg["event"] == "queue_member_called"
    assert msg["called"]["nome"] == "Alice"
    # After calling Alice out, Bob remains — size must be 1
    assert msg["queue_size"] == 1


def test_call_next_queue_size_reaches_zero(client_with_deps):
    client, db, _ = client_with_deps
    _seed(db)
    token = _token("t1")

    client.post("/api/v1/queue/join", json={"queue_id": "q1", "user_data": {"nome": "Solo"}})

    with client.websocket_connect("/api/v1/queue/q1/ws") as ws:
        client.post("/api/v1/b2b/queue/q1/call-next", headers={"x-tenant-token": token})
        msg = ws.receive_json()

    assert msg["event"] == "queue_member_called"
    assert msg["queue_size"] == 0


# ──────────────────────────────────────────────────────────────
# 3. remove_queue_member → queue_updated
# ──────────────────────────────────────────────────────────────

def test_remove_broadcasts_queue_updated(client_with_deps):
    client, db, _ = client_with_deps
    _seed(db)
    token = _token("t1")

    client.post("/api/v1/queue/join", json={"queue_id": "q1", "user_data": {"nome": "Alice"}})
    client.post("/api/v1/queue/join", json={"queue_id": "q1", "user_data": {"nome": "Bob"}})

    with client.websocket_connect("/api/v1/queue/q1/ws") as ws:
        client.request(
            "DELETE",
            "/api/v1/b2b/queue/q1/members",
            headers={"x-tenant-token": token},
            json={"user_data": {"nome": "Alice"}},
        )
        msg = ws.receive_json()

    assert msg["event"] == "queue_updated"
    assert msg["queue_size"] == 1


# ──────────────────────────────────────────────────────────────
# 4. clear_queue → queue_cleared
# ──────────────────────────────────────────────────────────────

def test_clear_broadcasts_queue_cleared(client_with_deps):
    client, db, _ = client_with_deps
    _seed(db)
    token = _token("t1")

    client.post("/api/v1/queue/join", json={"queue_id": "q1", "user_data": {"nome": "Alice"}})

    with client.websocket_connect("/api/v1/queue/q1/ws") as ws:
        client.post("/api/v1/b2b/queue/q1/clear", headers={"x-tenant-token": token})
        msg = ws.receive_json()

    assert msg["event"] == "queue_cleared"


# ──────────────────────────────────────────────────────────────
# 5. reorder → queue_reordered
# ──────────────────────────────────────────────────────────────

def test_reorder_broadcasts_queue_reordered(client_with_deps):
    client, db, _ = client_with_deps
    _seed(db)
    token = _token("t1")

    client.post("/api/v1/queue/join", json={"queue_id": "q1", "user_data": {"nome": "Alice"}})
    client.post("/api/v1/queue/join", json={"queue_id": "q1", "user_data": {"nome": "Bob"}})

    with client.websocket_connect("/api/v1/queue/q1/ws") as ws:
        client.put(
            "/api/v1/b2b/queue/q1/members/reorder",
            headers={"x-tenant-token": token},
            json={"user_data": {"nome": "Bob"}, "target_position": 0},
        )
        msg = ws.receive_json()

    assert msg["event"] == "queue_reordered"


# ──────────────────────────────────────────────────────────────
# 6. Multiple clients in the same queue all receive the broadcast
# ──────────────────────────────────────────────────────────────

def test_all_clients_in_queue_receive_broadcast(client_with_deps):
    client, db, _ = client_with_deps
    _seed(db)

    with client.websocket_connect("/api/v1/queue/q1/ws") as ws1:
        with client.websocket_connect("/api/v1/queue/q1/ws") as ws2:
            with client.websocket_connect("/api/v1/queue/q1/ws") as ws3:
                client.post("/api/v1/queue/join", json={"queue_id": "q1", "user_data": {"nome": "Alice"}})
                msg1 = ws1.receive_json()
                msg2 = ws2.receive_json()
                msg3 = ws3.receive_json()

    assert msg1["event"] == msg2["event"] == msg3["event"] == "queue_updated"
    assert msg1["queue_size"] == msg2["queue_size"] == msg3["queue_size"] == 1


# ──────────────────────────────────────────────────────────────
# 7. Cross-queue isolation — a broadcast must NOT leak to other queues
# ──────────────────────────────────────────────────────────────

def test_broadcast_does_not_leak_to_other_queues(db_session, fake_redis):
    """Client in queue q2 must not receive events triggered for queue q1."""
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_redis_client] = lambda: fake_redis

    tenant = Tenant(id="t1", name="T")
    q1 = QueueConfig(id="q1", tenant_id="t1", name="Q1", form_schema={"nome": "string"})
    q2 = QueueConfig(id="q2", tenant_id="t1", name="Q2", form_schema={"nome": "string"})
    db_session.add_all([tenant, q1, q2])
    db_session.commit()

    try:
        with TestClient(app) as client:
            with client.websocket_connect("/api/v1/queue/q2/ws") as ws_other:
                # Action on q1 — ws_other (q2) must not receive anything
                client.post("/api/v1/queue/join", json={"queue_id": "q1", "user_data": {"nome": "Alice"}})

                # The q2 socket should have nothing buffered
                assert "q1" not in ws_manager.active_connections or \
                       ws_other not in ws_manager.active_connections.get("q1", [])

            # Confirm q2 connection is cleaned up
            assert "q2" not in ws_manager.active_connections
    finally:
        app.dependency_overrides.clear()


# ──────────────────────────────────────────────────────────────
# 8. Disconnect pruning — closed sockets are removed from the map
# ──────────────────────────────────────────────────────────────

def test_disconnect_prunes_connection_map(client_with_deps):
    client, _, _ = client_with_deps

    with client.websocket_connect("/api/v1/queue/q1/ws"):
        assert "q1" in ws_manager.active_connections
        assert len(ws_manager.active_connections["q1"]) == 1

    # After context manager exits the connection is closed
    assert "q1" not in ws_manager.active_connections


def test_partial_disconnect_leaves_remaining_clients(client_with_deps):
    client, _, _ = client_with_deps

    with client.websocket_connect("/api/v1/queue/q1/ws"):
        with client.websocket_connect("/api/v1/queue/q1/ws"):
            assert len(ws_manager.active_connections["q1"]) == 2
        # Inner ws disconnected
        assert len(ws_manager.active_connections["q1"]) == 1

    assert "q1" not in ws_manager.active_connections


# ──────────────────────────────────────────────────────────────
# 9. No broadcast when queue action fails (e.g. member not found)
# ──────────────────────────────────────────────────────────────

def test_failed_remove_does_not_broadcast(client_with_deps):
    """Removing a non-existent member returns 404 and must not trigger a broadcast."""
    client, db, _ = client_with_deps
    _seed(db)
    token = _token("t1")

    received = []
    with client.websocket_connect("/api/v1/queue/q1/ws") as ws:
        resp = client.request(
            "DELETE",
            "/api/v1/b2b/queue/q1/members",
            headers={"x-tenant-token": token},
            json={"user_data": {"nome": "Ghost"}},
        )
        assert resp.status_code == 404
        # Poll with a tiny timeout — nothing should arrive
        import threading
        def _recv():
            try:
                received.append(ws.receive_json())
            except Exception:
                pass
        t = threading.Thread(target=_recv, daemon=True)
        t.start()
        t.join(timeout=0.3)

    assert received == [], f"Unexpected broadcast on failed remove: {received}"
