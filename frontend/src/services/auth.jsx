import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => sessionStorage.getItem('token'));
  const [csrfToken, setCsrfToken] = useState(() => sessionStorage.getItem('csrfToken'));
  const [user, setUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('user') || 'null'); } catch { return null; }
  });
  const [ready, setReady] = useState(false);

  const clearSession = useCallback(() => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('csrfToken');
    sessionStorage.removeItem('user');
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setCsrfToken(null);
    setUser(null);
    clearSession();
  }, [clearSession]);

  useEffect(() => {
    if (token) sessionStorage.setItem('token', token);
    else sessionStorage.removeItem('token');
    if (csrfToken) sessionStorage.setItem('csrfToken', csrfToken);
    else sessionStorage.removeItem('csrfToken');
    if (user) sessionStorage.setItem('user', JSON.stringify(user));
    else sessionStorage.removeItem('user');
  }, [token, csrfToken, user]);

  useEffect(() => {
    if (!token) { setReady(true); return; }
    let cancelled = false;
    const validate = async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          headers: authHeaders(token, csrfToken),
        });
        if (!res.ok) { if (!cancelled) logout(); return; }
        const data = await res.json();
        if (!cancelled) { setUser(data); setReady(true); }
      } catch { if (!cancelled) logout(); }
    };
    validate();
    return () => { cancelled = true; };
  }, [token, csrfToken, logout]);

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
    setCsrfToken(data.csrfToken);
    setUser(data.user);
    return data;
  };

  return (
    <AuthContext.Provider value={{ token, csrfToken, user, login, logout, ready }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

function authHeaders(token, csrfToken) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  return headers;
}

export async function apiFetch(url, options = {}, token, csrfToken) {
  const headers = {
    ...authHeaders(token, csrfToken),
    ...(options.headers || {}),
  };
  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  if (res.status === 401) throw new Error('Unauthorized');
  if (res.status === 403) throw new Error('Forbidden');
  if (res.status === 429) throw new Error('Too many requests');
  if (res.status === 400 && options.body) {
    const data = await res.json();
    if (data.error === 'Validation failed') {
      throw new Error(data.details?.map((d) => d.message).join(', ') || 'Validation failed');
    }
  }
  if (res.status === 404) throw new Error('Resource not found');
  return res;
}
