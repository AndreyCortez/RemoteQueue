from fastapi import HTTPException, Header
import jwt
from datetime import datetime, timedelta, timezone
from typing import Optional
from api.config import settings


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Generates a signed JWT. Accepts arbitrary claims (tenant_id, role, user_id, etc.)."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=30))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.tenant_secret_key, algorithm=settings.algorithm)


def _decode_jwt(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.tenant_secret_key, algorithms=[settings.algorithm])
    except jwt.PyJWTError:
        return None


def decode_and_verify_jwt(token: str) -> Optional[str]:
    payload = _decode_jwt(token)
    if payload is None:
        return None
    return payload.get("tenant_id")


def get_current_tenant_id(x_tenant_token: str = Header(..., description="JWT token supplied by B2B panel containing tenant boundaries.")) -> str:
    """
    Core IDOR prevention dependency.
    Every single authenticated route MUST use this to extract the context.
    """
    decoded_tenant_id = decode_and_verify_jwt(x_tenant_token)

    if not decoded_tenant_id:
        raise HTTPException(
            status_code=401,
            detail="tenant_identity_compromised"
        )

    return decoded_tenant_id


def get_current_admin_user_id(x_tenant_token: str = Header(..., description="Superadmin JWT token.")) -> str:
    """
    RBAC dependency for all /admin/* routes.
    Verifies JWT has role='superadmin'. Returns the admin user_id.
    Raises 403 if role is missing or wrong.
    """
    payload = _decode_jwt(x_tenant_token)
    if not payload:
        raise HTTPException(status_code=401, detail="invalid_token")
    if payload.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="superadmin_required")
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="invalid_token")
    return user_id
