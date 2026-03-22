import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import AdminLayout from './AdminLayout';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { adminColors } from './AdminLogin';

interface TenantDetail {
    id: string;
    name: string;
    is_suspended: boolean;
    created_at: string | null;
    queue_count: number;
    active_members: number;
    branding: Record<string, unknown> | null;
    queues: { id: string; name: string; active_members: number }[];
    calls_per_day: { date: string; count: number }[];
}

export default function AdminTenantDetail() {
    const { tenantId } = useParams<{ tenantId: string }>();
    const { getAuthHeaders } = useAdminAuth();
    const navigate = useNavigate();
    const [tenant, setTenant] = useState<TenantDetail | null>(null);
    const [editName, setEditName] = useState('');
    const [saving, setSaving] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState(false);

    const load = () => {
        if (!tenantId) return;
        axios.get(`/api/v1/admin/tenants/${tenantId}`, { headers: getAuthHeaders() })
            .then(r => { setTenant(r.data); setEditName(r.data.name); })
            .catch(() => setError(true));
    };

    useEffect(() => { load(); }, [tenantId]);

    const handleSaveName = async () => {
        if (!tenant || !editName.trim() || editName === tenant.name) return;
        setSaving(true);
        try {
            await axios.put(`/api/v1/admin/tenants/${tenant.id}`, { name: editName }, { headers: getAuthHeaders() });
            load();
        } finally {
            setSaving(false);
        }
    };

    const handleSuspend = async () => {
        if (!tenant) return;
        const action = tenant.is_suspended ? 'reativar' : 'suspender';
        if (!window.confirm(`Confirma ${action} o cliente "${tenant.name}"?`)) return;
        setActionLoading(true);
        try {
            await axios.post(`/api/v1/admin/tenants/${tenant.id}/suspend`, {}, { headers: getAuthHeaders() });
            load();
        } finally {
            setActionLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!tenant) return;
        if (!window.confirm(`Excluir permanentemente o cliente "${tenant.name}"? Esta ação não pode ser desfeita.`)) return;
        setActionLoading(true);
        try {
            await axios.delete(`/api/v1/admin/tenants/${tenant.id}`, { headers: getAuthHeaders() });
            navigate('/admin/tenants');
        } finally {
            setActionLoading(false);
        }
    };

    if (error) return (
        <AdminLayout>
            <div style={{ color: '#fca5a5', padding: 24 }}>Cliente não encontrado.</div>
        </AdminLayout>
    );

    if (!tenant) return (
        <AdminLayout>
            <div style={{ color: adminColors.textMuted, padding: 24 }}>Carregando...</div>
        </AdminLayout>
    );

    const maxCalls = Math.max(...tenant.calls_per_day.map(d => d.count), 1);

    return (
        <AdminLayout>
            <div style={{ maxWidth: 900 }}>
                {/* Breadcrumb */}
                <div style={{ marginBottom: 8 }}>
                    <button onClick={() => navigate('/admin/tenants')} style={backBtn}>
                        ← Clientes
                    </button>
                </div>

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: adminColors.textPrimary, margin: 0 }}>
                                {tenant.name}
                            </h1>
                            <SuspendedBadge suspended={tenant.is_suspended} />
                        </div>
                        <p style={{ color: adminColors.textMuted, fontSize: '0.8rem' }}>
                            ID: {tenant.id}
                            {tenant.created_at && ` · Criado em ${new Date(tenant.created_at).toLocaleDateString('pt-BR')}`}
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button
                            style={actionLoading ? { ...btnStyle, opacity: 0.6 } : btnStyle}
                            onClick={handleSuspend}
                            disabled={actionLoading}
                        >
                            {tenant.is_suspended ? 'Reativar' : 'Suspender'}
                        </button>
                        <button
                            style={{ ...btnDangerStyle, ...(actionLoading ? { opacity: 0.6 } : {}) }}
                            onClick={handleDelete}
                            disabled={actionLoading}
                        >
                            Excluir
                        </button>
                    </div>
                </div>

                {/* Edit name */}
                <section style={{ ...sectionCard, marginBottom: 24 }}>
                    <h2 style={sectionTitle}>Configurações</h2>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                        <div style={{ flex: 1 }}>
                            <label style={labelStyle}>Nome da empresa</label>
                            <input
                                value={editName}
                                onChange={e => setEditName(e.target.value)}
                                style={inputStyle}
                            />
                        </div>
                        <button
                            style={{ ...btnPrimaryStyle, ...(saving ? { opacity: 0.6 } : {}) }}
                            onClick={handleSaveName}
                            disabled={saving || editName === tenant.name}
                        >
                            {saving ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </section>

                {/* Stats row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
                    <MiniStat label="Filas" value={tenant.queue_count} />
                    <MiniStat label="Na fila agora" value={tenant.active_members} highlight />
                    <MiniStat label="Chamadas (30d)" value={tenant.calls_per_day.reduce((s, d) => s + d.count, 0)} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                    {/* Queues */}
                    <section style={sectionCard}>
                        <h2 style={sectionTitle}>Filas ativas</h2>
                        {tenant.queues.length === 0 ? (
                            <p style={{ color: adminColors.textMuted, fontSize: '0.85rem' }}>Nenhuma fila</p>
                        ) : (
                            tenant.queues.map(q => (
                                <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${adminColors.sidebarBorder}` }}>
                                    <span style={{ color: adminColors.textSecondary, fontSize: '0.875rem' }}>{q.name}</span>
                                    <span style={{ color: q.active_members > 0 ? adminColors.accent : adminColors.textMuted, fontWeight: 600, fontSize: '0.875rem' }}>
                                        {q.active_members} aguardando
                                    </span>
                                </div>
                            ))
                        )}
                    </section>

                    {/* Activity chart */}
                    <section style={sectionCard}>
                        <h2 style={sectionTitle}>Chamadas por dia (30d)</h2>
                        {tenant.calls_per_day.length === 0 ? (
                            <p style={{ color: adminColors.textMuted, fontSize: '0.85rem' }}>Sem dados</p>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120 }}>
                                {tenant.calls_per_day.map(d => (
                                    <div key={d.date} title={`${d.date}: ${d.count}`} style={{
                                        flex: 1,
                                        height: `${Math.max(4, (d.count / maxCalls) * 100)}%`,
                                        background: adminColors.accent,
                                        borderRadius: '3px 3px 0 0',
                                        opacity: 0.7,
                                        minWidth: 4,
                                    }} />
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </AdminLayout>
    );
}

function SuspendedBadge({ suspended }: { suspended: boolean }) {
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

function MiniStat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
    return (
        <div style={{ background: adminColors.card, border: `1px solid ${adminColors.cardBorder}`, borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ fontSize: '0.72rem', color: adminColors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: highlight ? adminColors.accent : adminColors.textPrimary, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        </div>
    );
}

const sectionCard: React.CSSProperties = { background: adminColors.card, border: `1px solid ${adminColors.cardBorder}`, borderRadius: 12, padding: 24 };
const sectionTitle: React.CSSProperties = { fontSize: '0.75rem', fontWeight: 600, color: adminColors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.8rem', color: adminColors.textSecondary, marginBottom: 6 };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box' as const, background: '#0f1117', border: `1px solid ${adminColors.cardBorder}`, borderRadius: 8, padding: '9px 12px', color: adminColors.textPrimary, fontSize: '0.875rem', outline: 'none' };
const btnPrimaryStyle: React.CSSProperties = { background: adminColors.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const };
const btnStyle: React.CSSProperties = { background: 'transparent', color: adminColors.textSecondary, border: `1px solid ${adminColors.cardBorder}`, borderRadius: 8, padding: '9px 18px', fontSize: '0.875rem', cursor: 'pointer' };
const btnDangerStyle: React.CSSProperties = { background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '9px 18px', fontSize: '0.875rem', cursor: 'pointer' };
const backBtn: React.CSSProperties = { background: 'transparent', border: 'none', color: adminColors.textMuted, fontSize: '0.85rem', cursor: 'pointer', padding: '4px 0', marginBottom: 8 };
