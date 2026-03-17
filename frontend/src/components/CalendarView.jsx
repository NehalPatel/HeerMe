import React, { useState, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import Modal from 'react-modal';
import ReminderModal from './ReminderModal';
import { getReminders, createReminder, deleteReminder } from '../services/api';

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
      _raw: r
    }
  };
}

export default function CalendarView() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [clickedDate, setClickedDate] = useState(null);
  const [detailEvent, setDetailEvent] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const notificationRef = React.useRef(null);

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
      .filter((e) => e.start && new Date(e.start) > now)
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, 10);
  }, [events]);

  const calendarOptions = useMemo(
    () => ({
      plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
      initialView: 'dayGridMonth',
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay'
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
      height: 'auto',
      nowIndicator: true
    }),
    [events]
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-2xl font-bold text-primary-600">HeerMe</h1>
          <div className="flex items-center justify-end">
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
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
            <FullCalendar {...calendarOptions} />
          </div>
        )}
      </main>

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
          />
        )}
      </Modal>
    </div>
  );
}

function DetailModal({ event, onClose, onDelete }) {
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

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-1">{event.title}</h2>
      <p className="text-sm text-slate-500 mb-2">{dateStr} at {timeStr}</p>
      <div className="flex gap-2 mb-3">
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
          {category}
        </span>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
          {priority.charAt(0).toUpperCase() + priority.slice(1)} priority
        </span>
      </div>
      {event.extendedProps?.description && (
        <p className="text-slate-600 text-sm mb-4 whitespace-pre-wrap">{event.extendedProps.description}</p>
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
