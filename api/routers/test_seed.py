"""
Test-only seed endpoint for E2E testing.
Creates a Tenant + B2BUser pair for login testing.
Gated by ENVIRONMENT != 'production' as a safety net.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from passlib.context import CryptContext
import os

from api.database.postgres import get_db
from api.database.models import Tenant, B2BUser

router = APIRouter(prefix="/api/v1/test", tags=["Test Seed"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class SeedRequest(BaseModel):
    tenant_name: str
    email: str
    password: str


@router.post("/seed-b2b")
def seed_b2b_user(payload: SeedRequest, db: Session = Depends(get_db)):
    """Creates a tenant + B2B user for E2E testing. Blocked in production."""
    if os.environ.get("ENVIRONMENT") == "production":
        raise HTTPException(status_code=403, detail="Forbidden in production")

    existing = db.query(B2BUser).filter(B2BUser.email == payload.email).first()
    if existing:
        return {
            "status": "already_exists",
            "tenant_id": existing.tenant_id,
            "user_id": existing.id,
            "email": existing.email
        }

    tenant = Tenant(name=payload.tenant_name)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    user = B2BUser(
        tenant_id=tenant.id,
        email=payload.email,
        hashed_password=pwd_context.hash(payload.password)
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "status": "created",
        "tenant_id": tenant.id,
        "user_id": user.id,
        "email": user.email
    }
