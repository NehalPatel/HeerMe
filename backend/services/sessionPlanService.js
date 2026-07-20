import AcademicLecture from '../models/AcademicLecture.js';
import SessionPlan from '../models/SessionPlan.js';
import { divisionLectureFilter, lectureDivisions } from '../utils/lectureDivisions.js';
import { formatLectureTimeRange, normalizeLectureTimes } from '../utils/lectureTimes.js';

function lectureToRow(lecture, sessionNo) {
  const times = normalizeLectureTimes(lecture.startTime, lecture.endTime);
  return {
    sessionNo,
    unitNoAndName: lecture.unitNoAndName || '',
    topic: lecture.topic || '',
    reference: lecture.reference || '',
    deliveryMethod: lecture.deliveryMethod || '',
    completedOn: lecture.lectureDate || '',
    roomNo: lecture.roomNo || '',
    time: formatLectureTimeRange(times.startTime, times.endTime),
    studentsPresent: lecture.numberOfStudents ?? null,
    lectureId: lecture._id
  };
}

function rowsEqualForLecture(saved, generated) {
  return (
    saved.unitNoAndName === generated.unitNoAndName &&
    saved.topic === generated.topic &&
    saved.reference === generated.reference &&
    saved.deliveryMethod === generated.deliveryMethod &&
    saved.completedOn === generated.completedOn &&
    saved.roomNo === generated.roomNo &&
    saved.time === generated.time &&
    saved.studentsPresent === generated.studentsPresent
  );
}

/**
 * Merge generated rows with existing saved rows, preserving manual edits.
 */
function mergeRows(existingRows, generatedRows) {
  const byLectureId = new Map();
  for (const row of existingRows) {
    if (row.lectureId) byLectureId.set(String(row.lectureId), row);
  }

  return generatedRows.map((gen) => {
    const lid = gen.lectureId ? String(gen.lectureId) : null;
    if (lid && byLectureId.has(lid)) {
      const saved = byLectureId.get(lid);
      const savedPlain = {
        unitNoAndName: saved.unitNoAndName || '',
        topic: saved.topic || '',
        reference: saved.reference || '',
        deliveryMethod: saved.deliveryMethod || '',
        completedOn: saved.completedOn || '',
        roomNo: saved.roomNo || '',
        time: saved.time || '',
        studentsPresent: saved.studentsPresent ?? null
      };
      if (!rowsEqualForLecture(savedPlain, gen)) {
        return {
          sessionNo: gen.sessionNo,
          unitNoAndName: saved.unitNoAndName || '',
          topic: saved.topic || '',
          reference: saved.reference || '',
          deliveryMethod: saved.deliveryMethod || '',
          completedOn: saved.completedOn || gen.completedOn,
          roomNo: saved.roomNo || '',
          time: saved.time || '',
          studentsPresent: saved.studentsPresent ?? gen.studentsPresent,
          lectureId: gen.lectureId
        };
      }
    }
    return gen;
  });
}

export async function generateSessionPlan({
  academicYear,
  className,
  division,
  subject,
  periodFrom,
  periodTo,
  semester = ''
}) {
  const lectures = await AcademicLecture.find({
    academicYear,
    className,
    subject,
    lectureDate: { $gte: periodFrom, $lte: periodTo },
    status: { $ne: 'cancelled' },
    ...divisionLectureFilter(division)
  }).sort({ lectureDate: 1, startTime: 1, createdAt: 1 });

  const generatedRows = lectures.map((lec, i) => lectureToRow(lec, i + 1));

  const existing = await SessionPlan.findOne({
    academicYear,
    className,
    division,
    subject,
    periodFrom,
    periodTo
  });

  const mergedRows = existing ? mergeRows(existing.rows, generatedRows) : generatedRows;
  const renumbered = mergedRows.map((r, i) => ({ ...r, sessionNo: i + 1 }));

  const resolvedSemester = semester || existing?.semester || lectures.find((l) => l.semester)?.semester || '';

  if (existing) {
    existing.rows = renumbered;
    existing.semester = resolvedSemester;
    if (!existing.submissionDate) existing.submissionDate = periodTo;
    existing.updatedAt = new Date();
    await existing.save();
    return existing;
  }

  const plan = await SessionPlan.create({
    academicYear,
    className,
    division,
    subject,
    semester: resolvedSemester,
    periodFrom,
    periodTo,
    facultyName: '',
    submissionDate: periodTo,
    rows: renumbered,
    status: 'draft',
    updatedAt: new Date()
  });
  return plan;
}

export async function generateSessionPlansBulk({
  academicYear,
  className,
  periodFrom,
  periodTo,
  semester = '',
  facultyName = ''
}) {
  const lectures = await AcademicLecture.find({
    academicYear,
    className,
    lectureDate: { $gte: periodFrom, $lte: periodTo },
    status: { $ne: 'cancelled' }
  }).sort({ division: 1, subject: 1, lectureDate: 1 });

  const combos = new Map();
  for (const lec of lectures) {
    const divs = lectureDivisions(lec);
    for (const div of divs) {
      const key = `${div}|||${lec.subject}`;
      if (!combos.has(key)) {
        combos.set(key, { division: div, subject: lec.subject, semester: lec.semester || '' });
      }
    }
  }

  const plans = [];
  for (const combo of combos.values()) {
    const plan = await generateSessionPlan({
      academicYear,
      className,
      division: combo.division,
      subject: combo.subject,
      periodFrom,
      periodTo,
      semester: semester || combo.semester
    });
    if (facultyName && !plan.facultyName) {
      plan.facultyName = facultyName;
      await plan.save();
    }
    plans.push(plan);
  }

  return plans.map(serializeSessionPlan);
}

export function serializeSessionPlan(doc) {
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    ...o,
    id: String(o._id),
    rows: (o.rows || []).map((r) => ({
      ...r,
      id: r._id ? String(r._id) : undefined,
      lectureId: r.lectureId ? String(r.lectureId) : null
    }))
  };
}
