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
  getAttendance,
  exportDatabaseDownload
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

/** Normalize API/store calendarDate to YYYY-MM-DD (handles ISO datetimes). */
function normalizeAttendanceYmd(v) {
  if (v == null || v === '') return '';
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

function attendanceMarkerToEvents(row) {
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

function addCalendarDays(d, days) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + days);
  return x;
}

function eachCalendarDay(fromDate, toExclusive, fn) {
  let d = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const end = new Date(toExclusive.getFullYear(), toExclusive.getMonth(), toExclusive.getDate());
  while (d < end) {
    fn(new Date(d));
    d = addCalendarDays(d, 1);
  }
}

/** Mon–Sat working week; Sunday (0) excluded — matches typical college schedule with Saturday on. */
function isCollegeWorkingDay(d) {
  const day = d.getDay();
  return day >= 1 && day <= 6;
}

/** Minimum required time on campus (11:30–6:10 or 9:30–4:10): 6h 40m */
const REQUIRED_STAY_MS = 6 * 60 * 60 * 1000 + 40 * 60 * 1000;

/** Typical / anchor arrival for chart reference line (11:30 local). */
const REGULAR_CHECK_IN_MINUTES = 11 * 60 + 30;

/** Typical departure for chart reference line (6:10 pm local). */
const REGULAR_CHECK_OUT_MINUTES = 18 * 60 + 10;

/** Mon 2000-01-03 … Sat (six working days) — placeholder when custom analytics dates are invalid. */
const ANALYTICS_INVALID_PLACEHOLDER = {
  from: new Date(2000, 0, 3, 12, 0, 0, 0),
  toExclusive: new Date(2000, 0, 9, 12, 0, 0, 0)
};

