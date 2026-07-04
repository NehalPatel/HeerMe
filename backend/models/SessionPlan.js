import mongoose from 'mongoose';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const sessionPlanRowSchema = new mongoose.Schema(
  {
    sessionNo: { type: Number, required: true },
    unitNoAndName: { type: String, default: '' },
    topic: { type: String, default: '' },
    reference: { type: String, default: '' },
    deliveryMethod: { type: String, default: '' },
    completedOn: { type: String, default: '' },
    roomNo: { type: String, default: '' },
    time: { type: String, default: '' },
    studentsPresent: { type: Number, min: 0, default: null },
    remarks: { type: String, default: '' },
    lectureId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicLecture', default: null }
  },
  { _id: true }
);

const sessionPlanSchema = new mongoose.Schema({
  academicYear: { type: String, required: true, trim: true },
  className: { type: String, required: true, trim: true },
  division: { type: String, required: true, trim: true },
  subject: { type: String, required: true, trim: true },
  semester: { type: String, default: '', trim: true },
  periodFrom: { type: String, required: true, match: YMD },
  periodTo: { type: String, required: true, match: YMD },
  facultyName: { type: String, default: '', trim: true },
  submissionDate: { type: String, default: '' },
  rows: { type: [sessionPlanRowSchema], default: [] },
  status: { type: String, enum: ['draft', 'final'], default: 'draft' },
  updatedAt: { type: Date, default: Date.now }
});

sessionPlanSchema.index(
  { academicYear: 1, className: 1, division: 1, subject: 1, periodFrom: 1, periodTo: 1 },
  { unique: true }
);

export default mongoose.model('SessionPlan', sessionPlanSchema);
