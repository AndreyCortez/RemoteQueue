import { useEffect, useRef } from 'react';

/**
 * Connects to the queue WebSocket and calls onMessage for each received message.
 * Automatically reconnects with exponential backoff (1s → 2s → 4s → … → 30s max)
 * when the connection drops.
 */
export function useQueueWebSocket(
    queueId: string | null,
    onMessage: (msg: unknown) => void,
) {
    const onMessageRef = useRef(onMessage);
    onMessageRef.current = onMessage;

    useEffect(() => {
        if (!queueId) return;

        let active = true;
        let delay = 1000;

        function connect() {
            if (!active) return;
            const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
            const ws = new WebSocket(`${protocol}://${location.host}/api/v1/queue/${queueId}/ws`);

            ws.onmessage = (event) => {
                try {
                    onMessageRef.current(JSON.parse(event.data));
                } catch { /* ignore malformed messages */ }
            };

            ws.onclose = () => {
                if (!active) return;
                setTimeout(() => {
                    delay = Math.min(delay * 2, 30000);
                    connect();
                }, delay);
            };

            ws.onerror = () => ws.close();
        }

        connect();

        return () => {
            active = false;
            delay = 1000;
        };
    }, [queueId]);
}
