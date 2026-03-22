import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, ProtectedRoute } from './context/AuthContext';
import { AdminAuthProvider, AdminProtectedRoute } from './context/AdminAuthContext';
import B2CJoin from './pages/B2CJoin';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import QueueManagement from './pages/QueueManagement';
import QRDisplay from './pages/QRDisplay';
import StatusDisplay from './pages/StatusDisplay';
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminTenants from './pages/admin/AdminTenants';
import AdminTenantDetail from './pages/admin/AdminTenantDetail';

function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
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
            </AuthProvider>

            {/* Admin portal — separate auth context to isolate superadmin tokens */}
            <AdminAuthProvider>
                <Routes>
                    <Route path="/admin/login" element={<AdminLogin />} />
                    <Route path="/admin" element={
                        <AdminProtectedRoute><AdminDashboard /></AdminProtectedRoute>
                    } />
                    <Route path="/admin/tenants" element={
                        <AdminProtectedRoute><AdminTenants /></AdminProtectedRoute>
                    } />
                    <Route path="/admin/tenants/:tenantId" element={
                        <AdminProtectedRoute><AdminTenantDetail /></AdminProtectedRoute>
                    } />
                </Routes>
            </AdminAuthProvider>
        </BrowserRouter>
    );
}

export default App;
