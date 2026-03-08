import { useState, useEffect, FormEvent } from 'react';
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

    const [queueName, setQueueName] = useState('');
    const [schemaFields, setSchemaFields] = useState<SchemaField[]>([{ name: '', type: 'string' }]);
    const [createError, setCreateError] = useState<string | null>(null);
    const [createSuccess, setCreateSuccess] = useState<string | null>(null);
    const [queues, setQueues] = useState<QueueConfig[]>([]);
    const [loadingQueues, setLoadingQueues] = useState(true);

    // QR Code modal — fetch as blob to bypass auth header limitation on <img>
    const [qrQueueId, setQrQueueId] = useState<string | null>(null);
    const [qrQueueName, setQrQueueName] = useState<string>('');
    const [qrBlobUrl, setQrBlobUrl] = useState<string | null>(null);
    const [qrLoading, setQrLoading] = useState(false);

    const headers = getAuthHeaders();

    const fetchQueues = async () => {
        try {
            const res = await axios.get(`${API_BASE}/b2b/queues`, { headers });
            setQueues(res.data);
        } catch (err: any) {
            if (err.response?.status === 401) { logout(); navigate('/login'); }
        } finally {
            setLoadingQueues(false);
        }
    };

    useEffect(() => { fetchQueues(); }, []);

    const addSchemaField = () => setSchemaFields(prev => [...prev, { name: '', type: 'string' }]);
    const removeSchemaField = (index: number) => setSchemaFields(prev => prev.filter((_, i) => i !== index));
    const updateSchemaField = (index: number, key: 'name' | 'type', value: string) =>
        setSchemaFields(prev => prev.map((f, i) => i === index ? { ...f, [key]: value } : f));

    const handleCreateQueue = async (e: FormEvent) => {
        e.preventDefault();
        setCreateError(null);
        setCreateSuccess(null);
        const form_schema: Record<string, string> = {};
        for (const field of schemaFields) {
            if (!field.name.trim()) { setCreateError('All fields must have a name.'); return; }
            form_schema[field.name.trim()] = field.type;
        }
        try {
            await axios.post(`${API_BASE}/b2b/queues`, { name: queueName, form_schema }, { headers });
            setCreateSuccess(`Queue "${queueName}" created successfully!`);
            setQueueName('');
            setSchemaFields([{ name: '', type: 'string' }]);
            fetchQueues();
        } catch (err: any) {
            setCreateError(err.response?.data?.detail || 'Failed to create queue.');
        }
    };

    const openQrCode = async (queueId: string, name: string) => {
        setQrQueueId(queueId);
        setQrQueueName(name);
        setQrBlobUrl(null);
        setQrLoading(true);
        try {
            // Fetch QR as blob so we can pass auth headers — <img src> can't do this
            const res = await axios.get(`${API_BASE}/b2b/queues/${queueId}/qrcode`, {
                headers,
                responseType: 'blob'
            });
            const url = URL.createObjectURL(res.data);
            setQrBlobUrl(url);
        } catch {
            setQrBlobUrl(null);
        } finally {
            setQrLoading(false);
        }
    };

    const closeQrCode = () => {
        if (qrBlobUrl) URL.revokeObjectURL(qrBlobUrl);
        setQrQueueId(null);
        setQrBlobUrl(null);
    };

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <div>
                    <h1 className="heading-lg">Dashboard</h1>
                    <p className="subtitle" style={{ marginBottom: 0 }}>Manage your queues and generate QR Codes</p>
                </div>
                <button id="logout-btn" className="btn btn-secondary btn-sm" onClick={() => { logout(); navigate('/login'); }}>
                    Sign Out
                </button>
            </div>

            <div className="dashboard-grid">
                {/* CREATE QUEUE */}
                <div className="card">
                    <h2 className="heading-md">Create New Queue</h2>
                    <p className="subtitle">Define the form fields your B2C customers must fill</p>
                    {createError && <div className="alert alert-error">{createError}</div>}
                    {createSuccess && <div className="alert alert-success" id="create-success">{createSuccess}</div>}
                    <form onSubmit={handleCreateQueue}>
                        <div className="form-group">
                            <label className="form-label" htmlFor="queue-name">Queue Name</label>
                            <input id="queue-name" className="form-input" type="text"
                                placeholder="e.g. Main Entrance" value={queueName}
                                onChange={e => setQueueName(e.target.value)} required />
                        </div>
                        <label className="form-label">Form Schema Fields</label>
                        {schemaFields.map((field, index) => (
                            <div key={index} className="schema-field-row">
                                <input className="form-input" type="text" placeholder="Field name"
                                    value={field.name} onChange={e => updateSchemaField(index, 'name', e.target.value)}
                                    data-testid={`schema-field-name-${index}`} />
                                <select className="form-select" value={field.type}
                                    onChange={e => updateSchemaField(index, 'type', e.target.value)}
                                    data-testid={`schema-field-type-${index}`}>
                                    <option value="string">String</option>
                                    <option value="integer">Integer</option>
                                    <option value="boolean">Boolean</option>
                                </select>
                                {schemaFields.length > 1 && (
                                    <button type="button" className="btn btn-danger btn-sm"
                                        onClick={() => removeSchemaField(index)}>✕</button>
                                )}
                            </div>
                        ))}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                            <button type="button" className="btn btn-secondary btn-sm"
                                onClick={addSchemaField} id="add-field-btn">+ Add Field</button>
                        </div>
                        <button id="create-queue-submit" className="btn btn-primary btn-full"
                            type="submit" style={{ marginTop: '20px' }}>Create Queue</button>
                    </form>
                </div>

                {/* QUEUE LIST */}
                <div className="card">
                    <h2 className="heading-md">My Queues</h2>
                    <p className="subtitle">Click a queue to view its QR Code</p>
                    {loadingQueues ? (
                        <div style={{ textAlign: 'center', padding: '20px' }}><span className="spinner" /></div>
                    ) : queues.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
                            No queues yet. Create one to get started.
                        </p>
                    ) : (
                        <ul className="queue-list" id="queue-list">
                            {queues.map(q => (
                                <li key={q.id} className="queue-item" style={{ cursor: 'pointer' }}
                                    onClick={() => openQrCode(q.id, q.name)}>
                                    <div>
                                        <div className="queue-item-name">{q.name}</div>
                                        <div className="queue-item-schema">
                                            Fields: {Object.keys(q.form_schema).join(', ') || 'none'}
                                        </div>
                                    </div>
                                    <button className="btn btn-secondary btn-sm" data-testid={`qr-btn-${q.id}`}>
                                        QR Code
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {/* QR CODE MODAL */}
            {qrQueueId && (
                <div className="qr-overlay" onClick={closeQrCode}>
                    <div className="qr-modal" onClick={e => e.stopPropagation()}>
                        <h2 className="heading-md">{qrQueueName}</h2>
                        <p className="subtitle" style={{ marginBottom: '8px' }}>Scan to join this queue</p>
                        {qrLoading ? (
                            <div style={{ padding: '40px' }}><span className="spinner" /></div>
                        ) : qrBlobUrl ? (
                            <img id="qr-code-img" src={qrBlobUrl}
                                alt={`QR Code for ${qrQueueName}`} width={250} height={250} />
                        ) : (
                            <p style={{ color: 'var(--accent-error)', padding: '20px' }}>Failed to load QR Code</p>
                        )}
                        <br />
                        <button className="btn btn-secondary" onClick={closeQrCode} style={{ marginTop: '12px' }}>
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
