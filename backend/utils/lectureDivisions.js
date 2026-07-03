export function parseDivisionsInput(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((d) => String(d || '').trim().toUpperCase()).filter(Boolean))];
  }
  const raw = String(value || '').trim();
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(/[,+/|&\s]+/)
        .map((d) => d.trim().toUpperCase())
        .filter(Boolean)
    )
  ];
}

export function lectureDivisions(lecture) {
  if (Array.isArray(lecture?.divisions) && lecture.divisions.length) {
    return lecture.divisions.map((d) => String(d).trim().toUpperCase()).filter(Boolean);
  }
  const single = String(lecture?.division || '').trim().toUpperCase();
  return single ? [single] : [];
}

export function divisionLectureFilter(division) {
  const div = String(division || '').trim().toUpperCase();
  return {
    $or: [{ division: div }, { divisions: div }]
  };
}
