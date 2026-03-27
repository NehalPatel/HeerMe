import React from 'react';
import Modal from 'react-modal';

Modal.setAppElement('#root');

export default function DayChoiceModal({ isOpen, onClose, dateLabel, onAddReminder, onCollegeAttendance }) {
  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      className="bg-white shadow-xl rounded-xl w-full max-w-sm mx-4 outline-none"
      overlayClassName="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
    >
      <div className="p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-1">This day</h2>
        <p className="text-sm text-slate-500 mb-5">{dateLabel}</p>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onAddReminder}
            className="w-full py-3 px-4 rounded-xl bg-primary-500 text-white font-medium hover:bg-primary-600"
          >
            Add reminder
          </button>
          <button
            type="button"
            onClick={onCollegeAttendance}
            className="w-full py-3 px-4 rounded-xl border-2 border-slate-200 text-slate-800 font-medium hover:bg-slate-50"
          >
            College in / out / leave
          </button>
          <button type="button" onClick={onClose} className="w-full py-2 text-sm text-slate-600 hover:text-slate-800">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
