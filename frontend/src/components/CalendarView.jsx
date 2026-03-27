import React, { useState, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import Modal from 'react-modal';
import ReminderModal from './ReminderModal';
import DayChoiceModal from './DayChoiceModal';
import AttendanceModal from './AttendanceModal';
import {
  getReminderOccurrences,
  createReminder,
  updateReminder,
  updateReminderOccurrence,
  deleteReminder,
  getAttendance
} from '../services/api';
import Swal from 'sweetalert2';
import { REMINDER_STATUSES } from '../constants/reminderStatus';

const CATEGORY_COLORS = {
  Academic: '#2563eb',
  Personal: '#0ea5e9',
  Other: '#8b5cf6'
};

/** Calendar events for completed tasks — distinct from category colors */
const COMPLETED_EVENT_COLORS = {
  backgroundColor: '#64748b',
  borderColor: '#475569',
  textColor: '#f8fafc'
};

/** Invalid status — warning / needs attention */
const INVALID_EVENT_COLORS = {
  backgroundColor: '#c2410c',
  borderColor: '#9a3412',
  textColor: '#fff7ed'
};

const PRIORITY_COLORS = {
  low: { bg: 'bg-emerald-100', border: 'border-l-emerald-500', text: 'text-emerald-800' },
  medium: { bg: 'bg-amber-100', border: 'border-l-amber-500', text: 'text-amber-800' },
  high: { bg: 'bg-red-100', border: 'border-l-red-500', text: 'text-red-800' }
};

/** Local calendar date YYYY-MM-DD (FullCalendar ranges use local midnight; do not use UTC date from toISOString). */
function toLocalYmd(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function attendanceMarkerToEvents(row) {
  if (!row?.calendarDate || row.isLeave) return [];
  const ymd = row.calendarDate;
  const out = [];
  const add = (iso, kind) => {
    if (!iso) return;
    const t = new Date(iso);
    if (Number.isNaN(t.getTime())) return;
    const end = new Date(t.getTime() + 60 * 1000);
    out.push({
      id: `att-${kind}-${ymd}`,
      title: kind === 'in' ? 'College in' : 'College out',
      start: t.toISOString(),
      end: end.toISOString(),
      backgroundColor: kind === 'in' ? '#047857' : '#1d4ed8',
      borderColor: kind === 'in' ? '#065f46' : '#1e40af',
      textColor: '#fff',
      classNames: ['heerme-att-time-marker', `heerme-att-time-marker-${kind}`],
      editable: false,
      extendedProps: {
        isAttendanceMarker: true,
        calendarDate: ymd,
        markerKind: kind
      }
    });
  };
  add(row.checkInAt, 'in');
  add(row.checkOutAt, 'out');
  return out;
}

function reminderToEvent(r) {
  const startAt = r.startAt ? new Date(r.startAt) : (r.start ? new Date(r.start) : new Date(r.date));
  const endAt = r.endAt ? new Date(r.endAt) : new Date(startAt.getTime() + 60 * 60 * 1000);
  const category = r.category || 'Personal';
  const rawStatus = r.status || 'open';
  const statusMap = { pending: 'open', done: 'completed', 'inprogress': 'in-progress', 'in_progress': 'in-progress' };
  const status = statusMap[rawStatus] || rawStatus;
  const isCompleted = status === 'completed';
  const isInvalid = status === 'invalid';
  const barColor = isCompleted
    ? COMPLETED_EVENT_COLORS
    : isInvalid
      ? INVALID_EVENT_COLORS
      : {
          backgroundColor: CATEGORY_COLORS[category] || CATEGORY_COLORS.Other,
          borderColor: CATEGORY_COLORS[category] || CATEGORY_COLORS.Other
        };
  return {
    id: r.occurrenceId || r._id,
    title: r.title,
    start: startAt.toISOString(),
    end: endAt.toISOString(),
    backgroundColor: barColor.backgroundColor,
    borderColor: barColor.borderColor,
    ...(isCompleted ? { textColor: COMPLETED_EVENT_COLORS.textColor } : {}),
    ...(isInvalid ? { textColor: INVALID_EVENT_COLORS.textColor } : {}),
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

export default function CalendarView({ onSignOut }) {
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
  const [dayChoiceOpen, setDayChoiceOpen] = useState(false);
  const [attendanceModalOpen, setAttendanceModalOpen] = useState(false);
  const [selectedDayStr, setSelectedDayStr] = useState(null);
  const [attendanceList, setAttendanceList] = useState([]);
  const [fcViewType, setFcViewType] = useState('dayGridMonth');
  /** Full-page spinner only on first load; refetches must not unmount FullCalendar or Week/Day reset to Month. */
  const isInitialCalendarLoadRef = React.useRef(true);
  const [activeRange, setActiveRange] = useState(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
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
    const showFullPageLoader = isInitialCalendarLoadRef.current;
    if (showFullPageLoader) setLoading(true);
    try {
      const from = toLocalYmd(range?.from || activeRange.from);
      const to = toLocalYmd(range?.to || activeRange.to);
      if (!from || !to || from >= to) {
        console.warn('Invalid occurrence range', { from, to });
        setEvents([]);
        return;
      }
      const data = await getReminderOccurrences({ from, to });
      setEvents(data.map(reminderToEvent));
    } catch (err) {
      console.error('Failed to fetch reminders', err);
      setEvents([]);
    } finally {
      if (showFullPageLoader) setLoading(false);
      isInitialCalendarLoadRef.current = false;
    }
  };

  React.useEffect(() => {
    fetchOccurrences(activeRange);
  }, [activeRange.from, activeRange.to]);

  const refreshAttendance = React.useCallback(async () => {
    const from = toLocalYmd(activeRange.from);
    const to = toLocalYmd(activeRange.to);
    if (!from || !to || from >= to) return;
    try {
      const rows = await getAttendance({ from, to });
      setAttendanceList(Array.isArray(rows) ? rows : []);
    } catch (err) {
      console.error('Failed to load attendance', err);
    }
  }, [activeRange.from, activeRange.to]);

  React.useEffect(() => {
    refreshAttendance();
  }, [refreshAttendance]);

  const attendanceByDate = useMemo(() => {
    const m = {};
    for (const row of attendanceList) {
      if (row?.calendarDate) m[row.calendarDate] = row;
    }
    return m;
  }, [attendanceList]);

  const leaveNotesInRange = useMemo(
    () =>
      attendanceList
        .filter((r) => r?.isLeave && String(r.notes || '').trim())
        .map((r) => ({ calendarDate: r.calendarDate, notes: String(r.notes).trim() }))
        .sort((a, b) => a.calendarDate.localeCompare(b.calendarDate)),
    [attendanceList]
  );

  const attendanceTimeMarkers = useMemo(() => {
    if (fcViewType !== 'timeGridWeek' && fcViewType !== 'timeGridDay') return [];
    const markers = [];
    for (const row of attendanceList) {
      markers.push(...attendanceMarkerToEvents(row));
    }
    return markers;
  }, [attendanceList, fcViewType]);

  const calendarEvents = useMemo(() => [...events, ...attendanceTimeMarkers], [events, attendanceTimeMarkers]);

  React.useEffect(() => {
    if (loading) return;
    let cancelled = false;
    const paintNotes = () => {
      if (cancelled) return;
      const root = document.querySelector('.heerme-calendar');
      if (!root) return;

      root.querySelectorAll('.fc-daygrid-day[data-date]').forEach((el) => {
        const ymd = el.getAttribute('data-date');
        if (!ymd) return;
        const row = attendanceByDate[ymd];
        const frame = el.querySelector('.fc-daygrid-day-frame');
        if (!frame) return;
        frame.querySelector('.heerme-leave-note')?.remove();
        const note = row?.isLeave && String(row.notes || '').trim() ? String(row.notes).trim() : '';
        if (note) {
          const div = document.createElement('div');
          div.className = 'heerme-leave-note';
          div.textContent = note;
          div.title = note;
          frame.appendChild(div);
        }
      });

      root.querySelectorAll('th.fc-col-header-cell[data-date], .fc-col-header-cell[data-date]').forEach((cell) => {
        const ymd = cell.getAttribute('data-date');
        if (!ymd) return;
        const row = attendanceByDate[ymd];
        cell.querySelector('.heerme-header-leave-note')?.remove();
        const note = row?.isLeave && String(row.notes || '').trim() ? String(row.notes).trim() : '';
        if (note && (fcViewType === 'timeGridWeek' || fcViewType === 'timeGridDay')) {
          const div = document.createElement('div');
          div.className = 'heerme-header-leave-note';
          div.textContent = note;
          div.title = note;
          cell.appendChild(div);
        }
      });
    };
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(paintNotes);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [loading, attendanceByDate, attendanceList, activeRange.from, activeRange.to, fcViewType]);

  // Schedule browser notifications for upcoming reminders (when tab is open)
  React.useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const timeouts = [];
    const now = Date.now();
    events.forEach((ev) => {
      if (ev.extendedProps?.isAttendanceMarker) return;
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
    setSelectedDayStr(info.dateStr);
    setDayChoiceOpen(true);
  };

  const handleEventClick = (info) => {
    info.jsEvent.preventDefault();
    if (info.event.extendedProps?.isAttendanceMarker) return;
    setDetailEvent(info.event);
    setClickedDate(null);
    setDetailModalOpen(true);
  };

  const handleSaveReminder = async (payload) => {
    try {
      await createReminder(payload);
      await fetchOccurrences();
      requestNotificationPermission();
      await Swal.fire({
        icon: 'success',
        title: 'Created',
        text: 'Reminder added successfully.',
        timer: 1200,
        showConfirmButton: false
      });
    } catch (err) {
      console.error('Failed to create reminder', err);
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        'Failed to create reminder. Please try again.';
      await Swal.fire({
        icon: 'error',
        title: 'Could not create',
        text: msg
      });
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
      .filter((e) => !e.extendedProps?.isAttendanceMarker)
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
      dayCellClassNames: (arg) => {
        const ymd = toLocalYmd(arg.date);
        const row = attendanceByDate[ymd];
        if (row?.isLeave) return ['fc-day-heerme-leave'];
        if (row && (row.checkInAt || row.checkOutAt)) return ['fc-day-heerme-college'];
        return [];
      },
      height: isMobile ? 'auto' : 'auto',
      expandRows: true,
      stickyHeaderDates: true,
      handleWindowResize: true,
      dayMaxEventRows: isMobile ? 2 : true,
      titleFormat: isMobile ? { year: 'numeric', month: 'short' } : { year: 'numeric', month: 'long' },
      nowIndicator: true
      ,
      datesSet: (arg) => {
        if (arg.view?.type) setFcViewType(arg.view.type);
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
    [isMobile, attendanceByDate]
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-primary-600 leading-none">HeerMe</h1>
          <div className="flex items-center justify-end flex-none gap-1">
            {typeof onSignOut === 'function' ? (
              <button
                type="button"
                onClick={onSignOut}
                className="px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                Sign out
              </button>
            ) : null}
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
            <FullCalendar {...calendarOptions} events={calendarEvents} />
            </div>
            {leaveNotesInRange.length > 0 && (
              <div className="mt-3 rounded-lg border border-rose-100 bg-rose-50/60 px-3 py-2 text-xs text-slate-700">
                <p className="font-medium text-rose-900 mb-1.5">Leave notes (this view)</p>
                <ul className="space-y-1 list-disc list-inside text-slate-600">
                  {leaveNotesInRange.map(({ calendarDate, notes }) => (
                    <li key={calendarDate}>
                      <span className="font-medium text-slate-800">
                        {new Date(`${calendarDate}T12:00:00`).toLocaleDateString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </span>
                      {' — '}
                      {notes}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-slate-500 mt-3 flex flex-wrap gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-rose-100 border border-rose-200 shrink-0" aria-hidden />
                Leave
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-200 shrink-0" aria-hidden />
                College in / out logged
              </span>
              <span className="text-slate-400">
                Week/Day view: green block = college in, blue = out. Click a date for reminders or attendance (any day).
              </span>
            </p>
          </div>
        )}
      </main>

      {isMobile && (
        <button
          type="button"
          onClick={() => {
            setSelectedDayStr(toLocalYmd(new Date()));
            setDayChoiceOpen(true);
          }}
          className="fixed bottom-5 right-5 z-40 rounded-full bg-primary-500 text-white shadow-lg hover:bg-primary-600 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 px-4 py-3 font-medium"
          aria-label="Add reminder"
        >
          + Add
        </button>
      )}

      <DayChoiceModal
        isOpen={dayChoiceOpen}
        onClose={() => { setDayChoiceOpen(false); setSelectedDayStr(null); }}
        dateLabel={
          selectedDayStr
            ? new Date(`${selectedDayStr}T12:00:00`).toLocaleDateString(undefined, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })
            : ''
        }
        onAddReminder={() => {
          if (!selectedDayStr) return;
          setClickedDate(selectedDayStr);
          setDetailEvent(null);
          setDayChoiceOpen(false);
          setModalOpen(true);
        }}
        onCollegeAttendance={() => {
          setDayChoiceOpen(false);
          setAttendanceModalOpen(true);
        }}
      />

      <AttendanceModal
        isOpen={attendanceModalOpen}
        onClose={() => {
          setAttendanceModalOpen(false);
          setSelectedDayStr(null);
        }}
        calendarDate={selectedDayStr || ''}
        initialRecord={selectedDayStr ? attendanceByDate[selectedDayStr] : null}
        onSaved={refreshAttendance}
      />

      <ReminderModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setClickedDate(null); setSelectedDayStr(null); }}
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
