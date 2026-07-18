import React, { useMemo } from 'react';
import {
  REGULAR_CHECK_IN_MINUTES,
  REGULAR_CHECK_OUT_MINUTES,
  formatDurationHhMm,
  formatTimeHm,
  minutesToTimeLabel,
  buildAttendancePresenceSeries,
  formatAnalyticsRangeLabel,
  computeAttendanceAnalytics
} from '../utils/attendanceAnalytics';

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

export default function AttendanceAnalyticsPanel({
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
