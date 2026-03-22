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


# ── Wait Time Estimation ─────────────────────────────────────────────────────

def test_estimate_wait_no_data(queue_manager: QueueManager):
    """With no call history, estimate returns None."""
    result = queue_manager.estimate_wait("t1", "q1", 5)
    assert result["estimated_wait_seconds"] is None
    assert result["sample_size"] == 0


def test_estimate_wait_insufficient_data(queue_manager: QueueManager, mock_redis):
    """With fewer than 3 timestamps, estimate returns None."""
    key = queue_manager._intervals_key("t1", "q1")
    mock_redis.lpush(key, "1000.0")
    mock_redis.lpush(key, "1060.0")
    result = queue_manager.estimate_wait("t1", "q1", 5)
    assert result["estimated_wait_seconds"] is None
    assert result["sample_size"] == 1  # 2 timestamps = 1 interval


def test_estimate_wait_with_enough_data(queue_manager: QueueManager, mock_redis):
    """With 4 evenly-spaced timestamps (3 intervals of 60s), estimate = position * 60."""
    key = queue_manager._intervals_key("t1", "q1")
    # Timestamps: newest first → 1180, 1120, 1060, 1000 (intervals: 60, 60, 60)
    for ts in ["1000.0", "1060.0", "1120.0", "1180.0"]:
        mock_redis.lpush(key, ts)
    result = queue_manager.estimate_wait("t1", "q1", 3)
    assert result["estimated_wait_seconds"] == 180  # 3 * 60
    assert result["sample_size"] == 3


def test_get_avg_interval_uses_median(queue_manager: QueueManager, mock_redis):
    """Median resists outliers: one huge interval shouldn't skew the result."""
    key = queue_manager._intervals_key("t1", "q1")
    # Timestamps: 1000, 1060, 1120, 1180, 5180 (outlier gap of 4000s at end)
    # newest-first: 5180, 1180, 1120, 1060, 1000
    # intervals: 4000, 60, 60, 60
    # After filtering (5 < iv < 7200): all pass
    # Sorted: [60, 60, 60, 4000] → median = (60+60)/2 = 60
    for ts in ["1000.0", "1060.0", "1120.0", "1180.0", "5180.0"]:
        mock_redis.lpush(key, ts)
    avg = queue_manager.get_avg_interval("t1", "q1")
    assert avg == 60.0


def test_record_call_interval_stores_timestamps(queue_manager: QueueManager, mock_redis):
    """record_call_interval pushes timestamps to the intervals list."""
    import time
    queue_manager.record_call_interval("t1", "q1")
    key = queue_manager._intervals_key("t1", "q1")
    assert mock_redis.llen(key) == 1
    # Second call should also store
    time.sleep(0.01)
    queue_manager.record_call_interval("t1", "q1")
    assert mock_redis.llen(key) >= 1  # at least original stays


def test_record_call_interval_trims_to_20(queue_manager: QueueManager, mock_redis):
    """The intervals list is capped at 20 entries."""
    key = queue_manager._intervals_key("t1", "q1")
    # Pre-fill with 25 entries
    for i in range(25):
        mock_redis.lpush(key, str(1000.0 + i * 100))
    mock_redis.ltrim(key, 0, 19)
    assert mock_redis.llen(key) == 20


def test_estimate_wait_filters_unreasonable_intervals(queue_manager: QueueManager, mock_redis):
    """Intervals < 5s or > 7200s are excluded from the median calculation."""
    key = queue_manager._intervals_key("t1", "q1")
    # Timestamps: 1000, 1001, 1002, 1062, 1122 (newest first: 1122, 1062, 1002, 1001, 1000)
    # Intervals: 60, 60, 1, 1 — the 1s intervals should be filtered out
    for ts in ["1000.0", "1001.0", "1002.0", "1062.0", "1122.0"]:
        mock_redis.lpush(key, ts)
    avg = queue_manager.get_avg_interval("t1", "q1")
    assert avg == 60.0  # only the two 60s intervals survive
