#!/usr/bin/env python3
"""
CLI script to bootstrap the first superadmin user.

Usage:
    python scripts/create_admin.py --email admin@remotequeue.com --password s3cr3t

Creates a dedicated "Remote Queue" tenant (if none exists) and a B2BUser
with is_superadmin=True attached to it.
"""
import argparse
import sys
import os

# Ensure the project root is on the path so api.* imports work
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from passlib.context import CryptContext
from sqlalchemy.orm import Session

from api.database.postgres import engine, SessionLocal, Base
from api.database.models import Tenant, B2BUser

Base.metadata.create_all(bind=engine)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def create_admin(email: str, password: str) -> None:
    db: Session = SessionLocal()
    try:
        existing = db.query(B2BUser).filter(B2BUser.email == email).first()
        if existing:
            if existing.is_superadmin:
                print(f"Superadmin {email!r} already exists.")
            else:
                existing.is_superadmin = True
                db.commit()
                print(f"Promoted existing user {email!r} to superadmin.")
            return

        # Reuse or create the internal admin tenant
        admin_tenant = (
            db.query(Tenant).filter(Tenant.name == "__remotequeue_admin__").first()
            or Tenant(name="__remotequeue_admin__")
        )
        if not admin_tenant.id:
            db.add(admin_tenant)
            db.flush()

        user = B2BUser(
            tenant_id=admin_tenant.id,
            email=email,
            hashed_password=pwd_context.hash(password),
            is_superadmin=True,
        )
        db.add(user)
        db.commit()
        print(f"Superadmin {email!r} created successfully.")
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create a superadmin user")
    parser.add_argument("--email", required=True, help="Admin email address")
    parser.add_argument("--password", required=True, help="Admin password")
    args = parser.parse_args()
    create_admin(args.email, args.password)
