import uuid
from sqlalchemy import Column, String, ForeignKey, JSON, DateTime, Boolean, Integer, Text
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
    branding = Column(JSON, nullable=True, default=None)
    is_suspended = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(DateTime, server_default=func.now())

    users = relationship("B2BUser", back_populates="tenant", cascade="all, delete-orphan")
    queues = relationship("QueueConfig", back_populates="tenant", cascade="all, delete-orphan")

class B2BUser(Base):
    __tablename__ = "b2b_users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_superadmin = Column(Boolean, nullable=False, default=False, server_default="false")

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

    # Operator-configured baseline for wait time estimation (seconds per patient).
    # The system also computes a dynamic average from QueueEntry history and blends both.
    avg_service_time_seconds = Column(Integer, nullable=False, default=300)

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
    called_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)


class AdminAuditLog(Base):
    """Immutable audit trail for destructive superadmin actions."""
    __tablename__ = "admin_audit_logs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    admin_user_id = Column(String(36), ForeignKey("b2b_users.id"), nullable=False, index=True)
    action = Column(String, nullable=False)           # e.g. "suspend_tenant", "delete_tenant"
    target_tenant_id = Column(String(36), nullable=True, index=True)
    detail = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
