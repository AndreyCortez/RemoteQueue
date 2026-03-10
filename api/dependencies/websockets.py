from fastapi import WebSocket
from typing import Dict, List

class ConnectionManager:
    def __init__(self):
        # Format: { queue_id: [websocket_1, websocket_2, ...] }
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, queue_id: str):
        await websocket.accept()
        if queue_id not in self.active_connections:
            self.active_connections[queue_id] = []
        self.active_connections[queue_id].append(websocket)

    def disconnect(self, websocket: WebSocket, queue_id: str):
        if queue_id in self.active_connections:
            if websocket in self.active_connections[queue_id]:
                self.active_connections[queue_id].remove(websocket)
            if not self.active_connections[queue_id]:
                del self.active_connections[queue_id]

    async def broadcast_to_queue(self, queue_id: str, message: dict):
        if queue_id in self.active_connections:
            # Create a localized copy of the list to safely iterate 
            # while websockets might disconnect and mutate the host list
            connections = list(self.active_connections[queue_id])
            
            for connection in connections:
                try:
                    await connection.send_json(message)
                except Exception:
                    # If socket sending fails, safely disconnect and prune
                    self.disconnect(connection, queue_id)

# Singleton initialized globally to persist connection state across API routers
manager = ConnectionManager()
