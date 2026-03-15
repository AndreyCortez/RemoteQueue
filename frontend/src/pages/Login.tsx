import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export default function Login() {
    const { login } = useAuth();
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
            navigate('/dashboard');
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.detail || 'Credenciais inválidas. Verifique e tente novamente.');
            } else {
                setError('Erro inesperado. Tente novamente.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page-container">
            <div className="card" style={{ textAlign: 'center' }}>
                <h1 className="heading-lg">Remote Queue</h1>
                <p className="subtitle">Portal de Gestão</p>
                {error && <div className="alert alert-error" id="login-error">{error}</div>}
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label" htmlFor="login-email">Email</label>
                        <input id="login-email" className="form-input" type="email"
                            placeholder="operator@company.com" value={email}
                            onChange={e => setEmail(e.target.value)} required autoComplete="email" autoFocus />
                    </div>
                    <div className="form-group">
                        <label className="form-label" htmlFor="login-password">Senha</label>
                        <input id="login-password" className="form-input" type="password"
                            placeholder="••••••••" value={password}
                            onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
                    </div>
                    <button id="login-submit" className="btn btn-primary btn-full" type="submit" disabled={loading}>
                        {loading ? <span className="spinner" role="status" aria-label="Entrando" /> : 'Entrar'}
                    </button>
                </form>
            </div>
        </div>
    );
}
