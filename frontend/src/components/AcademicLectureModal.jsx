import React, { useState, useEffect, useRef, useMemo } from 'react';
import Modal from 'react-modal';
import {
  DEFAULT_LECTURE_START,
  DEFAULT_LECTURE_DURATION_MIN,
  defaultLectureEnd,
  normalizeLectureTimes
} from '../utils/lectureTimes';
import { loadLastLectureFields } from '../utils/lectureFieldOptions';

Modal.setAppElement('#root');

const EMPTY = {
  academicYear: '',
  className: '',
  divisions: '',
  subject: '',
  semester: '',
  lectureDate: '',
  startTime: DEFAULT_LECTURE_START,
  endTime: defaultLectureEnd(DEFAULT_LECTURE_START),
  unitNoAndName: '',
  topic: '',
  reference: '',
  deliveryMethod: '',
  numberOfStudents: '',
  roomNo: '',
  remarks: '',
  status: 'conducted'
};

const UNIT_OPTIONS = ['UNIT-1', 'UNIT-2', 'UNIT-3', 'UNIT-4', 'UNIT-5'];

function SuggestField({
  label,
  value,
  onChange,
  options = [],
  required = false,
  placeholder = '',
  hint = '',
  className = '',
  listId
}) {
  const fieldClass =
    'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white';

  return (
    <label className={`text-sm text-slate-600 ${className}`}>
      {label}
      <input
        required={required}
        value={value}
        onChange={onChange}
        className={fieldClass}
        placeholder={placeholder}
        list={options.length ? listId : undefined}
      />
      {options.length ? (
        <datalist id={listId}>
          {options.map((opt) => (
            <option key={opt} value={opt} />
          ))}
        </datalist>
      ) : null}
      {hint ? <span className="text-xs text-slate-400 mt-0.5 block">{hint}</span> : null}
    </label>
  );
}

