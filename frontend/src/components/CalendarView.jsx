import React, { useState, useMemo, lazy, Suspense } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import Modal from 'react-modal';
import ReminderModal from './ReminderModal';
import DayChoiceModal from './DayChoiceModal';
import AttendanceModal from './AttendanceModal';
import AcademicLectureModal from './AcademicLectureModal';
import AttendanceAnalyticsPanel from './AttendanceAnalyticsPanel';
import ReminderDetailModal from './ReminderDetailModal';
import { normalizeLectureTimes } from '../utils/lectureTimes';
import { extractLectureFieldOptions, saveLastLectureFields } from '../utils/lectureFieldOptions';
import {
  toLocalYmd,
  normalizeAttendanceYmd,
  addCalendarDays,
  currentAcademicYear
} from '../utils/calendarDates';
import {
  ANALYTICS_INVALID_PLACEHOLDER
} from '../utils/attendanceAnalytics';
import {
  attendanceMarkerToEvents,
  lectureToEvent,
  reminderToEvent,
  rawReminderDocumentToSearchEvent,
  PRIORITY_COLORS
} from '../utils/calendarEvents';
import {
  getReminderOccurrences,
  createReminder,
  deleteReminder,
  getAttendance,
  exportDatabaseDownload,
  searchReminders,
  createAcademicLecture,
  updateAcademicLecture,
  getAcademicLectures,
  apiErrorMessage
} from '../services/api';
import Swal from 'sweetalert2';

const SessionPlansPanel = lazy(() => import('./SessionPlansPanel'));
const LecturesPanel = lazy(() => import('./LecturesPanel'));


