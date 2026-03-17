import React, { useState, useEffect } from 'react';
import Modal from 'react-modal';

Modal.setAppElement('#root');

const PRIORITIES = ['low', 'medium', 'high'];
const CATEGORIES = ['Academic', 'Personal', 'Other'];

export default function ReminderModal({ isOpen, onClose, initialDate, onSave, reminderToEdit }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [priority, setPriority] = useState('medium');
  const [category, setCategory] = useState('Personal');

  useEffect(() => {
    if (reminderToEdit) {
      setTitle(reminderToEdit.title);
      setDescription(reminderToEdit.description || '');
      setDate(reminderToEdit.dateStr?.slice(0, 10) || formatDate(reminderToEdit.start || new Date()));
      setTime(reminderToEdit.time || formatTime(reminderToEdit.start) || '09:00');
      setPriority(reminderToEdit.priority || 'medium');
      setCategory(reminderToEdit.category || 'Personal');
    } else if (initialDate) {
      const d = typeof initialDate === 'string' ? new Date(initialDate) : initialDate;
      setDate(formatDate(d));
      setTime('09:00');
      setTitle('');
      setDescription('');
      setPriority('medium');
      setCategory('Personal');
    }
  }, [isOpen, initialDate, reminderToEdit]);

  function formatDate(d) {
    return d.toISOString().slice(0, 10);
  }

  function formatTime(d) {
    if (!d) return '09:00';
    const date = d instanceof Date ? d : new Date(d);
    const h = date.getHours();
    const m = date.getMinutes();
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    const dateTime = new Date(date + 'T' + time);
    onSave({
      title: title.trim(),
      description: description.trim(),
      date: dateTime.toISOString(),
      time,
      priority,
      category
    });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      className="bg-white shadow-xl rounded-xl w-full max-w-md mx-4 outline-none"
      overlayClassName="fixed inset-0 z-50"
    >
      <div className="p-6">
        <h2 className="text-xl font-semibold text-slate-800 mb-4">
          {reminderToEdit ? 'Edit reminder' : 'New reminder'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Reminder title"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
              rows={3}
              placeholder="Optional description"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 font-medium"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
