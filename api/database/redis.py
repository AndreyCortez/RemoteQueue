import time
import json
import secrets
from typing import Dict, Any, Optional, List
import redis

from api.config import settings

# Redis connection stub (in prod this should use settings.redis_url and connection pooling)
def get_redis_client():
    """Stub connection, easily patchable by tests."""
    return redis.from_url(settings.redis_url, decode_responses=True)

class QueueManager:
    def __init__(self, client: redis.Redis):
        self.redis = client

    def get_queue_key(self, tenant_id: str, queue_id: str) -> str:
        """Deterministically bounds queue ops to a specific tenant preventing IDOR."""
        return f"tenant:{tenant_id}:queue:{queue_id}"

    def get_access_code_key(self, queue_id: str) -> str:
        return f"access_code:{queue_id}"

    def generate_access_code(self, queue_id: str, ttl: int) -> str:
        code = secrets.token_urlsafe(8)
        self.redis.setex(self.get_access_code_key(queue_id), ttl, code)
        return code

    def validate_access_code(self, queue_id: str, code: str) -> bool:
        stored = self.redis.get(self.get_access_code_key(queue_id))
        return stored == code

    def get_current_access_code(self, queue_id: str) -> Optional[str]:
        return self.redis.get(self.get_access_code_key(queue_id))

    def get_access_code_ttl(self, queue_id: str) -> int:
        return self.redis.ttl(self.get_access_code_key(queue_id))

    def join_queue(self, tenant_id: str, queue_id: str, user_data: Dict[str, Any]) -> int:
        """
        Inserts user into sorted set using timestamp.
        Returns the zero-indexed position (0 means next in line).
        """
        key = self.get_queue_key(tenant_id, queue_id)
        entry_score = time.time()
        payload = json.dumps(user_data, sort_keys=True)
        self.redis.zadd(key, {payload: entry_score})
        position = self.redis.zrank(key, payload)
        return position

    def get_position(self, tenant_id: str, queue_id: str, user_data: Dict[str, Any]) -> Optional[int]:
        """Gets the zero-indexed position of an existing participant."""
        key = self.get_queue_key(tenant_id, queue_id)
        payload = json.dumps(user_data, sort_keys=True)
        return self.redis.zrank(key, payload)

    def call_next(self, tenant_id: str, queue_id: str) -> Optional[Dict[str, Any]]:
        """Pops the first user efficiently (lowest score/timestamp)."""
        key = self.get_queue_key(tenant_id, queue_id)
        result = self.redis.zpopmin(key, count=1)
        if not result:
            return None
        payload, _score = result[0]
        return json.loads(payload)

    # ---- Queue Management Methods (Fase 1) ----

    def list_members(self, tenant_id: str, queue_id: str) -> List[Dict[str, Any]]:
        """Returns all queue members ordered by position with their data and join timestamp."""
        key = self.get_queue_key(tenant_id, queue_id)
        raw = self.redis.zrange(key, 0, -1, withscores=True)
        members = []
        for index, (payload, score) in enumerate(raw):
            members.append({
                "position": index,
                "user_data": json.loads(payload),
                "joined_at": score,
                "raw_payload": payload
            })
        return members

    def remove_member(self, tenant_id: str, queue_id: str, user_data: Dict[str, Any]) -> bool:
        """Removes a specific member from the queue by their data. Returns True if removed."""
        key = self.get_queue_key(tenant_id, queue_id)
        payload = json.dumps(user_data, sort_keys=True)
        removed_count = self.redis.zrem(key, payload)
        return removed_count > 0

    def reorder_member(self, tenant_id: str, queue_id: str, user_data: Dict[str, Any], target_position: int) -> bool:
        """
        Moves a member to a target position by recalculating their score.
        Uses the average of adjacent members' scores to place precisely.
        """
        key = self.get_queue_key(tenant_id, queue_id)
        payload = json.dumps(user_data, sort_keys=True)

        current_rank = self.redis.zrank(key, payload)
        if current_rank is None:
            return False

        all_members = self.redis.zrange(key, 0, -1, withscores=True)
        total = len(all_members)

        if target_position < 0 or target_position >= total:
            return False

        if target_position == 0:
            first_score = all_members[0][1] if all_members[0][0] != payload else (all_members[1][1] if total > 1 else time.time())
            new_score = first_score - 1.0
        elif target_position >= total - 1:
            last_score = all_members[-1][1] if all_members[-1][0] != payload else (all_members[-2][1] if total > 1 else time.time())
            new_score = last_score + 1.0
        else:
            scores = [s for m, s in all_members if m != payload]
            if target_position < len(scores):
                before = scores[target_position - 1] if target_position > 0 else scores[0] - 2.0
                after = scores[target_position]
                new_score = (before + after) / 2.0
            else:
                new_score = scores[-1] + 1.0

        self.redis.zadd(key, {payload: new_score})
        return True

    def clear_queue(self, tenant_id: str, queue_id: str) -> List[Dict[str, Any]]:
        """Removes all members from the queue. Returns the members that were cleared."""
        key = self.get_queue_key(tenant_id, queue_id)
        raw = self.redis.zrange(key, 0, -1, withscores=True)
        members = []
        for payload, score in raw:
            members.append({
                "user_data": json.loads(payload),
                "joined_at": score
            })
        self.redis.delete(key)
        return members

    def get_queue_size(self, tenant_id: str, queue_id: str) -> int:
        """Returns the number of members in the queue."""
        key = self.get_queue_key(tenant_id, queue_id)
        return self.redis.zcard(key)

    # ---- Wait Time Estimation (Fase 5) ----

    def _intervals_key(self, tenant_id: str, queue_id: str) -> str:
        return f"tenant:{tenant_id}:queue:{queue_id}:intervals"

    def record_call_interval(self, tenant_id: str, queue_id: str) -> None:
        """Records the timestamp of a call-next event. Computes interval from previous call."""
        key = self._intervals_key(tenant_id, queue_id)
        now = time.time()
        # Get the most recent call timestamp
        last = self.redis.lindex(key, 0)
        if last is not None:
            interval = now - float(last)
            # Only record reasonable intervals (> 5s, < 2h)
            if 5 < interval < 7200:
                self.redis.lpush(key, str(now))
                self.redis.ltrim(key, 0, 19)  # keep last 20 timestamps
                return
        # First call or unreasonable interval: just store timestamp
        self.redis.lpush(key, str(now))
        self.redis.ltrim(key, 0, 19)

    def get_avg_interval(self, tenant_id: str, queue_id: str) -> Optional[float]:
        """Computes median interval between recent calls. Returns None if < 3 data points."""
        key = self._intervals_key(tenant_id, queue_id)
        timestamps = self.redis.lrange(key, 0, 19)
        if len(timestamps) < 3:
            return None
        # timestamps are newest-first; compute intervals between consecutive ones
        floats = [float(t) for t in timestamps]
        intervals = [floats[i] - floats[i + 1] for i in range(len(floats) - 1)]
        # Filter out unreasonable intervals
        intervals = [iv for iv in intervals if 5 < iv < 7200]
        if not intervals:
            return None
        # Use median to resist outliers
        intervals.sort()
        mid = len(intervals) // 2
        if len(intervals) % 2 == 0:
            return (intervals[mid - 1] + intervals[mid]) / 2
        return intervals[mid]

    def estimate_wait(self, tenant_id: str, queue_id: str, position: int, fallback_seconds: int = 300) -> dict:
        """Returns wait estimate for a given position.
        Returns dict with estimated_wait_seconds (int|None) and sample_size (int).
        """
        key = self._intervals_key(tenant_id, queue_id)
        sample_size = max(0, self.redis.llen(key) - 1)  # intervals = timestamps - 1
        avg = self.get_avg_interval(tenant_id, queue_id)
        if avg is None:
            return {"estimated_wait_seconds": None, "sample_size": sample_size}
        return {
            "estimated_wait_seconds": round(avg * position),
            "sample_size": sample_size,
        }
