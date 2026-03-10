import uuid
from sqlalchemy import Column, String, ForeignKey, JSON, DateTime, Boolean, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from api.database.postgres import Base

# sqlite fallback for UUID emulation during tests
class GUID(UUID):
    def __init__(self, *args, **kwargs):
        kwargs['as_uuid'] = True
        super().__init__(*args, **kwargs)

def generate_uuid():
    return str(uuid.uuid4())

class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String, index=True, nullable=False)

    users = relationship("B2BUser", back_populates="tenant", cascade="all, delete-orphan")
    queues = relationship("QueueConfig", back_populates="tenant", cascade="all, delete-orphan")

class B2BUser(Base):
    __tablename__ = "b2b_users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)

    tenant = relationship("Tenant", back_populates="users")

class QueueConfig(Base):
    __tablename__ = "queue_configs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    name = Column(String, nullable=False)

    # JSON schema defining required fields from B2C users (e.g. {"name": "string", "cpf": "string"})
    form_schema = Column(JSON, nullable=False, default={})

    qr_rotation_enabled = Column(Boolean, nullable=False, default=False)
    qr_rotation_interval = Column(Integer, nullable=False, default=300)

    tenant = relationship("Tenant", back_populates="queues")

class QueueEntry(Base):
    """Persists every queue participation for audit/analytics. Redis handles live state."""
    __tablename__ = "queue_entries"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    queue_id = Column(String(36), ForeignKey("queue_configs.id"), nullable=False, index=True)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    user_data = Column(JSON, nullable=False)
    status = Column(String, nullable=False, default="waiting")  # waiting | called | removed
    joined_at = Column(DateTime, server_default=func.now())
    resolved_at = Column(DateTime, nullable=True)