export default function CalendarView({ onSignOut }) {
  const [events, setEvents] = useState([]);
  const [lectures, setLectures] = useState([]);
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
  const [lectureModalOpen, setLectureModalOpen] = useState(false);
  const [lectureToEdit, setLectureToEdit] = useState(null);
  const [lectureSuggestions, setLectureSuggestions] = useState(null);
  /** Bump to refetch Lectures tab table after create/update. */
  const [lecturesRefreshKey, setLecturesRefreshKey] = useState(0);
  const [attendanceModalOpen, setAttendanceModalOpen] = useState(false);
  /** YYYY-MM-DD for attendance modal only — avoids clearing when day-choice closes. */
  const [attendanceCalendarDate, setAttendanceCalendarDate] = useState(null);
  const [selectedDayStr, setSelectedDayStr] = useState(null);
  const [attendanceList, setAttendanceList] = useState([]);
  const [fcViewType, setFcViewType] = useState('dayGridMonth');
  const [mainTab, setMainTab] = useState('calendar');
  /** Full-page spinner only on first load; refetches must not unmount FullCalendar or Week/Day reset to Month. */
  const isInitialCalendarLoadRef = React.useRef(true);
  const rangeSeqRef = React.useRef(0);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = React.useRef(null);
  const [activeRange, setActiveRange] = useState(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { from, to };
  });

  const [analyticsUseCalendarRange, setAnalyticsUseCalendarRange] = useState(true);
  const [analyticsFromYmd, setAnalyticsFromYmd] = useState('');
  const [analyticsToInclusiveYmd, setAnalyticsToInclusiveYmd] = useState('');
  const [analyticsCustomList, setAnalyticsCustomList] = useState([]);
  const [analyticsCustomLoading, setAnalyticsCustomLoading] = useState(false);

  const analyticsCustomKey = useMemo(() => {
    if (analyticsUseCalendarRange) return '';
    const f = analyticsFromYmd;
    const t = analyticsToInclusiveYmd;
    if (!f || !t || !/^\d{4}-\d{2}-\d{2}$/.test(f) || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return '';
    if (f > t) return '';
    return `${f}|${t}`;
  }, [analyticsUseCalendarRange, analyticsFromYmd, analyticsToInclusiveYmd]);

  const analyticsEffectiveRange = useMemo(() => {
    if (analyticsUseCalendarRange) return { from: activeRange.from, toExclusive: activeRange.to };
    if (!analyticsCustomKey) return null;
    const [fromStr, toIncStr] = analyticsCustomKey.split('|');
    const fromD = new Date(`${fromStr}T12:00:00`);
    const toIncD = new Date(`${toIncStr}T12:00:00`);
    return { from: fromD, toExclusive: addCalendarDays(toIncD, 1) };
  }, [analyticsUseCalendarRange, analyticsCustomKey, activeRange.from, activeRange.to]);

  const analyticsCustomRangeInvalid = !analyticsUseCalendarRange && !analyticsCustomKey;

  React.useEffect(() => {
    if (analyticsUseCalendarRange) {
      setAnalyticsCustomList([]);
      setAnalyticsCustomLoading(false);
      return;
    }
    if (!analyticsCustomKey) {
      setAnalyticsCustomList([]);
      setAnalyticsCustomLoading(false);
      return;
    }
    const [fromStr, toIncStr] = analyticsCustomKey.split('|');
    const toExclusiveYmd = toLocalYmd(addCalendarDays(new Date(`${toIncStr}T12:00:00`), 1));
    let cancelled = false;
    setAnalyticsCustomLoading(true);
    (async () => {
      try {
        const rows = await getAttendance({ from: fromStr, to: toExclusiveYmd });
        if (!cancelled) setAnalyticsCustomList(Array.isArray(rows) ? rows : []);
      } catch (err) {
        console.error('Failed to load attendance for analytics range', err);
        if (!cancelled) setAnalyticsCustomList([]);
      } finally {
        if (!cancelled) setAnalyticsCustomLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [analyticsUseCalendarRange, analyticsCustomKey]);

  const analyticsRangeResolved = useMemo(() => {
    if (analyticsEffectiveRange) return analyticsEffectiveRange;
    if (analyticsCustomRangeInvalid) return ANALYTICS_INVALID_PLACEHOLDER;
    return activeRange;
  }, [analyticsEffectiveRange, analyticsCustomRangeInvalid, activeRange]);

  const analyticsPanelList = analyticsUseCalendarRange ? attendanceList : analyticsCustomList;
  const analyticsPanelListForStats = analyticsCustomRangeInvalid ? [] : analyticsPanelList;
  const analyticsPanelLoading = analyticsUseCalendarRange ? rangeLoading : analyticsCustomLoading;

  const handleAnalyticsUseCalendarRangeChange = React.useCallback(
    (useCal) => {
      setAnalyticsUseCalendarRange(useCal);
      if (!useCal) {
        setAnalyticsFromYmd((prevFrom) => {
          const seedFrom = toLocalYmd(activeRange.from);
          return prevFrom || seedFrom;
        });
        setAnalyticsToInclusiveYmd((prevTo) => {
          const seedTo = toLocalYmd(addCalendarDays(activeRange.to, -1));
          return prevTo || seedTo;
        });
      }
    },
    [activeRange.from, activeRange.to]
  );

  const handleApplyCurrentCalendarToCustom = React.useCallback(() => {
    setAnalyticsUseCalendarRange(false);
    setAnalyticsFromYmd(toLocalYmd(activeRange.from));
    setAnalyticsToInclusiveYmd(toLocalYmd(addCalendarDays(activeRange.to, -1)));
  }, [activeRange.from, activeRange.to]);

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

  React.useEffect(() => {
    function handleClickOutside(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false);
      }
    }
    if (searchOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [searchOpen]);

  React.useEffect(() => {
    if (!searchOpen) return;
    function onKey(e) {
      if (e.key === 'Escape') setSearchOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  React.useEffect(() => {
    if (!searchOpen) return;
    const q = searchQuery.trim();
    if (q.length < 1) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const data = await searchReminders(q, 40);
        if (!cancelled) setSearchResults(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Search failed', err);
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [searchQuery, searchOpen]);

  const fetchOccurrences = React.useCallback(async () => {
    const from = toLocalYmd(activeRange.from);
    const to = toLocalYmd(activeRange.to);
    if (!from || !to || from >= to) {
      console.warn('Invalid occurrence range', { from, to });
      setEvents([]);
      return;
    }
    try {
      const data = await getReminderOccurrences({ from, to });
      setEvents(data.map(reminderToEvent));
    } catch (err) {
      console.error('Failed to fetch reminders', err);
      setEvents([]);
    }
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
    if (!analyticsUseCalendarRange && analyticsCustomKey) {
      const [cf, toIncStr] = analyticsCustomKey.split('|');
      const toExclusiveYmd = toLocalYmd(addCalendarDays(new Date(`${toIncStr}T12:00:00`), 1));
      try {
        const rowsCustom = await getAttendance({ from: cf, to: toExclusiveYmd });
        setAnalyticsCustomList(Array.isArray(rowsCustom) ? rowsCustom : []);
      } catch (err) {
        console.error('Failed to refresh analytics attendance', err);
      }
    }
  }, [activeRange.from, activeRange.to, analyticsUseCalendarRange, analyticsCustomKey]);

  React.useEffect(() => {
    const seq = ++rangeSeqRef.current;
    const from = toLocalYmd(activeRange.from);
    const to = toLocalYmd(activeRange.to);
    if (!from || !to || from >= to) return;

    const showFullPage = isInitialCalendarLoadRef.current;
    if (showFullPage) setLoading(true);
    else setRangeLoading(true);

    let cancelled = false;
    (async () => {
      try {
        const [occData, attRows, lecRows] = await Promise.all([
          getReminderOccurrences({ from, to }),
          getAttendance({ from, to }),
          getAcademicLectures({ from, to })
        ]);
        if (cancelled || seq !== rangeSeqRef.current) return;
        setEvents(occData.map(reminderToEvent));
        setAttendanceList(Array.isArray(attRows) ? attRows : []);
        setLectures(Array.isArray(lecRows) ? lecRows : []);
      } catch (err) {
        if (cancelled || seq !== rangeSeqRef.current) return;
        console.error('Failed to load calendar data', err);
        setEvents([]);
        setAttendanceList([]);
      } finally {
        if (cancelled || seq !== rangeSeqRef.current) return;
        if (showFullPage) {
          setLoading(false);
          isInitialCalendarLoadRef.current = false;
        } else {
          setRangeLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeRange.from, activeRange.to]);

  const attendanceByDate = useMemo(() => {
    const m = {};
    for (const row of attendanceList) {
      const key = normalizeAttendanceYmd(row?.calendarDate);
      if (key) m[key] = row;
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

  const lectureEvents = useMemo(() => lectures.map(lectureToEvent), [lectures]);
  const calendarEvents = useMemo(
    () => [...events, ...lectureEvents, ...attendanceTimeMarkers],
    [events, lectureEvents, attendanceTimeMarkers]
  );

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
    if (info.event.extendedProps?.isLecture) {
      const lec = info.event.extendedProps.lecture;
      const divs = (lec?.divisions?.length ? lec.divisions : [lec?.division]).filter(Boolean);
      const times = normalizeLectureTimes(lec?.startTime, lec?.endTime);
      const lines = [
        `Status: ${
          lec?.status === 'cancelled'
            ? 'Cancelled'
            : lec?.status === 'planned'
              ? 'Planned'
              : 'Conducted'
        }`,
        `Class: ${lec?.className || ''}`,
        `Division(s): ${divs.join(', ') || '—'}`,
        `Subject: ${lec?.subject || ''}`,
        `Date: ${lec?.lectureDate || ''}`,
        `Time: ${times.startTime} – ${times.endTime}`
      ];
      if (lec?.unitNoAndName) lines.push(`Unit: ${lec.unitNoAndName}`);
      if (lec?.deliveryMethod) lines.push(`Method: ${lec.deliveryMethod}`);
      if (lec?.numberOfStudents != null) lines.push(`Students: ${lec.numberOfStudents}`);
      if (lec?.roomNo) lines.push(`Room: ${lec.roomNo}`);
      if (lec?.remarks) lines.push(`Remarks: ${lec.remarks}`);
      Swal.fire({
        icon: 'info',
        title: lec?.topic || 'Lecture',
        // Use text (not html) so user-controlled lecture fields cannot inject XSS.
        text: lines.join('\n'),
        showCancelButton: true,
        confirmButtonText: 'Edit lecture',
        cancelButtonText: 'Close'
      }).then((result) => {
        if (result.isConfirmed && lec) {
          setLectureToEdit(lec);
          setLectureModalOpen(true);
        }
      });
      return;
    }
    if (info.event.extendedProps?.isAttendanceMarker) {
      const raw =
        info.event.extendedProps?.calendarDate || toLocalYmd(info.event.start);
      const ymd = normalizeAttendanceYmd(raw) || raw;
      if (ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
        setAttendanceCalendarDate(ymd);
        setAttendanceModalOpen(true);
      }
      return;
    }
    setDetailEvent(info.event);
    setClickedDate(null);
    setDetailModalOpen(true);
  };

  const lectureModalInitialValues = useMemo(
    () => ({
      academicYear: currentAcademicYear(),
      lectureDate: selectedDayStr || ''
    }),
    [selectedDayStr]
  );

  React.useEffect(() => {
    if (!lectureModalOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await getAcademicLectures();
        if (!cancelled) setLectureSuggestions(extractLectureFieldOptions(rows));
      } catch {
        if (!cancelled) setLectureSuggestions(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lectureModalOpen]);

  const refreshLecturesInView = async () => {
    const from = toLocalYmd(activeRange.from);
    const to = toLocalYmd(activeRange.to);
    if (from && to && from < to) {
      const lecRows = await getAcademicLectures({ from, to });
      setLectures(Array.isArray(lecRows) ? lecRows : []);
    }
  };

  const handleSaveLecture = async (form, editingLecture = null) => {
    const payload = {
      academicYear: form.academicYear,
      className: form.className,
      divisions: form.divisions,
      subject: form.subject,
      semester: form.semester,
      lectureDate: form.lectureDate || selectedDayStr,
      startTime: form.startTime,
      endTime: form.endTime,
      unitNoAndName: form.unitNoAndName,
      topic: form.topic,
      reference: form.reference,
      deliveryMethod: form.deliveryMethod,
      numberOfStudents: form.numberOfStudents,
      roomNo: form.roomNo,
      remarks: form.remarks,
      status:
        form.status === 'cancelled'
          ? 'cancelled'
          : form.status === 'planned'
            ? 'planned'
            : 'conducted'
    };
    const lectureId = editingLecture?.id || editingLecture?._id;
    const isEdit = Boolean(lectureId);

    try {
      if (isEdit) {
        await updateAcademicLecture(lectureId, payload);
      } else {
        await createAcademicLecture(payload);
        saveLastLectureFields(form);
      }
      await refreshLecturesInView();
      setLecturesRefreshKey((k) => k + 1);
      setLectureToEdit(null);
      await Swal.fire({
        icon: 'success',
        title: isEdit ? 'Lecture updated' : 'Lecture added',
        text: isEdit
          ? 'Changes are saved on the calendar and in session plans.'
          : 'This lecture will appear in session plan generation.',
        timer: 1600,
        showConfirmButton: false
      });
    } catch (err) {
      await Swal.fire({
        icon: 'error',
        title: 'Could not save',
        text:
          err?.response?.data?.error ||
          err?.message ||
          (isEdit ? 'Failed to update lecture.' : 'Failed to add lecture.')
      });
      throw err;
    }
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
            <button
              type="button"
              disabled={exportLoading}
              onClick={async () => {
                try {
                  setExportLoading(true);
                  await exportDatabaseDownload();
                } catch (err) {
                  const msg =
                    err?.response?.data?.error ||
                    err?.message ||
                    'Could not export data. Try again.';
                  await Swal.fire({ icon: 'error', title: 'Export failed', text: String(msg) });
                } finally {
                  setExportLoading(false);
                }
              }}
              className="px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
            >
              {exportLoading ? 'Exporting…' : 'Export data'}
            </button>
            {typeof onSignOut === 'function' ? (
              <button
                type="button"
                onClick={onSignOut}
                className="px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                Sign out
              </button>
            ) : null}
            <div className="relative" ref={searchRef}>
              <button
                type="button"
                onClick={() => setSearchOpen((o) => !o)}
                className={`relative p-2 rounded-lg focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                  searchOpen ? 'bg-slate-100 text-slate-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                }`}
                aria-label="Search reminders"
                aria-expanded={searchOpen}
                aria-controls="heerme-reminder-search-panel"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
              {searchOpen && (
                <div
                  id="heerme-reminder-search-panel"
                  className="absolute right-0 top-full mt-2 w-[min(calc(100vw-2rem),24rem)] max-h-[min(28rem,75vh)] flex flex-col rounded-xl border border-slate-200 bg-white shadow-lg z-50 overflow-hidden"
                >
                  <div className="p-3 border-b border-slate-100">
                    <label className="sr-only" htmlFor="heerme-global-search-input">
                      Search reminders
                    </label>
                    <input
                      id="heerme-global-search-input"
                      type="search"
                      autoComplete="off"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Title, description, notes, category…"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      autoFocus
                    />
                    <p className="text-[11px] text-slate-500 mt-1.5">
                      Matches <strong>title</strong>, <strong>description</strong>, <strong>comments</strong> (task and recurring
                      occurrence notes), <strong>category</strong>, and <strong>priority</strong>. Select a result to edit.
                    </p>
                  </div>
                  <div className="overflow-y-auto flex-1 min-h-0">
                    {searchLoading ? (
                      <div className="flex items-center justify-center py-8 text-sm text-slate-500">
                        <span className="h-5 w-5 rounded-full border-2 border-primary-500 border-t-transparent animate-spin mr-2" />
                        Searching…
                      </div>
                    ) : searchQuery.trim().length < 1 ? (
                      <p className="p-4 text-sm text-slate-500 text-center">Type to search</p>
                    ) : searchResults.length === 0 ? (
                      <p className="p-4 text-sm text-slate-500 text-center">No reminders match</p>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {searchResults.map((doc) => {
                          const ev = rawReminderDocumentToSearchEvent(doc);
                          if (!ev) return null;
                          const priority = ev.extendedProps?.priority || 'medium';
                          const style = PRIORITY_COLORS[priority] || PRIORITY_COLORS.medium;
                          const start = ev.start ? new Date(ev.start) : null;
                          const dateStr = start
                            ? start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
                            : '';
                          const timeStr =
                            ev.extendedProps?.time ||
                            (start ? start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
                          const key = String(doc._id);
                          return (
                            <li key={key}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSearchOpen(false);
                                  setDetailEvent({
                                    id: ev.id,
                                    title: ev.title,
                                    start: ev.start,
                                    end: ev.end,
                                    extendedProps: ev.extendedProps
                                  });
                                  setDetailModalOpen(true);
                                }}
                                className={`w-full text-left px-4 py-3 border-l-4 ${style.border} ${style.bg} hover:opacity-90 transition-opacity`}
                              >
                                <span className={`block font-medium text-sm ${style.text}`}>{ev.title}</span>
                                <span className="block text-xs text-slate-500 mt-0.5">
                                  {dateStr}
                                  {timeStr ? ` · ${timeStr}` : ''}
                                  {doc.recurrence?.freq ? (
                                    <span className="ml-1 text-[10px] uppercase text-slate-400">Recurring</span>
                                  ) : null}
                                </span>
                                <span className="inline-flex mt-1 text-[10px] text-slate-600">{ev.extendedProps?.category}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
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
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="heerme-calendar-skeleton-shimmer h-3 w-full opacity-90" aria-hidden />
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-500 border-t-transparent mb-4" />
              <div className="w-full max-w-md space-y-3">
                <div className="h-3 rounded bg-slate-200 animate-pulse w-3/4 mx-auto" />
                <div className="h-3 rounded bg-slate-200 animate-pulse w-full" />
                <div className="h-3 rounded bg-slate-200 animate-pulse w-5/6 mx-auto" />
              </div>
              <p className="text-sm text-slate-500 mt-5">Loading calendar…</p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-6">
            <div className="flex flex-wrap gap-1 border-b border-slate-200 -mx-3 sm:-mx-6 px-3 sm:px-6 mb-4 sm:mb-5 pb-0">
              <button
                type="button"
                onClick={() => setMainTab('calendar')}
                className={`px-3 sm:px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                  mainTab === 'calendar'
                    ? 'border-primary-500 text-primary-700 bg-primary-50/60'
                    : 'border-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                Calendar
              </button>
              <button
                type="button"
                onClick={() => setMainTab('lectures')}
                className={`px-3 sm:px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                  mainTab === 'lectures'
                    ? 'border-primary-500 text-primary-700 bg-primary-50/60'
                    : 'border-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                Lectures
              </button>
              <button
                type="button"
                onClick={() => setMainTab('analytics')}
                className={`px-3 sm:px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                  mainTab === 'analytics'
                    ? 'border-primary-500 text-primary-700 bg-primary-50/60'
                    : 'border-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                Attendance analytics
              </button>
              <button
                type="button"
                onClick={() => setMainTab('sessionPlans')}
                className={`px-3 sm:px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                  mainTab === 'sessionPlans'
                    ? 'border-primary-500 text-primary-700 bg-primary-50/60'
                    : 'border-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                Session plans
              </button>
            </div>

            <div className={mainTab === 'calendar' ? 'block' : 'hidden'} aria-hidden={mainTab !== 'calendar'}>
              <div className="relative rounded-lg min-h-[18rem]">
                {rangeLoading ? (
                  <div
                    className="absolute inset-0 z-20 rounded-lg overflow-hidden flex flex-col items-center justify-start pt-14 sm:pt-20 bg-white/80 backdrop-blur-[1px]"
                    aria-busy="true"
                    aria-label="Loading calendar data"
                  >
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="heerme-calendar-skeleton-shimmer absolute inset-x-0 top-0 h-2.5 opacity-95" />
                      <div className="absolute inset-0 flex flex-col gap-3 p-4 pt-12 opacity-[0.35]">
                        <div className="h-4 rounded-md bg-slate-200 animate-pulse w-2/3" />
                        <div className="grid grid-cols-7 gap-2 flex-1 min-h-[8rem]">
                          {Array.from({ length: 14 }).map((_, i) => (
                            <div key={i} className="rounded-md bg-slate-100 animate-pulse" />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="relative flex flex-col items-center gap-3 mt-2">
                      <div className="h-9 w-9 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
                      <p className="text-sm text-slate-600">Loading this range…</p>
                    </div>
                  </div>
                ) : null}
                <div className={`heerme-calendar transition-opacity duration-200 ${rangeLoading ? 'opacity-60' : 'opacity-100'}`}>
                  <FullCalendar {...calendarOptions} events={calendarEvents} />
                </div>
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

            {mainTab === 'lectures' ? (
              <Suspense
                fallback={
                  <div className="flex items-center justify-center py-16 text-slate-500 text-sm">
                    Loading lectures…
                  </div>
                }
              >
                <LecturesPanel
                  refreshKey={lecturesRefreshKey}
                  onEditLecture={(lec) => {
                    setLectureToEdit(lec);
                    setLectureModalOpen(true);
                  }}
                />
              </Suspense>
            ) : null}

            {mainTab === 'analytics' ? (
              <AttendanceAnalyticsPanel
                rangeFrom={analyticsRangeResolved.from}
                toExclusive={analyticsRangeResolved.toExclusive}
                attendanceList={analyticsPanelListForStats}
                rangeLoading={analyticsPanelLoading}
                useCalendarRange={analyticsUseCalendarRange}
                onUseCalendarRangeChange={handleAnalyticsUseCalendarRangeChange}
                customFromYmd={analyticsFromYmd}
                customToInclusiveYmd={analyticsToInclusiveYmd}
                onCustomFromYmdChange={setAnalyticsFromYmd}
                onCustomToInclusiveYmdChange={setAnalyticsToInclusiveYmd}
                onApplyCurrentCalendarToCustom={handleApplyCurrentCalendarToCustom}
                customRangeInvalid={analyticsCustomRangeInvalid}
              />
            ) : null}

            {mainTab === 'sessionPlans' ? (
              <Suspense
                fallback={
                  <div className="flex items-center justify-center py-16 text-slate-500 text-sm">
                    Loading session plans…
                  </div>
                }
              >
                <SessionPlansPanel />
              </Suspense>
            ) : null}
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
        onAddLecture={() => {
          setLectureToEdit(null);
          setDayChoiceOpen(false);
          setLectureModalOpen(true);
        }}
        onCollegeAttendance={() => {
          if (selectedDayStr) setAttendanceCalendarDate(selectedDayStr);
          setDayChoiceOpen(false);
          setAttendanceModalOpen(true);
        }}
      />

      <AttendanceModal
        isOpen={attendanceModalOpen}
        onClose={() => {
          setAttendanceModalOpen(false);
          setAttendanceCalendarDate(null);
          setSelectedDayStr(null);
        }}
        calendarDate={attendanceCalendarDate || ''}
        initialRecord={
          attendanceCalendarDate ? attendanceByDate[attendanceCalendarDate] : null
        }
        onSaved={refreshAttendance}
      />

      <AcademicLectureModal
        isOpen={lectureModalOpen}
        onClose={() => {
          setLectureModalOpen(false);
          setLectureToEdit(null);
          setSelectedDayStr(null);
        }}
        onSave={handleSaveLecture}
        suggestions={lectureSuggestions}
        initialValues={lectureModalInitialValues}
        lectureToEdit={lectureToEdit}
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
          <ReminderDetailModal
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
