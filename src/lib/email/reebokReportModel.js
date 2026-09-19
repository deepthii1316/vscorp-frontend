// reebokReportModel.js — single source of truth for the Uppal Reebok sales-report TABLE LAYOUT.
//
// Both the on-screen HTML (api/reports/reebok-sales) and the Excel download
// (api/reports/reebok-export) render from the models built here, so a change to
// rows / columns / formulas is made once. Layout spec: public/SALES-REPORT-LAYOUT.md.
// KPI formulas: public/REEBOOK_KPI_DEFINITIONS.md (Target/ACH% live in reebokHelpers.js).
//
// Cell types: text | inr | int | dec | pct | ach | empty
//   pct / ach values are in PERCENT units (25.6 means 25.6%).

import { n, calcTarget, MTD_TARGET, YTD_TARGET, calcAchievement } from './reebokHelpers';

// ─── Palette (hex without #) ──────────────────────────────────────────────
export const TONE = {
  navy:   '1F2A44',
  blue:   '0F4C81',   // classic blue
  orange: 'E8710A',
  green:  '2E7D32',
  purple: '5F4B8B',   // ultra violet
  teal:   '0E7C7B',
  coral:  'D9534F',
  amber:  'B7791F',
};
// ACH% is the ONLY conditionally coloured value: green / yellow / red.
export const ACH_FILL = { high: '63BE7B', mid: 'FFEB84', low: 'F8696B' };
export const ZEBRA = ['FFFFFF', 'E9ECF1'];
export const TOTAL_BG = 'C9CED6';

/** ≥80 green, 60–<80 yellow, <60 red (thresholds carried over from the existing report; pending manager confirmation). */
export function achLevel(pct) {
  if (pct == null || Number.isNaN(Number(pct))) return null;
  const v = Number(pct);
  return v >= 80 ? 'high' : v >= 60 ? 'mid' : 'low';
}

// ─── Small helpers ────────────────────────────────────────────────────────
const ASSOCS = ['BALRAJ GADDAM', 'RAMBABU DHARAVATH', 'ERRI SRIJA'];
const STAFF_COUNT = ASSOCS.length;

