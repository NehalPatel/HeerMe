import mongoose from 'mongoose';

const reminderSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  // Canonical datetime range for the task/reminder.
  startAt: { type: Date },
  endAt: { type: Date },
  timezone: { type: String, default: 'Asia/Kolkata' },
  // Recurrence rule for generating occurrences (master reminders only).
  recurrence: {
    freq: { type: String, enum: ['DAILY', 'WEEKLY', 'YEARLY'] },
    interval: { type: Number, default: 1 },
    byWeekday: [{ type: Number, min: 0, max: 6 }],
    byMonth: { type: Number, min: 1, max: 12 },
    byMonthDay: { type: Number, min: 1, max: 31 },
    until: { type: Date },
    count: { type: Number, min: 1 }
  },
  // Per-occurrence overrides so completing one occurrence does not complete the whole series.
  // Keyed by occurrenceStartAt ISO string to avoid timezone ambiguity.
  occurrenceOverrides: [
    {
      occurrenceStartAt: { type: Date, required: true },
      status: { type: String, enum: ['open', 'in-progress', 'completed', 'invalid'], required: true },
      comments: { type: String, default: '' },
      updatedAt: { type: Date, default: Date.now }
    }
  ],
  date: { type: Date, required: true },
  time: { type: String, required: true },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  category: { type: String, enum: ['Academic', 'Personal', 'Other'], default: 'Personal' },
  status: { type: String, enum: ['open', 'in-progress', 'completed', 'invalid'], default: 'open' },
  comments: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Reminder', reminderSchema);
