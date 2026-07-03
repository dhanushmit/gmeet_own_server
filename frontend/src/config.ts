const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const defaultApiUrl = isLocalhost ? 'http://localhost:8000' : 'https://gmeet-own-server.onrender.com';
const defaultWsUrl = isLocalhost ? 'ws://localhost:8000' : 'wss://gmeet-own-server.onrender.com';

const rawApiUrl = import.meta.env.VITE_API_URL || defaultApiUrl;
const rawWsUrl = import.meta.env.VITE_WS_URL || defaultWsUrl;

// Clean URLs by removing any trailing slash to prevent double-slash path issues (e.g., //api/meetings)
export const API_URL = rawApiUrl.endsWith('/') ? rawApiUrl.slice(0, -1) : rawApiUrl;
export const WS_URL = rawWsUrl.endsWith('/') ? rawWsUrl.slice(0, -1) : rawWsUrl;
export const UPLOADS_URL = API_URL;
