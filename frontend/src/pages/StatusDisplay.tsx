import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';

const API_BASE = '/api/v1';

interface CalledEntry {
    user_data: Record<string, unknown>;
    called_at: number;
}

interface QueueStatus {
    queue_id: string;
    name: string;
    queue_size: number;
    last_called: Record<string, unknown> | null;
}

/**
 * StatusDisplay — real-time TV display for physical establishments.
 * Shows who was just called + how many people are waiting.
 * Accessible publicly via /display/status?q=<queue_id>
 */
export default function StatusDisplay() {
    const [searchParams] = useSearchParams();
    const queueId = searchParams.get('q');

    const [status, setStatus] = useState<QueueStatus | null>(null);
    const [calledHistory, setCalledHistory] = useState<CalledEntry[]>([]);
    const [flash, setFlash] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchStatus = async () => {
        if (!queueId) return;
        try {
            const res = await axios.get(`${API_BASE}/queue/${queueId}/status`);
            setStatus(res.data);
        } catch {
            setLoadError(true);
        }
    };

    useEffect(() => {
        fetchStatus();
    }, [queueId]);

    // WebSocket for real-time updates
    useEffect(() => {
        if (!queueId) return;
        const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
        const ws = new WebSocket(`${protocol}://${location.host}/api/v1/queue/${queueId}/ws`);

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);

            if (msg.event === 'queue_member_called' && msg.called) {
                const entry: CalledEntry = { user_data: msg.called, called_at: Date.now() };
                setCalledHistory(prev => [entry, ...prev].slice(0, 5));
                setStatus(prev => prev ? { ...prev, last_called: msg.called, queue_size: Math.max(0, (prev.queue_size ?? 1) - 1) } : prev);

                // Flash animation
                setFlash(true);
                if (flashTimer.current) clearTimeout(flashTimer.current);
                flashTimer.current = setTimeout(() => setFlash(false), 2000);
            } else if (msg.event === 'queue_advanced' || msg.event === 'queue_cleared') {
                fetchStatus();
            }
        };

        return () => { ws.close(); if (flashTimer.current) clearTimeout(flashTimer.current); };
    }, [queueId]);

    if (loadError) {
        return (
            <div style={tvStyle}>
                <div style={{ textAlign: 'center' }}>
                    <h1 style={{ fontSize: '5rem' }}>⚠️</h1>
                    <p style={{ color: '#94a3b8', fontSize: '1.5rem' }}>Fila não encontrada</p>
                </div>
            </div>
        );
    }

    if (!status) {
        return (
            <div style={tvStyle}>
                <div style={{ width: 60, height: 60, border: '4px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 600ms linear infinite' }} />
            </div>
        );
    }

    const latestCalled = calledHistory[0];

    return (
        <div style={tvStyle}>
            {/* Background animated orbs */}
            <div style={{ position: 'absolute', top: '-15vw', right: '-15vw', width: '60vw', height: '60vw', background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: '-15vw', left: '-15vw', width: '50vw', height: '50vw', background: 'radial-gradient(circle, rgba(16,185,129,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />

            <div style={{ width: '100%', maxWidth: 1200, padding: '40px 60px', zIndex: 1 }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 60, paddingBottom: 32, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <h1 style={{
                        fontSize: 'clamp(1.5rem, 4vw, 3rem)', fontWeight: 800, letterSpacing: '-0.03em',
                        background: 'linear-gradient(135deg, #f1f5f9 0%, #6366f1 100%)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
                    }}>
                        {status.name}
                    </h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', animation: 'pulse 2s ease-in-out infinite' }} />
                        <span style={{ color: '#10b981', fontSize: '0.9rem', fontWeight: 600 }}>AO VIVO</span>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
                    {/* LEFT: Called user */}
                    <div style={{
                        background: flash
                            ? 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(16,185,129,0.05))'
                            : 'rgba(255,255,255,0.03)',
                        border: flash ? '1px solid rgba(16,185,129,0.5)' : '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 24, padding: 40,
                        transition: 'all 600ms ease',
                        boxShadow: flash ? '0 0 60px rgba(16,185,129,0.2)' : 'none'
                    }}>
                        <p style={{ color: '#94a3b8', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 24 }}>
                            {latestCalled ? '✅ Chamando agora' : 'Próxima chamada'}
                        </p>

                        {latestCalled ? (
                            <div>
                                {Object.entries(latestCalled.user_data).map(([key, val]) => (
                                    <div key={key} style={{ marginBottom: 16 }}>
                                        <p style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: 4 }}>
                                            {key}
                                        </p>
                                        <p style={{
                                            fontSize: 'clamp(2rem, 4vw, 4rem)', fontWeight: 800, color: '#f1f5f9',
                                            letterSpacing: '-0.02em', lineHeight: 1.1,
                                            animation: flash ? 'slide-up 400ms ease' : 'none'
                                        }}>
                                            {String(val)}
                                        </p>
                                    </div>
                                ))}
                                <p style={{ color: '#64748b', fontSize: '0.75rem', marginTop: 24 }}>
                                    {new Date(latestCalled.called_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </p>
                            </div>
                        ) : (
                            <p style={{ color: '#475569', fontSize: '1.2rem' }}>
                                Aguardando...
                            </p>
                        )}
                    </div>

                    {/* RIGHT: Stats + History */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        {/* Queue counter */}
                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 24, padding: 32, textAlign: 'center' }}>
                            <p style={{ color: '#94a3b8', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                                Na fila
                            </p>
                            <p data-testid="live-queue-size" style={{
                                fontSize: 'clamp(4rem, 10vw, 9rem)', fontWeight: 900, lineHeight: 1,
                                color: status.queue_size === 0 ? '#10b981' : '#f1f5f9'
                            }}>
                                {status.queue_size}
                            </p>
                            <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: 8 }}>
                                {status.queue_size === 0 ? '🎉 fila vazia' : status.queue_size === 1 ? 'pessoa esperando' : 'pessoas esperando'}
                            </p>
                        </div>

                        {/* Recent calls history */}
                        {calledHistory.length > 0 && (
                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 24, padding: 24, flex: 1 }}>
                                <p style={{ color: '#94a3b8', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
                                    Últimas chamadas
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {calledHistory.map((entry, i) => (
                                        <div key={entry.called_at} style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            opacity: 1 - i * 0.18,
                                            padding: '8px 0',
                                            borderBottom: i < calledHistory.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none'
                                        }}>
                                            <span style={{ color: '#f1f5f9', fontWeight: 600, fontSize: '0.95rem' }}>
                                                {Object.values(entry.user_data).join(' · ')}
                                            </span>
                                            <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
                                                {new Date(entry.called_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.5; transform: scale(0.85); }
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                @keyframes slide-up {
                    from { opacity: 0.3; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}

const tvStyle: React.CSSProperties = {
    minHeight: '100vh', width: '100%',
    background: '#0a0e1a',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative', overflow: 'hidden',
    fontFamily: 'Inter, -apple-system, sans-serif',
    color: '#f1f5f9'
};
