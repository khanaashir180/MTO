import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);
const authStore = typeof window !== 'undefined' ? window.sessionStorage : null;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = authStore?.getItem('mto_user');
    return raw ? JSON.parse(raw) : null;
  });

  const [token, setToken] = useState(() => authStore?.getItem('mto_token') || null);
  const [refreshToken, setRefreshToken] = useState(() => authStore?.getItem('mto_refresh_token') || null);

  useEffect(() => {
    // Cleanup legacy persistent token storage.
    localStorage.removeItem('mto_token');
    localStorage.removeItem('mto_refresh_token');
    localStorage.removeItem('mto_user');
  }, []);

  useEffect(() => {
    if (token) authStore?.setItem('mto_token', token);
    else authStore?.removeItem('mto_token');
  }, [token]);

  useEffect(() => {
    if (refreshToken) authStore?.setItem('mto_refresh_token', refreshToken);
    else authStore?.removeItem('mto_refresh_token');
  }, [refreshToken]);

  useEffect(() => {
    if (user) authStore?.setItem('mto_user', JSON.stringify(user));
    else authStore?.removeItem('mto_user');
  }, [user]);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    setToken(data.accessToken || data.token);
    setRefreshToken(data.refreshToken || null);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', { refreshToken: refreshToken || authStore?.getItem('mto_refresh_token') || '' });
    } catch (_error) {
      // Logout should always clear local auth state even if network call fails.
    }
    setToken(null);
    setRefreshToken(null);
    setUser(null);
  }, [refreshToken]);

  const value = useMemo(
    () => ({ user, token, login, logout, isAuthenticated: Boolean(token) }),
    [user, token, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
