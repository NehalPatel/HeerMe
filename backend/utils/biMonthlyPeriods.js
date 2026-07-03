/** @param {number} year @param {number} month 1-12 */
function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toYmd(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function monthLabel(year, month) {
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

/**
 * Bi-monthly periods for a calendar month: 1–15 and 16–end.
 * @param {number} year
 * @param {number} month 1-12
 */
export function getBiMonthlyPeriods(year, month) {
  const last = daysInMonth(year, month);
  const label = monthLabel(year, month);
  return [
    {
      id: 'first-half',
      label: `1–15 ${label}`,
      periodFrom: toYmd(year, month, 1),
      periodTo: toYmd(year, month, 15)
    },
    {
      id: 'second-half',
      label: `16–${last} ${label}`,
      periodFrom: toYmd(year, month, 16),
      periodTo: toYmd(year, month, last)
    }
  ];
}

export function isYmd(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function formatDisplayDate(ymd) {
  if (!isYmd(ymd)) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const day = String(d).padStart(2, '0');
  const mon = dt.toLocaleDateString('en-GB', { month: 'short' });
  return `${day}-${mon}-${y}`;
}

export function formatCompletedOn(ymd) {
  if (!isYmd(ymd)) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}
