import mongoose from 'mongoose';

const reminderSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  category: { type: String, enum: ['Academic', 'Personal', 'Other'], default: 'Personal' },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Reminder', reminderSchema);
