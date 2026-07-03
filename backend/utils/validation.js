export function isYmd(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function trimStr(v) {
  return typeof v === 'string' ? v.trim() : '';
}
