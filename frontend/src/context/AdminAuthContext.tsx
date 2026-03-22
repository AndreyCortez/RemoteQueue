import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import axios from 'axios';

const API_BASE = '/api/v1';
const TOKEN_KEY = 'rq_admin_token';

interface AdminAuthContextType {
    token: string | null;
    isAuthenticated: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
    getAuthHeaders: () => Record<string, string>;
}

const AdminAuthContext = createContext<AdminAuthContextType | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
    const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
    const isAuthenticated = !!token;

    useEffect(() => {
        if (token) localStorage.setItem(TOKEN_KEY, token);
        else localStorage.removeItem(TOKEN_KEY);
    }, [token]);

    const login = async (email: string, password: string): Promise<void> => {
        const formData = new URLSearchParams();
        formData.append('username', email);
        formData.append('password', password);
        const response = await axios.post(`${API_BASE}/admin/auth/login`, formData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        setToken(response.data.access_token);
    };

    const logout = () => setToken(null);

    const getAuthHeaders = (): Record<string, string> => {
        if (!token) return {};
        return { 'x-tenant-token': token };
    };

    return (
        <AdminAuthContext.Provider value={{ token, isAuthenticated, login, logout, getAuthHeaders }}>
            {children}
        </AdminAuthContext.Provider>
    );
}

export function useAdminAuth(): AdminAuthContextType {
    const ctx = useContext(AdminAuthContext);
    if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
    return ctx;
}

export function AdminProtectedRoute({ children }: { children: ReactNode }) {
    const { isAuthenticated } = useAdminAuth();
    if (!isAuthenticated) return <Navigate to="/admin/login" replace />;
    return <>{children}</>;
}
