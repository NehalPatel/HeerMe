export function isYmd(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function trimStr(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/** Escape user text for safe use in MongoDB $regex / RegExp. */
export function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isSixDigitPin(s) {
  return typeof s === 'string' && /^\d{6}$/.test(s);
}
