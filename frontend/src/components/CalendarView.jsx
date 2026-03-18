import React, { useState, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import Modal from 'react-modal';
import ReminderModal from './ReminderModal';
import { getReminderOccurrences, createReminder, updateReminder, updateReminderOccurrence, deleteReminder } from '../services/api';
import Swal from 'sweetalert2';
import { REMINDER_STATUSES } from '../constants/reminderStatus';

const CATEGORY_COLORS = {
  Academic: '#2563eb',
  Personal: '#0ea5e9',
  Other: '#8b5cf6'
};

const PRIORITY_COLORS = {
  low: { bg: 'bg-emerald-100', border: 'border-l-emerald-500', text: 'text-emerald-800' },
  medium: { bg: 'bg-amber-100', border: 'border-l-amber-500', text: 'text-amber-800' },
  high: { bg: 'bg-red-100', border: 'border-l-red-500', text: 'text-red-800' }
};

function reminderToEvent(r) {
  const startAt = r.startAt ? new Date(r.startAt) : (r.start ? new Date(r.start) : new Date(r.date));
  const endAt = r.endAt ? new Date(r.endAt) : new Date(startAt.getTime() + 60 * 60 * 1000);
  const category = r.category || 'Personal';
  const rawStatus = r.status || 'open';
  const statusMap = { pending: 'open', done: 'completed', 'inprogress': 'in-progress', 'in_progress': 'in-progress' };
  const status = statusMap[rawStatus] || rawStatus;
  return {
    id: r.occurrenceId || r._id,
    title: r.title,
    start: startAt.toISOString(),
    end: endAt.toISOString(),
    backgroundColor: CATEGORY_COLORS[category] || CATEGORY_COLORS.Other,
    borderColor: CATEGORY_COLORS[category] || CATEGORY_COLORS.Other,
    extendedProps: {
      description: r.description,
      time: r.time,
      priority: r.priority || 'medium',
      category,
      status,
      comments: r.comments || '',
      reminderId: r.reminderId || r._id,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      recurrence: r.recurrence || null,
      _raw: r
    }
  };
}

export default function CalendarView() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [clickedDate, setClickedDate] = useState(null);
  const [detailEvent, setDetailEvent] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const notificationRef = React.useRef(null);
  const lastRangeKeyRef = React.useRef('');
  const [activeRange, setActiveRange] = useState(() => {
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { from, to };
  });

  React.useEffect(() => {
    function onResize() {
      setIsMobile(window.innerWidth < 640);
    }
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  React.useEffect(() => {
    function handleClickOutside(e) {
      if (notificationRef.current && !notificationRef.current.contains(e.target)) {
        setNotificationOpen(false);
      }
    }
    if (notificationOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [notificationOpen]);

  const fetchOccurrences = async (range) => {
    setLoading(true);
    try {
      const from = (range?.from || activeRange.from).toISOString().slice(0, 10);
      const to = (range?.to || activeRange.to).toISOString().slice(0, 10);
      const data = await getReminderOccurrences({ from, to });
      setEvents(data.map(reminderToEvent));
    } catch (err) {
      console.error('Failed to fetch reminders', err);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchOccurrences(activeRange);
  }, [activeRange.from, activeRange.to]);

  // Schedule browser notifications for upcoming reminders (when tab is open)
  React.useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const timeouts = [];
    const now = Date.now();
    events.forEach((ev) => {
      const start = ev.start ? new Date(ev.start).getTime() : 0;
      const delay = start - now;
      if (delay > 0 && delay < 24 * 60 * 60 * 1000) {
        timeouts.push(
          setTimeout(() => {
            new Notification('HeerMe Reminder', { body: ev.title });
          }, delay)
        );
      }
    });
    return () => timeouts.forEach(clearTimeout);
  }, [events]);

  const handleDateClick = (info) => {
    setClickedDate(info.dateStr);
    setDetailEvent(null);
    setModalOpen(true);
  };

  const handleEventClick = (info) => {
    info.jsEvent.preventDefault();
    setDetailEvent(info.event);
    setClickedDate(null);
    setDetailModalOpen(true);
  };

  const handleSaveReminder = async (payload) => {
    try {
      await createReminder(payload);
      await fetchOccurrences();
      requestNotificationPermission();
    } catch (err) {
      console.error('Failed to create reminder', err);
    }
  };

  const handleDeleteReminder = async (reminderId) => {
    try {
      await deleteReminder(reminderId);
      setDetailModalOpen(false);
      setDetailEvent(null);
      await fetchOccurrences();
    } catch (err) {
      console.error('Failed to delete reminder', err);
    }
  };

  function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  const upcomingReminders = useMemo(() => {
    const now = new Date();
    return events
      .filter((e) => e.start && new Date(e.start) > now && (e.extendedProps?.status || 'open') === 'open')
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, 10);
  }, [events]);

  const calendarOptions = useMemo(
    () => ({
      plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
      initialView: 'dayGridMonth',
      headerToolbar: {
        left: isMobile ? 'prev,next' : 'prev,next today',
        center: 'title',
        right: isMobile ? 'today' : 'dayGridMonth,timeGridWeek,timeGridDay'
      },
      buttonText: { today: 'Today', dayGridMonth: 'Month', timeGridWeek: 'Week', timeGridDay: 'Day' },
      editable: false,
      selectable: true,
      selectMirror: true,
      dayMaxEvents: true,
      weekends: true,
      dateClick: handleDateClick,
      eventClick: handleEventClick,
      height: isMobile ? 'auto' : 'auto',
      expandRows: true,
      stickyHeaderDates: true,
      handleWindowResize: true,
      dayMaxEventRows: isMobile ? 2 : true,
      titleFormat: isMobile ? { year: 'numeric', month: 'short' } : { year: 'numeric', month: 'long' },
      nowIndicator: true
      ,
      datesSet: (arg) => {
        const from = arg?.start ? new Date(arg.start) : null;
        const to = arg?.end ? new Date(arg.end) : null;
        if (from && to && !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
          const nextKey = `${from.getTime()}-${to.getTime()}`;
          if (lastRangeKeyRef.current !== nextKey) {
            lastRangeKeyRef.current = nextKey;
            setActiveRange({ from, to });
          }
        }
      }
    }),
    [isMobile]
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-primary-600 leading-none">HeerMe</h1>
          <div className="flex items-center justify-end flex-none">
            <div className="relative" ref={notificationRef}>
              <button
                type="button"
                onClick={() => setNotificationOpen((o) => !o)}
                className="relative p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-800 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                aria-label="Upcoming reminders"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {upcomingReminders.length > 0 && (
                  <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary-500 text-[10px] font-medium text-white">
                    {upcomingReminders.length > 9 ? '9+' : upcomingReminders.length}
                  </span>
                )}
              </button>
              {notificationOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 max-h-[min(24rem,70vh)] overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg z-50">
                  <div className="p-3 border-b border-slate-100">
                    <h3 className="font-semibold text-slate-800">Upcoming reminders</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {upcomingReminders.length === 0
                        ? 'No upcoming reminders'
                        : `${upcomingReminders.length} reminder${upcomingReminders.length === 1 ? '' : 's'}`}
                    </p>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {upcomingReminders.length === 0 ? (
                      <li className="p-4 text-sm text-slate-500 text-center">All caught up!</li>
                    ) : (
                      upcomingReminders.map((ev) => {
                        const priority = ev.extendedProps?.priority || 'medium';
                        const style = PRIORITY_COLORS[priority] || PRIORITY_COLORS.medium;
                        const start = ev.start ? new Date(ev.start) : null;
                        const dateStr = start ? start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
                        const timeStr = ev.extendedProps?.time || (start ? start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
                        return (
                          <li key={ev.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setNotificationOpen(false);
                                setDetailEvent({ id: ev.id, title: ev.title, start: ev.start, end: ev.end, extendedProps: ev.extendedProps });
                                setDetailModalOpen(true);
                              }}
                              className={`w-full text-left px-4 py-3 border-l-4 ${style.border} ${style.bg} hover:opacity-90 transition-opacity`}
                            >
                              <span className={`block font-medium text-sm ${style.text}`}>{ev.title}</span>
                              <span className="block text-xs text-slate-500 mt-0.5">{dateStr} at {timeStr}</span>
                              <div className="mt-1 flex flex-wrap gap-1">
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-white/70 text-[10px] text-slate-700">
                                  {(ev.extendedProps?.status || 'open').toUpperCase()}
                                </span>
                              </div>
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-500 border-t-transparent" />
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-6">
            <div className="heerme-calendar">
            <FullCalendar {...calendarOptions} events={events} />
            </div>
          </div>
        )}
      </main>

      {isMobile && (
        <button
          type="button"
          onClick={() => {
            setClickedDate(new Date().toISOString().slice(0, 10));
            setDetailEvent(null);
            setModalOpen(true);
          }}
          className="fixed bottom-5 right-5 z-40 rounded-full bg-primary-500 text-white shadow-lg hover:bg-primary-600 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 px-4 py-3 font-medium"
          aria-label="Add reminder"
        >
          + Add
        </button>
      )}

      <ReminderModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setClickedDate(null); }}
        initialDate={clickedDate}
        onSave={handleSaveReminder}
      />

      <Modal
        isOpen={detailModalOpen}
        onRequestClose={() => { setDetailModalOpen(false); setDetailEvent(null); }}
        className="bg-white shadow-xl rounded-xl w-full max-w-2xl mx-4 outline-none"
        overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      >
        {detailEvent && (
          <DetailModal
            event={detailEvent}
            onClose={() => { setDetailModalOpen(false); setDetailEvent(null); }}
            onDelete={() => handleDeleteReminder(detailEvent.extendedProps?.reminderId || detailEvent.id)}
            onClosed={async () => {
              setDetailModalOpen(false);
              setDetailEvent(null);
              await fetchOccurrences();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function DetailModal({ event, onClose, onDelete, onClosed }) {
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
    if (!d) return new Date().toISOString().slice(0, 10);
    const dt = d instanceof Date ? d : new Date(d);
    return dt.toISOString().slice(0, 10);
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
  // Only show read-only details if the reminder was already completed when opened.
  // If the user changes status to "completed" in the form, they should still be able to Save.
  const isReadOnly = initialStatus === 'completed';

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
              Completed
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
