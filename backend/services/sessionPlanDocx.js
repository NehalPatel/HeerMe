import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PizZip from 'pizzip';
import AcademicLecture from '../models/AcademicLecture.js';
import { formatCompletedOn, formatDisplayDate } from '../utils/biMonthlyPeriods.js';
import { formatLectureTimeRange } from '../utils/lectureTimes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(__dirname, '../templates/session-plan-template.docx');

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
    row.time || '',
    formatStudentsPresent(row.studentsPresent)
  ];
  const cells = vals.map((v, i) => tableCell(COL_WIDTHS[i], v, i === 0));
  return `<w:tr w:rsidR="00480507" w:rsidTr="00A74CDE">${cells.join('')}</w:tr>`;
}

function headerTextRun(text, size = 20) {
  const t = String(text ?? '');
  const space = /^\s|\s$/.test(t) ? ' xml:space="preserve"' : '';
  return `<w:r w:rsidRPr="009B382F"><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:sz w:val="${size}"/><w:szCs w:val="28"/></w:rPr><w:t${space}>${xmlEscape(t)}</w:t></w:r>`;
}

function patchHeader(xml, plan) {
  const classLabel = plan.division ? `${plan.className}-${plan.division}` : plan.className;
  const periodLine = `For the Period <${formatDisplayDate(plan.periodFrom)}> To <${formatDisplayDate(plan.periodTo)}>`;
  let out = xml;

  out = out.replace(/: 2025-26 /g, `: ${xmlEscape(plan.academicYear)} `);

  // Period dates are split across many <w:r> runs in the template; replace the whole paragraph.
  out = out.replace(
    /<w:p w:rsidR="009B382F" w:rsidRPr="009B382F" w:rsidRDefault="009B382F" w:rsidP="009B382F"><w:pPr><w:pStyle w:val="Header"\/><w:rPr>[\s\S]*?<\/w:pPr>[\s\S]*?For the Period[\s\S]*?<\/w:p>/,
    `<w:p w:rsidR="009B382F" w:rsidRPr="009B382F" w:rsidRDefault="009B382F" w:rsidP="009B382F"><w:pPr><w:pStyle w:val="Header"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:sz w:val="20"/><w:szCs w:val="28"/></w:rPr></w:pPr>${headerTextRun(periodLine)}</w:p>`
  );

  // Class label spans two runs (TYBCA- + F); merge into one well-formed run.
  out = out.replace(
    /<w:r w:rsidR="00480507"><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"\/><w:b\/><w:sz w:val="28"\/><w:szCs w:val="28"\/><\/w:rPr><w:t>TYBCA-<\/w:t><\/w:r><w:r w:rsidR="003C3537"><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"\/><w:b\/><w:sz w:val="28"\/><w:szCs w:val="28"\/><\/w:rPr><w:t>F<\/w:t><\/w:r>/,
    `<w:r w:rsidR="00480507"><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t>${xmlEscape(classLabel)}</w:t></w:r>`
  );

  out = out.replace(
    /<w:t xml:space="preserve"> Advance Web Designing<\/w:t>/,
    `<w:t xml:space="preserve"> ${xmlEscape(plan.subject)}</w:t>`
  );
  return out;
}

function patchFooter(xml, plan) {
  let out = xml;
  out = out.replace(/<w:t>Nehal Patel<\/w:t>/, `<w:t>${xmlEscape(plan.facultyName || '')}</w:t>`);
  out = out.replace(
    /Date of Submission:\s*30\/06\/2025/,
    `Date of Submission:  ${xmlEscape(formatCompletedOn(plan.submissionDate) || '')}`
  );
  return out;
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
  const parts = [
    'SDJIC',
    'SessionPlan',
    `AY_${slugPart(plan.academicYear)}`,
    slugPart(plan.className),
    slugPart(plan.semester),
    slugPart(plan.division),
    slugPart(plan.subject),
    slugPart(plan.facultyName),
    `${formatDateSlug(plan.periodFrom)}_${formatDateSlug(plan.periodTo)}`
  ].filter(Boolean);
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
