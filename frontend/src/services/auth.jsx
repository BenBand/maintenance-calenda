import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => sessionStorage.getItem('token'));
  const [user, setUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('user') || 'null'); } catch { return null; }
  });
  const [ready, setReady] = useState(false);

  const clearSession = useCallback(() => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    clearSession();
  }, [clearSession]);

  useEffect(() => {
    if (token) sessionStorage.setItem('token', token);
    else sessionStorage.removeItem('token');
    if (user) sessionStorage.setItem('user', JSON.stringify(user));
    else sessionStorage.removeItem('user');
  }, [token, user]);

  useEffect(() => {
    if (!token) { setReady(true); return; }
    let cancelled = false;
    const validate = async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) { if (!cancelled) logout(); return; }
        const data = await res.json();
        if (!cancelled) { setUser(data); setReady(true); }
      } catch { if (!cancelled) logout(); }
    };
    validate();
    return () => { cancelled = true; };
  }, [token, logout]);

  const login = async (username, password) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Login failed');
    }
    const data = await res.json();
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  return (
    <AuthContext.Provider value={{ token, user, login, logout, ready }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

export async function apiFetch(url, options = {}, token) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  if (res.status === 401) throw new Error('Unauthorized');
  if (res.status === 204) return null;
  return res;
}
