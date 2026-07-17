import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PizZip from 'pizzip';
import AcademicLecture from '../models/AcademicLecture.js';
import { formatCompletedOn, formatDisplayDate } from '../utils/biMonthlyPeriods.js';
import { formatLectureTimeRange, formatTimeForExport } from '../utils/lectureTimes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(__dirname, '../docs/session-plan-template.docx');

function xmlEscape(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textRun(text) {
  const t = String(text ?? '');
  const space = /^\s|\s$/.test(t) ? ' xml:space="preserve"' : '';
  return `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t${space}>${xmlEscape(t)}</w:t></w:r>`;
}

function cellPara(text, center = false) {
  const jc = center ? '<w:jc w:val="center"/>' : '';
  return `<w:p><w:pPr>${jc}<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>${textRun(text)}</w:p>`;
}

function tableCell(width, text, center = false) {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${cellPara(text, center)}</w:tc>`;
}

function textRunBold(text) {
  const t = String(text ?? '');
  const space = /^\s|\s$/.test(t) ? ' xml:space="preserve"' : '';
  return `<w:r w:rsidRPr="009B382F"><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t${space}>${xmlEscape(t)}</w:t></w:r>`;
}

function headerPara(text) {
  return `<w:p w:rsidR="00480507" w:rsidRPr="009B382F" w:rsidRDefault="00480507" w:rsidP="00480507"><w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>${textRunBold(text)}</w:p>`;
}

function headerCell(width, text, extraParas = []) {
  const paras = [headerPara(text), ...extraParas.map(headerPara)].join('');
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:shd w:val="pct12" w:color="auto" w:fill="auto"/><w:vAlign w:val="center"/></w:tcPr>${paras}</w:tc>`;
}

const COL_WIDTHS = [900, 2000, 2000, 1800, 1400, 1400, 1000, 1200, 1538];
const TABLE_WIDTH = COL_WIDTHS.reduce((sum, w) => sum + w, 0);

const HEADER_LABELS = [
  { text: 'Session', extra: ['No'] },
  { text: 'Unit No & Name' },
  { text: 'Topic' },
  { text: 'Reference' },
  { text: 'Delivery Method (PPT/Demo)' },
  { text: 'Completed On' },
  { text: 'Room No' },
  { text: 'Time' },
  { text: 'No.of students present' }
];

function buildHeaderRow() {
  const cells = HEADER_LABELS.map((label, i) =>
    headerCell(COL_WIDTHS[i], label.text, label.extra || [])
  );
  return `<w:tr w:rsidR="00480507" w:rsidTr="00A74CDE">${cells.join('')}</w:tr>`;
}

function buildTblGrid() {
  return `<w:tblGrid>${COL_WIDTHS.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
}

function formatStudentsPresent(value) {
  if (value === null || value === undefined || value === '') return '';
  return String(value);
}

function buildDataRow(row) {
  const vals = [
    String(row.sessionNo ?? ''),
    row.unitNoAndName || '',
    row.topic || '',
    row.reference || '',
    row.deliveryMethod || '',
    formatCompletedOn(row.completedOn) || '',
    row.roomNo || '',
    formatTimeForExport(row.time),
    formatStudentsPresent(row.studentsPresent)
  ];
  const cells = vals.map((v, i) => tableCell(COL_WIDTHS[i], v, i === 0));
  return `<w:tr w:rsidR="00480507" w:rsidTr="00A74CDE">${cells.join('')}</w:tr>`;
}

function fillPlaceholders(xml, values) {
  let out = xml;
  for (const [key, value] of Object.entries(values)) {
    out = out.split(`{${key}}`).join(xmlEscape(value ?? ''));
  }
  return out;
}

function patchHeader(xml, plan) {
  return fillPlaceholders(xml, {
    'academic-year': plan.academicYear || '',
    'from-date': formatDisplayDate(plan.periodFrom),
    'to-date': formatDisplayDate(plan.periodTo),
    'class-name': plan.className || '',
    division: plan.division || '',
    'subject-name': plan.subject || ''
  });
}

function patchFooter(xml, plan) {
  return fillPlaceholders(xml, {
    'user-name': plan.facultyName || 'Nehal Patel',
    today: formatCompletedOn(plan.submissionDate) || formatCompletedOn(new Date().toISOString().slice(0, 10))
  });
}

function patchDocument(xml, rows) {
  const tableMatch = xml.match(/<w:tbl>([\s\S]*?)<\/w:tbl>/);
  if (!tableMatch) throw new Error('Table not found in session plan template');
  const inner = tableMatch[1];
  const tblPr = inner.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/)?.[0] || '';
  const tblPrWithWidth = tblPr.replace(/<w:tblW[^/]*\/>/, `<w:tblW w:w="${TABLE_WIDTH}" w:type="dxa"/>`);
  const dataRows = (rows || []).map(buildDataRow).join('');
  const newTable = `<w:tbl>${tblPrWithWidth}${buildTblGrid()}${buildHeaderRow()}${dataRows}</w:tbl>`;
  return xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/, newTable);
}

async function enrichExportRows(rows) {
  const ids = [...new Set((rows || []).map((r) => r.lectureId).filter(Boolean))];
  const lectures = ids.length ? await AcademicLecture.find({ _id: { $in: ids } }) : [];
  const byId = new Map(lectures.map((l) => [String(l._id), l]));

  return (rows || []).map((row) => {
    const plain = row?.toObject ? row.toObject() : row;
    const lec = plain.lectureId ? byId.get(String(plain.lectureId)) : null;
    return {
      ...plain,
      roomNo: plain.roomNo || lec?.roomNo || '',
      time: plain.time || (lec ? formatLectureTimeRange(lec.startTime, lec.endTime) : ''),
      studentsPresent: plain.studentsPresent ?? lec?.numberOfStudents ?? null
    };
  });
}

function slugPart(s) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '');
}

function formatDateSlug(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
  const [y, m, d] = ymd.split('-');
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${d}${months[Number(m) - 1]}`;
}

export function buildDownloadFilename(plan) {
  // SDJIC__SessionPlan__AY_2026-27__{class}__{semester}__{division}__{SubjectWithoutSpaces}__NehalPatel__01JUL_15JUL
  const parts = [
    'SDJIC',
    'SessionPlan',
    `AY_${slugPart(plan.academicYear)}`,
    slugPart(plan.className),
    slugPart(plan.semester),
    slugPart(plan.division),
    slugPart(plan.subject),
    'NehalPatel',
    `${formatDateSlug(plan.periodFrom)}_${formatDateSlug(plan.periodTo)}`
  ];
  return `${parts.join('__')}.docx`;
}

export async function buildSessionPlanDocx(plan) {
  const templateBuf = fs.readFileSync(TEMPLATE_PATH);
  const zip = new PizZip(templateBuf);

  const headerFile = zip.file('word/header1.xml');
  const footerFile = zip.file('word/footer1.xml');
  const documentFile = zip.file('word/document.xml');
  if (!headerFile || !footerFile || !documentFile) {
    throw new Error('Invalid session plan template structure');
  }

  const headerXml = patchHeader(headerFile.asText(), plan);
  const footerXml = patchFooter(footerFile.asText(), plan);
  const exportRows = await enrichExportRows(plan.rows || []);
  const documentXml = patchDocument(documentFile.asText(), exportRows);

  zip.file('word/header1.xml', headerXml);
  zip.file('word/footer1.xml', footerXml);
  zip.file('word/document.xml', documentXml);

  return zip.generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}
