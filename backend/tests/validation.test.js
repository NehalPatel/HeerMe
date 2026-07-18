import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isYmd, escapeRegex, isSixDigitPin, trimStr } from '../utils/validation.js';
import { buildDownloadFilename } from '../services/sessionPlanDocx.js';

describe('validation', () => {
  it('isYmd accepts YYYY-MM-DD only', () => {
    assert.equal(isYmd('2026-07-18'), true);
    assert.equal(isYmd('2026-7-18'), false);
    assert.equal(isYmd(''), false);
    assert.equal(isYmd(null), false);
  });

  it('escapeRegex escapes metacharacters', () => {
    assert.equal(escapeRegex('a.b*c?'), 'a\\.b\\*c\\?');
    assert.equal(escapeRegex('(x)'), '\\(x\\)');
  });

  it('isSixDigitPin', () => {
    assert.equal(isSixDigitPin('123456'), true);
    assert.equal(isSixDigitPin('12345'), false);
    assert.equal(isSixDigitPin('1234567'), false);
    assert.equal(isSixDigitPin('12a456'), false);
  });

  it('trimStr', () => {
    assert.equal(trimStr('  hi '), 'hi');
    assert.equal(trimStr(1), '');
  });
});

describe('buildDownloadFilename', () => {
  it('follows SDJIC session plan convention', () => {
    const name = buildDownloadFilename({
      academicYear: '2026-27',
      className: 'TYBCA',
      semester: '5',
      division: 'F',
      subject: 'Advance Web Designing',
      periodFrom: '2026-07-01',
      periodTo: '2026-07-15'
    });
    assert.equal(
      name,
      'SDJIC__SessionPlan__AY_2026-27__TYBCA__5__F__AdvanceWebDesigning__NehalPatel__01JUL_15JUL.docx'
    );
  });
});
