from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    tenant_secret_key: str = "super_secret_test_key_change_in_production"
    algorithm: str = "HS256"
    database_url: str = "sqlite:///./test_saas.db"
    redis_url: str = "redis://localhost:6379/1"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    class Config:
        env_file = ".env"

settings = Settings()
