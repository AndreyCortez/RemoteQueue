from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Dict, Any

from api.dependencies.security import get_current_tenant_id
from api.dependencies.websockets import manager as websocket_manager
from api.database.postgres import get_db
from api.database.models import QueueConfig
from api.database.redis import get_redis_client, QueueManager

router = APIRouter(prefix="/api/v1/queue", tags=["Queue"])

class JoinQueueRequest(BaseModel):
    queue_id: str
    user_data: Dict[str, Any]

class CallNextRequest(BaseModel):
    queue_id: str

def validate_payload_against_schema(payload: dict, schema: dict):
    """
    Validates a simple B2C payload dictionary against a specified JSON Schema.
    Type checker for 'string', 'integer', 'boolean' requirements.
    """
    for field, required_type in schema.items():
        if field not in payload:
            raise HTTPException(status_code=422, detail=f"Missing required field: {field}")
        value = payload[field]
        if required_type == "string" and not isinstance(value, str):
            raise HTTPException(status_code=422, detail=f"Field {field} must be a string")
        elif required_type == "integer" and not isinstance(value, int):
            raise HTTPException(status_code=422, detail=f"Field {field} must be an integer")
        elif required_type == "boolean" and not isinstance(value, bool):
            raise HTTPException(status_code=422, detail=f"Field {field} must be a boolean")

@router.websocket("/{queue_id}/ws")
async def websocket_queue_endpoint(websocket: WebSocket, queue_id: str):
    await websocket_manager.connect(websocket, queue_id)
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        websocket_manager.disconnect(websocket, queue_id)

@router.get("/{queue_id}")
def get_queue_info(queue_id: str, db: Session = Depends(get_db)):
    """Public endpoint for B2C clients to fetch the form schema and queue name before joining."""
    queue_config = db.query(QueueConfig).filter(QueueConfig.id == queue_id).first()
    if not queue_config:
        raise HTTPException(status_code=404, detail="Queue not found")
    return {
        "id": queue_config.id,
        "name": queue_config.name,
        "form_schema": queue_config.form_schema
    }

@router.post("/join")
def join_queue(
    request: JoinQueueRequest,
    db: Session = Depends(get_db),
    client=Depends(get_redis_client)
):
    queue_config = db.query(QueueConfig).filter(QueueConfig.id == request.queue_id).first()
    if not queue_config:
        raise HTTPException(status_code=404, detail="Queue not found")

    tenant_id = queue_config.tenant_id
    if queue_config.form_schema:
        validate_payload_against_schema(request.user_data, queue_config.form_schema)

    manager = QueueManager(client)
    position = manager.join_queue(tenant_id, request.queue_id, request.user_data)
    return {"status": "success", "position": position, "queue_id": request.queue_id}

@router.post("/call-next")
async def call_next(
    request: CallNextRequest,
    tenant_id: str = Depends(get_current_tenant_id),
    client=Depends(get_redis_client)
):
    manager = QueueManager(client)
    user_data = manager.call_next(tenant_id, request.queue_id)
    if not user_data:
        raise HTTPException(status_code=404, detail="queue_is_empty")
    await websocket_manager.broadcast_to_queue(request.queue_id, {"event": "queue_advanced"})
    return {"status": "user_called", "user_data": user_data}
