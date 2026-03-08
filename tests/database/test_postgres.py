import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from api.database.postgres import Base, get_db

# Use an entirely in-memory SQLite setup for unit testing speed and isolation
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture
def db_session():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)

def test_db_session_health(db_session):
    """Ensure the test session interacts correctly with an isolated schema engine."""
    assert db_session.is_active is True
