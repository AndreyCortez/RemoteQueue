import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import axios from 'axios';

const API_BASE = '/api/v1';
const TOKEN_KEY = 'rq_access_token';

interface AuthContextType {
    token: string | null;
    isAuthenticated: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
    getAuthHeaders: () => Record<string, string>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
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
        const response = await axios.post(`${API_BASE}/auth/login`, formData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        setToken(response.data.access_token);
    };

    const logout = () => setToken(null);

    const getAuthHeaders = (): Record<string, string> => {
        if (!token) return {};
        return { 'x-tenant-token': token };
    };

    return (
        <AuthContext.Provider value={{ token, isAuthenticated, login, logout, getAuthHeaders }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within an AuthProvider');
    return context;
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
    const { isAuthenticated } = useAuth();
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    return <>{children}</>;
}
