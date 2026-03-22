import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import type { TenantBranding } from '../types/formSchema';
import { useQueueWebSocket } from '../hooks/useQueueWebSocket';

const API_BASE = '/api/v1';

function formatWait(seconds: number): string {
    if (seconds < 60) return '< 1 min';
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    if (h > 0) return m > 0 ? `~${h}h ${m}min` : `~${h}h`;
    return `~${m} min`;
}

interface CalledEntry {
    user_data: Record<string, unknown>;
    called_at: number;
}

interface QueueStatus {
    queue_id: string;
    name: string;
    queue_size: number;
    last_called: Record<string, unknown> | null;
    estimated_wait_seconds: number | null;
    sample_size: number;
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
    const [branding, setBranding] = useState<TenantBranding | null>(null);
    const [calledHistory, setCalledHistory] = useState<CalledEntry[]>([]);
    const [flash, setFlash] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchInitialData = useCallback(async () => {
        if (!queueId) return;
        try {
            const [statusRes, infoRes] = await Promise.all([
                axios.get(`${API_BASE}/queue/${queueId}/status`),
                axios.get(`${API_BASE}/queue/${queueId}`),
            ]);
            setStatus(statusRes.data);
            setBranding(infoRes.data.branding || null);
        } catch {
            setLoadError(true);
        }
    }, [queueId]);

