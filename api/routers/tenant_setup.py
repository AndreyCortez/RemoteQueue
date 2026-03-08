from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Dict, Any, List
from pydantic import BaseModel
import qrcode
import io

from api.database.postgres import get_db
from api.database.models import QueueConfig
from api.dependencies.security import get_current_tenant_id

router = APIRouter(prefix="/api/v1/b2b/queues", tags=["B2B Queue Setup"])

class QueueConfigCreate(BaseModel):
    name: str
    form_schema: Dict[str, Any]

class QueueConfigResponse(BaseModel):
    id: str
    name: str
    form_schema: Dict[str, Any]

@router.post("", response_model=QueueConfigResponse)
def create_queue_config(
    payload: QueueConfigCreate,
    tenant_id: str = Depends(get_current_tenant_id),
    db: Session = Depends(get_db)
):
    """
    Creates a new queue configuration tightly bound to the calling tenant.
    """
    new_queue = QueueConfig(
        tenant_id=tenant_id,
        name=payload.name,
        form_schema=payload.form_schema
    )
    db.add(new_queue)
    db.commit()
    db.refresh(new_queue)
    
    return new_queue

@router.get("", response_model=List[QueueConfigResponse])
def list_queues(
    tenant_id: str = Depends(get_current_tenant_id),
    db: Session = Depends(get_db)
):
    """
    Lists all queues STRICTLY BELONGING to the calling tenant.
    IDOR barrier applied.
    """
    queues = db.query(QueueConfig).filter(QueueConfig.tenant_id == tenant_id).all()
    return queues

@router.get("/{queue_id}/qrcode")
def generate_queue_qrcode(
    queue_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    db: Session = Depends(get_db)
):
    """
    Validates tenant ownership of the queue and generates a PNG QR code
    that deep-links end users to the B2C Queue Join portal.
    """
    # 1. Verify existence and ownership strictly
    queue_config = db.query(QueueConfig).filter(
        QueueConfig.id == queue_id,
        QueueConfig.tenant_id == tenant_id
    ).first()

    if not queue_config:
        raise HTTPException(status_code=404, detail="Queue not found")

    # 2. Generate the payload deep-link (Example: https://app.remotequeue.com/join?q=uuid)
    deep_link_url = f"https://app.remotequeue.com/join?q={queue_id}"

    # 3. Create the QRCode image entirely in-memory using Pillow
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(deep_link_url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")

    # 4. Save to a byte stream to bypass physical I/O constraints
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    return StreamingResponse(buf, media_type="image/png")
