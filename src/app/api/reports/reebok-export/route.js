// app/api/reports/reebok-export/route.js
// Reebok Sales — beautifully styled Excel export
//
// 7-sheet workbook: Cover, Daywise MTD, Staff KPI, staff/category, division,
// gender, and gender/division detail sheets.
// - Branded green title bar, white header row, colour-coded Achievement %
// - Alternating row shading, currency formatting, % formatting
// - Numbers stored as true values (no ₹ in cells), footer note

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { calcTarget, calcAchievement, MTD_TARGET } from '@/lib/email/reebokHelpers';

const STORE     = 'R1157';
const STORE_NM = 'Uppal Reebok';

// ─── Colours (no #) ─────────────────────────────────────────────────────
const C = {
  brand:      '1F6B45',   // forest green  – primary
  brandDark:  '143D2A',   // deep forest
  brandLight: 'E4F0E8',   // mint
  headerBg:   '0F2E22',   // deep green
  totalBg:    'F0F4EF',   // light tint
  zebra:      'FAFAF8',   // near-white
  border:     'D0CCC0',   // warm grey
  textDark:   '1A1A1A',
  textMuted:  '6B6B66',
  // Achievement colour scale
  achHigh:    '1F6B45',   // ≥100%
  achGood:    '4FA776',   // ≥80%
  achMid:     'C9972A',   // ≥60%
  achLow:     'C97A1D',   // ≥40%
  achCrit:    'B33A3A',   // <40%
  achBgHigh:  'E4F0E8',
  achBgGood:  'EBF5EE',
  achBgMid:   'FBF0D8',
  achBgLow:   'F9E7D3',
  achBgCrit:  'F5DFDF',
};

// ─── Style helpers (plain objects — ExcelJS reads them directly) ───────────

