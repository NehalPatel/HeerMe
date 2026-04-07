import express from 'express';
import Reminder from '../models/Reminder.js';
import rrulePkg from 'rrule';
const { RRule } = rrulePkg;

const router = express.Router();

function formatHHmmInTimeZone(date, timeZone = 'Asia/Kolkata') {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '00:00';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${h}:${m}`;
}

function isValidIsoDateString(v) {
  if (typeof v !== 'string') return false;
  const d = new Date(v);
  return !Number.isNaN(d.getTime());
}

function parseLegacyStartAt({ date, time }) {
  if (!date) return null;
  const base = new Date(date);
  if (Number.isNaN(base.getTime())) return null;
  const [h, m] = String(time || '00:00').split(':').map((x) => Number(x));
  base.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  return base;
}

function normalizeRecurrence(input, startAt) {
  if (!input || typeof input !== 'object') return undefined;
  const freq = String(input.freq || '').toUpperCase();
  if (!['DAILY', 'WEEKLY', 'YEARLY'].includes(freq)) return null;

  const interval = Number.isFinite(Number(input.interval)) ? Math.max(1, Number(input.interval)) : 1;

  let byWeekday;
  if (freq === 'WEEKLY') {
    const raw = Array.isArray(input.byWeekday) ? input.byWeekday : [];
    byWeekday = [...new Set(raw.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))];
    if (byWeekday.length === 0 && startAt instanceof Date && !Number.isNaN(startAt.getTime())) {
      byWeekday = [startAt.getDay()];
    }
  }

  let byMonth;
  let byMonthDay;
  if (freq === 'YEARLY') {
    const d = startAt instanceof Date && !Number.isNaN(startAt.getTime()) ? startAt : null;
    byMonth = Number.isFinite(Number(input.byMonth)) ? Number(input.byMonth) : d ? d.getMonth() + 1 : undefined;
    byMonthDay = Number.isFinite(Number(input.byMonthDay)) ? Number(input.byMonthDay) : d ? d.getDate() : undefined;
    if (byMonth != null) byMonth = Math.min(12, Math.max(1, byMonth));
    if (byMonthDay != null) byMonthDay = Math.min(31, Math.max(1, byMonthDay));
  }

  let until;
  if (input.until && isValidIsoDateString(String(input.until))) {
    until = new Date(String(input.until));
  }
  const count = Number.isFinite(Number(input.count)) ? Math.max(1, Math.floor(Number(input.count))) : undefined;

  const out = { freq, interval };
  if (byWeekday) out.byWeekday = byWeekday;
  if (byMonth != null) out.byMonth = byMonth;
  if (byMonthDay != null) out.byMonthDay = byMonthDay;
  if (until) out.until = until;
  if (count) out.count = count;
  return out;
}

function getStartEndFromDoc(r) {
  const startAt = r.startAt instanceof Date && !Number.isNaN(r.startAt.getTime())
    ? r.startAt
    : parseLegacyStartAt({ date: r.date, time: r.time });
  if (!startAt) return { startAt: null, endAt: null };

  const endAt = r.endAt instanceof Date && !Number.isNaN(r.endAt.getTime())
    ? r.endAt
    : new Date(startAt.getTime() + 60 * 60 * 1000);

  return { startAt, endAt };
}

/** YYYY-MM-DD as start of that calendar day in Asia/Kolkata (matches app / reminders). */
function startOfDayAppCalendar(yyyyMmDd) {
  if (typeof yyyyMmDd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) return null;
  const d = new Date(`${yyyyMmDd}T00:00:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getOverrideForOccurrence(reminderDoc, occurrenceStartAt) {
  const arr = Array.isArray(reminderDoc.occurrenceOverrides) ? reminderDoc.occurrenceOverrides : [];
  const key = occurrenceStartAt instanceof Date ? occurrenceStartAt.getTime() : NaN;
  if (!Number.isFinite(key)) return null;
  return arr.find((o) => o?.occurrenceStartAt && new Date(o.occurrenceStartAt).getTime() === key) || null;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Global search: unified text blob (title, description, task comments, category, priority, occurrence comments)
router.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) {
      return res.json([]);
    }
    if (q.length > 200) {
      return res.status(400).json({ error: 'Query too long (max 200 characters)' });
    }
    let limit = Number(req.query.limit);
    if (!Number.isFinite(limit)) limit = 30;
    limit = Math.min(100, Math.max(1, limit));

    const safe = escapeRegex(q);

    const reminders = await Reminder.aggregate([
      {
        $addFields: {
          _searchBlob: {
            $concat: [
              { $ifNull: ['$title', ''] },
              '\n',
              { $ifNull: ['$description', ''] },
              '\n',
              { $ifNull: ['$comments', ''] },
              '\n',
              { $ifNull: ['$category', ''] },
              '\n',
              { $ifNull: ['$priority', ''] },
              '\n',
              {
                $reduce: {
                  input: { $ifNull: ['$occurrenceOverrides', []] },
                  initialValue: '',
                  in: {
                    $concat: [
                      '$$value',
                      { $ifNull: ['$$this.comments', ''] },
                      '\n'
                    ]
                  }
                }
              }
            ]
          }
        }
      },
      {
        $match: {
          $expr: {
            $regexMatch: { input: '$_searchBlob', regex: safe, options: 'i' }
          }
        }
      },
      { $sort: { createdAt: -1, date: -1 } },
      { $limit: limit },
      { $project: { _searchBlob: 0 } }
    ]).exec();

    res.json(reminders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reminders - fetch all reminders
router.get('/', async (req, res) => {
  try {
    const reminders = await Reminder.find().sort({ date: 1, time: 1 });
    res.json(reminders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reminders/occurrences?from=YYYY-MM-DD&to=YYYY-MM-DD
// Expands recurring reminders into occurrences within [fromDay, toDay) using app calendar (Asia/Kolkata).
router.get('/occurrences', async (req, res) => {
  try {
    const fromParam = String(req.query.from || '');
    const toParam = String(req.query.to || '');
    const fromDay = startOfDayAppCalendar(fromParam);
    const toDay = startOfDayAppCalendar(toParam);

    if (!fromDay || !toDay || toDay <= fromDay) {
      return res.status(400).json({ error: 'from/to are required as YYYY-MM-DD with to > from' });
    }

    const max = Number.isFinite(Number(req.query.max)) ? Math.min(1000, Math.max(1, Number(req.query.max))) : 1000;

    const reminders = await Reminder.find().sort({ date: 1, time: 1 });
    const out = [];

    for (const r of reminders) {
      const { startAt, endAt } = getStartEndFromDoc(r);
      if (!startAt || !endAt) continue;

      const durationMs = Math.max(1, endAt.getTime() - startAt.getTime());
      const recurrence = r.recurrence && typeof r.recurrence === 'object' ? r.recurrence : null;

      if (!recurrence || !recurrence.freq) {
        // Non-recurring: include if overlaps requested range.
        if (startAt < toDay && endAt > fromDay) {
          const override = getOverrideForOccurrence(r, startAt);
          const tz = r.timezone || 'Asia/Kolkata';
          out.push({
            occurrenceId: String(r._id),
            reminderId: String(r._id),
            startAt: startAt.toISOString(),
            endAt: new Date(startAt.getTime() + durationMs).toISOString(),
            title: r.title,
            description: r.description || '',
            time: formatHHmmInTimeZone(startAt, tz),
            priority: r.priority,
            category: r.category,
            status: override?.status || r.status,
            comments: typeof override?.comments === 'string' ? override.comments : (r.comments || ''),
            timezone: tz,
            recurrence: null
          });
        }
        if (out.length >= max) break;
        continue;
      }

      const freqMap = { DAILY: RRule.DAILY, WEEKLY: RRule.WEEKLY, YEARLY: RRule.YEARLY };
      const rule = new RRule({
        freq: freqMap[String(recurrence.freq).toUpperCase()] ?? RRule.DAILY,
        interval: Number.isFinite(Number(recurrence.interval)) ? Math.max(1, Number(recurrence.interval)) : 1,
        dtstart: startAt,
        until: recurrence.until ? new Date(recurrence.until) : undefined,
        count: Number.isFinite(Number(recurrence.count)) ? Math.max(1, Math.floor(Number(recurrence.count))) : undefined,
        byweekday: Array.isArray(recurrence.byWeekday)
          ? recurrence.byWeekday
              .map((n) => Number(n))
              .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
              .map((n) => [RRule.SU, RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA][n])
          : undefined,
        bymonth: Number.isFinite(Number(recurrence.byMonth)) ? Number(recurrence.byMonth) : undefined,
        bymonthday: Number.isFinite(Number(recurrence.byMonthDay)) ? Number(recurrence.byMonthDay) : undefined
      });

      // Expand in range [fromDay, toDay)
      const starts = rule.between(fromDay, new Date(toDay.getTime() - 1), true);
      for (const occStart of starts) {
        const occEnd = new Date(occStart.getTime() + durationMs);
        const override = getOverrideForOccurrence(r, occStart);
        const tz = r.timezone || 'Asia/Kolkata';
        out.push({
          occurrenceId: `${String(r._id)}@${occStart.toISOString()}`,
          reminderId: String(r._id),
          startAt: occStart.toISOString(),
          endAt: occEnd.toISOString(),
          title: r.title,
          description: r.description || '',
          time: formatHHmmInTimeZone(occStart, tz),
          priority: r.priority,
          category: r.category,
          status: override?.status || r.status,
          comments: typeof override?.comments === 'string' ? override.comments : (r.comments || ''),
          timezone: tz,
          recurrence: {
            freq: String(recurrence.freq).toUpperCase(),
            interval: recurrence.interval ?? 1,
            byWeekday: recurrence.byWeekday ?? undefined,
            byMonth: recurrence.byMonth ?? undefined,
            byMonthDay: recurrence.byMonthDay ?? undefined,
            until: recurrence.until ?? undefined,
            count: recurrence.count ?? undefined
          }
        });
        if (out.length >= max) break;
      }
      if (out.length >= max) break;
    }

    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/reminders/:id/occurrence - update status/comments for a single occurrence
router.put('/:id/occurrence', async (req, res) => {
  try {
    const { occurrenceStartAt, status, comments } = req.body || {};
    if (!isValidIsoDateString(String(occurrenceStartAt || ''))) {
      return res.status(400).json({ error: 'occurrenceStartAt (ISO) is required' });
    }
    const allowedStatus = ['open', 'in-progress', 'completed', 'invalid'];
    if (!allowedStatus.includes(status)) {
      return res.status(400).json({ error: 'Status must be one of: open, in-progress, completed, invalid' });
    }

    const occStart = new Date(String(occurrenceStartAt));
    const reminder = await Reminder.findById(req.params.id);
    if (!reminder) return res.status(404).json({ error: 'Reminder not found' });

    const arr = Array.isArray(reminder.occurrenceOverrides) ? reminder.occurrenceOverrides : [];
    const idx = arr.findIndex((o) => o?.occurrenceStartAt && new Date(o.occurrenceStartAt).getTime() === occStart.getTime());

    const next = {
      occurrenceStartAt: occStart,
      status,
      comments: typeof comments === 'string' ? comments : '',
      updatedAt: new Date()
    };

    if (idx >= 0) {
      reminder.occurrenceOverrides[idx] = next;
    } else {
      reminder.occurrenceOverrides.push(next);
    }

    await reminder.save();
    res.json({ message: 'Occurrence updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reminders/:id - fetch one reminder by id
router.get('/:id', async (req, res) => {
  try {
    const reminder = await Reminder.findById(req.params.id);
    if (!reminder) return res.status(404).json({ error: 'Reminder not found' });
    res.json(reminder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reminders - create reminder
router.post('/', async (req, res) => {
  try {
    const { title, description, date, time, priority, category, startAt, endAt, recurrence, timezone } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const parsedStartAt = isValidIsoDateString(startAt)
      ? new Date(startAt)
      : parseLegacyStartAt({ date, time });
    if (!parsedStartAt) {
      return res.status(400).json({ error: 'Start date/time is required' });
    }

    const parsedEndAt = isValidIsoDateString(endAt)
      ? new Date(endAt)
      : new Date(parsedStartAt.getTime() + 60 * 60 * 1000);
    if (Number.isNaN(parsedEndAt.getTime()) || parsedEndAt <= parsedStartAt) {
      return res.status(400).json({ error: 'End date/time must be after start date/time' });
    }

    const tz = typeof timezone === 'string' && timezone.trim() ? timezone.trim() : 'Asia/Kolkata';
    const normalizedRecurrence = normalizeRecurrence(recurrence, parsedStartAt);

    const reminder = new Reminder({
      title: String(title),
      description: description || '',
      // Keep legacy date/time populated for compatibility (startAt-derived).
      date: parsedStartAt,
      time: String(time || formatHHmmInTimeZone(parsedStartAt, tz)),
      startAt: parsedStartAt,
      endAt: parsedEndAt,
      timezone: tz,
      recurrence: normalizedRecurrence === undefined ? null : normalizedRecurrence,
      priority: ['low', 'medium', 'high'].includes(priority) ? priority : 'medium',
      category: ['Academic', 'Personal', 'Other'].includes(category) ? category : 'Personal'
    });
    await reminder.save();
    res.status(201).json(reminder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/reminders/:id/close - close reminder with final status + comments
router.put('/:id/close', async (req, res) => {
  try {
    const { status, comments } = req.body;
    const allowedStatus = ['open', 'in-progress', 'completed', 'invalid'];
    if (!allowedStatus.includes(status)) {
      return res.status(400).json({ error: 'Status must be one of: open, in-progress, completed, invalid' });
    }
    const reminder = await Reminder.findByIdAndUpdate(
      req.params.id,
      {
        status,
        comments: typeof comments === 'string' ? comments : ''
      },
      { new: true }
    );
    if (!reminder) return res.status(404).json({ error: 'Reminder not found' });
    res.json(reminder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/reminders/:id - update reminder fields (edit task)
router.put('/:id', async (req, res) => {
  try {
    const {
      title,
      description,
      date,
      time,
      priority,
      category,
      status,
      comments,
      startAt,
      endAt,
      recurrence,
      timezone
    } = req.body || {};

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const allowedPriority = ['low', 'medium', 'high'];
    const allowedCategory = ['Academic', 'Personal', 'Other'];
    const allowedStatus = ['open', 'in-progress', 'completed', 'invalid'];

    const parsedStartAt = isValidIsoDateString(startAt)
      ? new Date(startAt)
      : parseLegacyStartAt({ date, time });
    if (!parsedStartAt) {
      return res.status(400).json({ error: 'Start date/time is required' });
    }

    const parsedEndAt = isValidIsoDateString(endAt)
      ? new Date(endAt)
      : new Date(parsedStartAt.getTime() + 60 * 60 * 1000);
    if (Number.isNaN(parsedEndAt.getTime()) || parsedEndAt <= parsedStartAt) {
      return res.status(400).json({ error: 'End date/time must be after start date/time' });
    }

    const tz = typeof timezone === 'string' && timezone.trim() ? timezone.trim() : 'Asia/Kolkata';
    const normalizedRecurrence = normalizeRecurrence(recurrence, parsedStartAt);

    const reminder = await Reminder.findByIdAndUpdate(
      req.params.id,
      {
        title: String(title),
        description: typeof description === 'string' ? description : '',
        // Keep legacy date/time populated for compatibility (startAt-derived).
        date: parsedStartAt,
        time: String(time || formatHHmmInTimeZone(parsedStartAt, tz)),
        startAt: parsedStartAt,
        endAt: parsedEndAt,
        timezone: tz,
        recurrence: normalizedRecurrence === undefined ? null : normalizedRecurrence,
        priority: allowedPriority.includes(priority) ? priority : 'medium',
        category: allowedCategory.includes(category) ? category : 'Personal',
        status: allowedStatus.includes(status) ? status : 'open',
        comments: typeof comments === 'string' ? comments : ''
      },
      { new: true }
    );

    if (!reminder) return res.status(404).json({ error: 'Reminder not found' });
    res.json(reminder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/reminders/:id - delete reminder
router.delete('/:id', async (req, res) => {
  try {
    const reminder = await Reminder.findByIdAndDelete(req.params.id);
    if (!reminder) return res.status(404).json({ error: 'Reminder not found' });
    res.json({ message: 'Reminder deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
