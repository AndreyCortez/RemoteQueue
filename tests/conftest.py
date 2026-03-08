import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from api.config import settings
# Force SQLite memory DB globally before any app imports happen
settings.database_url = "sqlite:///:memory:"

# Create a single shared in-memory engine using StaticPool so all connections
# (test client, db_session fixture) share the exact same database instance.
_test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_test_engine)

# Patch the engine and SessionLocal in postgres before importing the app
import api.database.postgres as _postgres_module
_postgres_module.engine = _test_engine
_postgres_module.SessionLocal = _TestSessionLocal

from api.main import app
from api.database.postgres import Base
from api.database import models  # noqa: F401 — ensures models are registered on Base


@pytest.fixture(autouse=True)
def reset_db():
    """Creates and drops all tables around each test for complete isolation."""
    Base.metadata.create_all(bind=_test_engine)
    yield
    Base.metadata.drop_all(bind=_test_engine)


@pytest.fixture
def client() -> TestClient:
    """Fixture providing an easy, synchronized test client for endpoints."""
    return TestClient(app)


@pytest.fixture
def db_session():
    """Provides a fresh database session for direct DB manipulation in tests."""
    db = _TestSessionLocal()
    try:
        yield db
    finally:
        db.close()