const font = (name, bold, size, color) => ({ name, bold, size, color: { argb: `FF${color}` } });
const fill  = (rgb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${rgb}` } });
const al    = (h, v) => ({ horizontal: h, vertical: v, wrapText: false });

// Number formats
const FMT_INT   = '#,##0';
const FMT_CUR   = '₹#,##0';
const FMT_PCT   = '0.0%';
const FMT_DEC   = '0.0000';

// ─── Style builders ──────────────────────────────────────────────────────

function titleStyle() {
  return { font: font('Inter', true, 13, 'FFFFFF'), fill: fill(C.brand), alignment: al('left', 'center'), border: { top: { style: 'thin', color: { argb: `FF${C.brand}` } } } };
}
function subtitleStyle() {
  return { font: font('Inter', false, 10, C.textMuted), fill: fill(C.brandLight), alignment: al('left', 'center') };
}
function headerStyle() {
  return { font: font('Inter', true, 11, 'FFFFFF'), fill: fill(C.headerBg), alignment: al('left', 'center'), border: { top: { style: 'thin', color: { argb: `FF${C.border}` } }, bottom: { style: 'medium', color: { argb: `FF${C.headerBg}` } } } };
}
function labelStyle() {
  return { font: font('Inter', true, 11, C.textDark), alignment: al('left', 'center'), border: { bottom: { style: 'hair', color: { argb: `FF${C.border}` } } } };
}
function totalStyle() {
  return { font: font('Inter', true, 11, C.brandDark), fill: fill(C.totalBg), alignment: al('left', 'center'), border: { top: { style: 'thin', color: { argb: `FF${C.brand}` } }, bottom: { style: 'medium', color: { argb: `FF${C.brand}` } } } };
}
function valStyle() {
  return { font: font('Inter', false, 11, C.textDark), alignment: al('right', 'center'), numFmt: FMT_INT, border: { bottom: { style: 'hair', color: { argb: `FF${C.border}` } } } };
}
function valCurStyle() {
  return { font: font('Inter', false, 11, C.brand), alignment: al('right', 'center'), numFmt: FMT_INT, border: { bottom: { style: 'hair', color: { argb: `FF${C.border}` } } } };
}
function valDecStyle() {
  return { font: font('Inter', false, 11, C.textDark), alignment: al('right', 'center'), numFmt: FMT_DEC, border: { bottom: { style: 'hair', color: { argb: `FF${C.border}` } } } };
}
function valPctStyle() {
  return { font: font('Inter', false, 11, C.textDark), alignment: al('right', 'center'), numFmt: FMT_PCT, border: { bottom: { style: 'hair', color: { argb: `FF${C.border}` } } } };
}
function altStyle() {
  return { font: font('Inter', false, 11, C.textDark), fill: fill(C.zebra), alignment: al('right', 'center'), numFmt: FMT_INT, border: { bottom: { style: 'hair', color: { argb: `FF${C.border}` } } } };
}
function altCurStyle() {
  return { font: font('Inter', false, 11, C.brand), fill: fill(C.zebra), alignment: al('right', 'center'), numFmt: FMT_INT, border: { bottom: { style: 'hair', color: { argb: `FF${C.border}` } } } };
}
function altDecStyle() {
  return { font: font('Inter', false, 11, C.textDark), fill: fill(C.zebra), alignment: al('right', 'center'), numFmt: FMT_DEC, border: { bottom: { style: 'hair', color: { argb: `FF${C.border}` } } } };
}
function altLabelStyle() {
  return { font: font('Inter', false, 11, C.textDark), fill: fill(C.zebra), alignment: al('left', 'center') };
}
function achStyle(pct) {
  if (pct == null) return { font: font('Inter', false, 11, C.textMuted), fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F1EC' } }, alignment: al('center', 'center'), numFmt: FMT_PCT, border: { bottom: { style: 'hair', color: { argb: `FF${C.border}` } } } };
  const v = Number(pct);
  let fg, bg;
  if (v >= 100)      { fg = C.achHigh;  bg = C.achBgHigh; }
  else if (v >= 80)  { fg = C.achGood;  bg = C.achBgGood; }
  else if (v >= 60)  { fg = C.achMid;   bg = C.achBgMid;  }
  else if (v >= 40)  { fg = C.achLow;   bg = C.achBgLow;  }
  else               { fg = C.achCrit;   bg = C.achBgCrit; }
  return { font: font('Inter', true, 11, fg), fill: fill(bg), alignment: al('center', 'center'), numFmt: FMT_PCT, border: { bottom: { style: 'hair', color: { argb: `FF${C.border}` } } } };
}
function achCurStyle(pct) {
  if (pct == null) return { font: font('Inter', false, 11, C.textMuted), fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F1EC' } }, alignment: al('right', 'center'), numFmt: FMT_INT, border: { bottom: { style: 'hair', color: { argb: `FF${C.border}` } } } };
  const v = Number(pct);
  let fg, bg;
  if (v >= 100)      { fg = C.achHigh;  bg = C.achBgHigh; }
  else if (v >= 80)  { fg = C.achGood;  bg = C.achBgGood; }
  else if (v >= 60)  { fg = C.achMid;   bg = C.achBgMid;  }
  else if (v >= 40)  { fg = C.achLow;   bg = C.achBgLow;  }
  else               { fg = C.achCrit;   bg = C.achBgCrit; }
  return { font: font('Inter', true, 11, fg), fill: fill(bg), alignment: al('right', 'center'), numFmt: FMT_INT, border: { bottom: { style: 'hair', color: { argb: `FF${C.border}` } } } };
}
function footerStyle() {
  return { font: font('Inter', false, 9, C.textMuted), alignment: al('left', 'center') };
}
function sectionStyle() {
  return { font: font('Inter', true, 10, C.brandDark), fill: fill(C.totalBg), alignment: al('left', 'center'), border: { top: { style: 'thin', color: { argb: `FF${C.border}` } }, bottom: { style: 'thin', color: { argb: `FF${C.border}` } } } };
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function safeNum(v) {
  if (v == null || v === '' || v === '—') return null;
  const f = Number(v);
  return isNaN(f) ? null : f;
}

function fmtINR(n) {
  if (n == null) return null;
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ─── Cell writers ────────────────────────────────────────────────────────

function writeTitle(ws, row, text, startCol = 1) {
  ws.getCell(row, startCol).value = text;
  ws.getCell(row, startCol).style = titleStyle();
  ws.mergeCells(row, startCol, row, startCol + 2);
  ws.getRow(row).height = 32;
}

function writeSubtitle(ws, row, text, startCol = 1) {
  ws.getCell(row, startCol).value = text;
  ws.getCell(row, startCol).style = subtitleStyle();
  ws.mergeCells(row, startCol, row, startCol + 2);
  ws.getRow(row).height = 20;
}

function writeHeader(ws, row, cols, startCol = 1) {
  cols.forEach((h, i) => {
    ws.getCell(row, startCol + i).value = h;
    ws.getCell(row, startCol + i).style = headerStyle();
  });
  ws.getRow(row).height = 26;
}

function writeFooter(ws, row, text, startCol = 1, totalCols = 3) {
  ws.getCell(row, startCol).value = text;
  ws.getCell(row, startCol).style = footerStyle();
  ws.mergeCells(row, startCol, row, startCol + totalCols - 1);
  ws.getRow(row).height = 18;
}

// ─── Sheet 1: Cover ──────────────────────────────────────────────────────

function addCoverSheet(wb, today, mtd, reportDate) {
  const ws = wb.addWorksheet('Cover');
  ws.columns = [
    { key: 'metric', width: 30 },
    { key: 'today',  width: 20 },
    { key: 'mtd',    width: 20 },
  ];

  writeTitle(ws, 1, `Virata Retail  ·  ${STORE_NM} (${STORE})`);
  writeSubtitle(ws, 2, `Report Date: ${reportDate}  ·  Generated: ${new Date().toLocaleString('en-IN')}`);

  writeHeader(ws, 3, ['METRIC', 'TODAY', 'MTD']);

  const rows = [
    { m: 'NSV (Taxable Amount)', t: today.nsv,  x: mtd.nsv,  type: 'cur' },
    { m: 'Bills',                t: today.bills,  x: mtd.bills,  type: 'int' },
    { m: 'Qty Sold',             t: today.qty_sold, x: mtd.qty_sold, type: 'int' },
    { m: 'ATV (NSV / Bills)',   t: today.atv,   x: mtd.atv,   type: 'cur' },
    { m: 'Achievement %',        t: today.achievement_pct, x: mtd.achievement_pct, type: 'ach' },
    { m: 'UPT (Qty / Bills)',   t: today.upt,   x: mtd.upt,   type: 'dec' },
    { m: 'ASP (NSV / Qty)',     t: today.asp,   x: mtd.asp,   type: 'cur' },
    { m: 'FUPT (FW Qty / Bills)', t: today.fupt, x: mtd.fupt,  type: 'dec' },
    { m: 'SFR (Socks / FW Qty)', t: today.sfr, x: mtd.sfr,   type: 'dec' },
    { m: 'AFR (APP / FW Qty)',   t: today.afr,  x: mtd.afr,   type: 'dec' },
  ];

  let r = 4;
  rows.forEach(({ m, t, x, type }, idx) => {
    const isAlt = idx % 2 === 1;
    ws.getCell(r, 1).value = m;
    ws.getCell(r, 1).style = labelStyle();
    if (type === 'ach') {
      ws.getCell(r, 2).style = achStyle(t);
      ws.getCell(r, 3).style = achStyle(x);
      if (t != null) ws.getCell(r, 2).value = Number(t) / 100;
      if (x != null) ws.getCell(r, 3).value = Number(x) / 100;
    } else if (type === 'cur') {
      const s2 = isAlt ? altCurStyle() : valCurStyle();
      ws.getCell(r, 2).value = safeNum(t); ws.getCell(r, 2).style = s2;
      ws.getCell(r, 3).value = safeNum(x); ws.getCell(r, 3).style = s2;
    } else if (type === 'dec') {
      const s2 = isAlt ? altDecStyle() : valDecStyle();
      ws.getCell(r, 2).value = safeNum(t); ws.getCell(r, 2).style = s2;
      ws.getCell(r, 3).value = safeNum(x); ws.getCell(r, 3).style = s2;
    } else {
      const s2 = isAlt ? altStyle() : valStyle();
      ws.getCell(r, 2).value = safeNum(t); ws.getCell(r, 2).style = s2;
      ws.getCell(r, 3).value = safeNum(x); ws.getCell(r, 3).style = s2;
    }
    r++;
  });

  r++;
  ws.getRow(r).height = 8; r++;

  ws.getCell(r, 1).value = 'SHEET INDEX';
  ws.getCell(r, 1).style = totalStyle();
  ws.mergeCells(r, 1, r, 3);
  ws.getRow(r).height = 22;
  r++;

  const toc = [
    ['Daywise + MTD',    'Headline KPIs — TODAY and MTD'],
    ['Staff KPI',         'Per-associate quantity and NSV'],
    ['FW / APP / ACC',   'Category-level breakdown'],
    ['Gender / Division', 'Gender × category split'],
  ];
  toc.forEach(([name, desc], idx) => {
    ws.getCell(r, 1).value = name;
    ws.getCell(r, 1).style = idx % 2 === 0 ? labelStyle() : altLabelStyle();
    ws.getCell(r, 2).value = desc;
    ws.getCell(r, 2).style = idx % 2 === 0 ? valStyle() : altStyle();
    ws.mergeCells(r, 2, r, 3);
    r++;
  });

  r++;
  writeFooter(ws, r, 'NSV = SUM(Taxable Amount).  Target = ₹8L/month × week/day fraction.  ATV=NSV/Bills  UPT=Qty/Bills  ASP=NSV/Qty');
  return ws;
}

// ─── Sheet 2: Daywise + MTD ──────────────────────────────────────────────

function addDaywiseSheet(wb, daywiseRows) {
  const today = daywiseRows.find(r => r.period_type === 'today') || {};
  const mtd   = daywiseRows.find(r => r.period_type === 'mtd')   || {};

  const ws = wb.addWorksheet('Daywise MTD');
  ws.columns = [
    { key: 'metric', width: 32 },
    { key: 'today',  width: 18 },
    { key: 'mtd',    width: 18 },
  ];

  writeTitle(ws, 1, 'Uppal Reebok — Daywise + MTD');
  writeSubtitle(ws, 2, `Headline KPIs  ·  Store ${STORE_NM} (${STORE})`);
  writeHeader(ws, 3, ['METRIC', 'TODAY', 'MTD']);

  const rows = [
    { section: 'HEADLINE KPIs' },
    { m: 'NSV (Taxable Amount)', t: today.nsv,  x: mtd.nsv,  type: 'cur' },
    { m: 'Target',                t: today.target, x: mtd.target, type: 'cur' },
    { m: 'Achievement %',        t: today.achievement_pct, x: mtd.achievement_pct, type: 'ach' },
    { m: 'Bills',                t: today.bills,  x: mtd.bills,  type: 'int' },
    { m: 'Qty Sold',             t: today.qty_sold, x: mtd.qty_sold, type: 'int' },
    { m: 'ATV (NSV / Bills)',   t: today.atv,   x: mtd.atv,   type: 'cur' },
    { m: 'UPT (Qty / Bills)',   t: today.upt,   x: mtd.upt,   type: 'dec' },
    { m: 'ASP (NSV / Qty)',     t: today.asp,   x: mtd.asp,   type: 'cur' },
    { m: 'FUPT (FW Qty / Bills)', t: today.fupt, x: mtd.fupt,  type: 'dec' },
    { section: 'CATEGORY BREAKDOWN' },
    { m: 'Footwear Qty',        t: today.footwear_qty, x: mtd.footwear_qty, type: 'int' },
    { m: 'Footwear NSV',        t: today.footwear_nsv, x: mtd.footwear_nsv, type: 'cur' },
    { m: 'Apparel Qty',         t: today.apparel_qty, x: mtd.apparel_qty, type: 'int' },
    { m: 'Apparel NSV',         t: today.apparel_nsv, x: mtd.apparel_nsv, type: 'cur' },
    { m: 'Accessories Qty',     t: today.accessories_qty, x: mtd.accessories_qty, type: 'int' },
    { m: 'Accessories NSV',     t: today.accessories_nsv, x: mtd.accessories_nsv, type: 'cur' },
    { section: 'RATIOS' },
    { m: 'SFR (Socks / FW Qty)', t: today.sfr, x: mtd.sfr, type: 'dec' },
    { m: 'AFR (APP / FW Qty)',   t: today.afr, x: mtd.afr, type: 'dec' },
  ];

  let r = 4;
  rows.forEach(({ section, m, t, x, type }, idx) => {
    if (section) {
      ws.getCell(r, 1).value = section;
      ws.getCell(r, 1).style = sectionStyle();
      ws.getCell(r, 2).style = sectionStyle();
      ws.getCell(r, 3).style = sectionStyle();
      ws.getRow(r).height = 20;
      r++;
      return;
    }
    const isAlt = idx % 2 === 1;
    ws.getCell(r, 1).value = m;
    ws.getCell(r, 1).style = labelStyle();
    if (type === 'ach') {
      ws.getCell(r, 2).style = achStyle(t);
      ws.getCell(r, 3).style = achStyle(x);
      if (t != null) ws.getCell(r, 2).value = Number(t) / 100;
      if (x != null) ws.getCell(r, 3).value = Number(x) / 100;
    } else if (type === 'cur') {
      const s2 = isAlt ? altCurStyle() : valCurStyle();
      ws.getCell(r, 2).value = safeNum(t); ws.getCell(r, 2).style = s2;
      ws.getCell(r, 3).value = safeNum(x); ws.getCell(r, 3).style = s2;
    } else if (type === 'dec') {
      const s2 = isAlt ? altDecStyle() : valDecStyle();
      ws.getCell(r, 2).value = safeNum(t); ws.getCell(r, 2).style = s2;
      ws.getCell(r, 3).value = safeNum(x); ws.getCell(r, 3).style = s2;
    } else {
      const s2 = isAlt ? altStyle() : valStyle();
      ws.getCell(r, 2).value = safeNum(t); ws.getCell(r, 2).style = s2;
      ws.getCell(r, 3).value = safeNum(x); ws.getCell(r, 3).style = s2;
    }
    r++;
  });

  r++;
  writeFooter(ws, r, 'NSV = SUM(Taxable Amount).  ATV=NSV/Bills  UPT=Qty/Bills  ASP=NSV/Qty  FUPT=FW Qty/Bills  SFR=Socks/FW Qty  AFR=APP/FW Qty');
  return ws;
}

// ─── Sheet 3: Staff KPI ──────────────────────────────────────────────────

function addStaffSheet(wb, staffRows) {
  const ASSOCS = ['BALRAJ GADDAM', 'RAMBABU DHARAVATH', 'ERRI SRIJA'];
  const ws = wb.addWorksheet('Staff KPI');
  ws.columns = [
    { key: 'period',    width: 10 },
    { key: 'assoc',     width: 24 },
    { key: 'totalQty',  width: 11 },
    { key: 'totalNsv',  width: 15 },
    { key: 'fwQty',     width: 9 },
    { key: 'fwNsv',     width: 15 },
    { key: 'appQty',    width: 9 },
    { key: 'appNsv',    width: 15 },
    { key: 'accQty',    width: 9 },
    { key: 'accNsv',    width: 15 },
  ];

  writeTitle(ws, 1, 'Uppal Reebok — Staff KPI');
  writeSubtitle(ws, 2, 'Per-associate quantity and NSV by category');
  writeHeader(ws, 3, ['Period', 'Sales Associate', 'Total Qty', 'Total NSV', 'FW Qty', 'FW NSV', 'APP Qty', 'APP NSV', 'ACC Qty', 'ACC NSV']);

  let r = 4;
  for (const period of ['today', 'mtd']) {
    const label = period === 'today' ? 'TODAY' : 'MTD';
    const sRows = (staffRows || []).filter(row => row.period_type === period);
    for (const assoc of ASSOCS) {
      const row = sRows.find(row => row.salesperson_name === assoc);
      if (!row) continue;
      ws.getCell(r, 1).value = label;  ws.getCell(r, 1).style = totalStyle();
      ws.getCell(r, 2).value = row.salesperson_name;  ws.getCell(r, 2).style = totalStyle();
      ws.getCell(r, 3).value = safeNum(row.qty);              ws.getCell(r, 3).style = valStyle();
      ws.getCell(r, 4).value = safeNum(row.nsv);              ws.getCell(r, 4).style = valCurStyle();
      ws.getCell(r, 5).value = safeNum(row.footwear_qty);     ws.getCell(r, 5).style = valStyle();
      ws.getCell(r, 6).value = safeNum(row.footwear_nsv);     ws.getCell(r, 6).style = valCurStyle();
      ws.getCell(r, 7).value = safeNum(row.apparel_qty);      ws.getCell(r, 7).style = valStyle();
      ws.getCell(r, 8).value = safeNum(row.apparel_nsv);      ws.getCell(r, 8).style = valCurStyle();
      ws.getCell(r, 9).value = safeNum(row.accessories_qty);  ws.getCell(r, 9).style = valStyle();
      ws.getCell(r, 10).value = safeNum(row.accessories_nsv); ws.getCell(r, 10).style = valCurStyle();
      r++;
    }
  }

  r++;
  writeFooter(ws, r, 'NSV from actual salesperson field in raw.sales — not distributed equally across associates.', 1, 10);
  return ws;
}

// ─── Sheet 4: FW / APP / ACC ─────────────────────────────────────────────

function addCategorySheet(wb, catRows) {
  const cats      = ['footwear', 'apparel', 'accessories'];
  const catsLabel = { footwear: 'Footwear', apparel: 'Apparel', accessories: 'Accessories' };
  const today = {}; const mtd = {};
  for (const r of (catRows || [])) {
    if (r.period_type === 'today') today[r.category] = r;
    if (r.period_type === 'mtd')   mtd[r.category]   = r;
  }

  const ws = wb.addWorksheet('FW APP ACC');
  ws.columns = [
    { key: 'period',  width: 10 },
    { key: 'category', width: 15 },
    { key: 'qty',     width: 12 },
    { key: 'nsv',     width: 17 },
  ];

  writeTitle(ws, 1, 'Uppal Reebok — FW / APP / ACC');
  writeSubtitle(ws, 2, 'Category-level quantity and NSV breakdown');
  writeHeader(ws, 3, ['Period', 'Category', 'Qty', 'NSV']);

  let r = 4;
  for (const period of ['today', 'mtd']) {
    const label = period === 'today' ? 'TODAY' : 'MTD';
    const data  = period === 'today' ? today : mtd;
    for (const cat of cats) {
      const row = data[cat];
      if (!row) continue;
      ws.getCell(r, 1).value = label;        ws.getCell(r, 1).style = totalStyle();
      ws.getCell(r, 2).value = catsLabel[cat]; ws.getCell(r, 2).style = totalStyle();
      ws.getCell(r, 3).value = safeNum(row.qty); ws.getCell(r, 3).style = valStyle();
      ws.getCell(r, 4).value = safeNum(row.nsv); ws.getCell(r, 4).style = valCurStyle();
      r++;
    }
  }

  r++;
  writeFooter(ws, r, 'Footwear, Apparel, Accessories — NSV = SUM(Taxable Amount).', 1, 4);
  return ws;
}

// ─── Sheet 5: Gender / Division ──────────────────────────────────────────

function addGenderSheet(wb, gdRows) {
  const genders      = ['men', 'women', 'unisex'];
  const gendersLabel = { men: 'Men', women: 'Women', unisex: 'Unisex' };
  const divs        = ['footwear', 'apparel', 'accessories'];
  const today = {}; const mtd = {};
  for (const r of (gdRows || [])) {
    const key = `${r.gender}__${r.division}`;
    if (r.period_type === 'today') today[key] = r;
    if (r.period_type === 'mtd')   mtd[key]   = r;
  }

  const ws = wb.addWorksheet('Gender Division');
  ws.columns = [
    { key: 'period',  width: 10 },
    { key: 'gender',  width: 13 },
    { key: 'fw',      width: 15 },
    { key: 'app',     width: 15 },
    { key: 'acc',     width: 17 },
  ];

  writeTitle(ws, 1, 'Uppal Reebok — Gender / Division Split');
  writeSubtitle(ws, 2, 'Quantity by gender × category');
  writeHeader(ws, 3, ['Period', 'Gender', 'Footwear Qty', 'Apparel Qty', 'Accessories Qty']);

  let r = 4;
  for (const period of ['today', 'mtd']) {
    const label = period === 'today' ? 'TODAY' : 'MTD';
    const data  = period === 'today' ? today : mtd;
    for (const g of genders) {
      ws.getCell(r, 1).value = label; ws.getCell(r, 1).style = totalStyle();
      ws.getCell(r, 2).value = gendersLabel[g]; ws.getCell(r, 2).style = totalStyle();
      ws.getCell(r, 3).value = safeNum(data[`${g}__footwear`]?.qty);  ws.getCell(r, 3).style = valStyle();
      ws.getCell(r, 4).value = safeNum(data[`${g}__apparel`]?.qty);   ws.getCell(r, 4).style = valStyle();
      ws.getCell(r, 5).value = safeNum(data[`${g}__accessories`]?.qty); ws.getCell(r, 5).style = valStyle();
      r++;
    }
  }

  r++;
  writeFooter(ws, r, 'Rows without data reflect no sales recorded for that gender × category combination.', 1, 5);
  return ws;
}

function addStaffCategorySheet(wb, staffRows) {
  const ws = wb.addWorksheet('Staff Categories');
  ws.columns = [
    { width: 10 }, { width: 24 }, { width: 18 }, { width: 11 }, { width: 15 },
    { width: 11 }, { width: 15 }, { width: 11 }, { width: 15 },
  ];
  writeTitle(ws, 1, 'Uppal Reebok — Staffwise Footwear / Apparel / Accessories');
  writeHeader(ws, 3, ['PERIOD', 'SALESPERSON', 'ROLE', 'FW QTY', 'FW NSV', 'APP QTY', 'APP NSV', 'ACC QTY', 'ACC NSV']);
  let r = 4;
  for (const period of ['today', 'mtd']) {
    for (const row of (staffRows || []).filter((item) => item.period_type === period)) {
      const values = [period === 'today' ? 'TODAY' : 'MTD', row.salesperson_name, row.role || 'Sales Associate', row.footwear_qty, row.footwear_nsv, row.apparel_qty, row.apparel_nsv, row.accessories_qty, row.accessories_nsv];
      values.forEach((value, index) => { ws.getCell(r, index + 1).value = index >= 3 ? safeNum(value) : value; ws.getCell(r, index + 1).style = index >= 3 ? ([4, 6, 8].includes(index) ? valCurStyle() : valStyle()) : labelStyle(); });
      r++;
    }
  }
  writeFooter(ws, r + 1, 'Category quantities and NSV use actual salesperson records.', 1, 9);
  return ws;
}

function addDivisionSheet(wb, catRows) {
  const ws = wb.addWorksheet('Division Wise');
  ws.columns = [{ width: 12 }, { width: 18 }, { width: 13 }, { width: 17 }, { width: 14 }];
  writeTitle(ws, 1, 'Uppal Reebok — Division Wise Report');
  writeHeader(ws, 3, ['PERIOD', 'DIVISION', 'QTY', 'NSV', '% MIX']);
  const rows = (catRows || []).filter((row) => row.period_type === 'today' || row.period_type === 'mtd');
  const totals = { today: 0, mtd: 0 };
  rows.forEach((row) => { totals[row.period_type] += Number(row.qty || 0); });
  rows.sort((a, b) => a.period_type.localeCompare(b.period_type) || a.category.localeCompare(b.category));
  rows.forEach((row, index) => {
    const values = [row.period_type === 'today' ? 'TODAY' : 'MTD', row.category, row.qty, row.nsv, totals[row.period_type] ? Number(row.qty || 0) / totals[row.period_type] : null];
    values.forEach((value, column) => { ws.getCell(index + 4, column + 1).value = value; ws.getCell(index + 4, column + 1).style = column === 3 ? valCurStyle() : column === 4 ? valPctStyle() : column > 1 ? valStyle() : labelStyle(); });
  });
  return ws;
}

function addGenderWiseSheet(wb, gdRows) {
  const ws = wb.addWorksheet('Gender Wise');
  ws.columns = [{ width: 12 }, { width: 16 }, { width: 13 }, { width: 17 }, { width: 14 }];
  writeTitle(ws, 1, 'Uppal Reebok — Gender Wise Report');
  writeHeader(ws, 3, ['PERIOD', 'GROUP', 'QTY', 'NSV', '% MIX']);
  const grouped = {};
  for (const row of gdRows || []) {
    const key = `${row.period_type}:${row.gender}`;
    grouped[key] ||= { period_type: row.period_type, gender: row.gender, qty: 0, nsv: 0 };
    grouped[key].qty += Number(row.qty || 0); grouped[key].nsv += Number(row.nsv || 0);
  }
  const rows = Object.values(grouped); const totals = { today: 0, mtd: 0 };
  rows.forEach((row) => { totals[row.period_type] += row.qty; });
  rows.sort((a, b) => a.period_type.localeCompare(b.period_type) || a.gender.localeCompare(b.gender));
  rows.forEach((row, index) => {
    const values = [row.period_type === 'today' ? 'TODAY' : 'MTD', row.gender, row.qty, row.nsv, totals[row.period_type] ? row.qty / totals[row.period_type] : null];
    values.forEach((value, column) => { ws.getCell(index + 4, column + 1).value = value; ws.getCell(index + 4, column + 1).style = column === 3 ? valCurStyle() : column === 4 ? valPctStyle() : column > 1 ? valStyle() : labelStyle(); });
  });
  return ws;
}

function addGenderDivisionDetailSheet(wb, gdRows) {
  const ws = wb.addWorksheet('Gender Division');
  ws.columns = [{ width: 12 }, { width: 14 }, { width: 16 }, { width: 13 }, { width: 17 }, { width: 14 }];
  writeTitle(ws, 1, 'Uppal Reebok — Division Split Within Gender');
  writeHeader(ws, 3, ['PERIOD', 'GENDER', 'DIVISION', 'QTY', 'NSV', '% WITHIN GENDER']);
  const grouped = {}; const totals = {};
  for (const row of gdRows || []) {
    const key = `${row.period_type}:${row.gender}:${row.division}`;
    grouped[key] = row;
    const totalKey = `${row.period_type}:${row.gender}`;
    totals[totalKey] = (totals[totalKey] || 0) + Number(row.qty || 0);
  }
  Object.values(grouped).sort((a, b) => a.period_type.localeCompare(b.period_type) || a.gender.localeCompare(b.gender) || a.division.localeCompare(b.division)).forEach((row, index) => {
    const total = totals[`${row.period_type}:${row.gender}`] || 0;
    const values = [row.period_type === 'today' ? 'TODAY' : 'MTD', row.gender, row.division, row.qty, row.nsv, total ? Number(row.qty || 0) / total : null];
    values.forEach((value, column) => { ws.getCell(index + 4, column + 1).value = value; ws.getCell(index + 4, column + 1).style = column === 4 ? valCurStyle() : column === 5 ? valPctStyle() : column > 2 ? valStyle() : labelStyle(); });
  });
  return ws;
}

// ─── GET handler ──────────────────────────────────────────────────────────

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date') || null;
    const supabase = createServerClient();

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

    const daywise = daywiseRows || [];
    const today   = daywise.find(r => r.period_type === 'today') || {};
    const mtd     = daywise.find(r => r.period_type === 'mtd')   || {};

    // Compute Achievement % from NSV / Target (database doesn't store it)
    const todayTarget = calcTarget(today.full_date) ?? calcTarget(reportDate);
    const mtdTarget   = MTD_TARGET(reportDate);
    const todayAch    = calcAchievement(today.nsv, todayTarget);
    const mtdAch      = calcAchievement(mtd.nsv,   mtdTarget);

    // Patch the rows with computed achievement_pct so the sheet builders pick them up
    const enriched = daywise.map((r) => {
      if (r.period_type === 'today') return { ...r, achievement_pct: todayAch, target: todayTarget };
      if (r.period_type === 'mtd')   return { ...r, achievement_pct: mtdAch,   target: mtdTarget   };
      return r;
    });

    // Build workbook via ExcelJS (the styled xlsx library)
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator  = 'Virata Retail';
    wb.created  = new Date();
    wb.modified = new Date();

    addCoverSheet(wb, enriched.find(r => r.period_type === 'today') || {}, enriched.find(r => r.period_type === 'mtd') || {}, reportDate);
    addDaywiseSheet(wb, enriched);
    addStaffSheet(wb, staffRows || []);
    addStaffCategorySheet(wb, staffRows || []);
    addDivisionSheet(wb, catRows || []);
    addGenderWiseSheet(wb, gdRows || []);
    addGenderDivisionDetailSheet(wb, gdRows || []);

    const buf = await wb.xlsx.writeBuffer();

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="VS_Corp_Reebok_Sales_${reportDate}.xlsx"`,
        'Cache-Control':        'no-store',
      },
    });
  } catch (err) {
    console.error('[reebok-export] Error:', err);
    return NextResponse.json({
      error: err.message,
      stack: (err.stack || '').split('\n').slice(0, 8).join('\n'),
    }, { status: 500 });
  }
}
