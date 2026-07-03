const LAST_LECTURE_KEY = 'heerme_last_lecture_fields';

export function extractLectureFieldOptions(lectures) {
  const semesters = new Set();
  const classes = new Set();
  const divisions = new Set();
  const subjects = new Set();
  const academicYears = new Set();
  const deliveryMethods = new Set();
  for (const l of lectures || []) {
    if (l.academicYear) academicYears.add(l.academicYear);
    if (l.className) classes.add(l.className);
    if (l.semester) semesters.add(l.semester);
    if (l.subject) subjects.add(l.subject);
    if (l.deliveryMethod) deliveryMethods.add(l.deliveryMethod);
    const divs = l.divisions?.length ? l.divisions : l.division ? [l.division] : [];
    for (const d of divs) if (d) divisions.add(String(d).toUpperCase());
  }
  const sort = (arr) => [...arr].sort((a, b) => a.localeCompare(b));
  return {
    academicYears: sort(academicYears),
    classes: sort(classes),
    semesters: sort(semesters),
    divisions: sort(divisions),
    subjects: sort(subjects),
    deliveryMethods: sort(deliveryMethods)
  };
}

export function loadLastLectureFields() {
  try {
    const raw = localStorage.getItem(LAST_LECTURE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return null;
    return o;
  } catch {
    return null;
  }
}

export function saveLastLectureFields(fields) {
  try {
    localStorage.setItem(
      LAST_LECTURE_KEY,
      JSON.stringify({
        academicYear: fields.academicYear || '',
        className: fields.className || '',
        divisions: fields.divisions || '',
        subject: fields.subject || '',
        semester: fields.semester || '',
        deliveryMethod: fields.deliveryMethod || ''
      })
    );
  } catch {
    /* ignore */
  }
}
