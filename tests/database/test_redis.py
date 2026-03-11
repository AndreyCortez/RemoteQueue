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


# ── reorder_member ─────────────────────────────────────────────────────────────

def _populate(qm: QueueManager, members: list[str]) -> None:
    """Adds members to queue q1/t1 in order, with distinct scores."""
    import time
    for i, name in enumerate(members):
        qm.join_queue("t1", "q1", {"nome": name})


def _names(qm: QueueManager) -> list[str]:
    """Returns current queue order as a list of names."""
    return [m["user_data"]["nome"] for m in qm.list_members("t1", "q1")]


def test_reorder_member_to_first_position(queue_manager: QueueManager):
    """Moving a member to position 0 places them before all others."""
    _populate(queue_manager, ["A", "B", "C"])
    assert queue_manager.reorder_member("t1", "q1", {"nome": "C"}, 0) is True
    names = _names(queue_manager)
    assert names[0] == "C"
    assert set(names) == {"A", "B", "C"}


def test_reorder_member_to_last_position(queue_manager: QueueManager):
    """Moving a member to the last position places them after all others."""
    _populate(queue_manager, ["A", "B", "C"])
    assert queue_manager.reorder_member("t1", "q1", {"nome": "A"}, 2) is True
    names = _names(queue_manager)
    assert names[-1] == "A"
    assert set(names) == {"A", "B", "C"}


def test_reorder_member_to_middle(queue_manager: QueueManager):
    """Moving a member to an intermediate position inserts correctly."""
    _populate(queue_manager, ["A", "B", "C", "D"])
    # Move D to position 1 → expected order: A, D, B, C
    assert queue_manager.reorder_member("t1", "q1", {"nome": "D"}, 1) is True
    names = _names(queue_manager)
    assert names[1] == "D"
    assert names[0] == "A"
    assert set(names) == {"A", "B", "C", "D"}


def test_reorder_nonexistent_member(queue_manager: QueueManager):
    """Attempting to reorder a member not in the queue returns False."""
    _populate(queue_manager, ["A", "B"])
    assert queue_manager.reorder_member("t1", "q1", {"nome": "Z"}, 0) is False


def test_reorder_invalid_position_negative(queue_manager: QueueManager):
    """Negative target position is rejected."""
    _populate(queue_manager, ["A", "B", "C"])
    assert queue_manager.reorder_member("t1", "q1", {"nome": "B"}, -1) is False


def test_reorder_invalid_position_out_of_bounds(queue_manager: QueueManager):
    """Target position >= queue size is rejected."""
    _populate(queue_manager, ["A", "B", "C"])
    assert queue_manager.reorder_member("t1", "q1", {"nome": "A"}, 10) is False


def test_reorder_preserves_fifo_for_others(queue_manager: QueueManager):
    """After reorder, members not moved retain their relative FIFO order."""
    _populate(queue_manager, ["A", "B", "C", "D", "E"])
    # Move E to position 2 → A, B, E, C, D
    queue_manager.reorder_member("t1", "q1", {"nome": "E"}, 2)
    names = _names(queue_manager)
    # A and B still before E, C and D still after E
    assert names.index("A") < names.index("E")
    assert names.index("B") < names.index("E")
    assert names.index("E") < names.index("C")
    assert names.index("E") < names.index("D")
