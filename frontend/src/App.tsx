import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, ProtectedRoute } from './context/AuthContext';
import B2CJoin from './pages/B2CJoin';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import QueueManagement from './pages/QueueManagement';
import QRDisplay from './pages/QRDisplay';
import StatusDisplay from './pages/StatusDisplay';

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/join" element={<B2CJoin />} />
                    <Route path="/" element={
                        <div className="page-container">
                            <div className="card" style={{ textAlign: 'center' }}>
                                <h1 className="heading-lg">Remote Queue</h1>
                                <p className="subtitle">Escaneie o QR Code da clínica para entrar na fila.</p>
                                <a href="/login" className="btn btn-secondary">Acesso operadores →</a>
                            </div>
                        </div>
                    } />
                    <Route path="/login" element={<Login />} />
                    <Route path="/dashboard" element={
                        <ProtectedRoute><Dashboard /></ProtectedRoute>
                    } />
                    <Route path="/dashboard/queue/:queueId" element={
                        <ProtectedRoute><QueueManagement /></ProtectedRoute>
                    } />
                    {/* Public display pages — no auth needed, for tablets/TVs */}
                    <Route path="/display/qr" element={<QRDisplay />} />
                    <Route path="/display/status" element={<StatusDisplay />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;
