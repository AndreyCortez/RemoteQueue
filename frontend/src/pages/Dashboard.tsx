import { useState, useEffect, useRef, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_BASE = '/api/v1';

interface QueueConfig {
    id: string;
    name: string;
    form_schema: Record<string, string>;
}

interface SchemaField {
    name: string;
    type: string;
}

export default function Dashboard() {
    const { getAuthHeaders, logout } = useAuth();
    const navigate = useNavigate();

    // Form state
    const [isCreating, setIsCreating] = useState(false);
    const [queueName, setQueueName] = useState('');
    const [schemaFields, setSchemaFields] = useState<SchemaField[]>([{ name: '', type: 'string' }]);
    const [qrRotationEnabled, setQrRotationEnabled] = useState(false);
    const [qrRotationInterval, setQrRotationInterval] = useState<number>(300);
    const [createError, setCreateError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Queue list state
    const [queues, setQueues] = useState<QueueConfig[]>([]);
    const [loadingQueues, setLoadingQueues] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const headers = getAuthHeaders();

    const fetchQueues = async () => {
        setLoadError(false);
        try {
            const res = await axios.get(`${API_BASE}/b2b/queues`, { headers });
            setQueues(res.data);
        } catch (err: unknown) {
            if (axios.isAxiosError(err) && err.response?.status === 401) { logout(); navigate('/login'); }
            else setLoadError(true);
        } finally {
            setLoadingQueues(false);
        }
    };

    useEffect(() => { fetchQueues(); }, []);

    const addSchemaField = () => setSchemaFields(prev => [...prev, { name: '', type: 'string' }]);
    const removeSchemaField = (index: number) => setSchemaFields(prev => prev.filter((_, i) => i !== index));
    const updateSchemaField = (index: number, key: 'name' | 'type', value: string) =>
        setSchemaFields(prev => prev.map((f, i) => i === index ? { ...f, [key]: value } : f));

    const resetCreateForm = () => {
        setQueueName('');
        setSchemaFields([{ name: '', type: 'string' }]);
        setQrRotationEnabled(false);
        setQrRotationInterval(300);
        setCreateError(null);
        setIsCreating(false);
    };

    const handleCreateQueue = async (e: FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        setCreateError(null);
        const form_schema: Record<string, string> = {};
        for (const field of schemaFields) {
            if (!field.name.trim()) { setCreateError('Todos os campos precisam ter um nome.'); return; }
            form_schema[field.name.trim()] = field.type;
        }
        setIsSubmitting(true);
        try {
            await axios.post(`${API_BASE}/b2b/queues`, {
                name: queueName,
                form_schema,
                qr_rotation_enabled: qrRotationEnabled,
                qr_rotation_interval: qrRotationInterval
            }, { headers });
            // Success: close form, refresh list, show brief confirmation
            const created = queueName;
            resetCreateForm();
            await fetchQueues();
            setSuccessMsg(`Fila "${created}" criada com sucesso!`);
            if (successTimer.current) clearTimeout(successTimer.current);
            successTimer.current = setTimeout(() => setSuccessMsg(null), 3000);
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setCreateError(err.response?.data?.detail || 'Erro ao criar fila.');
            } else {
                setCreateError('Erro inesperado. Tente novamente.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const queueCount = queues.length;

    return (
        <div className="dashboard-container">
            {/* Success flash — outside form so it's visible after form closes */}
            {successMsg && (
                <div id="create-success" className="alert alert-success" style={{ marginBottom: 16 }}>
                    {successMsg}
                </div>
            )}

            {/* Header */}
            <div className="dashboard-header">
                <div>
                    <h1 className="heading-lg">Painel</h1>
                    {!loadingQueues && (
                        <p className="subtitle" style={{ marginBottom: 0 }}>
                            {queueCount === 0
                                ? 'Nenhuma fila criada'
                                : `${queueCount} ${queueCount === 1 ? 'fila ativa' : 'filas ativas'}`}
                        </p>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <button
                        className={`btn btn-sm ${isCreating ? 'btn-secondary' : 'btn-primary'}`}
                        onClick={() => { setIsCreating(!isCreating); setCreateError(null); }}
                    >
                        {isCreating ? 'Cancelar' : '+ Nova Fila'}
                    </button>
                    <button
                        id="logout-btn"
                        className="btn btn-secondary btn-sm"
                        onClick={() => { logout(); navigate('/login'); }}
                    >
                        Sair
                    </button>
                </div>
            </div>

            {/* CREATE QUEUE — progressive disclosure */}
            {isCreating && (
                <div className="card" style={{ maxWidth: 'none', marginBottom: 32 }}>
                    <h2 className="heading-md">Nova Fila</h2>
                    <p className="subtitle">Defina os campos do formulário para seus pacientes</p>
                    {createError && <div className="alert alert-error">{createError}</div>}
                    <form onSubmit={handleCreateQueue}>
                        <div className="form-group">
                            <label className="form-label" htmlFor="queue-name">Nome da Fila</label>
                            <input
                                id="queue-name"
                                className="form-input"
                                type="text"
                                placeholder="ex: Recepção Principal"
                                value={queueName}
                                onChange={e => setQueueName(e.target.value)}
                                required
                                autoFocus
                                maxLength={80}
                                style={{ maxWidth: 400 }}
                            />
                        </div>

                        <label className="form-label">Dados para coletar do paciente</label>
                        {schemaFields.map((field, index) => (
                            <div key={index} className="schema-field-row">
                                <input
                                    className="form-input"
                                    type="text"
                                    placeholder="Nome do campo"
                                    value={field.name}
                                    onChange={e => updateSchemaField(index, 'name', e.target.value)}
                                    data-testid={`schema-field-name-${index}`}
                                    maxLength={50}
                                />
                                <select
                                    className="form-select"
                                    value={field.type}
                                    onChange={e => updateSchemaField(index, 'type', e.target.value)}
                                    data-testid={`schema-field-type-${index}`}
                                >
                                    <option value="string">Texto</option>
                                    <option value="integer">Número</option>
                                    <option value="boolean">Sim/Não</option>
                                </select>
                                {schemaFields.length > 1 && (
                                    <button
                                        type="button"
                                        className="btn btn-danger btn-sm"
                                        onClick={() => removeSchemaField(index)}
                                        aria-label="Remover campo"
                                    >✕</button>
                                )}
                            </div>
                        ))}
                        <div style={{ marginTop: 12 }}>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={addSchemaField}
                                id="add-field-btn"
                            >
                                + Adicionar Campo
                            </button>
                        </div>

                        <div className="form-group" style={{ marginTop: 20 }}>
                            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={qrRotationEnabled}
                                    onChange={e => setQrRotationEnabled(e.target.checked)}
                                />
                                QR Code com senha temporária — impede entradas duplicadas
                            </label>
                            {qrRotationEnabled && (
                                <div style={{ marginTop: 10, maxWidth: 280 }}>
                                    <label className="form-label" htmlFor="qr-interval">Trocar a senha a cada</label>
                                    <select
                                        id="qr-interval"
                                        className="form-select"
                                        value={qrRotationInterval}
                                        onChange={e => setQrRotationInterval(Number(e.target.value))}
                                    >
                                        <option value={30}>30 Segundos</option>
                                        <option value={60}>1 Minuto</option>
                                        <option value={300}>5 Minutos</option>
                                        <option value={900}>15 Minutos</option>
                                    </select>
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                            <button
                                id="create-queue-submit"
                                className="btn btn-primary"
                                type="submit"
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : 'Criar Fila'}
                            </button>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={resetCreateForm}
                            >
                                Cancelar
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* QUEUE LIST — the primary content */}
            {loadingQueues ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                    <span className="spinner" role="status" aria-label="Carregando filas" />
                </div>
            ) : loadError ? (
                <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--text-muted)' }}>
                    <p style={{ marginBottom: 16 }}>Erro ao carregar filas. Verifique sua conexão.</p>
                    <button className="btn btn-secondary" onClick={fetchQueues}>Tentar novamente</button>
                </div>
            ) : queues.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--text-muted)' }}>
                    <p style={{ marginBottom: 20, fontSize: '1rem' }}>
                        Crie sua primeira fila para começar a receber pacientes.
                    </p>
                    {!isCreating && (
                        <button className="btn btn-primary" onClick={() => setIsCreating(true)}>
                            + Criar primeira fila
                        </button>
                    )}
                </div>
            ) : (
                <ul className="queue-list" id="queue-list">
                    {queues.map(q => (
                        <li
                            key={q.id}
                            className="queue-item"
                            style={{ cursor: 'pointer' }}
                            onClick={() => navigate(`/dashboard/queue/${q.id}`)}
                            data-testid={`queue-item-${q.id}`}
                        >
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div className="queue-item-name">{q.name}</div>
                                <div className="queue-item-schema">
                                    Campos: {Object.keys(q.form_schema).join(', ') || 'nenhum'}
                                </div>
                            </div>
                            <div onClick={e => e.stopPropagation()}>
                                <a
                                    className="btn btn-secondary btn-sm"
                                    data-testid={`qr-btn-${q.id}`}
                                    href={`/display/qr?q=${q.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Abrir quiosque"
                                >
                                    Quiosque ↗
                                </a>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

        </div>
    );
}
