import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import type { TenantBranding } from '../types/formSchema';
import { useQueueWebSocket } from '../hooks/useQueueWebSocket';

const API_BASE = '/api/v1';

interface QueueInfo {
    id: string;
    name: string;
    form_schema: Record<string, string>;
    branding?: TenantBranding | null;
}

export default function QRDisplay() {
    const [searchParams] = useSearchParams();
    const queueId = searchParams.get('q');

    const [queueInfo, setQueueInfo] = useState<QueueInfo | null>(null);
    const [qrData, setQrData] = useState<{ url: string; expires_in?: number } | null>(null);
    const [queueSize, setQueueSize] = useState<number | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const rotationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchData = useCallback(async () => {
        if (!queueId) { setStatus('error'); return; }
        try {
            const [infoRes, statusRes] = await Promise.all([
                axios.get(`${API_BASE}/queue/${queueId}`),
                axios.get(`${API_BASE}/queue/${queueId}/status`)
            ]);
            setQueueInfo(infoRes.data);
            setQueueSize(statusRes.data.queue_size);

            const qrRes = await axios.get(`${API_BASE}/queue/${queueId}/current-qr`);
            const fullUrl = `${window.location.origin}${qrRes.data.url}`;
            setQrData({ url: fullUrl, expires_in: qrRes.data.expires_in });

            setStatus('ready');

            if (qrRes.data.rotation_enabled && qrRes.data.expires_in) {
                if (rotationTimer.current) clearTimeout(rotationTimer.current);
                rotationTimer.current = setTimeout(fetchData, Math.max((qrRes.data.expires_in - 1) * 1000, 1000));
            }
        } catch {
            setStatus('error');
        }
    }, [queueId]);

    useEffect(() => {
        fetchData();
        return () => { if (rotationTimer.current) clearTimeout(rotationTimer.current); };
    }, [queueId, fetchData]);

    useQueueWebSocket(queueId, useCallback(async () => {
        try {
            const res = await axios.get(`${API_BASE}/queue/${queueId}/status`);
            setQueueSize(res.data.queue_size);
        } catch { /* ignore */ }
    }, [queueId]));

    if (status === 'error') {
        return (
            <div style={shellStyle}>
                <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 'clamp(1rem, 2vw, 1.3rem)', color: 'var(--text-muted)' }}>
                        Fila nao encontrada
                    </p>
                </div>
            </div>
        );
    }

    if (status === 'loading') {
        return (
            <div style={shellStyle}>
                <span className="spinner" role="status" aria-label="Carregando"
                    style={{ width: 40, height: 40, borderWidth: 3 }} />
            </div>
        );
    }

    const branding = queueInfo?.branding;
    const primaryColor = branding?.primary_color || 'var(--accent-primary)';
    const accentColor = branding?.accent_color || 'var(--accent-success)';

    const pageStyle: React.CSSProperties = {
        ...shellStyle,
        ...(branding?.background_color ? { background: branding.background_color } : {}),
    };

    const hasBrandingHeader = branding && (branding.logo_url || branding.company_name);

    return (
        <div style={pageStyle}>
            {/* Thin accent bar at top */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0,
                height: 4, background: primaryColor,
            }} />

            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', flex: 1,
                width: '100%', maxWidth: 560,
                padding: 'clamp(24px, 4vh, 48px) 24px',
                gap: 'clamp(20px, 3vh, 36px)',
            }}>
                {/* Branding + Queue name */}
                <div style={{ textAlign: 'center', width: '100%' }}>
                    {hasBrandingHeader && (
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            gap: 12, marginBottom: 'clamp(8px, 1.5vh, 16px)',
                        }}>
                            {branding.logo_url && (
                                <img
                                    src={branding.logo_url}
                                    alt=""
                                    style={{
                                        height: 'clamp(32px, 5vh, 52px)',
                                        maxWidth: 180, objectFit: 'contain',
                                    }}
                                />
                            )}
                            {branding.company_name && (
                                <span style={{
                                    fontSize: 'clamp(0.85rem, 1.5vw, 1.1rem)',
                                    fontWeight: 600, color: 'var(--text-secondary)',
                                    letterSpacing: '-0.01em',
                                }}>
                                    {branding.company_name}
                                </span>
                            )}
                        </div>
                    )}

                    <h1 style={{
                        fontSize: 'clamp(1.5rem, 4vw, 2.5rem)',
                        fontWeight: 700, letterSpacing: '-0.025em',
                        color: 'var(--text-primary)', lineHeight: 1.15,
                        margin: 0,
                    }}>
                        {queueInfo?.name}
                    </h1>

                    <p style={{
                        fontSize: 'clamp(0.85rem, 1.5vw, 1.05rem)',
                        color: 'var(--text-muted)', marginTop: 6,
                        fontWeight: 400,
                    }}>
                        Escaneie para entrar na fila
                    </p>
                </div>

                {/* QR Code */}
                {qrData && (
                    <div style={{
                        background: '#fff',
                        padding: 'clamp(16px, 2.5vw, 28px)',
                        borderRadius: 'clamp(12px, 2vw, 20px)',
                        boxShadow: '0 2px 24px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)',
                        lineHeight: 0,
                    }}>
                        <QRCodeSVG
                            id="qr-display-img"
                            value={qrData.url}
                            size={320}
                            style={{
                                display: 'block',
                                width: 'clamp(200px, 28vw, 320px)',
                                height: 'auto',
                            }}
                        />
                    </div>
                )}

                {/* Queue counter */}
                <div data-testid="qr-queue-counter" style={{
                    display: 'flex', alignItems: 'baseline',
                    gap: 10, justifyContent: 'center',
                }}>
                    <span className="tabular" style={{
                        fontSize: 'clamp(2.5rem, 6vw, 4rem)',
                        fontWeight: 800, lineHeight: 1,
                        color: queueSize === 0 ? accentColor : primaryColor,
                        letterSpacing: '-0.03em',
                    }}>
                        {queueSize ?? '—'}
                    </span>
                    <span style={{
                        fontSize: 'clamp(0.85rem, 1.4vw, 1rem)',
                        color: 'var(--text-muted)', fontWeight: 500,
                    }}>
                        {queueSize === 0
                            ? 'ninguem esperando'
                            : queueSize === 1
                                ? 'na fila'
                                : 'na fila'}
                    </span>
                </div>
            </div>

            {/* Footer */}
            <div style={{
                paddingBottom: 'clamp(16px, 2vh, 28px)',
                color: 'var(--text-muted)',
                fontSize: '0.7rem', letterSpacing: '0.04em',
                opacity: 0.6,
            }}>
                powered by Remote Queue
            </div>
        </div>
    );
}

const shellStyle: React.CSSProperties = {
    minHeight: '100vh',
    width: '100%',
    background: 'var(--bg-primary)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
};
