import pytest
from fastapi.testclient import TestClient

from api.config import settings
# Force SQLite memory DB globally before any app imports happen
settings.database_url = "sqlite:///:memory:"

from api.main import app
from api.database.postgres import Base, engine, SessionLocal
from api.database import models

@pytest.fixture
def client() -> TestClient:
    """Fixture providing an easy, synchronized test client for endpoints."""
    return TestClient(app)

@pytest.fixture
def db_session():
    """Provides a fresh, isolated database transaction wrapping SQL Alchemy tests."""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)
