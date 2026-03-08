import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_BASE = '/api/v1';

interface Member {
    position: number;
    user_data: Record<string, unknown>;
    joined_at: number;
}

interface QueueInfo {
    id: string;
    name: string;
    form_schema: Record<string, string>;
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

    const headers = getAuthHeaders();

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    const fetchQueue = useCallback(async () => {
        try {
            const res = await axios.get(`${API_BASE}/b2b/queues`, { headers });
            const q = res.data.find((q: QueueInfo) => q.id === queueId);
            if (!q) { navigate('/dashboard'); return; }
            setQueue(q);
        } catch (err: any) {
            if (err.response?.status === 401) { logout(); navigate('/login'); }
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

    // WebSocket for real-time updates
    useEffect(() => {
        if (!queueId) return;
        const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
        const ws = new WebSocket(`${protocol}://${location.host}/api/v1/queue/${queueId}/ws`);
        ws.onmessage = () => fetchMembers(); // Any event → refresh list
        return () => ws.close();
    }, [queueId, fetchMembers]);

    const handleCallNext = async () => {
        try {
            const res = await axios.post(`${API_BASE}/b2b/queue/${queueId}/call-next`, {}, { headers });
            setCalledUser(res.data.user_data);
            showToast('Next person called! ✓');
            fetchMembers();
        } catch (err: any) {
            const detail = err.response?.data?.detail;
            if (detail === 'queue_is_empty') showToast('Queue is empty!', 'error');
            else showToast('Error calling next', 'error');
        }
    };

    const handleRemove = async (member: Member) => {
        try {
            await axios.delete(`${API_BASE}/b2b/queue/${queueId}/members`, {
                headers,
                data: { user_data: member.user_data }
            });
            showToast('Member removed');
            setMembers(prev => prev.filter(m => m.position !== member.position));
        } catch {
            showToast('Failed to remove member', 'error');
        }
    };

    const handleMoveUp = async (member: Member) => {
        if (member.position === 0) return;
        try {
            await axios.put(`${API_BASE}/b2b/queue/${queueId}/members/reorder`, {
                user_data: member.user_data,
                target_position: member.position - 1
            }, { headers });
            fetchMembers();
        } catch {
            showToast('Failed to reorder', 'error');
        }
    };

    const handleMoveDown = async (member: Member) => {
        if (member.position >= members.length - 1) return;
        try {
            await axios.put(`${API_BASE}/b2b/queue/${queueId}/members/reorder`, {
                user_data: member.user_data,
                target_position: member.position + 1
            }, { headers });
            fetchMembers();
        } catch {
            showToast('Failed to reorder', 'error');
        }
    };

    const handleClearAll = async () => {
        if (!confirm('Clear all members from the queue? This cannot be undone.')) return;
        try {
            const res = await axios.post(`${API_BASE}/b2b/queue/${queueId}/clear`, {}, { headers });
            showToast(`Cleared ${res.data.removed_count} members`);
            setMembers([]);
        } catch {
            showToast('Failed to clear queue', 'error');
        }
    };

    const formatTime = (score: number) => {
        return new Date(score * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="dashboard-container" style={{ maxWidth: '900px' }}>
            {/* Toast notification */}
            {toast && (
                <div
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
                        style={{ marginBottom: 8 }}>← Back to Dashboard</button>
                    <h1 className="heading-lg" style={{ marginBottom: 0 }}>{queue?.name || '...'}</h1>
                    <p className="subtitle" style={{ marginBottom: 0 }}>
                        {members.length} {members.length === 1 ? 'person' : 'people'} in queue
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button
                        id="call-next-btn"
                        className="btn btn-primary"
                        onClick={handleCallNext}
                        disabled={members.length === 0}
                    >
                        Call Next ▶
                    </button>
                    <button
                        id="clear-all-btn"
                        className="btn btn-danger"
                        onClick={handleClearAll}
                        disabled={members.length === 0}
                    >
                        Clear All ✕
                    </button>
                </div>
            </div>

            {/* Called user banner */}
            {calledUser && (
                <div
                    id="called-user-banner"
                    className="card"
                    style={{ marginBottom: 24, background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.04))', border: '1px solid rgba(16,185,129,0.3)' }}
                >
                    <p style={{ color: 'var(--accent-success)', fontWeight: 600, marginBottom: 8 }}>
                        ✓ Now calling:
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                        {Object.entries(calledUser).map(([key, val]) => (
                            <div key={key} style={{ background: 'rgba(16,185,129,0.1)', borderRadius: 8, padding: '6px 14px' }}>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>{key}: </span>
                                <span style={{ fontWeight: 600 }}>{String(val)}</span>
                            </div>
                        ))}
                    </div>
                    <button onClick={() => setCalledUser(null)} style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}>
                        dismiss
                    </button>
                </div>
            )}

            {/* Queue Table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /></div>
                ) : members.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🎉</div>
                        <p>Queue is empty!</p>
                    </div>
                ) : (
                    <table id="members-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                <th style={thStyle}>#</th>
                                <th style={thStyle}>Data</th>
                                <th style={thStyle}>Joined</th>
                                <th style={thStyle}>Order</th>
                                <th style={thStyle}>Remove</th>
                            </tr>
                        </thead>
                        <tbody>
                            {members.map((member, idx) => (
                                <tr
                                    key={idx}
                                    data-testid={`member-row-${idx}`}
                                    style={{
                                        borderBottom: '1px solid var(--border-subtle)',
                                        background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                                        transition: 'background var(--transition-fast)'
                                    }}
                                >
                                    {/* Position badge */}
                                    <td style={tdStyle}>
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                            width: 32, height: 32, borderRadius: '50%',
                                            background: idx === 0 ? 'linear-gradient(135deg, var(--accent-primary), #4f46e5)' : 'var(--bg-secondary)',
                                            fontWeight: 700, fontSize: '0.85rem'
                                        }}>
                                            {member.position + 1}
                                        </span>
                                    </td>
                                    {/* Form data fields */}
                                    <td style={tdStyle}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                            {Object.entries(member.user_data).map(([key, val]) => (
                                                <span key={key} style={{ background: 'var(--bg-secondary)', borderRadius: 6, padding: '4px 10px', fontSize: '0.82rem' }}>
                                                    <span style={{ color: 'var(--text-muted)' }}>{key}:</span>{' '}
                                                    <span style={{ fontWeight: 600 }}>{String(val)}</span>
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    {/* Timestamp */}
                                    <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                                        {formatTime(member.joined_at)}
                                    </td>
                                    {/* Reorder */}
                                    <td style={tdStyle}>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => handleMoveUp(member)}
                                                disabled={member.position === 0}
                                                title="Move up"
                                                data-testid={`move-up-${idx}`}
                                                style={{ padding: '6px 10px', opacity: member.position === 0 ? 0.3 : 1 }}
                                            >▲</button>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => handleMoveDown(member)}
                                                disabled={member.position >= members.length - 1}
                                                title="Move down"
                                                data-testid={`move-down-${idx}`}
                                                style={{ padding: '6px 10px', opacity: member.position >= members.length - 1 ? 0.3 : 1 }}
                                            >▼</button>
                                        </div>
                                    </td>
                                    {/* Remove */}
                                    <td style={tdStyle}>
                                        <button
                                            className="btn btn-danger btn-sm"
                                            onClick={() => handleRemove(member)}
                                            data-testid={`remove-btn-${idx}`}
                                            title="Remove from queue"
                                        >✕</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
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
