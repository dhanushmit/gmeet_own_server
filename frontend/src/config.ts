const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const defaultApiUrl = isLocalhost ? 'http://localhost:8000' : 'https://gmeet-own-server.onrender.com';
const defaultWsUrl = isLocalhost ? 'ws://localhost:8000' : 'wss://gmeet-own-server.onrender.com';

export const API_URL = import.meta.env.VITE_API_URL || defaultApiUrl;
export const WS_URL = import.meta.env.VITE_WS_URL || defaultWsUrl;
export const UPLOADS_URL = API_URL;