    useEffect(() => {
        fetchInitialData();
    }, [fetchInitialData]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleWsMessage = useCallback((msg: any) => {
        if (msg.event === 'queue_member_called' && msg.called) {
            const entry: CalledEntry = { user_data: msg.called, called_at: Date.now() };
            setCalledHistory(prev => [entry, ...prev].slice(0, 5));
            setStatus(prev => prev ? {
                ...prev,
                last_called: msg.called,
                queue_size: msg.queue_size ?? Math.max(0, (prev.queue_size ?? 1) - 1),
                estimated_wait_seconds: msg.estimated_wait_seconds ?? prev.estimated_wait_seconds,
                sample_size: msg.sample_size ?? prev.sample_size,
            } : prev);

            setFlash(true);
            if (flashTimer.current) clearTimeout(flashTimer.current);
            flashTimer.current = setTimeout(() => setFlash(false), 2000);
        } else if (msg.event === 'queue_updated') {
            setStatus(prev => prev ? {
                ...prev,
                queue_size: msg.queue_size,
                estimated_wait_seconds: msg.estimated_wait_seconds ?? prev.estimated_wait_seconds,
                sample_size: msg.sample_size ?? prev.sample_size,
            } : prev);
        } else if (msg.event === 'queue_cleared') {
            fetchInitialData();
        }
    }, [fetchInitialData]);

    useQueueWebSocket(queueId, handleWsMessage);

    useEffect(() => {
        return () => { if (flashTimer.current) clearTimeout(flashTimer.current); };
    }, []);

    if (loadError) {
        return (
            <div className="" style={tvStyle}>
                <div style={{ textAlign: 'center' }}>
                    <h1 style={{ fontSize: '5rem' }}>⚠️</h1>
                    <p data-testid="status-error" style={{ color: 'var(--text-secondary)', fontSize: '1.5rem' }}>Fila não encontrada</p>
                </div>
            </div>
        );
    }

    if (!status) {
        return (
            <div className="" style={tvStyle}>
                <span
                    className="spinner"
                    role="status"
                    aria-label="Carregando"
                    style={{ width: 60, height: 60, borderWidth: 4 }}
                />
            </div>
        );
    }

    const latestCalled = calledHistory[0];

    const pageStyle: React.CSSProperties = { ...tvStyle };
    if (branding?.background_color) pageStyle.background = branding.background_color;
    const liveColor = branding?.accent_color || 'var(--accent-success)';

    return (
        <div className="" style={pageStyle}>
            <div className="status-layout">
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    flexWrap: 'wrap', gap: '12px 24px',
                    marginBottom: 60, paddingBottom: 32,
                    borderBottom: `1px solid ${branding?.primary_color || 'var(--border-subtle)'}`
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        {branding?.logo_url && (
                            <img
                                src={branding.logo_url}
                                alt={branding.company_name || ''}
                                style={{ maxHeight: 48, maxWidth: 160, objectFit: 'contain' }}
                            />
                        )}
                        <div>
                            {branding?.company_name && (
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500, marginBottom: 2 }}>
                                    {branding.company_name}
                                </p>
                            )}
                            <h1 className="heading-lg" style={{ marginBottom: 0 }}>
                                {status.name}
                            </h1>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                            width: 10, height: 10, borderRadius: '50%',
                            background: liveColor,
                            animation: 'pulse 2s ease-in-out infinite'
                        }} />
                        <span style={{ color: liveColor, fontSize: '0.9rem', fontWeight: 600 }}>
                            AO VIVO
                        </span>
                    </div>
                </div>

                <div className="status-grid">
                    {/* LEFT: Called user */}
                    <div style={{
                        background: flash ? 'rgba(16,185,129,0.07)' : 'var(--bg-card)',
                        border: flash
                            ? '1px solid rgba(16,185,129,0.3)'
                            : '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-xl)', padding: 40,
                        transition: 'background 500ms ease, border-color 500ms ease',
                    }}>
                        <p style={{
                            color: 'var(--text-secondary)', fontSize: '0.85rem',
                            textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 24
                        }}>
                            {latestCalled ? '✅ Chamando agora' : 'Próxima chamada'}
                        </p>

                        {latestCalled ? (
                            <div>
                                {Object.entries(latestCalled.user_data).map(([key, val]) => (
                                    <div key={key} style={{ marginBottom: 16 }}>
                                        <p style={{
                                            color: 'var(--text-muted)', fontSize: '0.75rem',
                                            textTransform: 'uppercase', marginBottom: 4
                                        }}>
                                            {key}
                                        </p>
                                        <p style={{
                                            fontSize: 'clamp(2rem, 4vw, 4rem)', fontWeight: 800,
                                            color: 'var(--text-primary)',
                                            letterSpacing: '-0.02em', lineHeight: 1.1,
                                            animation: flash ? 'slide-up 400ms ease' : 'none'
                                        }}>
                                            {String(val)}
                                        </p>
                                    </div>
                                ))}
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 24 }}>
                                    {new Date(latestCalled.called_at).toLocaleTimeString('pt-BR', {
                                        hour: '2-digit', minute: '2-digit', second: '2-digit'
                                    })}
                                </p>
                            </div>
                        ) : (
                            <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>
                                Aguardando...
                            </p>
                        )}
                    </div>

                    {/* RIGHT: Stats + History */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        {/* Queue counter */}
                        <div style={{
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-xl)', padding: 32, textAlign: 'center'
                        }}>
                            <p style={{
                                color: 'var(--text-secondary)', fontSize: '0.85rem',
                                textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12
                            }}>
                                Na fila
                            </p>
                            <p
                                data-testid="live-queue-size"
                                className="tabular"
                                style={{
                                    fontSize: 'clamp(4rem, 10vw, 9rem)', fontWeight: 900, lineHeight: 1,
                                    color: status.queue_size === 0 ? liveColor : 'var(--text-primary)'
                                }}
                            >
                                {status.queue_size}
                            </p>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: 8 }}>
                                {status.queue_size === 0
                                    ? 'fila vazia'
                                    : status.queue_size === 1
                                        ? 'paciente aguardando'
                                        : 'pacientes aguardando'}
                            </p>
                        </div>

                        {/* Avg service time */}
                        {status.sample_size >= 3 && status.estimated_wait_seconds != null && status.queue_size > 0 && (
                            <div style={{
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: 'var(--radius-xl)', padding: 24, textAlign: 'center'
                            }}>
                                <p style={{
                                    color: 'var(--text-secondary)', fontSize: '0.85rem',
                                    textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8
                                }}>
                                    Tempo medio de espera
                                </p>
                                <p style={{
                                    fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 700,
                                    color: branding?.primary_color || 'var(--accent-primary)',
                                    lineHeight: 1.2
                                }}>
                                    {formatWait(status.estimated_wait_seconds)}
                                </p>
                            </div>
                        )}

                        {/* Recent calls history */}
                        {calledHistory.length > 0 && (
                            <div style={{
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: 'var(--radius-xl)', padding: 24, flex: 1
                            }}>
                                <p style={{
                                    color: 'var(--text-secondary)', fontSize: '0.75rem',
                                    textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16
                                }}>
                                    Últimas chamadas
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {calledHistory.map((entry, i) => (
                                        <div
                                            key={`${entry.called_at}-${i}`}
                                            style={{
                                                display: 'flex', alignItems: 'center',
                                                justifyContent: 'space-between',
                                                opacity: 1 - i * 0.18,
                                                padding: '8px 0',
                                                borderBottom: i < calledHistory.length - 1
                                                    ? '1px solid var(--border-subtle)'
                                                    : 'none'
                                            }}
                                        >
                                            <span style={{
                                                color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.95rem'
                                            }}>
                                                {Object.values(entry.user_data).join(' · ')}
                                            </span>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                                {new Date(entry.called_at).toLocaleTimeString('pt-BR', {
                                                    hour: '2-digit', minute: '2-digit'
                                                })}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

const tvStyle: React.CSSProperties = {
    minHeight: '100vh', width: '100%',
    background: 'var(--bg-primary)',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative', overflow: 'hidden',
};
