"""
B2B Queue Management Router.
Full CRUD operations on live queue members — tenant-scoped via x-tenant-token.
Persists removals/calls to QueueEntry in PostgreSQL for audit trails.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from pydantic import BaseModel
from typing import Dict, Any

from api.dependencies.security import get_current_tenant_id
from api.dependencies.websockets import manager as websocket_manager
from api.database.postgres import get_db
from api.database.models import QueueConfig, QueueEntry
from api.database.redis import get_redis_client, QueueManager

router = APIRouter(prefix="/api/v1/b2b/queue", tags=["B2B Queue Management"])


class RemoveMemberRequest(BaseModel):
    user_data: Dict[str, Any]


class ReorderMemberRequest(BaseModel):
    user_data: Dict[str, Any]
    target_position: int


def _verify_queue_ownership(queue_id: str, tenant_id: str, db: Session) -> QueueConfig:
    """Validates queue exists AND belongs to the calling tenant (IDOR barrier)."""
    queue = db.query(QueueConfig).filter(
        QueueConfig.id == queue_id,
        QueueConfig.tenant_id == tenant_id
    ).first()
    if not queue:
        raise HTTPException(status_code=404, detail="Queue not found")
    return queue


def _persist_entry(db: Session, queue_id: str, tenant_id: str, user_data: dict, status: str):
    """Records a queue entry action in PostgreSQL for audit trails."""
    entry = QueueEntry(
        queue_id=queue_id,
        tenant_id=tenant_id,
        user_data=user_data,
        status=status,
        resolved_at=func.now() if status != "waiting" else None
    )
    db.add(entry)
    db.commit()


@router.get("/{queue_id}/members")
def list_queue_members(
    queue_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    client=Depends(get_redis_client)
):
    """Lists all current members in the queue with their form data and position."""
    _verify_queue_ownership(queue_id, tenant_id, db)
    mgr = QueueManager(client)
    members = mgr.list_members(tenant_id, queue_id)
    return [{
        "position": m["position"],
        "user_data": m["user_data"],
        "joined_at": m["joined_at"]
    } for m in members]


@router.delete("/{queue_id}/members")
async def remove_queue_member(
    queue_id: str,
    request: RemoveMemberRequest,
    tenant_id: str = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    client=Depends(get_redis_client)
):
    """Removes a specific member from the queue. Persists removal in PostgreSQL."""
    _verify_queue_ownership(queue_id, tenant_id, db)
    mgr = QueueManager(client)

    removed = mgr.remove_member(tenant_id, queue_id, request.user_data)
    if not removed:
        raise HTTPException(status_code=404, detail="Member not found in queue")

    _persist_entry(db, queue_id, tenant_id, request.user_data, "removed")
    queue_size = mgr.get_queue_size(tenant_id, queue_id)
    await websocket_manager.broadcast_to_queue(queue_id, {
        "event": "queue_updated",
        "queue_size": queue_size,
    })
    return {"status": "member_removed"}


@router.put("/{queue_id}/members/reorder")
async def reorder_queue_member(
    queue_id: str,
    request: ReorderMemberRequest,
    tenant_id: str = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    client=Depends(get_redis_client)
):
    """Moves a member to a different position in the queue."""
    _verify_queue_ownership(queue_id, tenant_id, db)
    mgr = QueueManager(client)

    success = mgr.reorder_member(tenant_id, queue_id, request.user_data, request.target_position)
    if not success:
        raise HTTPException(status_code=400, detail="Could not reorder member")

    await websocket_manager.broadcast_to_queue(queue_id, {"event": "queue_reordered"})
    return {"status": "member_reordered", "new_position": request.target_position}


@router.post("/{queue_id}/clear")
async def clear_queue(
    queue_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    client=Depends(get_redis_client)
):
    """Clears all members from the queue. Persists all entries to PostgreSQL."""
    _verify_queue_ownership(queue_id, tenant_id, db)
    mgr = QueueManager(client)

    cleared = mgr.clear_queue(tenant_id, queue_id)
    for member in cleared:
        _persist_entry(db, queue_id, tenant_id, member["user_data"], "removed")

    await websocket_manager.broadcast_to_queue(queue_id, {"event": "queue_cleared"})
    return {"status": "queue_cleared", "removed_count": len(cleared)}


@router.post("/{queue_id}/call-next")
async def call_next_member(
    queue_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    client=Depends(get_redis_client)
):
    """Pops the next person in line. Persists in PostgreSQL and broadcasts via WebSocket."""
    _verify_queue_ownership(queue_id, tenant_id, db)
    mgr = QueueManager(client)

    user_data = mgr.call_next(tenant_id, queue_id)
    if not user_data:
        raise HTTPException(status_code=404, detail="queue_is_empty")

    _persist_entry(db, queue_id, tenant_id, user_data, "called")
    queue_size = mgr.get_queue_size(tenant_id, queue_id)

    await websocket_manager.broadcast_to_queue(queue_id, {
        "event": "queue_member_called",
        "called": user_data,
        "queue_size": queue_size,
    })

    return {"status": "user_called", "user_data": user_data}


@router.get("/{queue_id}/size")
def get_queue_size(
    queue_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    client=Depends(get_redis_client)
):
    """Returns the current number of people in the queue."""
    _verify_queue_ownership(queue_id, tenant_id, db)
    mgr = QueueManager(client)
    return {"queue_id": queue_id, "size": mgr.get_queue_size(tenant_id, queue_id)}
