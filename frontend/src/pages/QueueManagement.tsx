import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useQueueWebSocket } from '../hooks/useQueueWebSocket';
import type { FormSchemaV2, TenantBranding } from '../types/formSchema';
import { normalizeSchema } from '../types/formSchema';
import FormBuilder from '../components/FormBuilder/FormBuilder';
import FormPreview from '../components/FormBuilder/FormPreview';
import BrandingConfig from '../components/BrandingConfig';

const API_BASE = '/api/v1';

interface Member {
    position: number;
    user_data: Record<string, unknown>;
    joined_at: number;
}

interface QueueInfo {
    id: string;
    name: string;
    form_schema: unknown;
    qr_rotation_enabled: boolean;
    qr_rotation_interval: number;
}

export default function QueueManagement() {
    const { queueId } = useParams<{ queueId: string }>();
    const navigate = useNavigate();
    const { getAuthHeaders, logout } = useAuth();

    const [queue, setQueue] = useState<QueueInfo | null>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [calledUser, setCalledUser] = useState<Record<string, unknown> | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    // Settings panel
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [settingsTab, setSettingsTab] = useState<'qr' | 'form' | 'branding'>('qr');
    const [editQrEnabled, setEditQrEnabled] = useState(false);
    const [editQrInterval, setEditQrInterval] = useState(300);
    const [editSchema, setEditSchema] = useState<FormSchemaV2>({ version: 2, elements: [] });
    const [editBranding, setEditBranding] = useState<TenantBranding>({});
    const [showPreview, setShowPreview] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Action guards
    const [isCalling, setIsCalling] = useState(false);
    const [clearConfirm, setClearConfirm] = useState(false);
    const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const headers = getAuthHeaders();

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    const fetchQueue = useCallback(async () => {
        try {
            const res = await axios.get<QueueInfo[]>(`${API_BASE}/b2b/queues`, { headers });
            const q = res.data.find((item) => item.id === queueId);
            if (!q) { navigate('/dashboard'); return; }
            setQueue(q);
        } catch (err: unknown) {
            if (axios.isAxiosError(err) && err.response?.status === 401) { logout(); navigate('/login'); }
        }
    }, [queueId]);

    const fetchMembers = useCallback(async () => {
        if (!queueId) return;
        try {
            const res = await axios.get(`${API_BASE}/b2b/queue/${queueId}/members`, { headers });
            setMembers(res.data);
        } catch {
            // silently refresh on error polling
        } finally {
            setLoading(false);
        }
    }, [queueId]);

    // Initial load
    useEffect(() => {
        fetchQueue();
        fetchMembers();
    }, [queueId]);

    // WebSocket for real-time updates (with auto-reconnect)
    useQueueWebSocket(queueId ?? null, () => {
        fetchMembers();
    });

    const handleCallNext = async () => {
        if (isCalling) return;
        setIsCalling(true);
        try {
            const res = await axios.post(`${API_BASE}/b2b/queue/${queueId}/call-next`, {}, { headers });
            setCalledUser(res.data.user_data);
            showToast('Proximo paciente chamado ✓');
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                const detail = err.response?.data?.detail;
                if (detail === 'queue_is_empty') showToast('A fila esta vazia!', 'error');
                else showToast('Erro ao chamar proximo', 'error');
            } else {
                showToast('Erro inesperado', 'error');
            }
        } finally {
            setIsCalling(false);
        }
    };

    const handleRemove = async (member: Member) => {
        try {
            await axios.delete(`${API_BASE}/b2b/queue/${queueId}/members`, {
                headers,
                data: { user_data: member.user_data }
            });
            showToast('Removido da fila');
            setMembers(prev => prev.filter(m => m.position !== member.position));
        } catch {
            showToast('Erro ao remover', 'error');
        }
    };

    const handleMoveUp = async (member: Member) => {
        if (member.position === 0) return;
        try {
            await axios.put(`${API_BASE}/b2b/queue/${queueId}/members/reorder`, {
                user_data: member.user_data,
                target_position: member.position - 1
            }, { headers });
        } catch {
            showToast('Erro ao reordenar', 'error');
        }
    };

    const handleMoveDown = async (member: Member) => {
        if (member.position >= members.length - 1) return;
        try {
            await axios.put(`${API_BASE}/b2b/queue/${queueId}/members/reorder`, {
                user_data: member.user_data,
                target_position: member.position + 1
            }, { headers });
        } catch {
            showToast('Erro ao reordenar', 'error');
        }
    };

    const handleClearAll = async () => {
        if (!clearConfirm) {
            setClearConfirm(true);
            if (clearTimer.current) clearTimeout(clearTimer.current);
            clearTimer.current = setTimeout(() => setClearConfirm(false), 4000);
            return;
        }
        setClearConfirm(false);
        if (clearTimer.current) clearTimeout(clearTimer.current);
        try {
            const res = await axios.post(`${API_BASE}/b2b/queue/${queueId}/clear`, {}, { headers });
            showToast(`${res.data.removed_count} removido(s) da fila`);
            setMembers([]);
        } catch {
            showToast('Erro ao limpar fila', 'error');
        }
    };

    const openSettings = async () => {
        if (!queue) return;
        setEditQrEnabled(queue.qr_rotation_enabled || false);
        setEditQrInterval(queue.qr_rotation_interval || 300);
        setEditSchema(normalizeSchema(queue.form_schema));
        // Fetch branding
        try {
            const res = await axios.get(`${API_BASE}/b2b/queues/branding`, { headers });
            setEditBranding(res.data || {});
        } catch {
            setEditBranding({});
        }
        setIsSettingsOpen(true);
        setSettingsTab('qr');
    };

    const saveSettings = async () => {
        if (isSaving) return;
        setIsSaving(true);
        try {
            // Save queue config (QR + schema)
            await axios.put(`${API_BASE}/b2b/queues/${queueId}`, {
                qr_rotation_enabled: editQrEnabled,
                qr_rotation_interval: editQrInterval,
                form_schema: editSchema,
            }, { headers });

            // Save branding (tenant-level)
            await axios.put(`${API_BASE}/b2b/queues/branding`, editBranding, { headers });

            showToast('Configuracoes salvas com sucesso');
            fetchQueue();
            setIsSettingsOpen(false);
        } catch {
            showToast('Erro ao salvar configuracoes', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const formatTime = (score: number) => {
        if (!score || !isFinite(score)) return '—';
        const d = new Date(score * 1000);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="dashboard-container" style={{ maxWidth: '900px' }}>
            {/* Toast notification */}
            {toast && (
                <div
                    role="alert"
                    className={`alert alert-${toast.type === 'error' ? 'error' : 'success'}`}
                    id="queue-toast"
                    style={{ position: 'fixed', top: 24, right: 24, zIndex: 200, maxWidth: 340, animation: 'slide-up 200ms ease' }}
                >
                    {toast.msg}
                </div>
            )}

            {/* Header */}
            <div className="dashboard-header">
                <div>
                    <button className="btn btn-secondary btn-sm" onClick={() => navigate('/dashboard')}
                        data-testid="back-btn" style={{ marginBottom: 8 }}>← Voltar</button>
                    <h1 className="heading-lg" style={{ marginBottom: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60vw' }}>
                        {queue?.name || '...'}
                        {queue?.qr_rotation_enabled && (
                            <span style={{ marginLeft: 12, fontSize: '0.9rem', color: 'var(--accent-primary)', padding: '2px 10px', background: 'var(--accent-glow)', borderRadius: 'var(--radius-lg)' }}>
                                🔄 QR com codigo temporario
                            </span>
                        )}
                    </h1>
                    <p className="subtitle" style={{ marginBottom: 0 }} aria-live="polite">
                        {members.length} {members.length === 1 ? 'paciente' : 'pacientes'} na fila
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button
                        className="btn btn-secondary"
                        onClick={openSettings}
                        title="Configuracoes da fila"
                    >
                        ⚙️ Configuracoes
                    </button>
                    <button
                        id="call-next-btn"
                        className="btn btn-primary"
                        onClick={handleCallNext}
                        disabled={members.length === 0 || isCalling}
                    >
                        {isCalling ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : 'Chamar Proximo ▶'}
                    </button>
                    <button
                        id="clear-all-btn"
                        className="btn btn-danger"
                        onClick={handleClearAll}
                        disabled={members.length === 0}
                        style={clearConfirm ? { background: 'rgba(220,38,38,0.1)', borderColor: 'var(--accent-error)' } : undefined}
                    >
                        {clearConfirm ? 'Confirmar? ✕' : 'Limpar Fila ✕'}
                    </button>
                </div>
            </div>

            {/* SETTINGS PANEL — tabbed */}
            {isSettingsOpen && (
                <div className="card" style={{ maxWidth: 'none', marginBottom: 24, animation: 'slide-up 200ms ease' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <h2 className="heading-md" style={{ marginBottom: 0 }}>Configuracoes da Fila</h2>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {settingsTab === 'form' && (
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => setShowPreview(!showPreview)}
                                >
                                    {showPreview ? 'Esconder Preview' : 'Ver Preview'}
                                </button>
                            )}
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setIsSettingsOpen(false)}
                                aria-label="Fechar configuracoes"
                            >✕</button>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--border-subtle)' }}>
                        {([
                            ['qr', 'QR Code'],
                            ['form', 'Formulario'],
                            ['branding', 'Marca'],
                        ] as const).map(([tab, label]) => (
                            <button
                                key={tab}
                                type="button"
                                onClick={() => setSettingsTab(tab)}
                                style={{
                                    padding: '10px 20px', border: 'none', background: 'none',
                                    cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                                    color: settingsTab === tab ? 'var(--accent-primary)' : 'var(--text-muted)',
                                    borderBottom: settingsTab === tab ? '2px solid var(--accent-primary)' : '2px solid transparent',
                                    fontFamily: 'inherit',
                                    transition: 'all var(--transition-fast)',
                                }}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* QR Tab */}
                    {settingsTab === 'qr' && (
                        <div className="form-group">
                            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                <input
                                    id="qr-rotation-toggle"
                                    type="checkbox"
                                    checked={editQrEnabled}
                                    onChange={e => setEditQrEnabled(e.target.checked)}
                                />
                                QR Code com senha temporaria — impede entradas duplicadas
                            </label>
                            {editQrEnabled && (
                                <div style={{ marginTop: 10, maxWidth: 280 }}>
                                    <label className="form-label" htmlFor="edit-qr-interval">Trocar a senha a cada</label>
                                    <select
                                        id="edit-qr-interval"
                                        className="form-select"
                                        value={editQrInterval}
                                        onChange={e => setEditQrInterval(Number(e.target.value))}
                                    >
                                        <option value={30}>30 Segundos</option>
                                        <option value={60}>1 Minuto</option>
                                        <option value={300}>5 Minutos</option>
                                        <option value={900}>15 Minutos</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Form Tab */}
                    {settingsTab === 'form' && (
                        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                            <div style={{ flex: 2, minWidth: 320 }}>
                                <FormBuilder schema={editSchema} onChange={setEditSchema} />
                            </div>
                            {showPreview && (
                                <div style={{ flex: 1, minWidth: 300 }}>
                                    <FormPreview schema={editSchema} branding={editBranding} />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Branding Tab */}
                    {settingsTab === 'branding' && (
                        <BrandingConfig branding={editBranding} onChange={setEditBranding} />
                    )}

                    <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                        <button id="save-settings-btn" className="btn btn-primary" onClick={saveSettings} disabled={isSaving}>
                            {isSaving ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : 'Salvar'}
                        </button>
                        <button className="btn btn-secondary" onClick={() => setIsSettingsOpen(false)}>
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* Public links card */}
            <div className="card" style={{ marginBottom: 24, padding: '16px 24px' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, fontWeight: 600 }}>
                    Links Publicos
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    <a href={`/join?q=${queueId}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm" data-testid="link-join">
                        📱 Formulario do paciente
                    </a>
                    <a href={`/display/qr?q=${queueId}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm" data-testid="link-qr-display">
                        🖥️ Tela do Totem (QR Code)
                    </a>
                    <a href={`/display/status?q=${queueId}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm" data-testid="link-status-display">
                        📺 Tela da TV (Status)
                    </a>
                </div>
            </div>

            {/* Called user banner */}
            {calledUser && (
                <div
                    role="alert"
                    id="called-user-banner"
                    className="card"
                    style={{ marginBottom: 24, background: 'var(--accent-success-glow)', border: '1px solid rgba(5,150,105,0.22)', animation: 'slide-up 200ms ease' }}
                >
                    <p style={{ color: 'var(--accent-success)', fontWeight: 600, marginBottom: 8 }}>
                        ✓ Chamando agora:
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                        {Object.entries(calledUser).map(([key, val]) => {
                            const display = String(val ?? '') || '—';
                            return (
                                <div
                                    key={key}
                                    title={`${key}: ${display}`}
                                    style={{
                                        background: 'var(--accent-success-glow)', border: '1px solid rgba(5,150,105,0.15)',
                                        borderRadius: 'var(--radius-sm)', padding: '6px 14px',
                                        maxWidth: 220, overflow: 'hidden'
                                    }}
                                >
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>{key}: </span>
                                    <span style={{
                                        fontWeight: 600, display: 'inline-block',
                                        maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        verticalAlign: 'bottom'
                                    }}>{display}</span>
                                </div>
                            );
                        })}
                    </div>
                    <button
                        onClick={() => setCalledUser(null)}
                        aria-label="Dispensar notificacao"
                        className="btn btn-ghost btn-sm"
                        style={{ marginTop: 8, fontSize: '0.8rem' }}
                    >
                        Dispensar
                    </button>
                </div>
            )}

            {/* Queue Table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" role="status" aria-label="Carregando pacientes" /></div>
                ) : members.length === 0 ? (
                    <div data-testid="empty-queue" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>✓</div>
                        <p>Nenhum paciente na fila</p>
                    </div>
                ) : (
                    <div className="members-table-wrap">
                        <table id="members-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                <th style={thStyle}>No</th>
                                <th style={thStyle}>Dados</th>
                                <th style={thStyle}>Horario</th>
                                <th style={thStyle}>Ordem</th>
                                <th style={thStyle}>Remover</th>
                            </tr>
                        </thead>
                        <tbody>
                            {members.map((member, idx) => (
                                <tr
                                    key={idx}
                                    data-testid={`member-row-${idx}`}
                                    style={{
                                        borderBottom: '1px solid var(--border-subtle)',
                                        background: idx % 2 === 0 ? 'transparent' : 'var(--bg-secondary)',
                                        transition: 'background var(--transition-fast)'
                                    }}
                                >
                                    <td style={tdStyle}>
                                        <span className="tabular" style={{
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                            width: 32, height: 32, borderRadius: '50%',
                                            background: idx === 0 ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                                            color: idx === 0 ? 'white' : 'var(--text-primary)',
                                            fontWeight: 700, fontSize: '0.85rem'
                                        }}>
                                            {member.position + 1}
                                        </span>
                                    </td>
                                    <td style={tdStyle}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                            {Object.keys(member.user_data).length === 0 ? (
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>—</span>
                                            ) : Object.entries(member.user_data).map(([key, val]) => {
                                                const display = String(val ?? '');
                                                return (
                                                    <span
                                                        key={key}
                                                        title={`${key}: ${display}`}
                                                        style={{
                                                            background: 'var(--bg-secondary)', borderRadius: 6,
                                                            padding: '4px 10px', fontSize: '0.82rem',
                                                            maxWidth: 200, overflow: 'hidden',
                                                            textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                                        }}
                                                    >
                                                        <span style={{ color: 'var(--text-muted)' }}>{key}:</span>{' '}
                                                        <span style={{ fontWeight: 600 }}>{display || '—'}</span>
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </td>
                                    <td className="tabular" style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                                        {formatTime(member.joined_at)}
                                    </td>
                                    <td style={tdStyle}>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => handleMoveUp(member)}
                                                disabled={member.position === 0}
                                                title="Mover para cima"
                                                aria-label="Mover para cima"
                                                data-testid={`move-up-${idx}`}
                                                style={{ opacity: member.position === 0 ? 0.3 : 1 }}
                                            >▲</button>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => handleMoveDown(member)}
                                                disabled={member.position >= members.length - 1}
                                                title="Mover para baixo"
                                                aria-label="Mover para baixo"
                                                data-testid={`move-down-${idx}`}
                                                style={{ opacity: member.position >= members.length - 1 ? 0.3 : 1 }}
                                            >▼</button>
                                        </div>
                                    </td>
                                    <td style={tdStyle}>
                                        <button
                                            className="btn btn-danger btn-sm"
                                            onClick={() => handleRemove(member)}
                                            data-testid={`remove-btn-${idx}`}
                                            title="Remover da fila"
                                            aria-label="Remover da fila"
                                        >✕</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        </table>
                    </div>
                )}
            </div>

        </div>
    );
}

const thStyle: React.CSSProperties = {
    padding: '14px 20px',
    textAlign: 'left',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em'
};

const tdStyle: React.CSSProperties = {
    padding: '14px 20px',
    verticalAlign: 'middle'
};
