import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAdminAuth } from '../../context/AdminAuthContext';

export default function AdminLogin() {
    const { login } = useAdminAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            await login(email, password);
            navigate('/admin');
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                const status = err.response?.status;
                const detail = err.response?.data?.detail;
                if (status === 429) setError(detail || 'Muitas tentativas. Aguarde e tente novamente.');
                else setError('Credenciais inválidas ou sem permissão de superadmin.');
            } else {
                setError('Erro inesperado. Tente novamente.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={pageStyle}>
            <div style={cardStyle}>
                <div style={{ marginBottom: 32, textAlign: 'center' }}>
                    <div style={badgeStyle}>ADMIN</div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: adminColors.textPrimary, margin: '12px 0 4px' }}>
                        Remote Queue
                    </h1>
                    <p style={{ color: adminColors.textMuted, fontSize: '0.875rem' }}>Portal Administrativo Interno</p>
                </div>

                {error && (
                    <div style={errorStyle}>{error}</div>
                )}

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: 16 }}>
                        <label style={labelStyle}>Email</label>
                        <input
                            style={inputStyle}
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="admin@remotequeue.com"
                            required
                            autoFocus
                        />
                    </div>
                    <div style={{ marginBottom: 24 }}>
                        <label style={labelStyle}>Senha</label>
                        <input
                            style={inputStyle}
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>
                    <button style={{ ...btnStyle, opacity: loading ? 0.7 : 1 }} type="submit" disabled={loading}>
                        {loading ? 'Autenticando...' : 'Entrar no Painel Admin'}
                    </button>
                </form>

                <p style={{ textAlign: 'center', marginTop: 20, fontSize: '0.75rem', color: adminColors.textMuted }}>
                    Acesso restrito a superadmins
                </p>
            </div>
        </div>
    );
}

export const adminColors = {
    bg: '#0f1117',
    sidebar: '#161b27',
    sidebarBorder: '#1e2535',
    card: '#1a2032',
    cardBorder: '#232c3d',
    accent: '#3b82f6',
    accentHover: '#2563eb',
    success: '#10b981',
    danger: '#ef4444',
    warning: '#f59e0b',
    textPrimary: '#f1f5f9',
    textSecondary: '#94a3b8',
    textMuted: '#475569',
};

const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: adminColors.bg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
};

const cardStyle: React.CSSProperties = {
    background: adminColors.card,
    border: `1px solid ${adminColors.cardBorder}`,
    borderRadius: 16,
    padding: '40px 36px',
    width: '100%',
    maxWidth: 420,
};

const badgeStyle: React.CSSProperties = {
    display: 'inline-block',
    background: adminColors.accent,
    color: '#fff',
    fontSize: '0.65rem',
    fontWeight: 700,
    letterSpacing: '0.12em',
    padding: '4px 10px',
    borderRadius: 4,
};

const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.8rem',
    fontWeight: 500,
    color: adminColors.textSecondary,
    marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
    width: '100%',
    background: '#0f1117',
    border: `1px solid ${adminColors.cardBorder}`,
    borderRadius: 8,
    padding: '10px 12px',
    color: adminColors.textPrimary,
    fontSize: '0.9rem',
    outline: 'none',
    boxSizing: 'border-box',
};

const btnStyle: React.CSSProperties = {
    width: '100%',
    background: adminColors.accent,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '12px',
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
};

const errorStyle: React.CSSProperties = {
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.3)',
    color: '#fca5a5',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: '0.85rem',
    marginBottom: 20,
};
