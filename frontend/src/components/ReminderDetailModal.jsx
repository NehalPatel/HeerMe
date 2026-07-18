import React from 'react';
import Swal from 'sweetalert2';
import { updateReminder, updateReminderOccurrence } from '../services/api';
import { REMINDER_STATUSES } from '../constants/reminderStatus';
import { PRIORITY_COLORS } from '../utils/calendarEvents';
import { toLocalYmd } from '../utils/calendarDates';

export default function ReminderDetailModal({ event, onClose, onDelete, onClosed }) {
  const start = event.extendedProps?.startAt || event.start;
  const end = event.extendedProps?.endAt || event.end;
  const initialPriority = event.extendedProps?.priority || 'medium';
  const initialCategory = event.extendedProps?.category || 'Personal';
  const initialStatus = event.extendedProps?.status || 'open';
  const initialComments = event.extendedProps?.comments || '';
  const initialDescription = event.extendedProps?.description || '';
  const initialTimeStr =
    event.extendedProps?.time ||
    (start ? new Date(start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '09:00');

  const toInputDate = (d) => {
    if (!d) return toLocalYmd(new Date());
    const dt = d instanceof Date ? d : new Date(d);
    return toLocalYmd(dt);
  };

  const normalizeTime = (t) => {
    if (!t) return '09:00';
    // Ensure HH:mm for <input type="time" />
    const parts = String(t).split(':');
    const h = String(parts[0] ?? '09').padStart(2, '0');
    const m = String(parts[1] ?? '00').padStart(2, '0');
    return `${h}:${m}`;
  };

  const [title, setTitle] = React.useState(event.title || '');
  const [description, setDescription] = React.useState(initialDescription);
  const initialStart = start ? new Date(start) : new Date();
  const initialEnd = end ? new Date(end) : new Date(initialStart.getTime() + 60 * 60 * 1000);
  const [date, setDate] = React.useState(toInputDate(initialStart));
  const [time, setTime] = React.useState(normalizeTime(initialTimeStr));
  const [endDate, setEndDate] = React.useState(toInputDate(initialEnd));
  const [endTime, setEndTime] = React.useState(
    normalizeTime(initialEnd ? `${String(initialEnd.getHours()).padStart(2, '0')}:${String(initialEnd.getMinutes()).padStart(2, '0')}` : '10:00')
  );
  const [category, setCategory] = React.useState(initialCategory);
  const [priority, setPriority] = React.useState(initialPriority);
  const [status, setStatus] = React.useState(initialStatus);
  const [comments, setComments] = React.useState(initialComments);
  const [isSaving, setIsSaving] = React.useState(false);

  const priorityStyle = PRIORITY_COLORS[priority] || PRIORITY_COLORS.medium;
  // Read-only when already terminal: completed or invalid. User changing to those in the form can still Save.
  const isReadOnly = initialStatus === 'completed' || initialStatus === 'invalid';
  const readOnlyStatusLabel =
    REMINDER_STATUSES.find((s) => s.value === initialStatus)?.label ?? String(initialStatus);

  return (
    <div className="p-6 max-h-[85vh] overflow-y-auto sm:max-h-none sm:overflow-visible">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">{isReadOnly ? 'Reminder details' : 'Edit task'}</h2>

      {isReadOnly ? (
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">Title</p>
            <p className="text-slate-800 font-medium">{title}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Date</p>
              <p className="text-slate-700 text-sm">{date}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Time</p>
              <p className="text-slate-700 text-sm">{time}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
              {category}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${priorityStyle.bg} ${priorityStyle.text}`}>
              {priority.charAt(0).toUpperCase() + priority.slice(1)} priority
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
              {readOnlyStatusLabel}
            </span>
          </div>

          {description && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Description</p>
              <p className="text-slate-700 text-sm whitespace-pre-wrap">{description}</p>
            </div>
          )}
          {comments && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Comments</p>
              <p className="text-slate-700 text-sm whitespace-pre-wrap">{comments}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
            >
              Close
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium"
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) return;

            try {
              setIsSaving(true);
              const startAt = new Date(`${date}T${time}`);
              const endAt = new Date(`${endDate}T${endTime}`);
              if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
                await Swal.fire({
                  icon: 'error',
                  title: 'Invalid time range',
                  text: 'Close date/time must be after start date/time.'
                });
                return;
              }

              const reminderId = event.extendedProps?.reminderId || event.id;
              const isRecurring = !!(event.extendedProps?._raw?.recurrence || event.extendedProps?.recurrence);
              const occurrenceStartAt = event.extendedProps?._raw?.startAt || event.extendedProps?.startAt || event.start;

              // If this is a recurring reminder occurrence, changing status/comments should only affect this occurrence.
              if (isRecurring && occurrenceStartAt) {
                await updateReminderOccurrence(reminderId, {
                  occurrenceStartAt,
                  status,
                  comments
                });
              } else {
                await updateReminder(reminderId, {
                  title: title.trim(),
                  description,
                  startAt: startAt.toISOString(),
                  endAt: endAt.toISOString(),
                  timezone: 'Asia/Kolkata',
                  // Preserve recurrence on edit unless we add full recurrence UI in this modal later.
                  recurrence: event.extendedProps?._raw?.recurrence ?? event.extendedProps?.recurrence ?? null,
                  category,
                  priority,
                  status,
                  comments
                });
              }
              await Swal.fire({
                icon: 'success',
                title: 'Saved',
                text: 'Reminder updated successfully.',
                timer: 1200,
                showConfirmButton: false
              });
              await onClosed?.();
            } catch (err) {
              console.error('Failed to update reminder', err);
              const msg =
                err?.response?.data?.error ||
                err?.message ||
                'Failed to save. Please try again.';
              await Swal.fire({
                icon: 'error',
                title: 'Save failed',
                text: msg
              });
            } finally {
              setIsSaving(false);
            }
          }}
          className="space-y-4"
        >
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="Task title"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none text-sm"
            rows={3}
            placeholder="Optional description"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Close Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Close Time</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white text-sm"
            >
              <option value="Academic">Academic</option>
              <option value="Personal">Personal</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white text-sm"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
          <div className="sm:col-span-1">
            <label className="block text-sm font-medium text-slate-600 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white text-sm"
            >
              {REMINDER_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <div className="mt-2 flex gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                {category}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${priorityStyle.bg} ${priorityStyle.text}`}>
                {priority.charAt(0).toUpperCase() + priority.slice(1)} priority
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                {REMINDER_STATUSES.find((s) => s.value === status)?.label || status}
              </span>
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-600 mb-1">Comments</label>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none text-sm"
              rows={3}
              placeholder="Optional comments"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className={`flex-1 px-4 py-2 rounded-lg font-medium ${
              isSaving ? 'bg-slate-400 text-white cursor-not-allowed' : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium"
          >
            Delete
          </button>
        </div>
        </form>
      )}
    </div>
  );
}
