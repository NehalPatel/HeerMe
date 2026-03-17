import React, { useState, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import Modal from 'react-modal';
import ReminderModal from './ReminderModal';
import { getReminders, createReminder, closeReminder, deleteReminder } from '../services/api';

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
  const d = new Date(r.date);
  const [h, m] = (r.time || '00:00').split(':').map(Number);
  d.setHours(h, m, 0, 0);
  const category = r.category || 'Personal';
  const rawStatus = r.status || 'open';
  const statusMap = { pending: 'open', done: 'completed' };
  const status = statusMap[rawStatus] || rawStatus;
  return {
    id: r._id,
    title: r.title,
    start: d.toISOString(),
    backgroundColor: CATEGORY_COLORS[category] || CATEGORY_COLORS.Other,
    borderColor: CATEGORY_COLORS[category] || CATEGORY_COLORS.Other,
    extendedProps: {
      description: r.description,
      time: r.time,
      priority: r.priority || 'medium',
      category,
      status,
      comments: r.comments || '',
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

  const fetchReminders = async () => {
    setLoading(true);
    try {
      const data = await getReminders();
      setEvents(data.map(reminderToEvent));
    } catch (err) {
      console.error('Failed to fetch reminders', err);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchReminders();
  }, []);

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
      await fetchReminders();
      requestNotificationPermission();
    } catch (err) {
      console.error('Failed to create reminder', err);
    }
  };

  const handleDeleteReminder = async (id) => {
    try {
      await deleteReminder(id);
      setDetailModalOpen(false);
      setDetailEvent(null);
      await fetchReminders();
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
      events,
      height: isMobile ? 'auto' : 'auto',
      expandRows: true,
      stickyHeaderDates: true,
      handleWindowResize: true,
      dayMaxEventRows: isMobile ? 2 : true,
      titleFormat: isMobile ? { year: 'numeric', month: 'short' } : { year: 'numeric', month: 'long' },
      nowIndicator: true
    }),
    [events, isMobile]
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
                                setDetailEvent({ id: ev.id, title: ev.title, start: ev.start, extendedProps: ev.extendedProps });
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
            <FullCalendar {...calendarOptions} />
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
        className="bg-white shadow-xl rounded-xl w-full max-w-sm mx-4 outline-none"
        overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      >
        {detailEvent && (
          <DetailModal
            event={detailEvent}
            onClose={() => { setDetailModalOpen(false); setDetailEvent(null); }}
            onDelete={() => handleDeleteReminder(detailEvent.id)}
            onClosed={async () => {
              setDetailModalOpen(false);
              setDetailEvent(null);
              await fetchReminders();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function DetailModal({ event, onClose, onDelete, onClosed }) {
  const start = event.start;
  const dateStr = start ? new Date(start).toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }) : '';
  const timeStr = event.extendedProps?.time || (start ? new Date(start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
  const priority = event.extendedProps?.priority || 'medium';
  const category = event.extendedProps?.category || 'Personal';
  const status = event.extendedProps?.status || 'open';
  const comments = event.extendedProps?.comments || '';
  const priorityStyle = PRIORITY_COLORS[priority] || PRIORITY_COLORS.medium;
  const isClosed = status !== 'open';
  const [closeStatus, setCloseStatus] = React.useState('completed');
  const [closeComments, setCloseComments] = React.useState(comments || '');

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-1">{event.title}</h2>
      <p className="text-sm text-slate-500 mb-2">{dateStr} at {timeStr}</p>
      <div className="flex gap-2 mb-3">
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
          {category}
        </span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${priorityStyle.bg} ${priorityStyle.text}`}>
          {priority.charAt(0).toUpperCase() + priority.slice(1)} priority
        </span>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      </div>
      {event.extendedProps?.description && (
        <p className="text-slate-600 text-sm mb-4 whitespace-pre-wrap">{event.extendedProps.description}</p>
      )}
      {isClosed && comments && (
        <div className="mb-4">
          <p className="text-xs font-medium text-slate-500 mb-1">Comments</p>
          <p className="text-slate-700 text-sm whitespace-pre-wrap">{comments}</p>
        </div>
      )}
      {!isClosed && (
        <div className="mb-4 space-y-3">
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">Close reminder</p>
            <div className="grid grid-cols-2 gap-3">
              <select
                value={closeStatus}
                onChange={(e) => setCloseStatus(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white text-sm"
              >
                <option value="completed">Completed</option>
                <option value="invalid">Invalid</option>
                <option value="missed">Missed</option>
              </select>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await closeReminder(event.id, { status: closeStatus, comments: closeComments });
                    await onClosed?.();
                  } catch (e) {
                    console.error('Failed to close reminder', e);
                  }
                }}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 font-medium text-sm"
              >
                Save
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Comments</label>
            <textarea
              value={closeComments}
              onChange={(e) => setCloseComments(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none text-sm"
              rows={3}
              placeholder="Add closing comments (optional)"
            />
          </div>
        </div>
      )}
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
        >
          Close
        </button>
        <button
          onClick={onDelete}
          className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
