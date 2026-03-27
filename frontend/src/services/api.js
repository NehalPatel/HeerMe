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

export default api;
