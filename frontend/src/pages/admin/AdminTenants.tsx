import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import AdminLayout from './AdminLayout';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { adminColors } from './AdminLogin';

interface TenantSummary {
    id: string;
    name: string;
    is_suspended: boolean;
    created_at: string | null;
    queue_count: number;
    active_members: number;
}

interface CreateForm {
    name: string;
    operator_email: string;
    operator_password: string;
}

const EMPTY_FORM: CreateForm = { name: '', operator_email: '', operator_password: '' };

export default function AdminTenants() {
    const { getAuthHeaders } = useAdminAuth();
    const navigate = useNavigate();
    const [tenants, setTenants] = useState<TenantSummary[]>([]);
    const [filter, setFilter] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const load = () => {
        axios.get('/api/v1/admin/tenants', { headers: getAuthHeaders() })
            .then(r => setTenants(r.data.tenants));
    };

    useEffect(() => { load(); }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        setCreateError(null);
        try {
            await axios.post('/api/v1/admin/tenants', form, { headers: getAuthHeaders() });
            setShowCreate(false);
            setForm(EMPTY_FORM);
            load();
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setCreateError(err.response?.data?.detail || 'Erro ao criar cliente.');
            }
        } finally {
            setCreating(false);
        }
    };

    const handleSuspend = async (t: TenantSummary) => {
        setActionLoading(t.id);
        try {
            await axios.post(`/api/v1/admin/tenants/${t.id}/suspend`, {}, { headers: getAuthHeaders() });
            load();
        } finally {
            setActionLoading(null);
        }
    };

    const handleDelete = async (t: TenantSummary) => {
        if (!window.confirm(`Excluir permanentemente o cliente "${t.name}"? Esta ação não pode ser desfeita.`)) return;
        setActionLoading(t.id);
        try {
            await axios.delete(`/api/v1/admin/tenants/${t.id}`, { headers: getAuthHeaders() });
            load();
        } finally {
            setActionLoading(null);
        }
    };

    const filtered = tenants.filter(t =>
        t.name.toLowerCase().includes(filter.toLowerCase())
    );

    return (
        <AdminLayout>
            <div style={{ maxWidth: 1000 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
                    <div>
                        <h1 style={headingStyle}>Clientes</h1>
                        <p style={{ color: adminColors.textMuted, fontSize: '0.875rem', marginTop: 4 }}>
                            {tenants.length} cliente{tenants.length !== 1 ? 's' : ''} cadastrado{tenants.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                    <button style={btnPrimaryStyle} onClick={() => setShowCreate(true)}>
                        + Novo Cliente
                    </button>
                </div>

                {/* Search */}
                <input
                    style={searchStyle}
                    placeholder="Filtrar por nome..."
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                />

                {/* Create form */}
                {showCreate && (
                    <div style={modalOverlayStyle} onClick={e => { if (e.target === e.currentTarget) setShowCreate(false); }}>
                        <div style={modalStyle}>
                            <h2 style={{ color: adminColors.textPrimary, fontSize: '1.1rem', fontWeight: 600, margin: '0 0 20px' }}>
                                Novo Cliente
                            </h2>
                            {createError && <div style={errorBannerStyle}>{createError}</div>}
                            <form onSubmit={handleCreate}>
                                <Field label="Nome da empresa" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
                                <Field label="Email do operador" type="email" value={form.operator_email} onChange={v => setForm(f => ({ ...f, operator_email: v }))} />
                                <Field label="Senha do operador" type="password" value={form.operator_password} onChange={v => setForm(f => ({ ...f, operator_password: v }))} />
                                <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                                    <button type="submit" style={{ ...btnPrimaryStyle, flex: 1 }} disabled={creating}>
                                        {creating ? 'Criando...' : 'Criar'}
                                    </button>
                                    <button type="button" style={{ ...btnGhostStyle, flex: 1 }} onClick={() => setShowCreate(false)}>
                                        Cancelar
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Table */}
                <div style={{ background: adminColors.card, border: `1px solid ${adminColors.cardBorder}`, borderRadius: 12, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: `1px solid ${adminColors.cardBorder}` }}>
                                <th style={thStyle}>Cliente</th>
                                <th style={thStyle}>Status</th>
                                <th style={thStyle}>Filas</th>
                                <th style={thStyle}>Na fila agora</th>
                                <th style={thStyle}>Criado em</th>
                                <th style={thStyle} />
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={6} style={{ ...tdStyle, textAlign: 'center', padding: '32px 0', color: adminColors.textMuted }}>
                                        {filter ? 'Nenhum resultado' : 'Nenhum cliente cadastrado'}
                                    </td>
                                </tr>
                            )}
                            {filtered.map(t => (
                                <tr
                                    key={t.id}
                                    style={{ borderBottom: `1px solid ${adminColors.sidebarBorder}`, cursor: 'pointer' }}
                                    onClick={() => navigate(`/admin/tenants/${t.id}`)}
                                >
                                    <td style={{ ...tdStyle, fontWeight: 600, color: adminColors.textPrimary }}>
                                        {t.name}
                                    </td>
                                    <td style={tdStyle}>
                                        <StatusBadge suspended={t.is_suspended} />
                                    </td>
                                    <td style={tdStyle}>{t.queue_count}</td>
                                    <td style={{ ...tdStyle, color: t.active_members > 0 ? adminColors.accent : adminColors.textMuted }}>
                                        {t.active_members}
                                    </td>
                                    <td style={{ ...tdStyle, color: adminColors.textMuted, fontSize: '0.8rem' }}>
                                        {t.created_at ? new Date(t.created_at).toLocaleDateString('pt-BR') : '—'}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                            <button
                                                style={actionLoading === t.id ? { ...btnSmallStyle, opacity: 0.5 } : btnSmallStyle}
                                                onClick={() => handleSuspend(t)}
                                                disabled={actionLoading === t.id}
                                            >
                                                {t.is_suspended ? 'Reativar' : 'Suspender'}
                                            </button>
                                            <button
                                                style={{ ...btnSmallStyle, borderColor: 'rgba(239,68,68,0.4)', color: '#fca5a5' }}
                                                onClick={() => handleDelete(t)}
                                                disabled={actionLoading === t.id}
                                            >
                                                Excluir
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </AdminLayout>
    );
}

function StatusBadge({ suspended }: { suspended: boolean }) {
    return (
        <span style={{
            display: 'inline-block',
            padding: '3px 10px',
            borderRadius: 20,
            fontSize: '0.72rem',
            fontWeight: 600,
            background: suspended ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
            color: suspended ? '#fca5a5' : '#6ee7b7',
            border: `1px solid ${suspended ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)'}`,
        }}>
            {suspended ? 'Suspenso' : 'Ativo'}
        </span>
    );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
    return (
        <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: adminColors.textSecondary, marginBottom: 6 }}>{label}</label>
            <input
                type={type}
                value={value}
                onChange={e => onChange(e.target.value)}
                required
                style={{
                    width: '100%', boxSizing: 'border-box',
                    background: '#0f1117',
                    border: `1px solid ${adminColors.cardBorder}`,
                    borderRadius: 8,
                    padding: '9px 12px',
                    color: adminColors.textPrimary,
                    fontSize: '0.875rem',
                    outline: 'none',
                }}
            />
        </div>
    );
}

const headingStyle: React.CSSProperties = {
    fontSize: '1.5rem', fontWeight: 700, color: adminColors.textPrimary, margin: 0,
};

const searchStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: adminColors.card,
    border: `1px solid ${adminColors.cardBorder}`,
    borderRadius: 8,
    padding: '10px 14px',
    color: adminColors.textPrimary,
    fontSize: '0.875rem',
    outline: 'none',
    marginBottom: 16,
};

const thStyle: React.CSSProperties = {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: '0.72rem',
    fontWeight: 600,
    color: adminColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
};

const tdStyle: React.CSSProperties = {
    padding: '14px 16px',
    fontSize: '0.875rem',
    color: adminColors.textSecondary,
};

const btnPrimaryStyle: React.CSSProperties = {
    background: adminColors.accent,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '9px 18px',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
};

const btnGhostStyle: React.CSSProperties = {
    background: 'transparent',
    color: adminColors.textSecondary,
    border: `1px solid ${adminColors.cardBorder}`,
    borderRadius: 8,
    padding: '9px 18px',
    fontSize: '0.875rem',
    cursor: 'pointer',
};

const btnSmallStyle: React.CSSProperties = {
    background: 'transparent',
    border: `1px solid ${adminColors.cardBorder}`,
    borderRadius: 6,
    padding: '5px 12px',
    fontSize: '0.78rem',
    color: adminColors.textSecondary,
    cursor: 'pointer',
};

const modalOverlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100,
    padding: 24,
};

const modalStyle: React.CSSProperties = {
    background: adminColors.card,
    border: `1px solid ${adminColors.cardBorder}`,
    borderRadius: 16,
    padding: '32px 28px',
    width: '100%',
    maxWidth: 460,
};

const errorBannerStyle: React.CSSProperties = {
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.3)',
    color: '#fca5a5',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: '0.85rem',
    marginBottom: 16,
};
