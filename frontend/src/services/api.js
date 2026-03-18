import axios from 'axios';

// In dev we prefer the Vite proxy (/api -> localhost:5000) even if VITE_API_URL is set,
// so local development doesn't accidentally hit a stale deployed backend.
const API_BASE = import.meta.env.DEV ? '/api' : (import.meta.env.VITE_API_URL || '/api');

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' }
});

export const getReminders = () => api.get('/reminders').then((res) => res.data);
export const getReminderOccurrences = ({ from, to, max } = {}) =>
  api.get('/reminders/occurrences', { params: { from, to, max } }).then((res) => res.data);
export const createReminder = (data) => api.post('/reminders', data).then((res) => res.data);
export const updateReminder = (id, data) => api.put(`/reminders/${id}`, data).then((res) => res.data);
export const closeReminder = (id, data) => api.put(`/reminders/${id}/close`, data).then((res) => res.data);
export const updateReminderOccurrence = (id, data) =>
  api.put(`/reminders/${id}/occurrence`, data).then((res) => res.data);
export const deleteReminder = (id) => api.delete(`/reminders/${id}`).then((res) => res.data);

export default api;
