import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PizZip from 'pizzip';
import { formatCompletedOn, formatDisplayDate } from '../utils/biMonthlyPeriods.js';

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

const COL_WIDTHS = [1008, 2555, 2575, 2250, 1620, 1800, 2430];

function buildDataRow(row) {
  const vals = [
    String(row.sessionNo ?? ''),
    row.unitNoAndName || '',
    row.topic || '',
    row.reference || '',
    row.deliveryMethod || '',
    formatCompletedOn(row.completedOn) || '',
    row.remarks || ''
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
  const tblGrid = inner.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/)?.[0] || '';
  const trRows = inner.match(/<w:tr[\s\S]*?<\/w:tr>/g) || [];
  const headerRow = trRows[0] || '';
  const dataRows = (rows || []).map(buildDataRow).join('');
  const newTable = `<w:tbl>${tblPr}${tblGrid}${headerRow}${dataRows}</w:tbl>`;
  return xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/, newTable);
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
  const documentXml = patchDocument(documentFile.asText(), plan.rows || []);

  zip.file('word/header1.xml', headerXml);
  zip.file('word/footer1.xml', footerXml);
  zip.file('word/document.xml', documentXml);

  return zip.generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}
