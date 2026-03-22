import { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { adminColors } from './AdminLogin';

interface Props {
    children: ReactNode;
}

export default function AdminLayout({ children }: Props) {
    const { logout } = useAdminAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/admin/login');
    };

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: adminColors.bg }}>
            {/* Sidebar */}
            <nav style={{
                width: 220,
                background: adminColors.sidebar,
                borderRight: `1px solid ${adminColors.sidebarBorder}`,
                display: 'flex',
                flexDirection: 'column',
                flexShrink: 0,
            }}>
                {/* Logo */}
                <div style={{
                    padding: '24px 20px 20px',
                    borderBottom: `1px solid ${adminColors.sidebarBorder}`,
                }}>
                    <div style={{
                        display: 'inline-block',
                        background: adminColors.accent,
                        color: '#fff',
                        fontSize: '0.6rem',
                        fontWeight: 700,
                        letterSpacing: '0.12em',
                        padding: '3px 7px',
                        borderRadius: 4,
                        marginBottom: 8,
                    }}>ADMIN</div>
                    <div style={{ color: adminColors.textPrimary, fontWeight: 700, fontSize: '1rem' }}>
                        Remote Queue
                    </div>
                    <div style={{ color: adminColors.textMuted, fontSize: '0.72rem', marginTop: 2 }}>
                        Portal Interno
                    </div>
                </div>

                {/* Nav links */}
                <div style={{ padding: '16px 12px', flex: 1 }}>
                    <NavItem to="/admin" label="Dashboard" icon="▦" end />
                    <NavItem to="/admin/tenants" label="Clientes" icon="⊞" />
                </div>

                {/* Logout */}
                <div style={{ padding: '16px 12px', borderTop: `1px solid ${adminColors.sidebarBorder}` }}>
                    <button
                        onClick={handleLogout}
                        style={{
                            width: '100%',
                            background: 'transparent',
                            border: `1px solid ${adminColors.sidebarBorder}`,
                            borderRadius: 8,
                            padding: '8px 12px',
                            color: adminColors.textMuted,
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                            textAlign: 'left',
                        }}
                    >
                        ↩ Sair
                    </button>
                </div>
            </nav>

            {/* Main content */}
            <main style={{ flex: 1, overflow: 'auto', padding: '32px 36px' }}>
                {children}
            </main>
        </div>
    );
}

function NavItem({ to, label, icon, end }: { to: string; label: string; icon: string; end?: boolean }) {
    return (
        <NavLink
            to={to}
            end={end}
            style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                borderRadius: 8,
                textDecoration: 'none',
                fontSize: '0.875rem',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? adminColors.textPrimary : adminColors.textSecondary,
                background: isActive ? 'rgba(59,130,246,0.12)' : 'transparent',
                marginBottom: 2,
            })}
        >
            <span style={{ fontSize: '0.95rem', opacity: 0.8 }}>{icon}</span>
            {label}
        </NavLink>
    );
}
