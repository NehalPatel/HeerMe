import express from 'express';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import Reminder from '../models/Reminder.js';
import Attendance from '../models/Attendance.js';

const router = express.Router();

const exportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many export requests. Try again later.' }
});

function exportFilenameUtc() {
  const n = new Date();
  const p = (x) => String(x).padStart(2, '0');
  const ymd = `${n.getUTCFullYear()}${p(n.getUTCMonth() + 1)}${p(n.getUTCDate())}`;
  const hms = `${p(n.getUTCHours())}${p(n.getUTCMinutes())}${p(n.getUTCSeconds())}`;
  return `heerme-export-${ymd}-${hms}.json`;
}

function jsonReplacer(key, value) {
  if (value instanceof mongoose.Types.ObjectId) return value.toHexString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

router.get('/', exportLimiter, async (req, res) => {
  try {
    const [reminders, attendance] = await Promise.all([
      Reminder.find({}).lean().exec(),
      Attendance.find({}).lean().exec()
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      reminders,
      attendance
    };

    const body = JSON.stringify(payload, jsonReplacer);
    const filename = exportFilenameUtc();

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(body);
  } catch (err) {
    console.error('Export failed', err);
    res.status(500).json({ error: err.message || 'Export failed' });
  }
});

export default router;