export default function AcademicLectureModal({
  isOpen,
  onClose,
  onSave,
  initialValues = {},
  suggestions = null,
  lectureToEdit = null
}) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const endTouchedRef = useRef(false);
  const wasOpenRef = useRef(false);

  const opts = useMemo(
    () => ({
      academicYears: suggestions?.academicYears || [],
      classes: suggestions?.classes || [],
      semesters: suggestions?.semesters || [],
      divisions: suggestions?.divisions || [],
      subjects: suggestions?.subjects || []
    }),
    [suggestions]
  );

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    endTouchedRef.current = false;

    if (lectureToEdit) {
      const times = normalizeLectureTimes(lectureToEdit.startTime, lectureToEdit.endTime);
      setForm({
        academicYear: lectureToEdit.academicYear || '',
        className: lectureToEdit.className || '',
        divisions: (lectureToEdit.divisions || [lectureToEdit.division]).filter(Boolean).join(', '),
        subject: lectureToEdit.subject || '',
        semester: lectureToEdit.semester || '',
        lectureDate: lectureToEdit.lectureDate || '',
        startTime: times.startTime,
        endTime: times.endTime,
        unitNoAndName: lectureToEdit.unitNoAndName || '',
        topic: lectureToEdit.topic || '',
        reference: lectureToEdit.reference || '',
        deliveryMethod: lectureToEdit.deliveryMethod || '',
        numberOfStudents:
          lectureToEdit.numberOfStudents != null && lectureToEdit.numberOfStudents !== ''
            ? String(lectureToEdit.numberOfStudents)
            : '',
        roomNo: lectureToEdit.roomNo || '',
        remarks: lectureToEdit.remarks || '',
        status: lectureToEdit.status === 'cancelled' ? 'cancelled' : 'conducted'
      });
      return;
    }

    const last = loadLastLectureFields() || {};
    const merged = { ...EMPTY, ...last, ...initialValues };
    const times = normalizeLectureTimes(merged.startTime, merged.endTime);
    setForm({ ...merged, startTime: times.startTime, endTime: times.endTime });
  }, [isOpen, lectureToEdit, initialValues]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const applyLastSaved = () => {
    const last = loadLastLectureFields();
    if (!last) return;
    setForm((f) => ({
      ...f,
      academicYear: last.academicYear || f.academicYear,
      className: last.className || f.className,
      divisions: last.divisions || f.divisions,
      subject: last.subject || f.subject,
      semester: last.semester || f.semester,
      deliveryMethod: last.deliveryMethod || f.deliveryMethod
    }));
  };

  const handleStartTimeChange = (e) => {
    const startTime = e.target.value;
    setForm((f) => ({
      ...f,
      startTime,
      endTime: endTouchedRef.current ? f.endTime : defaultLectureEnd(startTime)
    }));
  };

  const handleEndTimeChange = (e) => {
    endTouchedRef.current = true;
    setForm((f) => ({ ...f, endTime: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const times = normalizeLectureTimes(form.startTime, form.endTime);
    const payload = {
      academicYear: form.academicYear.trim(),
      className: form.className.trim(),
      divisions: form.divisions.trim(),
      subject: form.subject.trim(),
      semester: form.semester.trim(),
      lectureDate: form.lectureDate,
      startTime: times.startTime,
      endTime: times.endTime,
      unitNoAndName: form.unitNoAndName.trim(),
      topic: form.topic.trim(),
      reference: form.reference.trim(),
      deliveryMethod: form.deliveryMethod.trim(),
      numberOfStudents:
        form.numberOfStudents === '' || !Number.isFinite(Number(form.numberOfStudents))
          ? null
          : Number(form.numberOfStudents),
      roomNo: form.roomNo.trim(),
      remarks: form.remarks.trim(),
      status: form.status === 'cancelled' ? 'cancelled' : 'conducted'
    };

    if (!payload.academicYear || !payload.className || !payload.divisions || !payload.subject || !payload.lectureDate || !payload.topic) {
      return;
    }
    if (times.endTime <= times.startTime) return;

    setSaving(true);
    try {
      await onSave(payload, lectureToEdit);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const fieldClass =
    'w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500';

  const hasLastSaved = Boolean(loadLastLectureFields());

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      className="bg-white shadow-xl rounded-xl w-[min(96vw,56rem)] mx-auto outline-none"
      overlayClassName="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3 sm:p-4"
    >
      <form onSubmit={handleSubmit} className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
          <h2 className="text-xl font-semibold text-slate-800">
            {lectureToEdit ? 'Edit academic lecture' : 'Add academic lecture'}
          </h2>
          {hasLastSaved && !lectureToEdit ? (
            <button
              type="button"
              onClick={applyLastSaved}
              className="text-xs font-medium text-primary-600 hover:text-primary-700 px-2 py-1 rounded-lg border border-primary-200 bg-primary-50"
            >
              Use last details
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2.5">
          <SuggestField
            label="Academic year"
            required
            value={form.academicYear}
            onChange={set('academicYear')}
            options={opts.academicYears}
            placeholder="2025-26"
            listId="lecture-ay-list"
          />
          <SuggestField
            label="Semester"
            value={form.semester}
            onChange={set('semester')}
            options={opts.semesters}
            placeholder="SEM5"
            listId="lecture-sem-list"
          />
          <SuggestField
            label="Class"
            required
            value={form.className}
            onChange={set('className')}
            options={opts.classes}
            placeholder="TYBCA"
            listId="lecture-class-list"
          />
          <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 items-start">
            <span className="text-sm text-slate-600">Divisions</span>
            <span className="text-sm text-slate-600 hidden sm:block">Subject</span>
            {opts.divisions.length > 0 ? (
              <div className="sm:col-span-2 flex flex-wrap gap-1.5 pb-0.5">
                {opts.divisions.map((d) => {
                  const parts = form.divisions
                    .split(/[,+/|&\s]+/)
                    .map((x) => x.trim().toUpperCase())
                    .filter(Boolean);
                  const active = parts.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        const next = active ? parts.filter((x) => x !== d) : [...parts, d];
                        setForm((f) => ({ ...f, divisions: next.join(', ') }));
                      }}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium border ${
                        active
                          ? 'bg-indigo-100 border-indigo-300 text-indigo-800'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-white'
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <div>
              <input
                required
                value={form.divisions}
                onChange={set('divisions')}
                className={fieldClass}
                placeholder="F  or  F, G  (merged class)"
                list="lecture-divisions-list"
                aria-label="Divisions"
              />
              <datalist id="lecture-divisions-list">
                {opts.divisions.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
              <span className="text-xs text-slate-400 mt-0.5 block">
                Tap chips above or type comma-separated divisions for merged class.
              </span>
            </div>
            <div>
              <span className="text-sm text-slate-600 sm:hidden block mb-0">Subject</span>
              <input
                required
                value={form.subject}
                onChange={set('subject')}
                className={fieldClass}
                placeholder="Advance Web Designing"
                list="lecture-subject-list"
                aria-label="Subject"
              />
              <datalist id="lecture-subject-list">
                {opts.subjects.map((opt) => (
                  <option key={opt} value={opt} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-2.5">
            <label className="text-sm text-slate-600">
              Lecture date
              <input required type="date" value={form.lectureDate} onChange={set('lectureDate')} className={fieldClass} />
            </label>
            <label className="text-sm text-slate-600">
              Unit no &amp; name
              <select
                value={form.unitNoAndName}
                onChange={set('unitNoAndName')}
                className={`${fieldClass} bg-white`}
              >
                <option value="">Select unit</option>
                {form.unitNoAndName && !UNIT_OPTIONS.includes(form.unitNoAndName) ? (
                  <option value={form.unitNoAndName}>{form.unitNoAndName}</option>
                ) : null}
                {UNIT_OPTIONS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-600">
              From
              <input required type="time" value={form.startTime} onChange={handleStartTimeChange} className={fieldClass} />
            </label>
            <label className="text-sm text-slate-600">
              To
              <input required type="time" value={form.endTime} onChange={handleEndTimeChange} className={fieldClass} />
            </label>
            <span className="col-span-2 lg:col-span-4 text-xs text-slate-400">
              Default {DEFAULT_LECTURE_DURATION_MIN} min when From changes.
            </span>
          </div>
          <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-2.5">
            <label className="text-sm text-slate-600">
              Number of students
              <input
                type="number"
                min="0"
                step="1"
                value={form.numberOfStudents}
                onChange={set('numberOfStudents')}
                className={fieldClass}
                placeholder="Optional"
              />
            </label>
            <label className="text-sm text-slate-600">
              Room no
              <input
                value={form.roomNo}
                onChange={set('roomNo')}
                className={fieldClass}
                placeholder="e.g. 301"
              />
            </label>
            <label className="text-sm text-slate-600">
              Reference
              <input value={form.reference} onChange={set('reference')} className={fieldClass} />
            </label>
            <label className="text-sm text-slate-600">
              Delivery method
              <input
                value={form.deliveryMethod}
                onChange={set('deliveryMethod')}
                className={fieldClass}
                placeholder="PPT / Demo"
                list="lecture-delivery-list"
              />
              <datalist id="lecture-delivery-list">
                {['PPT', 'Demo', 'PPT / Demo', ...(suggestions?.deliveryMethods || [])].map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </label>
          </div>
          <label className="text-sm text-slate-600 sm:col-span-2 lg:col-span-3">
            Topic
            <textarea
              required
              value={form.topic}
              onChange={set('topic')}
              rows={2}
              className={`${fieldClass} resize-none`}
            />
          </label>
          <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-2.5 items-start">
            <label className="text-sm text-slate-600 sm:col-span-2">
              Remarks
              <textarea
                value={form.remarks}
                onChange={set('remarks')}
                rows={2}
                className={`${fieldClass} resize-none`}
                placeholder={form.status === 'cancelled' ? 'Reason for cancellation' : ''}
              />
            </label>
            <label className="text-sm text-slate-600">
              Lecture status
              <select
                value={form.status}
                onChange={set('status')}
                className={`${fieldClass} bg-white`}
              >
                <option value="conducted">Conducted</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <span className="text-xs text-slate-400 mt-0.5 block">
                If cancelled, note the reason in Remarks.
              </span>
            </label>
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-2.5 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 disabled:opacity-50"
          >
            {saving ? 'Saving…' : lectureToEdit ? 'Update lecture' : 'Save lecture'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
