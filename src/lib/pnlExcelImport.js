// P&L Excel import: turns a workbook into month records for public.pnl_import().
// Pure functions (no React). Columns are matched by HEADER NAME, not position, and both layouts
// are accepted:
//   * months as rows    — a header row with "Month", then one row per month;
//   * months as columns — a row of month headers, then one row per line item ("Rent + CAM", ...).
// The import page shows every parsed month before anything is saved.

import * as XLSX from 'xlsx';

// field -> accepted header labels (compared after normalising: lower case, & -> and, no punctuation)
const FIELDS = {
  gross_sale:    ['sale', 'sales', 'sales nsv', 'nsv', 'gross sale', 'gross sales', 'net sales'],
  income_margin: ['income margin', 'margin', 'gross margin'],
  depreciation:  ['depreciation', 'dep'],
  funds_cost:    ['funds cost', 'fund cost', 'cost of funds', 'interest'],
  roi:           ['roi', 'roi percent'],
};

// Expense category (exact name in pnl_tracker.expense_categories) -> accepted labels
export const EXPENSES = {
  'Rent + CAM':           ['rent and cam', 'rent cam', 'rent'],
  'Staff Salaries':       ['staff salaries', 'staff salary', 'salaries', 'salary'],
  'Electricity Bill':     ['electricity bill', 'electricity'],
  'Telephone & Internet': ['telephone and internet', 'telephone', 'internet'],
  'Petty Cash':           ['petty cash'],
  'House Keeping':        ['house keeping', 'housekeeping'],
  'Staff Incentives':     ['staff incentives', 'incentives', 'incentive'],
  'Bank EDC Charges':     ['bank edc charges', 'edc charges', 'edc'],
  'Bank UPI Charges':     ['bank upi charges', 'upi charges', 'upi'],
};

const IGNORED = ['store code', 'store name', 'store', 'month', 'period', 'total', 'total opex', 'opex', 'operating expense',
  'operating profit', 'net profit', 'total expenses', 'expenses'];

