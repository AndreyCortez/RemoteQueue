import os
from fastapi import FastAPI, Depends

from api.dependencies.security import get_current_tenant_id
from api.routers import queue, tenant_setup, auth, test_seed, queue_management, admin
from api.logging_config import configure_logging, RequestLoggingMiddleware

configure_logging()

app = FastAPI(
    title="Remote Queue B2B/B2C SaaS",
    description="Backend robusto multi-tenant gerindo filas em tempo real. Possui validação dinâmica de schemas por empresa e websockets para transmissão de posições.",
    version="1.0.0"
)

app.add_middleware(RequestLoggingMiddleware)

app.include_router(auth.router)
app.include_router(queue.router)
app.include_router(tenant_setup.router)
if os.environ.get("ENVIRONMENT") != "production":
    app.include_router(test_seed.router)
app.include_router(queue_management.router)
app.include_router(admin.router)

@app.get("/")
def health_check():
    return {"status": "healthy"}

@app.get("/api/v1/secure-data")
def protected_route(tenant_id: str = Depends(get_current_tenant_id)):
    """
    Example protected route relying on the strict security dependency.
    """
    return {
        "message": "Access granted",
        "tenant_context": tenant_id
    }
