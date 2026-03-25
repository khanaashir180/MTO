const env = import.meta.env || {};

export const API_URL = env.VITE_API_URL || 'http://localhost:4000/api';
export const SOCKET_URL = env.VITE_SOCKET_URL || 'http://localhost:4000';
