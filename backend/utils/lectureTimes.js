export const DEFAULT_LECTURE_START = '09:00';
export const DEFAULT_LECTURE_DURATION_MIN = 55;

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
 * Normalize lecture start/end. Default 09:00–09:55 (55 min) when missing.
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

/** 24h HH:mm → 12h H:mm (no AM/PM), e.g. 09:00 → 9:00, 14:30 → 2:30 */
export function formatHm12NoAmPm(hm) {
  if (!isHm(hm)) return String(hm ?? '');
  const [h24, m] = hm.split(':').map(Number);
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')}`;
}

export function formatLectureTimeRange12(startTime, endTime) {
  const { startTime: s, endTime: e } = normalizeLectureTimes(startTime, endTime);
  return `${formatHm12NoAmPm(s)} – ${formatHm12NoAmPm(e)}`;
}

/** Format stored 24h time/range for DOCX export (12h, no AM/PM). */
export function formatTimeForExport(timeStr) {
  const raw = String(timeStr ?? '').trim();
  if (!raw) return '';
  const parts = raw.split(/\s*[–—-]\s*/);
  if (parts.length === 2 && isHm(parts[0].trim()) && isHm(parts[1].trim())) {
    return formatLectureTimeRange12(parts[0].trim(), parts[1].trim());
  }
  if (isHm(raw)) return formatHm12NoAmPm(raw);
  return raw;
}
