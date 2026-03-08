from fastapi import HTTPException, Header, Depends
import jwt
from typing import Optional
from api.config import settings

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
