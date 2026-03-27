import express from 'express';
import Attendance from '../models/Attendance.js';

const router = express.Router();

function isYmd(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function parseOptInstant(v) {
  if (v == null || v === '') return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

// GET /api/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD (to exclusive, same as reminders)
router.get('/', async (req, res) => {
  try {
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    if (!isYmd(from) || !isYmd(to) || from >= to) {
      return res.status(400).json({ error: 'from and to must be YYYY-MM-DD with from < to (to exclusive)' });
    }
    const rows = await Attendance.find({ calendarDate: { $gte: from, $lt: to } }).sort({ calendarDate: 1 });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/attendance — upsert one day
router.put('/', async (req, res) => {
  try {
    const { calendarDate, isLeave, checkInAt, checkOutAt, notes } = req.body || {};
    if (!isYmd(String(calendarDate || ''))) {
      return res.status(400).json({ error: 'calendarDate must be YYYY-MM-DD' });
    }
    const leave = Boolean(isLeave);

    let inD = null;
    let outD = null;
    if (!leave) {
      inD = parseOptInstant(checkInAt);
      outD = parseOptInstant(checkOutAt);
      if (checkInAt != null && checkInAt !== '' && inD == null) {
        return res.status(400).json({ error: 'checkInAt must be a valid ISO datetime' });
      }
      if (checkOutAt != null && checkOutAt !== '' && outD == null) {
        return res.status(400).json({ error: 'checkOutAt must be a valid ISO datetime' });
      }
      if (inD && outD && outD <= inD) {
        return res.status(400).json({ error: 'check-out must be after check-in' });
      }
    }

    const doc = await Attendance.findOneAndUpdate(
      { calendarDate },
      {
        $set: {
          calendarDate,
          isLeave: leave,
          checkInAt: leave ? null : inD,
          checkOutAt: leave ? null : outD,
          notes: typeof notes === 'string' ? notes : '',
          updatedAt: new Date()
        }
      },
      { upsert: true, new: true, runValidators: true }
    );

    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/attendance/:calendarDate — remove log for that day
router.delete('/:calendarDate', async (req, res) => {
  try {
    const calendarDate = decodeURIComponent(String(req.params.calendarDate || ''));
    if (!isYmd(calendarDate)) {
      return res.status(400).json({ error: 'calendarDate must be YYYY-MM-DD' });
    }
    const deleted = await Attendance.findOneAndDelete({ calendarDate });
    if (!deleted) {
      return res.status(404).json({ error: 'No attendance entry for that day' });
    }
    res.json({ message: 'Removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
