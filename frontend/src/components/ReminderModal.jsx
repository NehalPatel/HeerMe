import React, { useState, useEffect } from 'react';
import Modal from 'react-modal';
import DatePicker from 'react-datepicker';
import Swal from 'sweetalert2';

Modal.setAppElement('#root');

const PRIORITIES = ['low', 'medium', 'high'];
const CATEGORIES = ['Academic', 'Personal', 'Other'];
const WEEKDAYS = [
  { key: 0, label: 'Sun' },
  { key: 1, label: 'Mon' },
  { key: 2, label: 'Tue' },
  { key: 3, label: 'Wed' },
  { key: 4, label: 'Thu' },
  { key: 5, label: 'Fri' },
  { key: 6, label: 'Sat' }
];

export default function ReminderModal({ isOpen, onClose, initialDate, onSave, reminderToEdit }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startAt, setStartAt] = useState(null);
  const [endAt, setEndAt] = useState(null);
  const [priority, setPriority] = useState('medium');
  const [category, setCategory] = useState('Personal');
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatFreq, setRepeatFreq] = useState('DAILY'); // DAILY | WEEKLY | YEARLY
  const [repeatWeekdays, setRepeatWeekdays] = useState([1]); // default Mon

  useEffect(() => {
    if (reminderToEdit) {
      setTitle(reminderToEdit.title);
      setDescription(reminderToEdit.description || '');
      const s =
        reminderToEdit.startAt ? new Date(reminderToEdit.startAt) :
        reminderToEdit.start ? new Date(reminderToEdit.start) :
        reminderToEdit.date ? new Date(reminderToEdit.date) :
        new Date();
      const e =
        reminderToEdit.endAt ? new Date(reminderToEdit.endAt) :
        (s ? new Date(s.getTime() + 60 * 60 * 1000) : new Date(Date.now() + 60 * 60 * 1000));
      setStartAt(s);
      setEndAt(e);
      setPriority(reminderToEdit.priority || 'medium');
      setCategory(reminderToEdit.category || 'Personal');

      const rec = reminderToEdit.recurrence || null;
      if (rec && rec.freq) {
        setRepeatEnabled(true);
        setRepeatFreq(String(rec.freq).toUpperCase());
        if (Array.isArray(rec.byWeekday) && rec.byWeekday.length) {
          setRepeatWeekdays(rec.byWeekday);
        } else if (s) {
          setRepeatWeekdays([s.getDay()]);
        }
      } else {
        setRepeatEnabled(false);
        setRepeatFreq('DAILY');
        setRepeatWeekdays(s ? [s.getDay()] : [1]);
      }
    } else if (initialDate) {
      const d = typeof initialDate === 'string' ? new Date(initialDate) : initialDate;
      const s = new Date(d);
      s.setHours(9, 0, 0, 0);
      setStartAt(s);
      setEndAt(new Date(s.getTime() + 60 * 60 * 1000));
      setTitle('');
      setDescription('');
      setPriority('medium');
      setCategory('Personal');
      setRepeatEnabled(false);
      setRepeatFreq('DAILY');
      setRepeatWeekdays([s.getDay()]);
    }
  }, [isOpen, initialDate, reminderToEdit]);

  function sameTime(a, b) {
    if (!a || !b) return false;
    return a.getTime() === b.getTime();
  }

  function ensureEndAfterStart(nextStart) {
    const defaultEnd = new Date(nextStart.getTime() + 60 * 60 * 1000);
    if (!endAt) return defaultEnd;
    const currentDefaultEnd = startAt ? new Date(startAt.getTime() + 60 * 60 * 1000) : null;
    if (currentDefaultEnd && sameTime(endAt, currentDefaultEnd)) return defaultEnd;
    if (endAt <= nextStart) return defaultEnd;
    return endAt;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (!(startAt instanceof Date) || Number.isNaN(startAt.getTime())) {
      await Swal.fire({
        icon: 'error',
        title: 'Invalid start',
        text: 'Please choose a valid start date and time.'
      });
      return;
    }
    const finalEndAt =
      endAt instanceof Date && !Number.isNaN(endAt.getTime())
        ? endAt
        : new Date(startAt.getTime() + 60 * 60 * 1000);
    if (finalEndAt <= startAt) {
      await Swal.fire({
        icon: 'error',
        title: 'Invalid time range',
        text: 'End date/time must be after start date/time.'
      });
      return;
    }

    let recurrence = null;
    if (repeatEnabled) {
      if (repeatFreq === 'DAILY') {
        recurrence = { freq: 'DAILY', interval: 1 };
      } else if (repeatFreq === 'WEEKLY') {
        const days = Array.isArray(repeatWeekdays) && repeatWeekdays.length ? repeatWeekdays : [startAt.getDay()];
        recurrence = { freq: 'WEEKLY', interval: 1, byWeekday: days };
      } else if (repeatFreq === 'YEARLY') {
        recurrence = { freq: 'YEARLY', interval: 1, byMonth: startAt.getMonth() + 1, byMonthDay: startAt.getDate() };
      }
    }

    onSave({
      title: title.trim(),
      description: description.trim(),
      startAt: startAt.toISOString(),
      endAt: finalEndAt.toISOString(),
      timezone: 'Asia/Kolkata',
      recurrence,
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

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Start (Reminder Date & Time)</label>
              <DatePicker
                selected={startAt}
                onChange={(d) => {
                  if (!d) return;
                  const nextStart = d instanceof Date ? d : new Date(d);
                  setStartAt(nextStart);
                  setEndAt(ensureEndAfterStart(nextStart));
                  if (repeatEnabled && repeatFreq === 'WEEKLY') {
                    setRepeatWeekdays((prev) => (Array.isArray(prev) && prev.length ? prev : [nextStart.getDay()]));
                  }
                }}
                showTimeSelect
                timeIntervals={15}
                dateFormat="yyyy-MM-dd h:mm aa"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholderText="Select start date & time"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Close (End Date & Time)</label>
              <DatePicker
                selected={endAt}
                onChange={(d) => {
                  if (!d) return;
                  const nextEnd = d instanceof Date ? d : new Date(d);
                  setEndAt(nextEnd);
                }}
                showTimeSelect
                timeIntervals={15}
                dateFormat="yyyy-MM-dd h:mm aa"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholderText="Select end date & time"
                minDate={startAt || undefined}
                required
              />
              {startAt && endAt && endAt <= startAt && (
                <p className="mt-1 text-xs text-red-600">End must be after start.</p>
              )}
              {startAt && endAt && endAt > startAt && (
                <p className="mt-1 text-xs text-slate-500">
                  Duration: {Math.round((endAt.getTime() - startAt.getTime()) / 60000)} minutes
                </p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-slate-700">Repeat</label>
              <button
                type="button"
                onClick={() => setRepeatEnabled((v) => !v)}
                className={`inline-flex items-center h-8 px-3 rounded-lg text-sm font-medium ${
                  repeatEnabled ? 'bg-primary-500 text-white' : 'bg-slate-100 text-slate-700'
                }`}
                aria-pressed={repeatEnabled}
              >
                {repeatEnabled ? 'On' : 'Off'}
              </button>
            </div>

            {repeatEnabled && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Frequency</label>
                  <select
                    value={repeatFreq}
                    onChange={(e) => setRepeatFreq(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
                  >
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="YEARLY">Yearly</option>
                  </select>
                </div>

                {repeatFreq === 'WEEKLY' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-2">Days of week</label>
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAYS.map((d) => {
                        const checked = repeatWeekdays.includes(d.key);
                        return (
                          <button
                            key={d.key}
                            type="button"
                            onClick={() => {
                              setRepeatWeekdays((prev) => {
                                const set = new Set(Array.isArray(prev) ? prev : []);
                                if (set.has(d.key)) set.delete(d.key);
                                else set.add(d.key);
                                const next = [...set].sort((a, b) => a - b);
                                return next.length ? next : (startAt ? [startAt.getDay()] : [1]);
                              });
                            }}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium border ${
                              checked ? 'bg-primary-500 text-white border-primary-500' : 'bg-white text-slate-700 border-slate-300'
                            }`}
                            aria-pressed={checked}
                          >
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {repeatFreq === 'YEARLY' && (
                  <p className="text-xs text-slate-500">
                    Yearly repeat will occur on the same month/day as the start date.
                  </p>
                )}
              </div>
            )}
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
