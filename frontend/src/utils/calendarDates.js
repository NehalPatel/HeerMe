/** Local calendar YYYY-MM-DD helpers (FullCalendar uses local midnight). */

export function toLocalYmd(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Normalize API/store calendarDate to YYYY-MM-DD (handles ISO datetimes). */
export function normalizeAttendanceYmd(v) {
  if (v == null || v === '') return '';
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

export function addCalendarDays(d, days) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + days);
  return x;
}

export function eachCalendarDay(fromDate, toExclusive, fn) {
  let d = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const end = new Date(toExclusive.getFullYear(), toExclusive.getMonth(), toExclusive.getDate());
  while (d < end) {
    fn(new Date(d));
    d = addCalendarDays(d, 1);
  }
}

/** e.g. June 2026 → 2026-27 */
export function currentAcademicYear(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (m >= 6) return `${y}-${String(y + 1).slice(-2)}`;
  return `${y - 1}-${String(y).slice(-2)}`;
}
