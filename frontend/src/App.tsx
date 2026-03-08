import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, ProtectedRoute } from './context/AuthContext';
import B2CJoin from './pages/B2CJoin';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import QueueManagement from './pages/QueueManagement';

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
                                <p className="subtitle">Welcome. Please scan a QR code to join a queue.</p>
                                <a href="/login" className="btn btn-secondary">B2B Login →</a>
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
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;
