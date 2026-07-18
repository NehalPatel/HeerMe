import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { currentAcademicYear, toLocalYmd, normalizeAttendanceYmd } from '../src/utils/calendarDates.js';

describe('calendarDates', () => {
  it('toLocalYmd formats local date', () => {
    assert.equal(toLocalYmd(new Date(2026, 6, 18)), '2026-07-18');
  });

  it('normalizeAttendanceYmd strips time portion', () => {
    assert.equal(normalizeAttendanceYmd('2026-07-18T10:00:00.000Z'), '2026-07-18');
    assert.equal(normalizeAttendanceYmd('2026-07-18'), '2026-07-18');
  });

  it('currentAcademicYear switches in June', () => {
    assert.equal(currentAcademicYear(new Date(2026, 5, 1)), '2026-27');
    assert.equal(currentAcademicYear(new Date(2026, 4, 1)), '2025-26');
  });
});
