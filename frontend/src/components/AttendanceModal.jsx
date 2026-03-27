import React, { useState, useEffect } from 'react';
import Modal from 'react-modal';
import Swal from 'sweetalert2';
import { putAttendance, deleteAttendance } from '../services/api';

Modal.setAppElement('#root');

function isoToTimeInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** @param {string} ymd YYYY-MM-DD @param {string} hhmm HH:mm */
function localTimeToIso(ymd, hhmm) {
  if (!ymd || !hhmm) return null;
  const [y, mo, day] = ymd.split('-').map((n) => Number(n));
  const [hh, mm] = hhmm.split(':').map((n) => Number(n));
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(day)) return null;
  const d = new Date(y, mo - 1, day, hh || 0, mm || 0, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function AttendanceModal({ isOpen, onClose, calendarDate, initialRecord, onSaved }) {
  const [isLeave, setIsLeave] = useState(false);
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const r = initialRecord;
    setIsLeave(Boolean(r?.isLeave));
    setCheckInTime(r && !r.isLeave && r.checkInAt ? isoToTimeInput(r.checkInAt) : '');
    setCheckOutTime(r && !r.isLeave && r.checkOutAt ? isoToTimeInput(r.checkOutAt) : '');
    setNotes(r?.notes ? String(r.notes) : '');
  }, [isOpen, calendarDate, initialRecord]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        calendarDate,
        isLeave,
        checkInAt: isLeave ? null : localTimeToIso(calendarDate, checkInTime),
        checkOutAt: isLeave ? null : localTimeToIso(calendarDate, checkOutTime),
        notes: notes.trim()
      };
      await putAttendance(body);
      await Swal.fire({
        icon: 'success',
        title: 'Saved',
        text: isLeave ? 'Marked as leave.' : 'College times saved.',
        timer: 1200,
        showConfirmButton: false
      });
      onSaved?.();
      onClose();
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Could not save.';
      await Swal.fire({ icon: 'error', title: 'Save failed', text: msg });
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    if (!initialRecord?._id) {
      onClose();
      return;
    }
    const ok = await Swal.fire({
      icon: 'question',
      title: 'Remove this day?',
      text: 'Clear attendance and leave flag for this date.',
      showCancelButton: true,
      confirmButtonText: 'Remove',
      cancelButtonText: 'Cancel'
    });
    if (!ok.isConfirmed) return;
    setSaving(true);
    try {
      await deleteAttendance(calendarDate);
      await Swal.fire({
        icon: 'success',
        title: 'Removed',
        timer: 1000,
        showConfirmButton: false
      });
      onSaved?.();
      onClose();
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Could not remove.';
      await Swal.fire({ icon: 'error', title: 'Error', text: msg });
    } finally {
      setSaving(false);
    }
  }

  const weekday =
    calendarDate &&
    new Date(`${calendarDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' });

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      className="bg-white shadow-xl rounded-xl w-full max-w-md mx-4 outline-none max-h-[90vh] overflow-y-auto"
      overlayClassName="fixed inset-0 z-[61] flex items-center justify-center bg-black/50"
    >
      <form onSubmit={handleSubmit} className="p-6">
        <h2 className="text-xl font-semibold text-slate-800 mb-1">College attendance</h2>
        <p className="text-sm text-slate-500 mb-4">
          {calendarDate}
          {weekday ? ` · ${weekday}` : ''}
          <span className="block text-xs mt-1 text-slate-400">Reminders stay separate — you can still use this day for tasks.</span>
        </p>

        <label className="flex items-center gap-2 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={isLeave}
            onChange={(e) => setIsLeave(e.target.checked)}
            className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm font-medium text-slate-700">Leave (no college this day)</span>
        </label>

        {!isLeave && (
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">In</label>
              <input
                type="time"
                value={checkInTime}
                onChange={(e) => setCheckInTime(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Out</label>
              <input
                type="time"
                value={checkOutTime}
                onChange={(e) => setCheckOutTime(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        )}

        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-600 mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg resize-none text-sm"
            placeholder="Half day, event, etc."
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 min-w-[8rem] py-2.5 rounded-lg bg-primary-500 text-white font-medium hover:bg-primary-600 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {initialRecord?._id ? (
            <button
              type="button"
              disabled={saving}
              onClick={handleClear}
              className="py-2.5 px-4 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Clear day
            </button>
          ) : null}
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="py-2.5 px-4 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
