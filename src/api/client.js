import axios from 'axios';
import { API_URL } from '../config/env';

const api = axios.create({
  baseURL: API_URL,
});

let refreshInFlight = null;
const authStore = typeof window !== 'undefined' ? window.sessionStorage : null;

api.interceptors.request.use((config) => {
  const token = authStore?.getItem('mto_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const method = String(config.method || 'get').toLowerCase();
  const isMutating = ['post', 'put', 'patch', 'delete'].includes(method);
  if (isMutating) {
    config.headers = config.headers || {};
    if (!config.headers['Idempotency-Key']) {
      const key = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      config.headers['Idempotency-Key'] = key;
    }
  }
  return config;
});

async function refreshAccessToken() {
  if (!refreshInFlight) {
    const refreshToken = authStore?.getItem('mto_refresh_token');
    if (!refreshToken) throw new Error('No refresh token');
    refreshInFlight = api.post('/auth/refresh', { refreshToken })
      .then((response) => {
        const accessToken = response.data?.accessToken || response.data?.token;
        const nextRefreshToken = response.data?.refreshToken || refreshToken;
        if (!accessToken) {
          throw new Error('Refresh response missing access token');
        }
        authStore?.setItem('mto_token', accessToken);
        authStore?.setItem('mto_refresh_token', nextRefreshToken);
        if (response.data?.user) {
          authStore?.setItem('mto_user', JSON.stringify(response.data.user));
        }
        return accessToken;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};
    const status = error.response?.status;
    const isAuthRoute = String(originalRequest.url || '').includes('/auth/');
    if (status !== 401 || isAuthRoute || originalRequest._retry) {
      throw error;
    }

    originalRequest._retry = true;
    try {
      const nextAccessToken = await refreshAccessToken();
      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers.Authorization = `Bearer ${nextAccessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      authStore?.removeItem('mto_token');
      authStore?.removeItem('mto_refresh_token');
      authStore?.removeItem('mto_user');
      throw refreshError;
    }
  }
);

export default api;
