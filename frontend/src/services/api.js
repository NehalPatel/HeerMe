import axios from 'axios';

// In dev we prefer the Vite proxy (/api -> localhost:5000) even if VITE_API_URL is set,
// so local development doesn't accidentally hit a stale deployed backend.
const API_BASE = import.meta.env.DEV ? '/api' : (import.meta.env.VITE_API_URL || '/api');

const TOKEN_KEY = 'heerme_token';

export function getStoredToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

let authErrorHandler = null;
export function setAuthErrorHandler(fn) {
  authErrorHandler = fn;
}

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use((config) => {
  const t = getStoredToken();
  if (t) {
    config.headers.Authorization = `Bearer ${t}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const url = err.config?.url || '';
    const isAuthRoute = typeof url === 'string' && (url.includes('/auth/login') || url.endsWith('/auth/login'));
    if (status === 401 && !isAuthRoute) {
      setStoredToken(null);
      authErrorHandler?.();
    }
    return Promise.reject(err);
  }
);

export const loginWithPin = (pin) =>
  api.post('/auth/login', { pin }).then((res) => {
    setStoredToken(res.data.token);
    return res.data;
  });

export const verifySession = () => api.get('/auth/session').then((res) => res.data);

export const getReminders = () => api.get('/reminders').then((res) => res.data);
/** @param {string} q @param {number} [limit] */
export const searchReminders = (q, limit = 30) =>
  api.get('/reminders/search', { params: { q, limit } }).then((res) => res.data);
export const getReminderOccurrences = ({ from, to, max } = {}) =>
  api.get('/reminders/occurrences', { params: { from, to, max } }).then((res) => res.data);
export const createReminder = (data) => api.post('/reminders', data).then((res) => res.data);
export const updateReminder = (id, data) => api.put(`/reminders/${id}`, data).then((res) => res.data);
export const closeReminder = (id, data) => api.put(`/reminders/${id}/close`, data).then((res) => res.data);
export const updateReminderOccurrence = (id, data) =>
  api.put(`/reminders/${id}/occurrence`, data).then((res) => res.data);
export const deleteReminder = (id) => api.delete(`/reminders/${id}`).then((res) => res.data);

export const getAttendance = ({ from, to } = {}) =>
  api.get('/attendance', { params: { from, to } }).then((res) => res.data);
export const putAttendance = (body) => api.put('/attendance', body).then((res) => res.data);
export const deleteAttendance = (calendarDate) =>
  api.delete(`/attendance/${encodeURIComponent(calendarDate)}`).then((res) => res.data);

function filenameFromContentDisposition(cd) {
  if (!cd || typeof cd !== 'string') return null;
  const m =
    /filename\*=UTF-8''([^;\n]+)|filename="([^"]+)"|filename=([^;\s]+)/i.exec(cd);
  const raw = m ? m[1] || m[2] || m[3] : null;
  if (!raw) return null;
  try {
    return decodeURIComponent(String(raw).replace(/"/g, ''));
  } catch {
    return String(raw).replace(/"/g, '');
  }
}

/** Download all reminders + attendance as JSON (authenticated). */
export async function exportDatabaseDownload() {
  try {
    const res = await api.get('/export', { responseType: 'blob' });
    const blob = res.data;
    if (!(blob instanceof Blob)) {
      throw new Error('Invalid export response');
    }
    const cd = res.headers['content-disposition'];
    const name = filenameFromContentDisposition(cd) || 'heerme-export.json';
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    const data = err?.response?.data;
    if (data instanceof Blob) {
      const text = await data.text();
      let msg = text;
      try {
        const j = JSON.parse(text);
        if (j?.error) msg = j.error;
      } catch {
        /* not JSON */
      }
      throw new Error(msg || 'Export failed');
    }
    throw err;
  }
}

export default api;