function formatDurationHhMm(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '0m';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function formatTimeHm(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function minutesToTimeLabel(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const d = new Date(2000, 0, 1, h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * Mon–Sat days in range with college in+out (not leave); Sunday excluded — drives line/bar charts.
 * extraMs = time beyond REQUIRED_STAY_MS.
 */
function buildAttendancePresenceSeries(attendanceList, rangeFrom, toExclusive) {
  const byDate = {};
  for (const row of attendanceList) {
    const k = normalizeAttendanceYmd(row?.calendarDate);
    if (k) byDate[k] = row;
  }
  const points = [];
  let totalExtraMs = 0;
  eachCalendarDay(rangeFrom, toExclusive, (d) => {
    if (!isCollegeWorkingDay(d)) return;
    const ymd = toLocalYmd(d);
    const row = byDate[ymd];
    if (!row || row.isLeave) return;
    if (!row.checkInAt || !row.checkOutAt) return;
    const inD = new Date(row.checkInAt);
    const outD = new Date(row.checkOutAt);
    if (Number.isNaN(inD.getTime()) || Number.isNaN(outD.getTime()) || outD <= inD) return;
    const stayMs = outD.getTime() - inD.getTime();
    const extraMs = Math.max(0, stayMs - REQUIRED_STAY_MS);
    totalExtraMs += extraMs;
    points.push({
      ymd,
      sortKey: ymd,
      labelShort: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      weekdayShort: d.toLocaleDateString(undefined, { weekday: 'short' }),
      checkIn: inD,
      checkOut: outD,
      checkInMin: inD.getHours() * 60 + inD.getMinutes(),
      checkOutMin: outD.getHours() * 60 + outD.getMinutes(),
      stayMs,
      extraMs
    });
  });
  points.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return { points, totalExtraMs };
}

function formatAnalyticsRangeLabel(fromDate, toExclusive) {
  const endIncl = addCalendarDays(toExclusive, -1);
  if (
    fromDate.getFullYear() === endIncl.getFullYear() &&
    fromDate.getMonth() === endIncl.getMonth()
  ) {
    return fromDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  const a = fromDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const b = endIncl.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${a} – ${b}`;
}

function computeAttendanceAnalytics(attendanceList, rangeFrom, toExclusive) {
  const byDate = {};
  for (const row of attendanceList) {
    const k = normalizeAttendanceYmd(row?.calendarDate);
    if (k) byDate[k] = row;
  }
  let totalMs = 0;
  let presentWeekdays = 0;
  let weekdayCount = 0;
  let weekdayLeave = 0;
  eachCalendarDay(rangeFrom, toExclusive, (d) => {
    if (!isCollegeWorkingDay(d)) return;
    weekdayCount += 1;
    const ymd = toLocalYmd(d);
    const row = byDate[ymd];
    if (row?.isLeave) {
      weekdayLeave += 1;
      return;
    }
    if (row?.checkInAt && row?.checkOutAt) {
      const a = new Date(row.checkInAt).getTime();
      const b = new Date(row.checkOutAt).getTime();
      if (!Number.isNaN(a) && !Number.isNaN(b) && b > a) {
        totalMs += b - a;
        presentWeekdays += 1;
      }
    }
  });
  const expectedWeekdays = weekdayCount - weekdayLeave;
  const attendancePct =
    expectedWeekdays > 0 ? Math.round((presentWeekdays / expectedWeekdays) * 1000) / 10 : null;
  return {
    totalHours: Math.round((totalMs / 3600000) * 10) / 10,
    presentWeekdays,
    weekdayCount,
    weekdayLeave,
    expectedWeekdays,
    attendancePct
  };
}

function AttendanceTimingCharts({ points }) {
  if (!points.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-center text-sm text-slate-500">
        Log college in and out in this range to see check-in / check-out trends and extra time.
      </div>
    );
  }

  const vbW = 720;
  const vbH = 300;
  const pad = { l: 56, r: 16, t: 20, b: 56 };
  const iw = vbW - pad.l - pad.r;
  const ih = vbH - pad.t - pad.b;

  const allMins = points.flatMap((p) => [p.checkInMin, p.checkOutMin]);
  let yMin = Math.min(...allMins, REGULAR_CHECK_IN_MINUTES, REGULAR_CHECK_OUT_MINUTES) - 20;
  let yMax = Math.max(...allMins, REGULAR_CHECK_IN_MINUTES, REGULAR_CHECK_OUT_MINUTES) + 25;
  if (yMax <= yMin) yMax = yMin + 60;

  const ySpan = yMax - yMin;
  /** Earlier times (morning) at top; later times (evening) at bottom — matches clock reading downward. */
  const yScale = (m) => pad.t + ((m - yMin) / ySpan) * ih;
  const n = points.length;
  const xScale = (i) => (n <= 1 ? pad.l + iw / 2 : pad.l + (i / Math.max(n - 1, 1)) * iw);

  const pathIn = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(p.checkInMin)}`)
    .join(' ');
  const pathOut = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(p.checkOutMin)}`)
    .join(' ');

  const refInY = yScale(REGULAR_CHECK_IN_MINUTES);
  const refOutY = yScale(REGULAR_CHECK_OUT_MINUTES);
  const tickCount = 5;
  const yTicks = Array.from({ length: tickCount }, (_, t) => yMin + (t / (tickCount - 1)) * (yMax - yMin));

  const labelStep = Math.max(1, Math.ceil(n / 7));

  const maxExtra = Math.max(...points.map((p) => p.extraMs), 1);
  const barVbW = 720;
  const barVbH = 260;
  const bPad = { l: 56, r: 16, t: 14, b: 56 };
  const biw = barVbW - bPad.l - bPad.r;
  const bih = barVbH - bPad.t - bPad.b;
  const gap = n > 12 ? 2 : 4;
  const barSlot = biw / n;
  const barW = Math.max(4, Math.min(40, barSlot - gap));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Check-in &amp; check-out by day</h3>
        <p className="text-xs text-slate-500 mt-1">
          Solid line = college in, dashed gray = out. <strong className="text-amber-700">Amber</strong> dashed = typical in{' '}
          <strong>11:30</strong>; <strong className="text-indigo-700">indigo</strong> dashed = typical out{' '}
          <strong>6:10 pm</strong>. Morning at top, evening at bottom; early exam duty shifts the in line upward.
        </p>
        <div className="mt-3 w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${vbW} ${vbH}`}
            className="w-full min-w-[320px] h-[220px] sm:h-[280px]"
            role="img"
            aria-label="Line chart of check-in and check-out times by date"
          >
            <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + ih} className="stroke-slate-200" strokeWidth="1" />
            <line
              x1={pad.l}
              y1={pad.t + ih}
              x2={pad.l + iw}
              y2={pad.t + ih}
              className="stroke-slate-200"
              strokeWidth="1"
            />
            {yTicks.map((m) => (
              <g key={m}>
                <line
                  x1={pad.l}
                  y1={yScale(m)}
                  x2={pad.l + iw}
                  y2={yScale(m)}
                  className="stroke-slate-100"
                  strokeWidth="1"
                />
                <text x={pad.l - 8} y={yScale(m)} textAnchor="end" dominantBaseline="middle" className="fill-slate-400 text-[11px]">
                  {minutesToTimeLabel(Math.round(m))}
                </text>
              </g>
            ))}
            <line
              x1={pad.l}
              y1={refInY}
              x2={pad.l + iw}
              y2={refInY}
              className="stroke-amber-500"
              strokeWidth="1.5"
              strokeDasharray="6 4"
              opacity="0.9"
            />
            <text
              x={pad.l + iw}
              y={refInY - 6}
              textAnchor="end"
              className="fill-amber-700 text-[10px] font-medium"
            >
              11:30 typical in
            </text>
            <line
              x1={pad.l}
              y1={refOutY}
              x2={pad.l + iw}
              y2={refOutY}
              className="stroke-indigo-500"
              strokeWidth="1.5"
              strokeDasharray="6 4"
              opacity="0.9"
            />
            <text
              x={pad.l + iw}
              y={refOutY + 12}
              textAnchor="end"
              className="fill-indigo-700 text-[10px] font-medium"
            >
              6:10 pm typical out
            </text>
            <path d={pathIn} fill="none" className="stroke-primary-500" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            <path
              d={pathOut}
              fill="none"
              className="stroke-slate-500"
              strokeWidth="2"
              strokeDasharray="5 4"
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity="0.85"
            />
            {points.map((p, i) => (
              <g key={p.ymd}>
                <title>
                  {p.weekdayShort} {p.labelShort}: in {formatTimeHm(p.checkIn)}, out {formatTimeHm(p.checkOut)} — stayed{' '}
                  {formatDurationHhMm(p.stayMs)}
                  {p.extraMs > 0 ? `, extra ${formatDurationHhMm(p.extraMs)}` : ''}
                </title>
                <circle cx={xScale(i)} cy={yScale(p.checkInMin)} r="5" className="fill-primary-500 stroke-white" strokeWidth="2" />
                <circle
                  cx={xScale(i)}
                  cy={yScale(p.checkOutMin)}
                  r="4"
                  className="fill-slate-500 stroke-white opacity-90"
                  strokeWidth="2"
                />
              </g>
            ))}
            {points.map((p, i) =>
              i % labelStep === 0 || i === n - 1 ? (
                <text
                  key={`${p.ymd}-lx`}
                  x={xScale(i)}
                  y={vbH - 12}
                  textAnchor="middle"
                  className="fill-slate-500 text-[10px]"
                >
                  {p.labelShort}
                </text>
              ) : null
            )}
          </svg>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-primary-500 rounded" />
            College in
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 border-t-2 border-dotted border-slate-500" />
            College out
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 h-0 border-t-2 border-amber-500 border-dashed" />
            11:30 in
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 h-0 border-t-2 border-indigo-500 border-dashed" />
            6:10 pm out
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Extra time beyond required 6h 40m</h3>
        <p className="text-xs text-slate-500 mt-1">
          Required presence = <strong>6h 40m</strong> (e.g. 11:30–6:10 or 9:30–4:10). Bars show how much longer you stayed
          each Mon–Sat day; hover a bar or point for details.
        </p>
        <div className="mt-3 w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${barVbW} ${barVbH}`}
            className="w-full min-w-[320px] h-[200px] sm:h-[240px]"
            role="img"
            aria-label="Bar chart of extra minutes per Mon–Sat day"
          >
            <line
              x1={bPad.l}
              y1={bPad.t + bih}
              x2={bPad.l + biw}
              y2={bPad.t + bih}
              className="stroke-slate-200"
              strokeWidth="1"
            />
            <line x1={bPad.l} y1={bPad.t} x2={bPad.l} y2={bPad.t + bih} className="stroke-slate-200" strokeWidth="1" />
            <text x={bPad.l - 6} y={bPad.t + 8} textAnchor="end" className="fill-slate-400 text-[10px]">
              Extra
            </text>
            {points.map((p, i) => {
              const cx = bPad.l + i * barSlot + barSlot / 2;
              const h = p.extraMs > 0 ? (p.extraMs / maxExtra) * bih : 2;
              const y = bPad.t + bih - h;
              const fillClass = p.extraMs > 0 ? 'fill-emerald-500' : 'fill-slate-200';
              return (
                <g key={`bar-${p.ymd}`}>
                  <title>
                    {p.weekdayShort} {p.labelShort}: extra {formatDurationHhMm(p.extraMs)} (stayed {formatDurationHhMm(p.stayMs)} total)
                  </title>
                  <rect x={cx - barW / 2} y={y} width={barW} height={Math.max(h, 2)} rx="3" className={fillClass} opacity={p.extraMs > 0 ? 0.92 : 0.55} />
                </g>
              );
            })}
            {points.map((p, i) =>
              i % labelStep === 0 || i === n - 1 ? (
                <text
                  key={`${p.ymd}-bx`}
                  x={bPad.l + i * barSlot + barSlot / 2}
                  y={barVbH - 10}
                  textAnchor="middle"
                  className="fill-slate-500 text-[10px]"
                >
                  {p.labelShort}
                </text>
              ) : null
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}

function AttendanceAnalyticsPanel({
  rangeFrom,
  toExclusive,
  attendanceList,
  rangeLoading,
  useCalendarRange,
  onUseCalendarRangeChange,
  customFromYmd,
  customToInclusiveYmd,
  onCustomFromYmdChange,
  onCustomToInclusiveYmdChange,
  onApplyCurrentCalendarToCustom,
  customRangeInvalid
}) {
  const stats = useMemo(
    () => computeAttendanceAnalytics(attendanceList, rangeFrom, toExclusive),
    [attendanceList, rangeFrom, toExclusive]
  );
  const { points, totalExtraMs } = useMemo(
    () => buildAttendancePresenceSeries(attendanceList, rangeFrom, toExclusive),
    [attendanceList, rangeFrom, toExclusive]
  );
  const daysWithExtra = useMemo(() => points.reduce((acc, p) => acc + (p.extraMs > 0 ? 1 : 0), 0), [points]);
  const title = formatAnalyticsRangeLabel(rangeFrom, toExclusive);

  return (
    <div className="px-1 py-2 sm:px-2">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-slate-800">Attendance analytics</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            College in/out for{' '}
            <span className="font-medium text-slate-700">{customRangeInvalid ? '—' : title}</span>
            <span className="text-slate-400">
              {useCalendarRange ? ' (matches Calendar tab)' : ' (custom range)'}
            </span>
          </p>
        </div>
        {rangeLoading ? (
          <span className="inline-flex items-center gap-2 text-xs text-slate-500">
            <span
              className="h-3.5 w-3.5 rounded-full border-2 border-primary-500 border-t-transparent animate-spin shrink-0"
              aria-hidden
            />
            Updating…
          </span>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:p-4 mb-4">
        <p className="text-xs font-medium text-slate-600 mb-2">Date range for charts &amp; summaries</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 shrink-0">
            <input
              type="radio"
              name="analytics-range-mode"
              className="text-primary-600 focus:ring-primary-500"
              checked={useCalendarRange}
              onChange={() => onUseCalendarRangeChange(true)}
            />
            Match calendar view
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 shrink-0">
            <input
              type="radio"
              name="analytics-range-mode"
              className="text-primary-600 focus:ring-primary-500"
              checked={!useCalendarRange}
              onChange={() => onUseCalendarRangeChange(false)}
            />
            Custom range
          </label>
          {!useCalendarRange ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-slate-600">
                  <span className="block mb-0.5">From</span>
                  <input
                    type="date"
                    value={customFromYmd}
                    onChange={(e) => onCustomFromYmdChange(e.target.value)}
                    className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500"
                  />
                </label>
                <label className="text-xs text-slate-600">
                  <span className="block mb-0.5">To</span>
                  <input
                    type="date"
                    value={customToInclusiveYmd}
                    onChange={(e) => onCustomToInclusiveYmdChange(e.target.value)}
                    className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={onApplyCurrentCalendarToCustom}
                className="text-xs font-medium text-primary-600 hover:text-primary-700 px-2 py-1.5 rounded-lg border border-primary-200 bg-white hover:bg-primary-50"
              >
                Fill from calendar
              </button>
            </>
          ) : null}
        </div>
        {customRangeInvalid ? (
          <p className="text-xs text-amber-800 mt-2 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
            Choose a start and end date (start ≤ end). End date is <strong>inclusive</strong>.
          </p>
        ) : null}
      </div>

      <p className="text-xs text-slate-500 mb-4">
        <strong>Required presence</strong> is <strong>6h 40m</strong> per day (same span as 11:30–6:10 or 9:30–4:10).
        <strong> Extra time</strong> is anything beyond that on days with both in and out logged. Attendance % counts
        Mon–Sat: present = both times logged; leave days excluded from the expected count. Sunday is off.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total hours on campus</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
            {stats.totalHours.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            <span className="text-base font-normal text-slate-500 ml-1">h</span>
          </p>
          <p className="text-xs text-slate-500 mt-2">Sum of (out − in) for Mon–Sat days with both times.</p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
          <p className="text-xs font-medium text-emerald-800 uppercase tracking-wide">Extra beyond 6h 40m</p>
          <p className="text-2xl font-semibold text-emerald-900 mt-1 tabular-nums">
            {formatDurationHhMm(totalExtraMs)}
          </p>
          <p className="text-xs text-emerald-800/90 mt-2">
            {daysWithExtra > 0
              ? `${daysWithExtra} day${daysWithExtra === 1 ? '' : 's'} with extra time (${points.length} with full logs).`
              : points.length > 0
                ? 'No extra time in this range — within or under 6h 40m each logged day.'
                : 'Log in & out to compute extra time.'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Attendance</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
            {stats.attendancePct != null ? `${stats.attendancePct}%` : '—'}
          </p>
          <p className="text-xs text-slate-500 mt-2">
            {stats.presentWeekdays} present / {stats.expectedWeekdays} expected (Mon–Sat)
            {stats.weekdayLeave > 0 ? ` (${stats.weekdayLeave} leave)` : ''}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Mon–Sat days in range</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">{stats.weekdayCount}</p>
          <p className="text-xs text-slate-500 mt-2">
            {useCalendarRange
              ? 'Use the Calendar tab to change the grid range, or switch to Custom range above.'
              : 'Counts Mon–Sat in the From–To dates above (end date inclusive); Sunday excluded.'}
          </p>
        </div>
      </div>

      <div className="mt-8">
        <h3 className="text-sm font-semibold text-slate-800 mb-1">Timing &amp; extra hours</h3>
        <p className="text-xs text-slate-500 mb-4">
          Charts and summaries use <strong>Mon–Sat</strong> only (Saturday included). <strong>Sunday</strong> is treated as weekly off and omitted.
        </p>
        <AttendanceTimingCharts points={points} />
      </div>
    </div>
  );
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
        const [occData, attRows] = await Promise.all([
          getReminderOccurrences({ from, to }),
          getAttendance({ from, to })
        ]);
        if (cancelled || seq !== rangeSeqRef.current) return;
        setEvents(occData.map(reminderToEvent));
        setAttendanceList(Array.isArray(attRows) ? attRows : []);
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
                onClick={() => setMainTab('analytics')}
                className={`px-3 sm:px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                  mainTab === 'analytics'
                    ? 'border-primary-500 text-primary-700 bg-primary-50/60'
                    : 'border-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                Attendance analytics
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
