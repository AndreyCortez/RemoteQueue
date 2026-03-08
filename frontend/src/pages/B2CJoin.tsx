import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';

const API_BASE = '/api/v1';

interface FormSchema {
    [key: string]: string;
}

interface QueueInfo {
    id: string;
    name: string;
    form_schema: FormSchema;
}

export default function B2CJoin() {
    const [searchParams] = useSearchParams();
    const queueId = searchParams.get('q');

    const [queueInfo, setQueueInfo] = useState<QueueInfo | null>(null);
    const [formData, setFormData] = useState<Record<string, string>>({});
    const [position, setPosition] = useState<number | null>(null);
    const [status, setStatus] = useState<'loading' | 'form' | 'queued' | 'called' | 'error'>('loading');
    const [errorMsg, setErrorMsg] = useState<string>('');
    const wsRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        if (!queueId) {
            setStatus('error');
            setErrorMsg('No queue ID provided. Please scan a valid QR code.');
            return;
        }

        axios.get(`${API_BASE}/queue/${queueId}`)
            .then(res => {
                setQueueInfo(res.data);
                const initial: Record<string, string> = {};
                Object.keys(res.data.form_schema).forEach(k => initial[k] = '');
                setFormData(initial);
                setStatus('form');
            })
            .catch(err => {
                setStatus('error');
                if (err.response?.status === 404) {
                    setErrorMsg('Queue not found. Please scan a valid QR code.');
                } else {
                    setErrorMsg('Connection error. Please try again.');
                }
            });
    }, [queueId]);

    const handleJoin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!queueId) return;

        const user_data: Record<string, unknown> = {};
        Object.entries(queueInfo!.form_schema).forEach(([key, type]) => {
            const raw = formData[key];
            if (type === 'integer') user_data[key] = parseInt(raw) || 0;
            else if (type === 'boolean') user_data[key] = raw.toLowerCase() === 'true';
            else user_data[key] = raw;
        });

        try {
            const res = await axios.post(`${API_BASE}/queue/join`, {
                queue_id: queueId,
                user_data
            });
            setPosition(res.data.position);
            setStatus('queued');

            // Subscribe to real-time updates via WebSocket
            const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
            const ws = new WebSocket(`${protocol}://${location.host}/api/v1/queue/${queueId}/ws`);
            ws.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                if (msg.event === 'queue_advanced' || msg.event === 'queue_member_called') {
                    setPosition(prev => {
                        if (prev === null) return null;
                        if (prev === 0) {
                            setStatus('called');
                            return null;
                        }
                        return prev - 1;
                    });
                }
            };
            wsRef.current = ws;
        } catch (err: any) {
            setErrorMsg(err.response?.data?.detail || 'Failed to join queue. Please try again.');
        }
    };

    useEffect(() => {
        return () => { wsRef.current?.close(); };
    }, []);

    const renderField = (key: string, type: string) => (
        <div className="form-group" key={key}>
            <label className="form-label" htmlFor={`field-${key}`}>
                {key.charAt(0).toUpperCase() + key.slice(1)}
                {type !== 'string' && <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>({type})</span>}
            </label>
            <input
                id={`field-${key}`}
                className="form-input"
                data-testid={`input-${key}`}
                type={type === 'integer' ? 'number' : 'text'}
                value={formData[key] ?? ''}
                onChange={e => setFormData(prev => ({ ...prev, [key]: e.target.value }))}
                required
            />
        </div>
    );

    return (
        <div className="page-container">
            {status === 'loading' && (
                <div className="card" style={{ textAlign: 'center' }}>
                    <span className="spinner" />
                    <p className="subtitle" style={{ marginTop: 16 }}>Loading queue...</p>
                </div>
            )}

            {status === 'error' && (
                <div className="card" style={{ textAlign: 'center' }}>
                    <h1 className="heading-lg" style={{ color: 'var(--accent-error)' }}>⚠️</h1>
                    <p className="subtitle">{errorMsg}</p>
                </div>
            )}

            {status === 'form' && queueInfo && (
                <div className="card">
                    <h1 className="heading-lg">{queueInfo.name}</h1>
                    <p className="subtitle">Fill in your information to join the queue</p>
                    {errorMsg && <div className="alert alert-error">{errorMsg}</div>}
                    <form onSubmit={handleJoin}>
                        {Object.entries(queueInfo.form_schema).map(([key, type]) => renderField(key, type))}
                        <button id="join-submit" className="btn btn-primary btn-full" type="submit" style={{ marginTop: 8 }}>
                            Join Queue
                        </button>
                    </form>
                </div>
            )}

            {status === 'queued' && (
                <div className="card" style={{ textAlign: 'center' }}>
                    <h2 className="heading-lg">You're in line! 🎟️</h2>
                    <p className="subtitle">Queue: <strong>{queueInfo?.name}</strong></p>
                    <div style={{
                        fontSize: '4rem', fontWeight: 800, margin: '24px 0',
                        background: 'linear-gradient(135deg, var(--accent-primary), #4f46e5)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
                    }}>
                        {(position ?? 0) + 1}
                    </div>
                    <p style={{ color: 'var(--text-secondary)' }}>
                        {position === 0 ? "You're next! Get ready." : `${position} ${position === 1 ? 'person' : 'people'} ahead of you`}
                    </p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 16 }}>Updates automatically in real-time</p>
                </div>
            )}

            {status === 'called' && (
                <div className="card" style={{ textAlign: 'center' }}>
                    <h2 className="heading-lg" style={{ color: 'var(--accent-success)' }}>It's your turn! 🎉</h2>
                    <p className="subtitle">Please proceed to the counter now.</p>
                </div>
            )}
        </div>
    );
}
