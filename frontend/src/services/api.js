import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' }
});

export const getReminders = () => api.get('/reminders').then((res) => res.data);
export const createReminder = (data) => api.post('/reminders', data).then((res) => res.data);
export const deleteReminder = (id) => api.delete(`/reminders/${id}`).then((res) => res.data);

export default api;