const cell = (v, t = 'text', extra = {}) => ({ v, t, ...extra });
const pctOf = (a, b) => (b ? (a / b) * 100 : null);
const titleName = (s) => String(s || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const col = (label, tone, align = 'r') => ({ label, tone: TONE[tone], align });

function sumBy(rows, key) {
  return rows.reduce((s, r) => s + n(r[key]), 0);
}

// ─── Table 1: Daywise / MTD / YTD ─────────────────────────────────────────
function daywiseTable(daywiseRows, reportDate) {
  const today = daywiseRows.find((r) => r.period_type === 'today') || {};
  const mtd = daywiseRows.find((r) => r.period_type === 'mtd') || {};
  // YTD comes from the pipeline's 'ytd' row; the column stays empty until that row exists.
  const ytdRow = daywiseRows.find((r) => r.period_type === 'ytd');
  const ytd = ytdRow ? { nsv: n(ytdRow.nsv), bills: n(ytdRow.bills), qty: n(ytdRow.qty_sold), target: YTD_TARGET(reportDate) } : null;
  const tTarget = calcTarget(reportDate);
  const mTarget = MTD_TARGET(reportDate);

  return {
    key: 'daywise',
    title: 'Uppal Reebok — Target, Daywise, MTD & YTD',
    columns: [
      col('Metric', 'navy', 'l'),
      col('Daywise', 'orange'),
      col('MTD', 'blue'),
      col('YTD', 'purple'),
    ],
    rows: [
      { cells: [cell('NSV (Taxable Amount)'), cell(n(today.nsv), 'inr'), cell(n(mtd.nsv), 'inr'), ytd ? cell(ytd.nsv, 'inr') : cell(null, 'empty')] },
      { cells: [cell('Target'), cell(tTarget, 'inr'), cell(mTarget, 'inr'), ytd ? cell(ytd.target, 'inr') : cell(null, 'empty')] },
      { cells: [cell('Achievement %'), cell(calcAchievement(today.nsv, tTarget), 'ach'), cell(calcAchievement(mtd.nsv, mTarget), 'ach'), ytd ? cell(calcAchievement(ytd.nsv, ytd.target), 'ach') : cell(null, 'empty')] },
      { cells: [cell('Bills'), cell(n(today.bills), 'int'), cell(n(mtd.bills), 'int'), ytd ? cell(ytd.bills, 'int') : cell(null, 'empty')] },
      { cells: [cell('Qty Sold'), cell(n(today.qty_sold), 'int'), cell(n(mtd.qty_sold), 'int'), ytd ? cell(ytd.qty, 'int') : cell(null, 'empty')] },
    ],
    footnotes: [
      'Target = ₹14,00,000 ÷ days in month (daywise); MTD target = sum of daywise targets; YTD (calendar year) target = ₹14,00,000 per completed month since 1 Jan + current MTD target.  ACH% = NSV ÷ Target × 100.',
    ],
  };
}

// ─── Tables 2 & 3: Staffwise KPI (Today / MTD) ────────────────────────────
function staffKpiTable(period, staffRows, daywiseRows, reportDate) {
  const isToday = period === 'today';
  const storeTarget = isToday ? calcTarget(reportDate) : MTD_TARGET(reportDate);
  const perStaffTarget = storeTarget == null ? null : storeTarget / STAFF_COUNT;
  const store = daywiseRows.find((r) => r.period_type === period) || {};

  const people = ASSOCS.map((name) => {
    const r = staffRows.find((x) => x.period_type === period && x.salesperson_name === name) || {};
    return { name, role: r.role || 'Sales Associate', nsv: n(r.nsv), bills: n(r.bills), qty: n(r.qty), sfr: n(r.sfr) * 100, afr: n(r.afr) * 100 };
  });

  const kpiCells = (nsv, bills, qty, target, sfr, afr) => [
    cell(target, 'inr'),
    cell(nsv, 'inr'),
    cell(calcAchievement(nsv, target), 'ach'),
    cell(bills, 'int'),
    cell(qty, 'int'),
    cell(bills ? nsv / bills : 0, 'inr'),   // ATV = NSV / Bills
    cell(bills ? qty / bills : 0, 'dec'),   // UPT = Qty / Bills
    cell(qty ? nsv / qty : 0, 'inr'),       // ASP = NSV / Qty
    cell(sfr, 'pct'),
    cell(afr, 'pct'),
  ];

  const rows = people.map((p) => ({
    cells: [cell(titleName(p.name)), cell(p.role), ...kpiCells(p.nsv, p.bills, p.qty, perStaffTarget, p.sfr, p.afr)],
  }));
  const tNsv = people.reduce((s, p) => s + p.nsv, 0);
  const tBills = people.reduce((s, p) => s + p.bills, 0);
  const tQty = people.reduce((s, p) => s + p.qty, 0);
  // SFR / AFR are ratios: taken from the store-level row (recalculated from totals), never summed.
  rows.push({ kind: 'total', cells: [cell('STORE TOTAL'), cell(''), ...kpiCells(tNsv, tBills, tQty, storeTarget, n(store.sfr) * 100, n(store.afr) * 100)] });

  return {
    key: 'staff',
    title: isToday ? 'Uppal Reebok — Staffwise KPI — Daywise' : 'Uppal Reebok — Staffwise KPI — MTD',
    columns: [
      col('Salesperson', 'navy', 'l'), col('Role', 'navy', 'l'),
      col('Target', 'blue'), col('NSV (Achieved)', 'green'), col('ACH%', 'orange'),
      col('Bills', 'purple'), col('Qty', 'purple'),
      col('ATV', 'teal'), col('UPT', 'teal'), col('ASP', 'teal'),
      col('SFR', 'amber'), col('AFR', 'amber'),
    ],
    rows,
    footnotes: [isToday
      ? 'Per-staff target = day target ÷ 3. Store total ratios are recalculated from totals.'
      : 'Per-staff target = MTD target ÷ 3. Store total ratios are recalculated from totals.'],
  };
}

// ─── Table 4: Staffwise Footwear / Apparel / Accessories (Today / MTD) ────
function staffCategoryTable(period, staffRows, reportDate) {
  const isToday = period === 'today';
  const people = ASSOCS.map((name) => {
    const r = staffRows.find((x) => x.period_type === period && x.salesperson_name === name) || {};
    return { name, role: r.role || 'Sales Associate', r };
  });
  const keys = ['footwear_qty', 'footwear_nsv', 'apparel_qty', 'apparel_nsv', 'accessories_qty', 'accessories_nsv'];
  const types = ['int', 'inr', 'int', 'inr', 'int', 'inr'];
  const rows = people.map((p) => ({
    cells: [cell(titleName(p.name)), cell(p.role), ...keys.map((k, i) => cell(n(p.r[k]), types[i]))],
  }));
  rows.push({
    kind: 'total',
    cells: [cell('STORE TOTAL'), cell(''), ...keys.map((k, i) => cell(people.reduce((s, p) => s + n(p.r[k]), 0), types[i]))],
  });
  return {
    key: 'category',
    title: isToday ? 'Uppal Reebok — Staffwise FW / APP / ACC — Daywise' : 'Uppal Reebok — Staffwise FW / APP / ACC — MTD',
    columns: [
      col('Salesperson', 'navy', 'l'), col('Role', 'navy', 'l'),
      col('FW Qty', 'blue'), col('FW NSV', 'blue'),
      col('APP Qty', 'coral'), col('APP NSV', 'coral'),
      col('ACC Qty', 'amber'), col('ACC NSV', 'amber'),
    ],
    rows,
  };
}

// ─── Table 5: Gender Wise / Table 6: Division Wise ────────────────────────
function mixTable({ key, title, firstLabel, labels, todayMap, mtdMap }) {
  const totals = (map) => ({ qty: labels.reduce((s, [k]) => s + n(map[k]?.qty), 0), nsv: labels.reduce((s, [k]) => s + n(map[k]?.nsv), 0) });
  const tt = totals(todayMap);
  const mt = totals(mtdMap);
  const rows = labels.map(([k, label]) => ({
    cells: [
      cell(label),
      cell(n(todayMap[k]?.qty), 'int'), cell(n(todayMap[k]?.nsv), 'inr'), cell(pctOf(n(todayMap[k]?.nsv), tt.nsv), 'pct'),
      cell(n(mtdMap[k]?.qty), 'int'), cell(n(mtdMap[k]?.nsv), 'inr'), cell(pctOf(n(mtdMap[k]?.nsv), mt.nsv), 'pct'),
    ],
  }));
  rows.push({
    kind: 'total',
    cells: [
      cell('TOTAL'),
      cell(tt.qty, 'int'), cell(tt.nsv, 'inr'), cell(tt.nsv ? 100 : null, 'pct'),
      cell(mt.qty, 'int'), cell(mt.nsv, 'inr'), cell(mt.nsv ? 100 : null, 'pct'),
    ],
  });
  return {
    key,
    title,
    columns: [
      col(firstLabel, 'navy', 'l'),
      col('Today Qty', 'orange'), col('Today NSV', 'orange'), col('Today % Mix', 'orange'),
      col('MTD Qty', 'blue'), col('MTD NSV', 'blue'), col('MTD % Mix', 'blue'),
    ],
    rows,
    footnotes: ['% Mix = share of total NSV.'],
  };
}

function genderWiseTable(gdRows) {
  const build = (period) => {
    const map = {};
    for (const r of gdRows) {
      if (r.period_type !== period) continue;
      map[r.gender] ||= { qty: 0, nsv: 0 };
      map[r.gender].qty += n(r.qty);
      map[r.gender].nsv += n(r.nsv);
    }
    return map;
  };
  return mixTable({
    key: 'gender',
    title: 'Uppal Reebok — Gender Wise Report',
    firstLabel: 'Group',
    labels: [['men', 'Men'], ['women', 'Women'], ['unisex', 'Unisex']],
    todayMap: build('today'),
    mtdMap: build('mtd'),
  });
}

function divisionWiseTable(catRows) {
  const build = (period) => {
    const map = {};
    for (const r of catRows) if (r.period_type === period) map[r.category] = r;
    return map;
  };
  return mixTable({
    key: 'gender',
    title: 'Uppal Reebok — Division Wise Report',
    firstLabel: 'Division',
    labels: [['footwear', 'Footwear'], ['apparel', 'Apparel'], ['accessories', 'Accessories']],
    todayMap: build('today'),
    mtdMap: build('mtd'),
  });
}

// ─── Table 7: Division split within Gender ────────────────────────────────
function divisionSplitTable(gdRows) {
  const get = (period, g, d) => gdRows.find((r) => r.period_type === period && r.gender === g && r.division === d) || {};
  const genders = [
    ['men', 'Men', ['footwear', 'apparel']],
    ['women', 'Women', ['footwear', 'apparel']],
    ['unisex', 'Unisex', ['footwear', 'apparel', 'accessories']],   // accessories are always unisex
  ];
  const divLabel = { footwear: 'Footwear', apparel: 'Apparel', accessories: 'Accessories' };
  const rows = [];

  for (const [g, gLabel, divs] of genders) {
    const mtdTotalNsv = divs.reduce((s, d) => s + n(get('mtd', g, d).nsv), 0);
    const sum = (period, key) => divs.reduce((s, d) => s + n(get(period, g, d)[key]), 0);
    divs.forEach((d, i) => {
      rows.push({
        cells: [
          i === 0 ? cell(gLabel, 'text', { rowspan: divs.length + 1 }) : { merged: true },
          cell(divLabel[d]),
          cell(n(get('today', g, d).qty), 'int'), cell(n(get('today', g, d).nsv), 'inr'),
          cell(n(get('mtd', g, d).qty), 'int'), cell(n(get('mtd', g, d).nsv), 'inr'),
          cell(pctOf(n(get('mtd', g, d).nsv), mtdTotalNsv), 'pct'),
        ],
      });
    });
    rows.push({
      kind: 'total',
      cells: [
        { merged: true },
        cell(`${gLabel} TOTAL`),
        cell(sum('today', 'qty'), 'int'), cell(sum('today', 'nsv'), 'inr'),
        cell(sum('mtd', 'qty'), 'int'), cell(sum('mtd', 'nsv'), 'inr'),
        cell(mtdTotalNsv ? 100 : null, 'pct'),
      ],
    });
  }

  return {
    key: 'gender',
    title: 'Uppal Reebok — Division Split Within Gender',
    columns: [
      col('Gender', 'navy', 'l'), col('Division', 'navy', 'l'),
      col('Today Qty', 'orange'), col('Today NSV', 'orange'),
      col('MTD Qty', 'blue'), col('MTD NSV', 'blue'),
      col('MTD % within Gender', 'purple'),
    ],
    rows,
    footnotes: ['% within Gender = division MTD NSV ÷ that gender\'s total MTD NSV.'],
  };
}

// ─── Public API ───────────────────────────────────────────────────────────

/** Build every sales-report table model, in display order. */
export function buildReportModel({ reportDate, daywiseRows = [], staffRows = [], catRows = [], gdRows = [] }) {
  return [
    daywiseTable(daywiseRows, reportDate),
    staffKpiTable('today', staffRows, daywiseRows, reportDate),
    staffKpiTable('mtd', staffRows, daywiseRows, reportDate),
    staffCategoryTable('today', staffRows, reportDate),
    staffCategoryTable('mtd', staffRows, reportDate),
    genderWiseTable(gdRows),
    divisionWiseTable(catRows),
    divisionSplitTable(gdRows),
  ];
}

// ─── Value formatting shared by HTML renderers ────────────────────────────
export function formatCell(c) {
  if (c.t === 'empty' || c.v == null || c.v === '') return c.t === 'text' ? '' : (c.t === 'empty' ? '' : '—');
  if (c.t === 'text') return String(c.v);
  const v = Number(c.v);
  if (Number.isNaN(v)) return '—';
  if (c.t === 'inr') return `₹${Math.round(v).toLocaleString('en-IN')}`;
  if (c.t === 'int') return Math.round(v).toLocaleString('en-IN');
  if (c.t === 'dec') return v.toFixed(2);
  if (c.t === 'pct' || c.t === 'ach') return `${v.toFixed(1)}%`;
  return String(c.v);
}
