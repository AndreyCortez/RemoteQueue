from fastapi import HTTPException, Header, Depends
import jwt
from datetime import datetime, timedelta, timezone
from typing import Optional
from api.config import settings


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Generates a signed JWT embedding tenant_id for B2B session management."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=30))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.tenant_secret_key, algorithm=settings.algorithm)


def decode_and_verify_jwt(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, settings.tenant_secret_key, algorithms=[settings.algorithm])
        return payload.get("tenant_id")
    except jwt.PyJWTError:
        return None


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
