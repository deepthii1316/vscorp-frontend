// lib/email/reebokExcel.js
// Reebok Sales — styled Excel workbook builder (shared by the download route and the email sender).
//
// Every table is rendered from the SAME model as the on-screen report
// (lib/email/reebokReportModel.js), so rows, columns, formulas and colours
// stay identical between the page and the download.
//
// Sheets: Cover, Daywise MTD YTD, Staff KPI, Staff FW APP ACC, Gender Wise,
//         Division Wise, Gender Division Split.

import { buildReportModel, heatColor, ZEBRA, TOTAL_BG } from './reebokReportModel';

const STORE     = 'R1157';
const STORE_NM = 'Uppal Reebok';

// ─── Style helpers ────────────────────────────────────────────────────────
const FONT_NAME = 'Inter';
const font = (bold, size, color) => ({ name: FONT_NAME, bold, size, color: { argb: `FF${color}` } });
const fill = (rgb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${rgb}` } });
const thin = { style: 'thin', color: { argb: 'FFB8C0CC' } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

const NUM_FMT = { inr: '₹#,##0', int: '#,##0', dec: '0.00', pct: '0.0%', ach: '0.0%' };

/** Excel value for a model cell (percent units → fraction for % formats). */
function excelValue(c) {
  if (c.t === 'text') return c.v;
  if (c.t === 'empty' || c.v == null || c.v === '') return null;
  const v = Number(c.v);
  if (Number.isNaN(v)) return null;
  return c.t === 'pct' || c.t === 'ach' ? v / 100 : v;
}

/**
 * Write one model table starting at `startRow`. Returns the next free row.
 * Column A of the model maps to sheet column 1.
 */
function writeTable(ws, startRow, t) {
  // Title
  const titleCell = ws.getCell(startRow, 1);
  titleCell.value = t.title;
  titleCell.font = font(true, 13, '111827');
  ws.getRow(startRow).height = 24;

  // Header row (coloured per column)
  const hr = startRow + 1;
  t.columns.forEach((c, i) => {
    const cellRef = ws.getCell(hr, i + 1);
    cellRef.value = c.label;
    cellRef.font = font(true, 11, 'FFFFFF');
    cellRef.fill = fill(c.tone);
    cellRef.alignment = { horizontal: c.align === 'l' ? 'left' : 'right', vertical: 'middle', wrapText: true };
    cellRef.border = BORDER;
  });
  ws.getRow(hr).height = 26;

  // Body
  let r = hr + 1;
  let zebra = 0;
  for (const row of t.rows) {
    const isTotal = row.kind === 'total';
    const rowBg = isTotal ? TOTAL_BG : ZEBRA[zebra++ % 2];
    row.cells.forEach((c, i) => {
      if (c.merged) return;
      const ref = ws.getCell(r, i + 1);
      ref.value = excelValue(c);
      ref.font = font(isTotal || !!c.rowspan, 11, '111827');
      ref.fill = fill(rowBg);
      ref.border = BORDER;
      ref.alignment = { horizontal: t.columns[i].align === 'l' ? 'left' : 'right', vertical: 'middle' };
      if (NUM_FMT[c.t]) ref.numFmt = NUM_FMT[c.t];
      if (c.t === 'ach') {
        if (c.heat !== undefined) { ref.fill = fill(heatColor(c.heat)); ref.font = font(true, 11, '111827'); }   // relative colour: lowest red, highest green
      }
      if (c.rowspan) {
        ws.mergeCells(r, i + 1, r + c.rowspan - 1, i + 1);
        ref.fill = fill('F6F7F9');
        ref.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    });
    ws.getRow(r).height = 20;
    r++;
  }

  // Footnotes
  for (const note of t.footnotes || []) {
    const ref = ws.getCell(r, 1);
    ref.value = note;
    ref.font = font(false, 9, '6B6B66');
    r++;
  }
  return r + 1; // one blank row between tables
}

function setWidths(ws, first, rest, count) {
  ws.columns = Array.from({ length: count }, (_, i) => ({ width: i === 0 ? first : rest }));
}

function addSheet(wb, name, tables, widths) {
  const ws = wb.addWorksheet(name);
  setWidths(ws, widths.first, widths.rest, widths.count);
  let row = 1;
  for (const t of tables) row = writeTable(ws, row, t);
  return ws;
}

function addCoverSheet(wb, reportDate) {
  const ws = wb.addWorksheet('Cover');
  ws.columns = [{ width: 34 }, { width: 60 }];
  ws.getCell(1, 1).value = `Virata Retail  ·  ${STORE_NM} (${STORE})`;
  ws.getCell(1, 1).font = font(true, 14, '1F2A44');
  ws.getCell(2, 1).value = `Report Date: ${reportDate}  ·  Generated: ${new Date().toLocaleString('en-IN')}`;
  ws.getCell(2, 1).font = font(false, 10, '6B6B66');

  const index = [
    ['Daywise MTD YTD', 'Target, NSV, Achievement %, Bills, Qty — daywise, MTD, YTD'],
    ['Staff KPI', 'Staffwise KPIs — Daywise and MTD, with store total'],
    ['Staff FW APP ACC', 'Per-salesperson footwear / apparel / accessories — Daywise and MTD'],
    ['Gender Wise', 'Qty, NSV and % Mix by gender — Today and MTD'],
    ['Division Wise', 'Qty, NSV and % Mix by division — Today and MTD'],
    ['Gender Division Split', 'Division split within each gender — Today and MTD'],
  ];
  ws.getCell(4, 1).value = 'SHEET';       ws.getCell(4, 2).value = 'CONTENTS';
  [1, 2].forEach((c) => { const ref = ws.getCell(4, c); ref.font = font(true, 11, 'FFFFFF'); ref.fill = fill('1F2A44'); ref.border = BORDER; });
  index.forEach(([name, desc], i) => {
    const r = 5 + i;
    ws.getCell(r, 1).value = name; ws.getCell(r, 2).value = desc;
    [1, 2].forEach((c) => { const ref = ws.getCell(r, c); ref.font = font(c === 1, 11, '111827'); ref.fill = fill(ZEBRA[i % 2]); ref.border = BORDER; });
  });
  return ws;
}

// ─── Public: build the workbook for a date ────────────────────────────────

/**
 * Fetch the report data and build the workbook.
 * Falls back to the latest available date if the requested date has no data.
 * Returns { buffer, reportDate, filename }.
 */
export async function buildReebokWorkbook(supabase, dateParam = null) {
  let reportDate = dateParam || (() => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  })();

  // Verify date exists; fall back to latest
  const { data: dateCheck } = await supabase
    .schema('gold').from('reebok_daily_metrics')
    .select('full_date').eq('site_short_name', STORE)
    .eq('period_type', 'today').eq('full_date', reportDate).limit(1).maybeSingle();

  if (!dateCheck) {
    const { data: latest } = await supabase
      .schema('gold').from('reebok_daily_metrics')
      .select('full_date').eq('site_short_name', STORE).eq('period_type', 'today')
      .lte('full_date', reportDate).order('full_date', { ascending: false }).limit(1);
    if (latest?.[0]?.full_date) reportDate = latest[0].full_date;
  }

  const [{ data: daywiseRows }, { data: staffRows }, { data: catRows }, { data: gdRows }] =
    await Promise.all([
      supabase.rpc('rpt_reebok_daywise',         { p_date: reportDate }),
      supabase.rpc('rpt_reebok_staffwise',       { p_date: reportDate }),
      supabase.rpc('rpt_reebok_category',        { p_date: reportDate }),
      supabase.rpc('rpt_reebok_gender_division',  { p_date: reportDate }),
    ]);

  // Same table models as the on-screen report.
  const [daywise, staffToday, staffMtd, catToday, catMtd, genderWise, divisionWise, split] = buildReportModel({
    reportDate,
    daywiseRows: daywiseRows || [],
    staffRows: staffRows || [],
    catRows: catRows || [],
    gdRows: gdRows || [],
  });

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator  = 'Virata Retail';
  wb.created  = new Date();
  wb.modified = new Date();

  addCoverSheet(wb, reportDate);
  addSheet(wb, 'Daywise MTD YTD',       [daywise],                { first: 26, rest: 22, count: 4 });
  addSheet(wb, 'Staff KPI',             [staffToday, staffMtd],   { first: 24, rest: 15, count: 13 });
  addSheet(wb, 'Staff FW APP ACC',      [catToday, catMtd],       { first: 24, rest: 16, count: 8 });
  addSheet(wb, 'Gender Wise',           [genderWise],             { first: 20, rest: 15, count: 7 });
  addSheet(wb, 'Division Wise',         [divisionWise],           { first: 20, rest: 15, count: 7 });
  addSheet(wb, 'Gender Division Split', [split],                  { first: 16, rest: 18, count: 7 });

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, reportDate, filename: `Virata_Retail_Reebok_Sales_${reportDate}.xlsx` };
}
