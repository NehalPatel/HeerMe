export const DEFAULT_LECTURE_START = '09:00';
export const DEFAULT_LECTURE_DURATION_MIN = 45;

export function isHm(s) {
  return typeof s === 'string' && /^\d{2}:\d{2}$/.test(s);
}

export function hmToMinutes(hm) {
  if (!isHm(hm)) return null;
  const [h, m] = hm.split(':').map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

export function minutesToHm(total) {
  const mins = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function addMinutesToHm(hm, minutes) {
  const base = hmToMinutes(hm);
  if (base == null) return null;
  return minutesToHm(base + minutes);
}

/**
 * Normalize lecture start/end. Default 09:00–09:45 (45 min) when missing.
 */
export function normalizeLectureTimes(startTime, endTime) {
  let start = isHm(startTime) ? startTime : DEFAULT_LECTURE_START;
  let end = isHm(endTime) ? endTime : addMinutesToHm(start, DEFAULT_LECTURE_DURATION_MIN);
  if (hmToMinutes(end) <= hmToMinutes(start)) {
    end = addMinutesToHm(start, DEFAULT_LECTURE_DURATION_MIN);
  }
  return { startTime: start, endTime: end };
}

export function formatLectureTimeRange(startTime, endTime) {
  const { startTime: s, endTime: e } = normalizeLectureTimes(startTime, endTime);
  return `${s} – ${e}`;
}
