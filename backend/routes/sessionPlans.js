import express from 'express';
import SessionPlan from '../models/SessionPlan.js';
import { generateSessionPlan, generateSessionPlansBulk, serializeSessionPlan } from '../services/sessionPlanService.js';
import { buildSessionPlanDocx, buildDownloadFilename } from '../services/sessionPlanDocx.js';
import { getBiMonthlyPeriods } from '../utils/biMonthlyPeriods.js';
import { isYmd, trimStr } from '../utils/validation.js';

const router = express.Router();

function parseOptionalCount(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

router.get('/periods', (req, res) => {
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (!Number.isInteger(year) || year < 2000 || !Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'year and month (1-12) are required' });
  }
  res.json(getBiMonthlyPeriods(year, month));
});

router.get('/', async (req, res) => {
  try {
    const filter = {};
    for (const key of ['academicYear', 'className', 'division', 'subject']) {
      const v = trimStr(req.query[key]);
      if (v) filter[key] = v;
    }
    const rows = await SessionPlan.find(filter).sort({ periodFrom: -1, updatedAt: -1 });
    res.json(rows.map(serializeSessionPlan));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/generate-bulk', async (req, res) => {
  try {
    const body = req.body || {};
    const academicYear = trimStr(body.academicYear);
    const className = trimStr(body.className);
    const periodFrom = trimStr(body.periodFrom);
    const periodTo = trimStr(body.periodTo);

    if (!academicYear || !className || !periodFrom || !periodTo) {
      return res.status(400).json({
        error: 'academicYear, className, periodFrom, and periodTo are required'
      });
    }
    if (!isYmd(periodFrom) || !isYmd(periodTo) || periodFrom > periodTo) {
      return res.status(400).json({ error: 'periodFrom and periodTo must be valid YYYY-MM-DD with from <= to' });
    }

    const plans = await generateSessionPlansBulk({
      academicYear,
      className,
      periodFrom,
      periodTo,
      semester: trimStr(body.semester),
      facultyName: trimStr(body.facultyName)
    });
    res.json({ plans, count: plans.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/generate', async (req, res) => {
  try {
    const body = req.body || {};
    const academicYear = trimStr(body.academicYear);
    const className = trimStr(body.className);
    const division = trimStr(body.division);
    const subject = trimStr(body.subject);
    const periodFrom = trimStr(body.periodFrom);
    const periodTo = trimStr(body.periodTo);

    if (!academicYear || !className || !division || !subject || !periodFrom || !periodTo) {
      return res.status(400).json({
        error: 'academicYear, className, division, subject, periodFrom, and periodTo are required'
      });
    }
    if (!isYmd(periodFrom) || !isYmd(periodTo) || periodFrom > periodTo) {
      return res.status(400).json({ error: 'periodFrom and periodTo must be valid YYYY-MM-DD with from <= to' });
    }

    const plan = await generateSessionPlan({
      academicYear,
      className,
      division,
      subject,
      periodFrom,
      periodTo,
      semester: trimStr(body.semester)
    });
    res.json(serializeSessionPlan(plan));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/download', async (req, res) => {
  try {
    const plan = await SessionPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Session plan not found' });
    const buffer = await buildSessionPlanDocx(plan);
    const filename = buildDownloadFilename(plan);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const plan = await SessionPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Session plan not found' });
    res.json(serializeSessionPlan(plan));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const body = req.body || {};
    const plan = await SessionPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Session plan not found' });

    if (body.facultyName !== undefined) plan.facultyName = trimStr(body.facultyName);
    if (body.submissionDate !== undefined) {
      const sd = trimStr(body.submissionDate);
      if (sd && !isYmd(sd)) return res.status(400).json({ error: 'submissionDate must be YYYY-MM-DD' });
      plan.submissionDate = sd;
    }
    if (body.semester !== undefined) plan.semester = trimStr(body.semester);
    if (body.status !== undefined) {
      if (!['draft', 'final'].includes(body.status)) {
        return res.status(400).json({ error: 'status must be draft or final' });
      }
      plan.status = body.status;
    }
    if (Array.isArray(body.rows)) {
      plan.rows = body.rows.map((r, i) => ({
        sessionNo: Number(r.sessionNo) || i + 1,
        unitNoAndName: trimStr(r.unitNoAndName),
        topic: trimStr(r.topic),
        reference: trimStr(r.reference),
        deliveryMethod: trimStr(r.deliveryMethod),
        completedOn: trimStr(r.completedOn),
        roomNo: trimStr(r.roomNo),
        time: trimStr(r.time),
        studentsPresent: parseOptionalCount(r.studentsPresent),
        remarks: trimStr(r.remarks),
        lectureId: r.lectureId || null
      }));
    }
    plan.updatedAt = new Date();
    await plan.save();
    res.json(serializeSessionPlan(plan));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
