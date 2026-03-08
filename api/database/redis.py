import time
import json
from typing import Dict, Any, Optional
import redis

# Redis connection stub (in prod this should use settings.redis_url and connection pooling)
def get_redis_client():
    """Stub connection, easily patchable by tests."""
    return redis.Redis(host='localhost', port=6379, db=1, decode_responses=True)

class QueueManager:
    def __init__(self, client: redis.Redis):
        self.redis = client

    def get_queue_key(self, tenant_id: str, queue_id: str) -> str:
        """Deterministically bounds queue ops to a specific tenant preventing IDOR."""
        return f"tenant:{tenant_id}:queue:{queue_id}"

    def join_queue(self, tenant_id: str, queue_id: str, user_data: Dict[str, Any]) -> int:
        """
        Inserts user into sorted set using timestamp.
        Returns the zero-indexed position (0 means next in line).
        """
        key = self.get_queue_key(tenant_id, queue_id)
        entry_score = time.time()
        
        # Serialize payloads safely. Not using pickle mitigates RCE risks.
        payload = json.dumps(user_data, sort_keys=True) 
        
        # zadd with rank resolution is atomic relative to insertions
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
        
        # zpopmin removes and returns the smallest score element
        result = self.redis.zpopmin(key, count=1)
        if not result:
            return None
            
        payload, _score = result[0]
        return json.loads(payload)
