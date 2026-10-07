// merchReportModel.js — single source of truth for the Uppal Reebok MERCHANDISER REPORT layout.
//
// Both the on-screen / image HTML (api/reports/merch-report) and the Excel download
// (lib/email/merchReportExcel.js) render from the models built here, the same split the sales
// reports use (reebokReportModel.js), so rows / columns / formulas are defined once.
//
// Source: public.rpt_merch_report_sku() — one row per EAN for the latest stock snapshot, with
// Sale Qty MTD and YTD (YTD from 1 July). Carry bags and promotional items are already left out
// by the RPC. Stock value is at MRP only.
//
// Formulas:
//   % of Qty / % of MRP Value = the row's share of the table total
//   Sell-through YTD          = Sale Qty YTD ÷ (Sale Qty YTD + Quantity), recomputed from sums on
//                               every total row (never an average of the rows above it)

import { TONE } from './reebokReportModel';
import { ordinalDate } from './reebokHelpers';

export const STORE = 'R1157';
export const STORE_NM = 'Uppal Reebok';

const PAGE = 1000;
const NUMERIC = ['mrp', 'stock_qty', 'stock_mrp_value', 'sales_qty_mtd', 'sales_qty_ytd'];

/**
 * Every row of rpt_merch_report_sku(). PostgREST caps a response at 1,000 rows, so this pages
 * through the result (ordered by barcode so pages never overlap), like /api/merchandiser.
 */
