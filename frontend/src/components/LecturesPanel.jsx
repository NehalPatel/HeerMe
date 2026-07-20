import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getAcademicLectures, apiErrorMessage } from '../services/api';
import { formatLectureTimeRange } from '../utils/lectureTimes';

function formatLectureDate(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd || '—';
  return new Date(`${ymd}T12:00:00`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function divisionLabel(lec) {
  const divs = lec?.divisions?.length ? lec.divisions : [lec?.division];
  const cleaned = (divs || []).filter(Boolean);
  return cleaned.length ? cleaned.join(', ') : '—';
}

function SortHeader({ label, active, dir, onClick }) {
  const arrow = !active ? '' : dir === 'asc' ? ' ▲' : ' ▼';
  return (
    <th className="px-2 py-2.5 border-b border-slate-200 whitespace-nowrap">
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-0.5 uppercase tracking-wide font-semibold ${
          active ? 'text-primary-700' : 'text-slate-600 hover:text-slate-800'
        }`}
        aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        {label}
        <span className="text-[10px] leading-none opacity-80" aria-hidden>
          {arrow || ' ⇅'}
        </span>
      </button>
    </th>
  );
}

export default function LecturesPanel({ onEditLecture, refreshKey = 0 }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortKey, setSortKey] = useState('lectureDate');
  const [sortDir, setSortDir] = useState('desc');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAcademicLectures();
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setRows([]);
      setError(apiErrorMessage(err, 'Could not load lectures.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const classOptions = useMemo(() => {
    const set = new Set();
    for (const lec of rows) {
      const c = String(lec?.className || '').trim();
      if (c) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [rows]);

  const filteredSorted = useMemo(() => {
    let list = rows;
    if (classFilter) {
      list = list.filter((lec) => String(lec.className || '').trim() === classFilter);
    }
    if (dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
      list = list.filter((lec) => String(lec.lectureDate || '') >= dateFrom);
    }
    if (dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      list = list.filter((lec) => String(lec.lectureDate || '') <= dateTo);
    }

    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === 'className') {
        const ca = String(a.className || '');
        const cb = String(b.className || '');
        const cmp = ca.localeCompare(cb, undefined, { sensitivity: 'base' });
        if (cmp !== 0) return cmp * dir;
        // Stable secondary: date then time
        const d = String(a.lectureDate || '').localeCompare(String(b.lectureDate || ''));
        if (d !== 0) return d;
        return String(a.startTime || '').localeCompare(String(b.startTime || ''));
      }
      // lectureDate
      const d = String(a.lectureDate || '').localeCompare(String(b.lectureDate || ''));
      if (d !== 0) return d * dir;
      const t = String(a.startTime || '').localeCompare(String(b.startTime || ''));
      if (t !== 0) return t * dir;
      return String(a.className || '').localeCompare(String(b.className || ''), undefined, {
        sensitivity: 'base'
      });
    });
  }, [rows, classFilter, dateFrom, dateTo, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const clearFilters = () => {
    setClassFilter('');
    setDateFrom('');
    setDateTo('');
  };

  const hasFilters = Boolean(classFilter || dateFrom || dateTo);

  const toolbar = (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <p className="text-sm text-slate-600">
        {loading
          ? 'Loading…'
          : `${filteredSorted.length} lecture${filteredSorted.length === 1 ? '' : 's'}${
              hasFilters ? ` (of ${rows.length})` : ''
            }`}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5 text-xs font-medium text-slate-600">
          Class
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="min-w-[8rem] px-2 py-1.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-800 focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">All classes</option>
            {classOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-xs font-medium text-slate-600">
          From
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-800 focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs font-medium text-slate-600">
          To
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-800 focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
          />
        </label>
        {hasFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            Clear
          </button>
        ) : null}
        <button
          type="button"
          onClick={load}
          className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>
    </div>
  );

  if (loading && !rows.length) {
    return (
      <div className="space-y-3">
        {toolbar}
        <div className="flex items-center justify-center py-16 text-slate-500 text-sm">
          Loading lectures…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-dashed border-red-200 bg-red-50/60 p-6 text-center text-sm text-red-700">
        <p>{error}</p>
        <button
          type="button"
          onClick={load}
          className="mt-3 px-3 py-1.5 text-sm font-medium rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-center text-sm text-slate-500">
        No lectures yet. Add one from the calendar (pick a day → Academic lecture).
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {toolbar}

      {!filteredSorted.length ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-center text-sm text-slate-500">
          No lectures match these filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm text-left">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-600 uppercase tracking-wide">
              <tr>
                <th className="px-2 py-2.5 border-b border-slate-200 whitespace-nowrap">Sr No</th>
                <SortHeader
                  label="Date of lecture"
                  active={sortKey === 'lectureDate'}
                  dir={sortDir}
                  onClick={() => toggleSort('lectureDate')}
                />
                <SortHeader
                  label="Class"
                  active={sortKey === 'className'}
                  dir={sortDir}
                  onClick={() => toggleSort('className')}
                />
                <th className="px-2 py-2.5 border-b border-slate-200 whitespace-nowrap">Division</th>
                <th className="px-2 py-2.5 border-b border-slate-200 whitespace-nowrap">Subject</th>
                <th className="px-2 py-2.5 border-b border-slate-200 whitespace-nowrap">Time</th>
                <th className="px-2 py-2.5 border-b border-slate-200 whitespace-nowrap">No. of students</th>
              </tr>
            </thead>
            <tbody>
              {filteredSorted.map((lec, i) => {
                const id = lec.id || lec._id || i;
                return (
                  <tr
                    key={id}
                    className="border-b border-slate-100 last:border-0 hover:bg-primary-50/40 cursor-pointer"
                    onClick={() => onEditLecture?.(lec)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onEditLecture?.(lec);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Edit lecture ${lec.topic || lec.subject || id}`}
                  >
                    <td className="px-2 py-2 text-slate-600 whitespace-nowrap">{i + 1}</td>
                    <td className="px-2 py-2 text-slate-800 whitespace-nowrap">
                      {formatLectureDate(lec.lectureDate)}
                    </td>
                    <td className="px-2 py-2 text-slate-800 whitespace-nowrap">{lec.className || '—'}</td>
                    <td className="px-2 py-2 text-slate-800 whitespace-nowrap">{divisionLabel(lec)}</td>
                    <td className="px-2 py-2 text-slate-800">{lec.subject || '—'}</td>
                    <td className="px-2 py-2 text-slate-800 whitespace-nowrap">
                      {formatLectureTimeRange(lec.startTime, lec.endTime)}
                    </td>
                    <td className="px-2 py-2 text-slate-800 whitespace-nowrap">
                      {lec.numberOfStudents != null ? lec.numberOfStudents : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
