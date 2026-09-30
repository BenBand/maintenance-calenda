import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  apiFetch,
  clearSession as clearApiSession,
  configureApiClient,
  getSession,
  onSessionChange,
  readResponseJson,
  setSession,
} from './api';
import { hasPermission } from './permissions';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const initialSession = getSession();
  const [token, setToken] = useState(initialSession.token);
  const [csrfToken, setCsrfToken] = useState(initialSession.csrfToken);
  const [refreshToken, setRefreshToken] = useState(initialSession.refreshToken);
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  });
  const [ready, setReady] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const authAdapterRef = useRef(null);
  authAdapterRef.current = {
    getCredentials: () => ({ token, csrfToken, refreshToken }),
    setCredentials: (session) => {
      setToken(session.token || null);
      setCsrfToken(session.csrfToken || null);
      setRefreshToken(session.refreshToken || null);
    },
    clearCredentials: () => {
      setToken(null);
      setCsrfToken(null);
      setRefreshToken(null);
      setUser(null);
    },
  };
  configureApiClient(authAdapterRef.current);

  useEffect(() => onSessionChange((session) => {
    setToken(session.token || null);
    setCsrfToken(session.csrfToken || null);
    setRefreshToken(session.refreshToken || null);
  }), []);

  useEffect(() => {
    if (user) sessionStorage.setItem('user', JSON.stringify(user));
    else sessionStorage.removeItem('user');
  }, [user]);

  const clearSession = useCallback(() => {
    clearApiSession();
    setUser(null);
  }, []);

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  useEffect(() => {
    if (!token) {
      setReady(true);
      return undefined;
    }

    let cancelled = false;
    const validate = async () => {
      try {
        const response = await apiFetch('/auth/me');
        const data = await readResponseJson(response);
        if (cancelled) return;
        setUser(data);
        setSessionError('');
        if (data?.csrfToken) setSession({ csrfToken: data.csrfToken });
        setReady(true);
      } catch (error) {
        if (cancelled) return;
        // Only a rejected or expired token means the session is genuinely gone.
        // Signing out on any other failure (403, 500, offline) throws the user
        // back to the login screen with no explanation, which looks like the
        // credentials were rejected when they were not.
        if (error?.status === 401) {
          logout();
          return;
        }
        setSessionError(
          error?.status
            ? `Unable to verify your session (HTTP ${error.status}). Please try again.`
            : 'Unable to reach the server. Check your connection and try again.'
        );
        setReady(true);
      }
    };

    validate();
    return () => {
      cancelled = true;
    };
  }, [token, logout]);

  const login = async (username, password) => {
    const response = await apiFetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }, { skipAuth: true, skipRefresh: true, maxRetries: 0 });
    const data = await readResponseJson(response);

    if (!response.ok) throw new Error(data?.error || 'Login failed');
    setSession({
      token: data.token,
      csrfToken: data.csrfToken,
      refreshToken: data.refreshToken,
    });
    setUser(data.user);
    return data;
  };

  const can = useCallback(
    (permission) => hasPermission(user?.role, permission),
    [user?.role]
  );

  return (
    <AuthContext.Provider value={{ token, csrfToken, refreshToken, user, login, logout, ready, can, sessionError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
