import { lectureDateTime, normalizeLectureTimes } from './lectureTimes';
import { normalizeAttendanceYmd } from './calendarDates';

export const CATEGORY_COLORS = {
  Academic: '#2563eb',
  Personal: '#0ea5e9',
  Other: '#8b5cf6'
};

export const COMPLETED_EVENT_COLORS = {
  backgroundColor: '#64748b',
  borderColor: '#475569',
  textColor: '#f8fafc'
};

export const INVALID_EVENT_COLORS = {
  backgroundColor: '#c2410c',
  borderColor: '#9a3412',
  textColor: '#fff7ed'
};

export const PRIORITY_COLORS = {
  low: { bg: 'bg-emerald-100', border: 'border-l-emerald-500', text: 'text-emerald-800' },
  medium: { bg: 'bg-amber-100', border: 'border-l-amber-500', text: 'text-amber-800' },
  high: { bg: 'bg-red-100', border: 'border-l-red-500', text: 'text-red-800' }
};

export function attendanceMarkerToEvents(row) {
  const ymd = normalizeAttendanceYmd(row?.calendarDate);
  if (!ymd || row.isLeave) return [];
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

/** Map a reminder document from GET /reminders/search to a calendar-style event for DetailModal. */
export function rawReminderDocumentToSearchEvent(doc) {
  if (!doc?._id) return null;
  const idStr = String(doc._id);
  let startAt = doc.startAt ? new Date(doc.startAt) : null;
  if (!startAt || Number.isNaN(startAt.getTime())) {
    const base = doc.date ? new Date(doc.date) : null;
    if (!base || Number.isNaN(base.getTime())) return null;
    const [h, m] = String(doc.time || '09:00').split(':').map((x) => Number(x));
    base.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0, 0);
    startAt = base;
  }
  let endAt = doc.endAt ? new Date(doc.endAt) : null;
  if (!endAt || Number.isNaN(endAt.getTime())) {
    endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
  }
  const hasRec = doc.recurrence && doc.recurrence.freq;
  const occId = hasRec ? `${idStr}@${startAt.toISOString()}` : idStr;
  return reminderToEvent({
    occurrenceId: occId,
    reminderId: idStr,
    _id: idStr,
    title: doc.title,
    description: doc.description || '',
    time: doc.time,
    priority: doc.priority,
    category: doc.category,
    status: doc.status,
    comments: doc.comments || '',
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    date: doc.date,
    recurrence: doc.recurrence || null,
    occurrenceOverrides: doc.occurrenceOverrides,
    timezone: doc.timezone
  });
}

export function lectureToEvent(lec) {
  const divs = (lec.divisions && lec.divisions.length ? lec.divisions : [lec.division]).filter(Boolean);
  const label = [lec.className, divs.join('+')].filter(Boolean).join('-');
  const times = normalizeLectureTimes(lec.startTime, lec.endTime);
  const start = lectureDateTime(lec.lectureDate, times.startTime);
  const end = lectureDateTime(lec.lectureDate, times.endTime);
  return {
    id: `lecture-${lec.id || lec._id}`,
    title: `${label}: ${lec.topic}`,
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: false,
    backgroundColor: '#4f46e5',
    borderColor: '#4338ca',
    textColor: '#eef2ff',
    extendedProps: {
      isLecture: true,
      lecture: lec
    }
  };
}

export function reminderToEvent(r) {
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
