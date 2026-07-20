import mongoose from 'mongoose';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const academicLectureSchema = new mongoose.Schema({
  academicYear: { type: String, required: true, trim: true },
  className: { type: String, required: true, trim: true },
  /** Primary division (first in divisions) — kept for backward compatibility */
  division: { type: String, trim: true },
  /** All divisions this lecture counts for in session plans (merged classes) */
  divisions: { type: [String], default: [] },
  subject: { type: String, required: true, trim: true },
  semester: { type: String, default: '', trim: true },
  lectureDate: { type: String, required: true, match: YMD },
  /** HH:mm local */
  startTime: { type: String, default: '09:00' },
  /** HH:mm local */
  endTime: { type: String, default: '09:55' },
  unitNoAndName: { type: String, default: '', trim: true },
  topic: { type: String, required: true, trim: true },
  reference: { type: String, default: '', trim: true },
  deliveryMethod: { type: String, default: '', trim: true },
  /** Optional headcount for this lecture */
  numberOfStudents: { type: Number, min: 0, default: null },
  roomNo: { type: String, default: '', trim: true },
  remarks: { type: String, default: '', trim: true },
  /** planned = upcoming; conducted = held; cancelled = did not run (reason in remarks) */
  status: {
    type: String,
    enum: ['planned', 'conducted', 'cancelled'],
    default: 'planned'
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

academicLectureSchema.index({ academicYear: 1, className: 1, division: 1, subject: 1, lectureDate: 1 });

export default mongoose.model('AcademicLecture', academicLectureSchema);
