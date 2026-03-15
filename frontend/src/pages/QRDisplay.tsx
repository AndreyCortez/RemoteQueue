import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';

const API_BASE = '/api/v1';

interface QueueInfo {
    id: string;
    name: string;
    form_schema: Record<string, string>;
}

/**
 * QRDisplay — fullscreen QR Code page for tablets/kiosks.
 * Accessible publicly via /display/qr?q=<queue_id>
 * Fetches the QR code blob from the public endpoint (no auth required).
 */
export default function QRDisplay() {
    const [searchParams] = useSearchParams();
    const queueId = searchParams.get('q');

    const [queueInfo, setQueueInfo] = useState<QueueInfo | null>(null);
    const [qrData, setQrData] = useState<{ url: string; expires_in?: number } | null>(null);
    const [queueSize, setQueueSize] = useState<number | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

    const fetchData = useCallback(async () => {
        if (!queueId) { setStatus('error'); return; }
        try {
            const [infoRes, statusRes] = await Promise.all([
                axios.get(`${API_BASE}/queue/${queueId}`),
                axios.get(`${API_BASE}/queue/${queueId}/status`)
            ]);
            setQueueInfo(infoRes.data);
            setQueueSize(statusRes.data.queue_size);

            // Fetch dynamic QR logic (code and TTL)
            const qrRes = await axios.get(`${API_BASE}/queue/${queueId}/current-qr`);
            const fullUrl = `${window.location.origin}${qrRes.data.url}`;
            setQrData({ url: fullUrl, expires_in: qrRes.data.expires_in });

            setStatus('ready');

            if (qrRes.data.rotation_enabled && qrRes.data.expires_in) {
                // Buffer to update 1 sec before it expires
                setTimeout(fetchData, Math.max((qrRes.data.expires_in - 1) * 1000, 1000));
            }
        } catch {
            setStatus('error');
        }
    }, [queueId]);

    useEffect(() => {
        let mounted = true;
        if (mounted) fetchData();
        return () => { mounted = false; };
    }, [queueId, fetchData]);

    // WebSocket to update queue size in real time
    useEffect(() => {
        if (!queueId) return;
        const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
        const ws = new WebSocket(`${protocol}://${location.host}/api/v1/queue/${queueId}/ws`);
        ws.onmessage = async () => {
            try {
                const res = await axios.get(`${API_BASE}/queue/${queueId}/status`);
                setQueueSize(res.data.queue_size);
            } catch { /* ignore */ }
        };
        return () => ws.close();
    }, [queueId]);

    if (status === 'error') {
        return (
            <div className="display-dark" style={fullscreenStyle}>
                <div style={{ textAlign: 'center' }}>
                    <h1 style={{ fontSize: '4rem', marginBottom: 16 }}>⚠️</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem' }}>Queue not found.</p>
                </div>
            </div>
        );
    }

    if (status === 'loading') {
        return (
            <div className="display-dark" style={fullscreenStyle}>
                <span className="spinner" role="status" aria-label="Carregando" style={{ width: 48, height: 48, borderWidth: 4 }} />
            </div>
        );
    }

    return (
        <div className="display-dark" style={fullscreenStyle}>
            <div style={{ textAlign: 'center', padding: 24 }}>
                {/* Queue name */}
                <h1 className="heading-lg" style={{ fontSize: 'clamp(2rem, 5vw, 4rem)', marginBottom: 8 }}>
                    {queueInfo?.name}
                </h1>

                {/* Subtitle */}
                <p style={{ color: 'var(--text-secondary)', fontSize: 'clamp(1rem, 2vw, 1.4rem)', marginBottom: 40 }}>
                    Escaneie o QR Code para entrar na fila
                </p>

                {/* QR Code */}
                {qrData && (
                    <div style={{
                        display: 'inline-block', padding: 20,
                        background: 'white', borderRadius: 24,
                        boxShadow: 'var(--shadow-raised)',
                        marginBottom: 40
                    }}>
                        <QRCodeSVG
                            id="qr-display-img"
                            value={qrData.url}
                            size={320}
                            style={{ display: 'block', width: 'clamp(200px, 30vw, 360px)', height: 'auto' }}
                        />
                    </div>
                )}

                {/* Live queue counter */}
                <div style={{
                    display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
                    gap: 4, background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-lg)', padding: '16px 40px'
                }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        Aguardando agora
                    </span>
                    <span className="tabular" style={{
                        fontSize: 'clamp(2.5rem, 6vw, 5rem)', fontWeight: 800, lineHeight: 1,
                        color: queueSize === 0 ? 'var(--accent-success)' : 'var(--text-primary)'
                    }}>
                        {queueSize ?? '—'}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        {queueSize === 0 ? 'ninguém esperando' : queueSize === 1 ? 'paciente aguardando' : 'pacientes aguardando'}
                    </span>
                </div>
            </div>

            {/* Footer */}
            <div style={{ position: 'absolute', bottom: 24, color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                powered by Remote Queue
            </div>
        </div>
    );
}

const fullscreenStyle: React.CSSProperties = {
    minHeight: '100vh', width: '100%',
    background: 'var(--bg-primary)',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative', overflow: 'hidden',
    fontFamily: 'inherit'
};
