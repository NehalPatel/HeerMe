import express from 'express';
import AcademicLecture from '../models/AcademicLecture.js';
import { isYmd, trimStr } from '../utils/validation.js';
import { lectureDivisions, parseDivisionsInput } from '../utils/lectureDivisions.js';
import { normalizeLectureTimes } from '../utils/lectureTimes.js';

const router = express.Router();

function parseOptionalStudentCount(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function serialize(doc) {
  const o = doc.toObject();
  const divisions = lectureDivisions(o);
  const times = normalizeLectureTimes(o.startTime, o.endTime);
  return {
    ...o,
    id: String(o._id),
    divisions,
    division: divisions[0] || o.division || '',
    startTime: times.startTime,
    endTime: times.endTime,
    numberOfStudents: o.numberOfStudents ?? null
  };
}

function buildListFilter(query) {
  const filter = {};
  const ay = trimStr(query.academicYear);
  const cn = trimStr(query.className);
  const div = trimStr(query.division);
  const sub = trimStr(query.subject);
  const from = trimStr(query.from);
  const to = trimStr(query.to);
  if (ay) filter.academicYear = ay;
  if (cn) filter.className = cn;
  if (div) {
    Object.assign(filter, {
      $or: [{ division: div.toUpperCase() }, { divisions: div.toUpperCase() }]
    });
  }
  if (sub) filter.subject = sub;
  if (from || to) {
    filter.lectureDate = {};
    if (from) {
      if (!isYmd(from)) throw new Error('from must be YYYY-MM-DD');
      filter.lectureDate.$gte = from;
    }
    if (to) {
      if (!isYmd(to)) throw new Error('to must be YYYY-MM-DD');
      filter.lectureDate.$lte = to;
    }
  }
  return filter;
}

router.get('/', async (req, res) => {
  try {
    const filter = buildListFilter(req.query);
    const rows = await AcademicLecture.find(filter).sort({ lectureDate: 1, startTime: 1, createdAt: 1 });
    res.json(rows.map(serialize));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const academicYear = trimStr(body.academicYear);
    const className = trimStr(body.className);
    const subject = trimStr(body.subject);
    const lectureDate = trimStr(body.lectureDate);
    const topic = trimStr(body.topic);
    const divisions = parseDivisionsInput(body.divisions ?? body.division);

    if (!academicYear || !className || !divisions.length || !subject || !lectureDate || !topic) {
      return res.status(400).json({
        error: 'academicYear, className, at least one division, subject, lectureDate, and topic are required'
      });
    }
    if (!isYmd(lectureDate)) {
      return res.status(400).json({ error: 'lectureDate must be YYYY-MM-DD' });
    }

    const times = normalizeLectureTimes(body.startTime, body.endTime);

    const doc = await AcademicLecture.create({
      academicYear,
      className,
      division: divisions[0],
      divisions,
      subject,
      semester: trimStr(body.semester),
      lectureDate,
      startTime: times.startTime,
      endTime: times.endTime,
      unitNoAndName: trimStr(body.unitNoAndName),
      topic,
      reference: trimStr(body.reference),
      deliveryMethod: trimStr(body.deliveryMethod),
      numberOfStudents: parseOptionalStudentCount(body.numberOfStudents),
      remarks: trimStr(body.remarks),
      updatedAt: new Date()
    });
    res.status(201).json(serialize(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const body = req.body || {};
    const updates = { updatedAt: new Date() };
    const fields = [
      'academicYear',
      'className',
      'subject',
      'semester',
      'lectureDate',
      'unitNoAndName',
      'topic',
      'reference',
      'deliveryMethod',
      'remarks'
    ];
    for (const f of fields) {
      if (body[f] !== undefined) updates[f] = trimStr(body[f]);
    }
    if (body.divisions !== undefined || body.division !== undefined) {
      const divisions = parseDivisionsInput(body.divisions ?? body.division);
      if (!divisions.length) {
        return res.status(400).json({ error: 'At least one division is required' });
      }
      updates.divisions = divisions;
      updates.division = divisions[0];
    }
    if (updates.lectureDate && !isYmd(updates.lectureDate)) {
      return res.status(400).json({ error: 'lectureDate must be YYYY-MM-DD' });
    }
    if (body.startTime !== undefined || body.endTime !== undefined) {
      const current = await AcademicLecture.findById(req.params.id);
      if (!current) return res.status(404).json({ error: 'Lecture not found' });
      const times = normalizeLectureTimes(
        body.startTime !== undefined ? trimStr(body.startTime) : current.startTime,
        body.endTime !== undefined ? trimStr(body.endTime) : current.endTime
      );
      updates.startTime = times.startTime;
      updates.endTime = times.endTime;
    }
    if (body.numberOfStudents !== undefined) {
      updates.numberOfStudents = parseOptionalStudentCount(body.numberOfStudents);
    }
    const doc = await AcademicLecture.findByIdAndUpdate(req.params.id, { $set: updates }, {
      new: true,
      runValidators: true
    });
    if (!doc) return res.status(404).json({ error: 'Lecture not found' });
    res.json(serialize(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const doc = await AcademicLecture.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Lecture not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
