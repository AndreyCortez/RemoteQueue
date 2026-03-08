import pytest
import fakeredis
from api.database.redis import QueueManager

@pytest.fixture
def mock_redis():
    """Provides an isolated, in-memory Redis equivalent for strict unit testing."""
    return fakeredis.FakeStrictRedis(decode_responses=True)

@pytest.fixture
def queue_manager(mock_redis):
    return QueueManager(mock_redis)

def test_tenant_queue_isolation(queue_manager: QueueManager):
    """Ensure identical queue logic strictly partitions different tenants."""
    user = {"name": "TestUser"}
    queue_manager.join_queue("tenant_A", "balcao_1", user)
    
    # User shouldn't exist in Tenant B's queue
    tenant_b_pos = queue_manager.get_position("tenant_B", "balcao_1", user)
    assert tenant_b_pos is None
    
    tenant_a_pos = queue_manager.get_position("tenant_A", "balcao_1", user)
    assert tenant_a_pos == 0

def test_queue_fifo_ordering(queue_manager: QueueManager):
    """Ensure timestamp-based ordered extraction resolves strict FIFO."""
    u1 = {"name": "First"}
    u2 = {"name": "Second"}
    u3 = {"name": "Third"}
    
    pos1 = queue_manager.join_queue("t1", "q1", u1)
    pos2 = queue_manager.join_queue("t1", "q1", u2)
    pos3 = queue_manager.join_queue("t1", "q1", u3)
    
    assert pos1 == 0
    assert pos2 == 1
    assert pos3 == 2
    
    # Confirm exact positions changed after one pop
    assert queue_manager.call_next("t1", "q1") == u1
    assert queue_manager.get_position("t1", "q1", u2) == 0
    assert queue_manager.get_position("t1", "q1", u3) == 1
    
def test_call_next_on_empty(queue_manager: QueueManager):
    """Empty queue yields safely."""
    assert queue_manager.call_next("t1", "empty_q") is None
