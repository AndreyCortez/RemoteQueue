import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { normalizeSchema, createEmptyFormData, formDataToPayload, type FormSchemaV2, type TenantBranding } from '../types/formSchema';
import ElementRenderer from '../components/fields/FieldRenderer';
import { useQueueWebSocket } from '../hooks/useQueueWebSocket';

const API_BASE = '/api/v1';

function formatWait(seconds: number): string {
    if (seconds < 60) return '< 1 min';
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    if (h > 0) return m > 0 ? `~${h}h ${m}min` : `~${h}h`;
    return `~${m} min`;
}

interface QueueInfo {
    id: string;
    name: string;
    form_schema: unknown;
    branding?: TenantBranding | null;
}

export default function B2CJoin() {
    const [searchParams] = useSearchParams();
    const queueId = searchParams.get('q');
    const accessCode = searchParams.get('code');

    const [queueInfo, setQueueInfo] = useState<QueueInfo | null>(null);
    const [schema, setSchema] = useState<FormSchemaV2 | null>(null);
    const [formData, setFormData] = useState<Record<string, string>>({});
    const [position, setPosition] = useState<number | null>(null);
    const [status, setStatus] = useState<'loading' | 'form' | 'queued' | 'called' | 'error'>('loading');
    const [errorMsg, setErrorMsg] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [waitEstimate, setWaitEstimate] = useState<{ seconds: number | null; sampleSize: number } | null>(null);
    const userDataRef = useRef<Record<string, unknown> | null>(null);
    // Only connect WebSocket once the user is in the queue
    const [wsQueueId, setWsQueueId] = useState<string | null>(null);

    useEffect(() => {
        if (!queueId) {
            setStatus('error');
            setErrorMsg('QR Code invalido. Por favor, escaneie novamente.');
            return;
        }

        axios.get(`${API_BASE}/queue/${queueId}`)
            .then(res => {
                setQueueInfo(res.data);
                const normalized = normalizeSchema(res.data.form_schema);
                setSchema(normalized);
                setFormData(createEmptyFormData(normalized));
                setStatus('form');
            })
            .catch(err => {
                setStatus('error');
                if (err.response?.status === 404) {
                    setErrorMsg('Fila nao encontrada. Escaneie um QR Code valido.');
                } else {
                    setErrorMsg('Erro de conexao. Tente novamente.');
                }
            });
    }, [queueId]);

    const handleJoin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!queueId || !schema || isSubmitting) return;
        setIsSubmitting(true);

        const user_data = formDataToPayload(schema, formData);

        try {
            const payload: Record<string, unknown> = { queue_id: queueId, user_data };
            if (accessCode) payload.access_code = accessCode;

            const res = await axios.post<{position: number}>(`${API_BASE}/queue/join`, payload);
            userDataRef.current = user_data;
            setPosition(res.data.position);
            setStatus('queued');
            setWsQueueId(queueId);
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                const errorData = err.response?.data as { detail?: string } | undefined;
                if (err.response?.status === 403 && errorData?.detail?.toLowerCase().includes('code')) {
                    setErrorMsg('QR Code expirado ou invalido. Escaneie o painel novamente.');
                } else {
                    setErrorMsg(errorData?.detail || 'Erro ao entrar na fila. Tente novamente.');
                }
            } else {
                setErrorMsg('Erro inesperado. Tente novamente.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const fetchPosition = useCallback(async () => {
        if (!wsQueueId || !userDataRef.current) return;
        try {
            const res = await axios.post<{ position: number }>(
                `${API_BASE}/queue/${wsQueueId}/position`,
                { user_data: userDataRef.current }
            );
            setPosition(res.data.position);
        } catch (err) {
            if (axios.isAxiosError(err) && err.response?.status === 404) {
                // Member was removed from queue
                setStatus('error');
                setErrorMsg('Você foi removido da fila.');
            }
        }
    }, [wsQueueId]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleWsMessage = useCallback((msg: any) => {
        if (msg.estimated_wait_seconds !== undefined) {
            setWaitEstimate({
                seconds: msg.estimated_wait_seconds,
                sampleSize: msg.sample_size ?? 0,
            });
        }
        if (msg.event === 'queue_member_called') {
            setPosition(prev => {
                if (prev === null) return null;
                if (prev === 0) {
                    setStatus('called');
                    return null;
                }
                // Re-fetch authoritative position in case multiple calls happened
                fetchPosition();
                return prev;
            });
        } else if (
            msg.event === 'queue_updated' ||
            msg.event === 'queue_reordered'
        ) {
            fetchPosition();
        } else if (msg.event === 'queue_cleared') {
            setStatus('error');
            setErrorMsg('A fila foi encerrada.');
        }
    }, [fetchPosition]);

    useQueueWebSocket(wsQueueId, handleWsMessage);

    // Apply branding CSS custom properties
    const branding = queueInfo?.branding;
    const brandingStyle: React.CSSProperties = {};
    if (branding?.background_color) {
        brandingStyle.background = branding.background_color;
    }

    if (status === 'called') {
        return (
            <div style={{
                minHeight: '100vh', width: '100%',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                background: branding?.accent_color || 'var(--accent-success)',
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
                    E a sua vez!
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
        <div className="page-container" style={brandingStyle}>
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

            {status === 'form' && schema && (
                <div className="card" style={branding?.primary_color ? {
                    borderTop: `3px solid ${branding.primary_color}`
                } : undefined}>
                    {/* Branding header */}
                    {branding && (branding.logo_url || branding.company_name) && (
                        <div style={{ textAlign: 'center', marginBottom: 20 }}>
                            {branding.logo_url && (
                                <img
                                    src={branding.logo_url}
                                    alt={branding.company_name || ''}
                                    style={{ maxHeight: 56, maxWidth: 200, objectFit: 'contain', marginBottom: 8 }}
                                />
                            )}
                            {branding.company_name && (
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                    {branding.company_name}
                                </p>
                            )}
                        </div>
                    )}

                    <h1 className="heading-lg">{queueInfo?.name}</h1>
                    <p className="subtitle">Preencha seus dados para entrar na fila</p>
                    {errorMsg && <div className="alert alert-error">{errorMsg}</div>}
                    <form onSubmit={handleJoin}>
                        {schema.elements.map(element => (
                            <ElementRenderer
                                key={element.id}
                                element={element}
                                value={element.kind === 'field' ? (formData[element.key] ?? '') : undefined}
                                onChange={element.kind === 'field'
                                    ? (val: string) => { setErrorMsg(''); setFormData(prev => ({ ...prev, [element.key]: val })); }
                                    : undefined
                                }
                            />
                        ))}
                        <button
                            id="join-submit"
                            className="btn btn-primary btn-full"
                            type="submit"
                            style={{
                                marginTop: 8,
                                ...(branding?.primary_color ? { background: branding.primary_color } : {}),
                            }}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : 'Entrar na Fila'}
                        </button>
                    </form>
                </div>
            )}

            {status === 'queued' && (
                <div className="card" style={{ textAlign: 'center' }}>
                    <h2 className="heading-lg">Voce esta na fila!</h2>
                    <p className="subtitle">Fila: <strong>{queueInfo?.name}</strong></p>
                    <div
                        key={`pos-${(position ?? 0) + 1}`}
                        className="tabular"
                        style={{
                            fontSize: 'clamp(5rem, 20vw, 8rem)', fontWeight: 900,
                            lineHeight: 1, margin: '28px 0 12px',
                            color: position === 0
                                ? (branding?.accent_color || 'var(--accent-success)')
                                : (branding?.primary_color || 'var(--accent-primary)'),
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
                            Voce e o proximo! Prepare-se.
                        </p>
                    ) : (
                        <>
                            <p style={{ color: 'var(--text-secondary)' }}>
                                {position} {position === 1 ? 'pessoa' : 'pessoas'} na sua frente
                            </p>
                            {waitEstimate && position != null && position > 0 && (
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: 4 }}>
                                    {waitEstimate.sampleSize < 3
                                        ? 'Calculando tempo de espera...'
                                        : waitEstimate.seconds != null
                                            ? `Tempo estimado: ${formatWait(waitEstimate.seconds)}`
                                            : null}
                                </p>
                            )}
                        </>
                    )}
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 16 }}>Atualizacao em tempo real</p>
                </div>
            )}

        </div>
    );
}
