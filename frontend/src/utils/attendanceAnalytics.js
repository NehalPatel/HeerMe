import { toLocalYmd, normalizeAttendanceYmd, addCalendarDays, eachCalendarDay } from './calendarDates';

/** Mon–Sat working week; Sunday (0) excluded — matches typical college schedule with Saturday on. */
export function isCollegeWorkingDay(d) {
  const day = d.getDay();
  return day >= 1 && day <= 6;
}

/** Minimum required time on campus (11:30–6:10 or 9:30–4:10): 6h 40m */
export const REQUIRED_STAY_MS = 6 * 60 * 60 * 1000 + 40 * 60 * 1000;

/** Typical / anchor arrival for chart reference line (11:30 local). */
export const REGULAR_CHECK_IN_MINUTES = 11 * 60 + 30;

/** Typical departure for chart reference line (6:10 pm local). */
export const REGULAR_CHECK_OUT_MINUTES = 18 * 60 + 10;

/** Mon 2000-01-03 … Sat (six working days) — placeholder when custom analytics dates are invalid. */
export const ANALYTICS_INVALID_PLACEHOLDER = {
  from: new Date(2000, 0, 3, 12, 0, 0, 0),
  toExclusive: new Date(2000, 0, 9, 12, 0, 0, 0)
};

export function formatDurationHhMm(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '0m';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function formatTimeHm(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function minutesToTimeLabel(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const d = new Date(2000, 0, 1, h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * Mon–Sat days in range with college in+out (not leave); Sunday excluded — drives line/bar charts.
 * extraMs = time beyond REQUIRED_STAY_MS.
 */
export function buildAttendancePresenceSeries(attendanceList, rangeFrom, toExclusive) {
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

export function formatAnalyticsRangeLabel(fromDate, toExclusive) {
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

export function computeAttendanceAnalytics(attendanceList, rangeFrom, toExclusive) {
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