const norm = (s) => String(s ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

function labelToKey(label) {
  const n = norm(label);
  if (!n) return null;
  for (const [field, aliases] of Object.entries(FIELDS)) if (aliases.includes(n)) return { field };
  for (const [cat, aliases] of Object.entries(EXPENSES)) if (aliases.includes(n)) return { expense: cat };
  return null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const iso = (y, m) => `${y}-${String(m).padStart(2, '0')}-01`;

/** A cell as 'YYYY-MM-01', or null. Accepts Date cells, Excel serials and "Jul-2026" / "July 2026" / "7/2026" / "2026-07". */
export function toMonth(v) {
  if (v instanceof Date && !isNaN(v)) {
    // SheetJS date cells can land a few hours either side of midnight depending on the time zone
    // (IST midnight is 18:30 UTC the day before), so read the date at midday UTC.
    const d = new Date(v.getTime() + 12 * 3600 * 1000);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1);
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? iso(d.y, d.m) : null;
  }
  const s = String(v ?? '').trim().toLowerCase();
  let m = s.match(/^([a-z]{3,9})[\s\-/']*(\d{2}|\d{4})$/);
  if (m) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3));
    if (mi < 0) return null;
    const y = m[2].length === 2 ? 2000 + +m[2] : +m[2];
    return iso(y, mi + 1);
  }
  m = s.match(/^(\d{1,2})[/-](\d{4})$/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return iso(+m[2], +m[1]);
  m = s.match(/^(\d{4})-(\d{1,2})(-\d{1,2})?$/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return iso(+m[1], +m[2]);
  return null;
}

/** "1,23,456", "₹ 5,000", "(1,200)" -> number; blank -> null. */
export function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v ?? '').trim();
  if (!s || s === '-') return null;
  const neg = /^\(.*\)$/.test(s);
  s = s.replace(/[₹,%\s()]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

function emptyMonth(month) {
  return { period_month: month, gross_sale: null, income_margin: null, depreciation: null, funds_cost: null, roi: null, expenses: {} };
}

function assign(rec, key, value) {
  const n = toNumber(value);
  if (n == null) return;
  if (key.field) rec[key.field] = n;
  else rec.expenses[key.expense] = (rec.expenses[key.expense] || 0) + n;
}

/** Months as rows: header row contains "Month". */
function parseRowLayout(grid, warnings) {
  const h = grid.findIndex((row) => row.some((c) => ['month', 'period'].includes(norm(c))));
  if (h < 0) return null;
  const header = grid[h];
  const monthCol = header.findIndex((c) => ['month', 'period'].includes(norm(c)));
  const cols = header.map((c, i) => ({ i, label: c, key: i === monthCol ? null : labelToKey(c) }));
  cols.filter((c) => c.i !== monthCol && !c.key && norm(c.label) && !IGNORED.includes(norm(c.label)))
    .forEach((c) => warnings.push(`Column "${c.label}" was not recognised and was skipped.`));
  const out = [];
  grid.slice(h + 1).forEach((row, r) => {
    if (row.every((c) => String(c ?? '').trim() === '')) return;
    const month = toMonth(row[monthCol]);
    if (!month) { warnings.push(`Row ${h + r + 2}: "${row[monthCol] ?? ''}" is not a month, skipped.`); return; }
    const rec = emptyMonth(month);
    cols.forEach((c) => { if (c.key) assign(rec, c.key, row[c.i]); });
    out.push(rec);
  });
  return out;
}

/** Months as columns: a row with at least two month headers; line items down the first text column. */
function parseColumnLayout(grid, warnings) {
  const h = grid.findIndex((row) => row.filter((c) => toMonth(c)).length >= 2);
  if (h < 0) return null;
  const monthCols = grid[h].map((c, i) => ({ i, month: toMonth(c) })).filter((c) => c.month);
  const labelCol = Math.max(0, grid.slice(h + 1).reduce((best, row) => {
    const i = row.findIndex((c) => typeof c === 'string' && c.trim() && toNumber(c) == null);
    return best < 0 || (i >= 0 && i < best) ? i : best;
  }, -1));
  const recs = new Map(monthCols.map((c) => [c.month, emptyMonth(c.month)]));
  grid.slice(h + 1).forEach((row) => {
    const label = row[labelCol];
    const key = labelToKey(label);
    if (!key) {
      if (norm(label) && !IGNORED.includes(norm(label)) && monthCols.some((c) => toNumber(row[c.i]) != null)) {
        warnings.push(`Line "${label}" was not recognised and was skipped.`);
      }
      return;
    }
    monthCols.forEach((c) => assign(recs.get(c.month), key, row[c.i]));
  });
  return [...recs.values()];
}

/**
 * Parse the first sheet that yields months. Returns { months, warnings, sheet, layout }.
 * Months are sorted, de-duplicated (a later row for the same month wins, with a warning).
 */
export function parsePnLWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  for (const sheet of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: '', raw: true });
    const warnings = [];
    let layout = 'rows';
    let months = parseRowLayout(grid, warnings);
    if (!months || months.length === 0) { layout = 'columns'; warnings.length = 0; months = parseColumnLayout(grid, warnings); }
    if (!months || months.length === 0) continue;

    const byMonth = new Map();
    months.forEach((m) => {
      if (byMonth.has(m.period_month)) warnings.push(`${m.period_month.slice(0, 7)} appears more than once; the last one is used.`);
      byMonth.set(m.period_month, m);
    });
    const list = [...byMonth.values()].sort((a, b) => a.period_month.localeCompare(b.period_month));
    list.forEach((m) => {
      if (m.gross_sale == null) warnings.push(`${m.period_month.slice(0, 7)}: no Sales figure found.`);
      if (m.income_margin == null) warnings.push(`${m.period_month.slice(0, 7)}: no Income Margin found.`);
      if (Object.keys(m.expenses).length === 0) warnings.push(`${m.period_month.slice(0, 7)}: no expense lines found.`);
    });
    return { months: list, warnings, sheet, layout };
  }
  return { months: [], warnings: ['No sheet has a "Month" column or a row of month headers (e.g. Jul-2026).'], sheet: null, layout: null };
}

export const opexOf = (m) => Object.values(m.expenses).reduce((s, v) => s + (v || 0), 0);
