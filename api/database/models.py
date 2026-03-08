import uuid
from sqlalchemy import Column, String, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
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

    tenant = relationship("Tenant", back_populates="queues")
