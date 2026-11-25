import axios from 'axios';

// Cross-origin deployments (Vercel frontend → Render backend) set
// VITE_API_BASE to e.g. https://poms-api.onrender.com/api ; single-origin
// deployments leave it unset and the same server serves both.
export const API_BASE = import.meta.env.VITE_API_BASE || '/api';
// Origin of the API server — used to build absolute URLs for locally-stored
// files (Supabase-stored files already carry absolute public URLs).
export const API_ORIGIN = API_BASE.startsWith('http')
  ? new URL(API_BASE).origin
  : '';

// Prefix app-relative file URLs (/uploads/...) with the API origin when the
// frontend runs on a different origin than the backend.
export const assetUrl = (url) => {
  if (!url) return url;
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  return `${API_ORIGIN}${url}`;
};

const api = axios.create({ baseURL: API_BASE });

// ─── Token integration & Automatic Token Refresh ────────────────────────────
let _getToken = null;
export function setTokenGetter(fn) { _getToken = fn; }

api.interceptors.request.use(async (cfg) => {
  if (_getToken) {
    try {
      const token = await _getToken();
      if (token) cfg.headers.Authorization = `Bearer ${token}`;
    } catch { /* ignore — will result in 401 from backend */ }
  }
  return cfg;
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const originalRequest = err.config;
    const isPublicPage = ['/login', '/landing', '/signup', '/privacy', '/terms', '/security']
      .some((p) => typeof window !== 'undefined' && window.location.pathname.startsWith(p));

    if (err.response?.status === 401 && originalRequest && !originalRequest._retry && !isPublicPage) {
      if (originalRequest.url?.includes('/auth/refresh') || originalRequest.url?.includes('/auth/login')) {
        return Promise.reject(err);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((e) => Promise.reject(e));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const currentToken = localStorage.getItem('poms_token');
        if (!currentToken) throw new Error('No token to refresh');

        const { data } = await axios.post(
          `${API_BASE}/auth/refresh`,
          {},
          { headers: { Authorization: `Bearer ${currentToken}` } }
        );

        const newToken = data.token;
        if (!newToken) throw new Error('Refresh response missing token');

        localStorage.setItem('poms_token', newToken);
        setTokenGetter(() => Promise.resolve(newToken));
        processQueue(null, newToken);

        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        try {
          localStorage.removeItem('poms_token');
          sessionStorage.setItem('poms_logout_reason', 'Your session has expired. Please sign in again.');
        } catch {}
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(err);
  }
);

export const errMessage = (e) => {
  if (!e) return 'Request failed';

  // Network errors (no response received)
  if (!e.response) {
    const target = API_ORIGIN || (typeof window !== 'undefined' ? window.location.origin : 'the backend server');
    if (e.code === 'ERR_NETWORK') {
      return `Backend server is not reachable at ${target}. Please ensure the backend service is running.`;
    }
    if (e.message?.includes('ECONNREFUSED') || e.message?.includes('Failed to fetch')) {
      return `Cannot connect to backend server at ${target}.`;
    }
    return `Network error: ${e.message || 'Unknown error'}`;
  }

  // Server errors
  if (e.response.status >= 500) {
    const customMsg = e.response.data?.error?.message;
    if (customMsg && customMsg !== 'An unexpected error occurred' && customMsg !== 'Internal server error') {
      return customMsg;
    }
    return 'An unexpected server error occurred. Please try again later.';
  }

  // Other errors with response
  return e.response.data?.error?.message || e.message || 'Request failed';
};

// Multipart upload helper — every file type accepted server-side (200 MB cap).
export const uploadFile = (path, files, field = 'files') => {
  const fd = new FormData();
  for (const f of Array.isArray(files) ? files : [files]) fd.append(field, f);
  return api.post(path, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
};

export const formatBytes = (n) => {
  if (!n && n !== 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
};

// Human icon for any mime type — used in attachment drawers.
export const fileKind = (mime = '', name = '') => {
  const m = mime.toLowerCase(), ext = (name.split('.').pop() || '').toLowerCase();
  if (m.startsWith('image/')) return { icon: 'image', label: 'Image' };
  if (m.startsWith('video/') || ['mp4', 'mkv', 'avi', 'mov', 'webm', 'wmv', 'flv', '3gp'].includes(ext)) return { icon: 'video', label: 'Video' };
  if (m === 'application/pdf' || ext === 'pdf') return { icon: 'file', label: 'PDF' };
  if (['xlsx', 'xls', 'csv', 'ods'].includes(ext) || m.includes('spreadsheet') || m.includes('excel') || m === 'text/csv') return { icon: 'reports', label: 'Spreadsheet' };
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext) || m.includes('word')) return { icon: 'file', label: 'Document' };
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) || m.includes('zip') || m.includes('compressed')) return { icon: 'file', label: 'Archive' };
  if (m.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return { icon: 'video', label: 'Audio' };
  return { icon: 'file', label: 'File' };
};

export default api;
// ── Import / Data Import API helpers (admin-only) ──────────────────────────
export const importUpload = (file) => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post('/import/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
};
export const importConfirm = (importId, mapping) =>
  api.post(`/import/${importId}/confirm`, { mapping });
export const importHistory = (params = {}) =>
  api.get('/import/history', { params });
export const importCancel = (importId) =>
  api.delete(`/import/${importId}`);
export const importRecords = (importId) =>
  api.get(`/import/${importId}/records`);
