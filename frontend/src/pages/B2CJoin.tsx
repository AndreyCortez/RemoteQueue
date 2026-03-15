import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';

const API_BASE = '/api/v1';

interface RichFieldDef {
    type: string;
    label?: string;
    placeholder?: string;
    required?: boolean;
    pattern?: string;
}

type FieldDef = string | RichFieldDef;

interface FormSchema {
    [key: string]: FieldDef;
}

interface QueueInfo {
    id: string;
    name: string;
    form_schema: FormSchema;
}

/** Normalises both simple ("string") and rich ({type,...}) field definitions. */
function normaliseDef(key: string, def: FieldDef): Required<RichFieldDef> {
    if (typeof def === 'string') {
        return { type: def, label: key.charAt(0).toUpperCase() + key.slice(1), placeholder: '', required: true, pattern: '' };
    }
    return {
        type: def.type ?? 'string',
        label: def.label ?? (key.charAt(0).toUpperCase() + key.slice(1)),
        placeholder: def.placeholder ?? '',
        required: def.required ?? true,
        pattern: def.pattern ?? '',
    };
}

export default function B2CJoin() {
    const [searchParams] = useSearchParams();
    const queueId = searchParams.get('q');
    const accessCode = searchParams.get('code');

    const [queueInfo, setQueueInfo] = useState<QueueInfo | null>(null);
    const [formData, setFormData] = useState<Record<string, string>>({});
    const [position, setPosition] = useState<number | null>(null);
    const [status, setStatus] = useState<'loading' | 'form' | 'queued' | 'called' | 'error'>('loading');
    const [errorMsg, setErrorMsg] = useState<string>('');
    const wsRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        if (!queueId) {
            setStatus('error');
            setErrorMsg('QR Code inválido. Por favor, escaneie novamente.');
            return;
        }

        axios.get(`${API_BASE}/queue/${queueId}`)
            .then(res => {
                setQueueInfo(res.data);
                const initial: Record<string, string> = {};
                // Initialise all fields (both simple and rich) to empty string
                Object.keys(res.data.form_schema).forEach(k => initial[k] = '');
                setFormData(initial);
                setStatus('form');
            })
            .catch(err => {
                setStatus('error');
                if (err.response?.status === 404) {
                    setErrorMsg('Fila não encontrada. Escaneie um QR Code válido.');
                } else {
                    setErrorMsg('Erro de conexão. Tente novamente.');
                }
            });
    }, [queueId]);

    const handleJoin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!queueId) return;

        const user_data: Record<string, unknown> = {};
        Object.entries(queueInfo!.form_schema).forEach(([key, def]) => {
            const { type, required } = normaliseDef(key, def);
            const raw = formData[key];
            // Skip optional empty fields — backend handles the absence correctly
            if (!required && raw === '') return;
            if (type === 'integer') user_data[key] = parseInt(raw) || 0;
            else if (type === 'boolean') user_data[key] = raw.toLowerCase() === 'true';
            else user_data[key] = raw;
        });

        try {
            const payload: Record<string, unknown> = {
                queue_id: queueId,
                user_data
            };
            if (accessCode) payload.access_code = accessCode;

            const res = await axios.post<{position: number}>(`${API_BASE}/queue/join`, payload);
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
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                const errorData = err.response?.data as { detail?: string } | undefined;
                if (err.response?.status === 403 && errorData?.detail?.toLowerCase().includes('code')) {
                    setErrorMsg('QR Code expirado ou inválido. Escaneie o painel novamente.');
                } else {
                    setErrorMsg(errorData?.detail || 'Erro ao entrar na fila. Tente novamente.');
                }
            } else {
                setErrorMsg('Erro inesperado. Tente novamente.');
            }
        }
    };

    useEffect(() => {
        return () => { wsRef.current?.close(); };
    }, []);

    const renderField = (key: string, def: FieldDef) => {
        const { type, label, placeholder, required } = normaliseDef(key, def);
        return (
            <div className="form-group" key={key}>
                <label className="form-label" htmlFor={`field-${key}`}>
                    {label}
                    {!required && <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: '0.8em' }}>(opcional)</span>}
                    {type === 'integer' && <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: '0.8em' }}>(número)</span>}
                    {type === 'boolean' && <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: '0.8em' }}>(sim/não)</span>}
                </label>
                <input
                    id={`field-${key}`}
                    className="form-input"
                    data-testid={`input-${key}`}
                    type={type === 'integer' ? 'number' : 'text'}
                    placeholder={placeholder}
                    value={formData[key] ?? ''}
                    onChange={e => { setErrorMsg(''); setFormData(prev => ({ ...prev, [key]: e.target.value })); }}
                    required={required}
                />
            </div>
        );
    };

    if (status === 'called') {
        return (
            <div style={{
                minHeight: '100vh', width: '100%',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                background: 'var(--accent-success)',
                padding: 40, textAlign: 'center',
                animation: 'fade-in 400ms ease'
            }}>
                <div style={{
                    width: 96, height: 96, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '3rem', color: 'white', marginBottom: 32,
                    animation: 'check-appear 500ms cubic-bezier(0.22, 1, 0.36, 1)'
                }}>✓</div>
                <h1 style={{
                    fontSize: 'clamp(3rem, 8vw, 6rem)', fontWeight: 900,
                    color: 'white', margin: '0 0 16px', lineHeight: 1.1
                }}>
                    É a sua vez!
                </h1>
                <p style={{
                    fontSize: 'clamp(1.1rem, 3vw, 1.5rem)',
                    color: 'rgba(255,255,255,0.9)', margin: 0
                }}>
                    Dirija-se ao atendimento agora.
                </p>
            </div>
        );
    }

    return (
        <div className="page-container">
            {status === 'loading' && (
                <div className="card" style={{ textAlign: 'center' }}>
                    <span className="spinner" role="status" aria-label="Buscando sua fila" />
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
                    <p className="subtitle">Preencha seus dados para entrar na fila</p>
                    {errorMsg && <div className="alert alert-error">{errorMsg}</div>}
                    <form onSubmit={handleJoin}>
                        {Object.entries(queueInfo.form_schema).map(([key, def]) => renderField(key, def))}
                        <button id="join-submit" className="btn btn-primary btn-full" type="submit" style={{ marginTop: 8 }}>
                            Entrar na Fila
                        </button>
                    </form>
                </div>
            )}

            {status === 'queued' && (
                <div className="card" style={{ textAlign: 'center' }}>
                    <h2 className="heading-lg">Você está na fila!</h2>
                    <p className="subtitle">Fila: <strong>{queueInfo?.name}</strong></p>
                    <div
                        key={`pos-${(position ?? 0) + 1}`}
                        className="tabular"
                        style={{
                            fontSize: 'clamp(5rem, 20vw, 8rem)', fontWeight: 900,
                            lineHeight: 1, margin: '28px 0 12px',
                            color: position === 0 ? 'var(--accent-success)' : 'var(--accent-primary)',
                            animation: 'slide-up 300ms cubic-bezier(0.22, 1, 0.36, 1)',
                            letterSpacing: '-0.04em',
                            transition: 'color 400ms ease'
                        }}
                    >
                        {(position ?? 0) + 1}
                    </div>
                    {position === 0 ? (
                        <p style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--accent-success)', fontWeight: 600, fontSize: '1.1rem' }}>
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent-success)', display: 'inline-block', animation: 'pulse 1.5s ease-in-out infinite' }} />
                            Você é o próximo! Prepare-se.
                        </p>
                    ) : (
                        <p style={{ color: 'var(--text-secondary)' }}>
                            {position} {position === 1 ? 'pessoa' : 'pessoas'} na sua frente
                        </p>
                    )}
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 16 }}>Atualização em tempo real</p>
                </div>
            )}

        </div>
    );
}