export async function fetchMerchReportRows(supabase) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.rpc('rpt_merch_report_sku').order('barcode').range(from, from + PAGE - 1);
    if (error) throw new Error(`rpt_merch_report_sku: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  for (const r of rows) for (const k of NUMERIC) r[k] = r[k] == null ? (k === 'mrp' ? null : 0) : Number(r[k]);
  return rows;
}

// ─── Helpers ──────────────────────────────────────────────────────────────
const cell = (v, t = 'text', extra = {}) => ({ v, t, ...extra });
const col = (label, tone, align = 'r') => ({ label, tone: TONE[tone], align });
const pctOf = (a, b) => (b ? (a / b) * 100 : null);
const sellThrough = (sold, stock) => (sold + stock > 0 ? Math.max(0, (sold / (sold + stock)) * 100) : null);

function agg(rows) {
  const a = { qty: 0, val: 0, mtd: 0, ytd: 0 };
  for (const r of rows) { a.qty += r.stock_qty; a.val += r.stock_mrp_value; a.mtd += r.sales_qty_mtd; a.ytd += r.sales_qty_ytd; }
  return a;
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

/** Sell-through is the only coloured value: lowest red, highest green within the table (total rows excluded). */
function applyHeat(rows, index) {
  const cells = rows.filter((r) => r.kind !== 'total').map((r) => r.cells[index]).filter((c) => c.v != null);
  if (!cells.length) return;
  const vals = cells.map((c) => c.v);
  const min = Math.min(...vals), max = Math.max(...vals);
  for (const c of cells) c.heat = max === min ? 0.5 : (c.v - min) / (max - min);
}

const DIVISION_ORDER = ['FOOTWEAR', 'APPAREL', 'ACCESSORIES'];
const GROUP_ORDER = ['RB MEN', 'RB WOMEN', 'RB UNISEX'];
const ordered = (keys, order) => [...order.filter((k) => keys.includes(k)), ...keys.filter((k) => !order.includes(k)).sort()];

// ─── Summary table: one row per division or department ────────────────────
function summaryTable({ key, title, firstLabel, groups, footnotes }) {
  const total = agg(groups.flatMap(([, rows]) => rows));
  const line = (label, a) => [
    cell(label),
    cell(a.qty, 'int'), cell(a.val, 'inr'),
    cell(pctOf(a.qty, total.qty), 'pct'), cell(pctOf(a.val, total.val), 'pct'),
    cell(a.mtd, 'int'), cell(a.ytd, 'int'),
    cell(sellThrough(a.ytd, a.qty), 'ach'),
  ];
  const rows = groups.map(([label, groupRows]) => ({ cells: line(label, agg(groupRows)) }));
  applyHeat(rows, 7);
  rows.push({ kind: 'total', cells: line('TOTAL', total) });
  return {
    key,
    title,
    columns: [
      col(firstLabel, 'navy', 'l'),
      col('Quantity', 'blue'), col('MRP Value', 'blue'), col('% of Qty', 'blue'), col('% of MRP Value', 'blue'),
      col('Sale Qty MTD', 'orange'), col('Sale Qty YTD', 'orange'),
      col('Sell-through YTD', 'green'),
    ],
    rows,
    footnotes,
  };
}

// ─── Division > Group (men / women / unisex) ──────────────────────────────
function divisionGroupTable(rows, divisions) {
  const groupOf = (r) => r.group_name.toUpperCase();
  // One block per division, then the same groups summed across all divisions.
  const block = (label, blockRows, kind) => {
    const blockAgg = agg(blockRows);
    const byGroup = groupBy(blockRows, groupOf);
    const lines = ordered([...byGroup.keys()], GROUP_ORDER).map((g) => ({ g, a: agg(byGroup.get(g)) }))
      .filter((l) => l.a.qty || l.a.ytd || l.a.mtd);
    return lines.map(({ g, a }, i) => ({
      kind,
      cells: [
        i === 0 ? cell(label, 'text', { rowspan: lines.length }) : cell(label, 'text', { merged: true }),
        cell(g),
        cell(a.qty, 'int'), cell(a.val, 'inr'), cell(pctOf(a.val, blockAgg.val), 'pct'),
        cell(a.mtd, 'int'), cell(a.ytd, 'int'),
        cell(sellThrough(a.ytd, a.qty), 'ach'),
      ],
    }));
  };
  const out = divisions.flatMap((d) => block(d, rows.filter((r) => r.division === d)));
  applyHeat(out, 7);
  out.push(...block('ALL DIVISIONS', rows, 'total'));
  const total = agg(rows);
  out.push({
    kind: 'total',
    cells: [
      cell('TOTAL'), cell(''),
      cell(total.qty, 'int'), cell(total.val, 'inr'), cell(null, 'empty'),
      cell(total.mtd, 'int'), cell(total.ytd, 'int'),
      cell(sellThrough(total.ytd, total.qty), 'ach'),
    ],
  });
  return {
    key: 'division-group',
    title: 'Division and Group Stock Report',
    columns: [
      col('Division', 'navy', 'l'), col('Group', 'navy', 'l'),
      col('Quantity', 'blue'), col('MRP Value', 'blue'), col('% of Division MRP Value', 'blue'),
      col('Sale Qty MTD', 'orange'), col('Sale Qty YTD', 'orange'),
      col('Sell-through YTD', 'green'),
    ],
    rows: out,
    footnotes: ['A group with no stock left is listed while it has sales in the period.'],
  };
}

// ─── Detail table: Department > Category > Subclass ───────────────────────
function detailTable({ key, title, rows }) {
  const depts = [...groupBy(rows, (r) => r.department)].map(([dept, deptRows]) => ({ dept, a: agg(deptRows), deptRows }))
    .sort((x, y) => y.a.val - x.a.val || y.a.ytd - x.a.ytd);
  const out = [];
  for (const { dept, a: deptAgg, deptRows } of depts) {
    const lines = [...groupBy(deptRows, (r) => `${r.category}\u0000${r.subclass}`)].map(([k, lineRows]) => ({ k, a: agg(lineRows) }))
      .filter((l) => l.a.qty || l.a.ytd || l.a.mtd)
      .sort((x, y) => y.a.val - x.a.val || y.a.ytd - x.a.ytd);
    lines.forEach(({ k, a }, i) => {
      const [category, subclass] = k.split('\u0000');
      out.push({
        cells: [
          i === 0 ? cell(dept, 'text', { rowspan: lines.length }) : cell(dept, 'text', { merged: true }),
          cell(category), cell(subclass),
          cell(a.qty, 'int'), cell(a.val, 'inr'), cell(pctOf(a.val, deptAgg.val), 'pct'),
          cell(a.mtd, 'int'), cell(a.ytd, 'int'),
          cell(sellThrough(a.ytd, a.qty), 'ach'),
        ],
      });
    });
  }
  applyHeat(out, 8);
  const total = agg(rows);
  out.push({
    kind: 'total',
    cells: [
      cell('TOTAL'), cell(''), cell(''),
      cell(total.qty, 'int'), cell(total.val, 'inr'), cell(null, 'empty'),
      cell(total.mtd, 'int'), cell(total.ytd, 'int'),
      cell(sellThrough(total.ytd, total.qty), 'ach'),
    ],
  });
  return {
    key,
    title,
    columns: [
      col('Department', 'navy', 'l'), col('Category', 'navy', 'l'), col('Subclass', 'navy', 'l'),
      col('Quantity', 'blue'), col('MRP Value', 'blue'), col('% of Dept MRP Value', 'blue'),
      col('Sale Qty MTD', 'orange'), col('Sale Qty YTD', 'orange'),
      col('Sell-through YTD', 'green'),
    ],
    rows: out,
    footnotes: ['Sorted by MRP Value. A line with no stock left is listed while it has sales in the period.'],
  };
}

function departmentTab(rows, division, label) {
  const divRows = rows.filter((r) => r.division === division);
  const depts = [...groupBy(divRows, (r) => r.department)].sort((x, y) => agg(y[1]).val - agg(x[1]).val);
  return {
    key: division.toLowerCase(),
    title: label,
    sheet: label,
    tables: [
      summaryTable({ key: `${division.toLowerCase()}-dept`, title: `${label} by Department`, firstLabel: 'Department', groups: depts, footnotes: [] }),
      detailTable({ key: `${division.toLowerCase()}-detail`, title: `${label} — Department > Category > Subclass`, rows: divRows }),
    ],
  };
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Build the report: three tabs (Division Summary, Footwear, Apparel), each a list of table
 * models in display order. `meta` carries the dates every renderer prints.
 */
export function buildMerchReportModel(rows) {
  const first = rows[0] || {};
  const meta = { asOf: first.as_of || null, mtdFrom: first.mtd_from || null, ytdFrom: first.ytd_from || null };
  const notes = [
    `Stock as of ${ordinalDate(meta.asOf)} (latest stock report). MRP Value = Quantity × MRP.`,
    `Sale Qty MTD = ${ordinalDate(meta.mtdFrom)} to ${ordinalDate(meta.asOf)}; Sale Qty YTD = ${ordinalDate(meta.ytdFrom)} to ${ordinalDate(meta.asOf)}; both net of returns.`,
    'Sell-through YTD = Sale Qty YTD ÷ (Sale Qty YTD + Quantity). Carry bags and promotional items (trolley, promo bags) are excluded.',
  ];
  const divisions = ordered([...new Set(rows.map((r) => r.division))], DIVISION_ORDER);
  const byDivision = groupBy(rows, (r) => r.division);
  const tabs = [
    {
      key: 'division',
      title: 'Division Summary',
      sheet: 'Division Summary',
      tables: [
        summaryTable({ key: 'division-summary', title: 'Division Stock Report', firstLabel: 'Division', groups: divisions.map((d) => [d, byDivision.get(d)]), footnotes: notes }),
        divisionGroupTable(rows, divisions),
      ],
    },
    departmentTab(rows, 'FOOTWEAR', 'Footwear'),
    departmentTab(rows, 'APPAREL', 'Apparel'),
  ];
  return { meta, tabs };
}
