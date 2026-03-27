import mongoose from 'mongoose';

/** One row per calendar day (YYYY-MM-DD, local app calendar). */
const attendanceSchema = new mongoose.Schema({
  calendarDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, unique: true },
  isLeave: { type: Boolean, default: false },
  checkInAt: { type: Date, default: null },
  checkOutAt: { type: Date, default: null },
  notes: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model('Attendance', attendanceSchema);
