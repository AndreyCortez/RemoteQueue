import pytest
from fastapi.testclient import TestClient
from api.main import app
from unittest.mock import MagicMock
import jwt
from typing import Generator
from api.config import settings
from api.dependencies.websockets import manager as websocket_manager

@pytest.fixture
def mock_redis():
    mock = MagicMock()
    mock.zadd.return_value = 1
    mock.zrank.return_value = 0
    mock.zpopmin.side_effect = [
        [('{"name": "Alice"}', 123456.0)], # 1st call: Alice
        []                                 # 2nd call: Empty
    ]
    return mock

@pytest.fixture
def override_db_redis(db_session, mock_redis):
    from api.database.postgres import get_db
    from api.routers.queue import get_redis_client
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_redis_client] = lambda: mock_redis
    yield
    app.dependency_overrides.clear()

def create_mock_token(tenant_id: str) -> str:
    payload = {"tenant_id": tenant_id}
    return jwt.encode(payload, settings.tenant_secret_key, algorithm=settings.algorithm)

def test_websocket_broadcast_on_call_next(client: TestClient, db_session, override_db_redis):
    # Setup Tenant and QueueConfig in DB for calling Next to succeed with a valid context
    token = create_mock_token("test_tenant")
    
    # 1. Start a websocket connection in a specific queue room
    with client.websocket_connect("/api/v1/queue/ws_queue_1/ws") as websocket:
        # Check active map internal state ensures it's tracked
        assert "ws_queue_1" in websocket_manager.active_connections
        assert len(websocket_manager.active_connections["ws_queue_1"]) == 1
        
        # 2. Trigger HTTP REST API for calling the next user on the queue
        response = client.post(
            "/api/v1/queue/call-next",
            headers={"x-tenant-token": token},
            json={"queue_id": "ws_queue_1"}
        )
        assert response.status_code == 200
        
        # 3. Assert our listening websocket received the broadcast payload immediately
        data = websocket.receive_json()
        assert data["event"] == "queue_member_called"
        assert "called" in data
        assert data["called"]["name"] == "Alice"

def test_websocket_disconnect_prunes_active_list(client: TestClient):
    with client.websocket_connect("/api/v1/queue/prune_queue/ws") as websocket:
        # We are connected
        assert "prune_queue" in websocket_manager.active_connections
        assert len(websocket_manager.active_connections["prune_queue"]) == 1
    
    # Connection context manager closes here. Check the cleanup mechanism worked automatically
    assert "prune_queue" not in websocket_manager.active_connections
