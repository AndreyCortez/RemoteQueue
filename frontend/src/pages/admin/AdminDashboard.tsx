import { useEffect, useState } from 'react';
import axios from 'axios';
import AdminLayout from './AdminLayout';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { adminColors } from './AdminLogin';

interface Stats {
    total_tenants: number;
    active_tenants: number;
    suspended_tenants: number;
    calls_today: number;
    calls_this_week: number;
    calls_this_month: number;
    top_tenants: { tenant_id: string; name: string; calls_this_month: number }[];
    busiest_queues: { queue_id: string; queue_name: string; tenant_name: string; active_members: number }[];
}

export default function AdminDashboard() {
    const { getAuthHeaders } = useAdminAuth();
    const [stats, setStats] = useState<Stats | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        axios.get('/api/v1/admin/stats', { headers: getAuthHeaders() })
            .then(r => setStats(r.data))
            .catch(() => setError(true));
    }, []);

    return (
        <AdminLayout>
            <div style={{ maxWidth: 1100 }}>
                <div style={{ marginBottom: 32 }}>
                    <h1 style={headingStyle}>Dashboard</h1>
                    <p style={{ color: adminColors.textMuted, fontSize: '0.875rem', marginTop: 4 }}>
                        Visão geral da plataforma
                    </p>
                </div>

                {error && (
                    <div style={errorBannerStyle}>Erro ao carregar dados.</div>
                )}

                {!stats && !error && (
                    <div style={{ color: adminColors.textMuted }}>Carregando...</div>
                )}

                {stats && (
                    <>
                        {/* Stat cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
                            <StatCard label="Clientes ativos" value={stats.active_tenants} color={adminColors.success} />
                            <StatCard label="Clientes suspensos" value={stats.suspended_tenants} color={adminColors.danger} />
                            <StatCard label="Chamadas hoje" value={stats.calls_today} color={adminColors.accent} />
                            <StatCard label="Chamadas esta semana" value={stats.calls_this_week} color={adminColors.accent} />
                            <StatCard label="Chamadas este mês" value={stats.calls_this_month} color={adminColors.accent} />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                            {/* Top tenants */}
                            <div style={sectionCard}>
                                <h2 style={sectionTitle}>Top clientes (este mês)</h2>
                                {stats.top_tenants.length === 0 ? (
                                    <p style={{ color: adminColors.textMuted, fontSize: '0.85rem' }}>Sem dados ainda</p>
                                ) : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr>
                                                <th style={thStyle}>Cliente</th>
                                                <th style={{ ...thStyle, textAlign: 'right' }}>Chamadas</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stats.top_tenants.map((t, i) => (
                                                <tr key={t.tenant_id} style={{ opacity: 1 - i * 0.05 }}>
                                                    <td style={tdStyle}>{t.name}</td>
                                                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: adminColors.textPrimary }}>
                                                        {t.calls_this_month.toLocaleString()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            {/* Busiest queues now */}
                            <div style={sectionCard}>
                                <h2 style={sectionTitle}>Filas mais ativas agora</h2>
                                {stats.busiest_queues.length === 0 ? (
                                    <p style={{ color: adminColors.textMuted, fontSize: '0.85rem' }}>Nenhuma fila ativa no momento</p>
                                ) : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr>
                                                <th style={thStyle}>Fila</th>
                                                <th style={thStyle}>Cliente</th>
                                                <th style={{ ...thStyle, textAlign: 'right' }}>Aguardando</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stats.busiest_queues.map(q => (
                                                <tr key={q.queue_id}>
                                                    <td style={tdStyle}>{q.queue_name}</td>
                                                    <td style={{ ...tdStyle, color: adminColors.textMuted }}>{q.tenant_name}</td>
                                                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: adminColors.accent }}>
                                                        {q.active_members}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </AdminLayout>
    );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div style={{
            background: adminColors.card,
            border: `1px solid ${adminColors.cardBorder}`,
            borderRadius: 12,
            padding: '20px 24px',
        }}>
            <div style={{ fontSize: '0.75rem', color: adminColors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                {label}
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
                {value.toLocaleString()}
            </div>
        </div>
    );
}

const headingStyle: React.CSSProperties = {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: adminColors.textPrimary,
    margin: 0,
};

const sectionCard: React.CSSProperties = {
    background: adminColors.card,
    border: `1px solid ${adminColors.cardBorder}`,
    borderRadius: 12,
    padding: 24,
};

const sectionTitle: React.CSSProperties = {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: adminColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    margin: '0 0 16px',
};

const thStyle: React.CSSProperties = {
    fontSize: '0.72rem',
    fontWeight: 600,
    color: adminColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    padding: '0 0 10px',
    textAlign: 'left',
    borderBottom: `1px solid ${adminColors.cardBorder}`,
};

const tdStyle: React.CSSProperties = {
    padding: '10px 0',
    fontSize: '0.875rem',
    color: adminColors.textSecondary,
    borderBottom: `1px solid ${adminColors.sidebarBorder}`,
};

const errorBannerStyle: React.CSSProperties = {
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.3)',
    color: '#fca5a5',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: '0.875rem',
    marginBottom: 24,
};
