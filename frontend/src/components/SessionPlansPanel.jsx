import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Swal from 'sweetalert2';
import SessionPlanTable from './SessionPlanTable';
import {
  generateSessionPlansBulk,
  updateSessionPlan,
  downloadSessionPlan,
  getAcademicLectures,
  listSessionPlans
} from '../services/api';
import { extractLectureFieldOptions } from '../utils/lectureFieldOptions';

function currentAcademicYear() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (m >= 6) return `${y}-${String(y + 1).slice(-2)}`;
  return `${y - 1}-${String(y).slice(-2)}`;
}

function toYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export default function SessionPlansPanel() {
  const now = new Date();
  const [academicYear, setAcademicYear] = useState(currentAcademicYear());
  const [className, setClassName] = useState('');
  const [periodFrom, setPeriodFrom] = useState(toYmd(new Date(now.getFullYear(), now.getMonth(), 16)));
  const [periodTo, setPeriodTo] = useState(toYmd(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
  const [facultyName, setFacultyName] = useState('');
  const [semester, setSemester] = useState('');
  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [submissionDate, setSubmissionDate] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [knownClasses, setKnownClasses] = useState([]);
  const [knownSemesters, setKnownSemesters] = useState([]);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId) || null,
    [plans, selectedPlanId]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [existingPlans, lectures] = await Promise.all([listSessionPlans(), getAcademicLectures()]);
        if (cancelled) return;
        const opts = extractLectureFieldOptions(lectures);
        const classes = [
          ...new Set([...opts.classes, ...existingPlans.map((p) => p.className).filter(Boolean)])
        ].sort((a, b) => a.localeCompare(b));
        const semesters = [
          ...new Set([...opts.semesters, ...existingPlans.map((p) => p.semester).filter(Boolean)])
        ].sort((a, b) => a.localeCompare(b));
        setKnownClasses(classes);
        setKnownSemesters(semesters);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plans.length]);

  const applySelectedPlan = useCallback((p) => {
    if (!p) {
      setSelectedPlanId(null);
      setRows([]);
      setSubmissionDate('');
      return;
    }
    setSelectedPlanId(p.id);
    setFacultyName(p.facultyName || '');
    setSemester(p.semester || '');
    setSubmissionDate(p.submissionDate || p.periodTo || '');
    setRows(
      (p.rows || []).map((r) => ({
        ...r,
        sessionNo: r.sessionNo,
        unitNoAndName: r.unitNoAndName || '',
        topic: r.topic || '',
        reference: r.reference || '',
        deliveryMethod: r.deliveryMethod || '',
        completedOn: r.completedOn || '',
        roomNo: r.roomNo || '',
        time: r.time || '',
        studentsPresent: r.studentsPresent ?? '',
        lectureId: r.lectureId || null
      }))
    );
  }, []);

  const handleGenerateAll = async () => {
    if (!academicYear || !className) {
      await Swal.fire({ icon: 'warning', title: 'Missing filters', text: 'Fill academic year and class.' });
      return;
    }
    if (!periodFrom || !periodTo || periodFrom > periodTo) {
      await Swal.fire({ icon: 'warning', title: 'Invalid range', text: 'Choose a valid from/to date range.' });
      return;
    }
    setLoading(true);
    try {
      const result = await generateSessionPlansBulk({
        academicYear,
        className,
        periodFrom,
        periodTo,
        semester,
        facultyName
      });
      const generated = result.plans || [];
      setPlans(generated);
      if (!generated.length) {
        await Swal.fire({
          icon: 'info',
          title: 'No lectures found',
          text: 'Add lectures from the calendar for this class and date range, then try again.'
        });
        applySelectedPlan(null);
      } else {
        applySelectedPlan(generated[0]);
        await Swal.fire({
          icon: 'success',
          title: 'Generated',
          text: `Created ${generated.length} session plan(s) for division + subject combinations.`,
          timer: 2000,
          showConfirmButton: false
        });
      }
    } catch (err) {
      await Swal.fire({ icon: 'error', title: 'Generate failed', text: err.message || 'Could not generate.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedPlan?.id) return;
    setSaving(true);
    try {
      const p = await updateSessionPlan(selectedPlan.id, {
        facultyName,
        submissionDate,
        semester,
        rows: rows.map((r, i) => ({ ...r, sessionNo: r.sessionNo || i + 1 }))
      });
      setPlans((prev) => prev.map((x) => (x.id === p.id ? p : x)));
      applySelectedPlan(p);
      await Swal.fire({ icon: 'success', title: 'Saved', timer: 1500, showConfirmButton: false });
    } catch (err) {
      await Swal.fire({ icon: 'error', title: 'Save failed', text: err.message || 'Could not save.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!selectedPlan?.id) return;
    try {
      await updateSessionPlan(selectedPlan.id, {
        facultyName,
        submissionDate,
        semester,
        rows: rows.map((r, i) => ({ ...r, sessionNo: r.sessionNo || i + 1 }))
      });
      await downloadSessionPlan(selectedPlan.id);
    } catch (err) {
      await Swal.fire({ icon: 'error', title: 'Download failed', text: err.message || 'Could not download.' });
    }
  };

  const setQuickRange = (from, to) => {
    setPeriodFrom(from);
    setPeriodTo(to);
  };

  const quickRanges = useMemo(() => {
    const y = now.getFullYear();
    const m = now.getMonth();
    const last = daysInMonth(y, m + 1);
    return {
      firstHalf: () => setQuickRange(toYmd(new Date(y, m, 1)), toYmd(new Date(y, m, 15))),
      secondHalf: () => setQuickRange(toYmd(new Date(y, m, 16)), toYmd(new Date(y, m, last))),
      last15: () => setQuickRange(toYmd(addDays(now, -14)), toYmd(now)),
      last30: () => setQuickRange(toYmd(addDays(now, -29)), toYmd(now))
    };
  }, [now]);

  const fieldClass =
    'w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500';

  return (
    <div className="px-1 py-2 sm:px-2">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Session plans</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Generate one plan per division and subject from calendar lectures. Use any date range (15 days, 30 days, or
            custom).
          </p>
        </div>
        {loading ? (
          <span className="inline-flex items-center gap-2 text-xs text-slate-500">
            <span className="h-3.5 w-3.5 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
            Generating…
          </span>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:p-4 mb-4 space-y-3">
        <p className="text-xs font-medium text-slate-600">Generate for class</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="text-xs text-slate-600">
            Academic year
            <input value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} className={fieldClass} />
          </label>
          <label className="text-xs text-slate-600">
            Class
            <select value={className} onChange={(e) => setClassName(e.target.value)} className={fieldClass}>
              <option value="">Select class</option>
              {className && !knownClasses.includes(className) ? (
                <option value={className}>{className}</option>
              ) : null}
              {knownClasses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Semester (optional)
            <select value={semester} onChange={(e) => setSemester(e.target.value)} className={fieldClass}>
              <option value="">Select semester</option>
              {semester && !knownSemesters.includes(semester) ? (
                <option value={semester}>{semester}</option>
              ) : null}
              {knownSemesters.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Faculty name (optional)
            <input value={facultyName} onChange={(e) => setFacultyName(e.target.value)} className={fieldClass} />
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-600">
            From
            <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} className={fieldClass} />
          </label>
          <label className="text-xs text-slate-600">
            To
            <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} className={fieldClass} />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={quickRanges.firstHalf} className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50">
            1–15 this month
          </button>
          <button type="button" onClick={quickRanges.secondHalf} className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50">
            16–end this month
          </button>
          <button type="button" onClick={quickRanges.last15} className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50">
            Last 15 days
          </button>
          <button type="button" onClick={quickRanges.last30} className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50">
            Last 30 days
          </button>
        </div>

        <button
          type="button"
          onClick={handleGenerateAll}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50"
        >
          Generate all division &amp; subject plans
        </button>
      </div>

      {plans.length > 0 ? (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 mb-4">
            <p className="text-xs font-medium text-slate-600 mb-2">Generated plans ({plans.length})</p>
            <div className="flex flex-wrap gap-2">
              {plans.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applySelectedPlan(p)}
                  className={`text-xs px-3 py-2 rounded-lg border transition-colors ${
                    selectedPlanId === p.id
                      ? 'border-primary-400 bg-primary-50 text-primary-800'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                  }`}
                >
                  <span className="font-medium">{p.division}</span>
                  <span className="text-slate-400 mx-1">·</span>
                  <span>{p.subject}</span>
                  <span className="text-slate-400 ml-1">({(p.rows || []).length} sessions)</span>
                </button>
              ))}
            </div>
          </div>

          {selectedPlan ? (
            <>
              <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 mb-4">
                <p className="text-xs font-medium text-slate-600 mb-2">Plan header</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-xs text-slate-600">
                    Submission date
                    <input type="date" value={submissionDate} onChange={(e) => setSubmissionDate(e.target.value)} className={fieldClass} />
                  </label>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {selectedPlan.className}-{selectedPlan.division} · {selectedPlan.subject} · {selectedPlan.periodFrom} —{' '}
                  {selectedPlan.periodTo}
                </p>
              </div>

              <SessionPlanTable
                rows={rows}
                onChange={setRows}
                onRemoveRow={(index) => setRows((prev) => prev.filter((_, i) => i !== index))}
              />

              <div className="flex flex-wrap gap-2 mt-4">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-primary-300 text-primary-700 bg-primary-50 hover:bg-primary-100"
                >
                  Download DOCX
                </button>
              </div>
            </>
          ) : null}
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-8 text-center text-sm text-slate-500">
          Add lectures from the <strong className="text-slate-700">Calendar</strong> (click a date → Add lecture), then
          generate plans for your class and date range.
        </div>
      )}
    </div>
  );
}
