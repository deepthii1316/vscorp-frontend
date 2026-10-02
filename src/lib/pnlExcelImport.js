// P&L Excel import: turns a workbook into month records for public.pnl_import().
// Pure functions (no React). Written against the real file, "P&L RBK Upl.xlsx":
//
//   SL.NO | Category                         | Jul-2026 | Aug-2026 | ... | Mar-2027   (date cells)
//   1     | Sale (NSV)                       | 880353.5 | ...
//   2     | Rent+CAM [May+Jun+July]          | 525000   | ...
//   ...   | Total Operating Expenditure (Opex) ...   <- ignored (recomputed from the lines, and checked)
//   20    | ROI                              | -5.39%   (stored as the fraction -0.0539 with a % format)
//   then reference rows (Rental Deposit, Capital Expenditure, Breakeven ...)  <- ignored
//
// Labels carry notes ("Rent+CAM [May+Jun+July]", "Income on Sales (42%)"), so a line matches when
// its label, with brackets removed, IS an alias or STARTS WITH one as whole words. Months as rows
// (a "Month" column, one row per month) are accepted too. Months with no figures at all (the
// empty future columns) are skipped. The import page shows every parsed month before saving.

import * as XLSX from 'xlsx';

// field -> accepted labels (after normalising: lower case, & -> and, brackets and punctuation removed)
const FIELDS = {
  gross_sale:    ['sale', 'sales', 'nsv', 'gross sale', 'gross sales', 'net sales'],
  income_margin: ['income on sales', 'income margin', 'margin', 'gross margin'],
  depreciation:  ['depreciation', 'dep'],
  funds_cost:    ['funds cost', 'fund cost', 'cost of funds', 'interest'],
  roi:           ['roi'],
};

// Expense category (exact name in pnl_tracker.expense_categories) -> accepted labels
export const EXPENSES = {
  'Rent + CAM':           ['rent cam', 'rent and cam', 'rent'],
  'Staff Salaries':       ['staff salaries', 'staff salary', 'salaries', 'salary'],
  'Electricity Bill':     ['electricity bill', 'electricity'],
  'Telephone & Internet': ['telephone and internet', 'telephone', 'internet'],
  'Petty Cash':           ['petty cash'],
  'House Keeping':        ['house keeping', 'housekeeping'],
  'Staff Incentives':     ['staff incentives', 'staff incentive', 'incentives', 'incentive'],
  'Bank EDC Charges':     ['bank edc charges', 'edc charges', 'edc'],
  'Bank UPI Charges':     ['bank upi charges', 'upi charges', 'upi'],
};

// Lines that are totals, results or reference figures: never imported, never warned about.
const IGNORED_PREFIXES = ['total', 'net', 'operating profit', 'opex', 'breakeven', 'cost sq', 'rental deposit', 'stock deposit',
  'capital expenditure', 'capex', 'store', 'month', 'period', 'category', 'sl no', 'expenses'];
const OPEX_TOTAL_PREFIXES = ['total operating', 'total opex', 'total expenses'];

/** "Rent+CAM [May+Jun+July]" -> "rent cam";  "Bank EDC Charges(1.2% on Card Sale)" -> "bank edc charges". */
const norm = (s) => String(s ?? '').toLowerCase()
  .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

const startsWithWords = (label, alias) => label === alias || label.startsWith(`${alias} `);
const isIgnored = (n) => IGNORED_PREFIXES.some((p) => startsWithWords(n, p));

// Longest alias first, so "staff incentives" is tried before "staff", "rent cam" before "rent".
const ALIASES = [
  ...Object.entries(FIELDS).flatMap(([field, list]) => list.map((alias) => ({ alias, key: { field } }))),
  ...Object.entries(EXPENSES).flatMap(([expense, list]) => list.map((alias) => ({ alias, key: { expense } }))),
].sort((a, b) => b.alias.length - a.alias.length);

function labelToKey(label) {
  const n = norm(label);
  if (!n || isIgnored(n)) return null;
  return ALIASES.find(({ alias }) => startsWithWords(n, alias))?.key || null;
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

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Put one cell into a month record. First line wins: the file repeats "Funds Cost" and
 * "Depreciation" in its reference block lower down, and those must not overwrite the P&L lines.
 * ROI is kept in percent units: a cell stored as the fraction -0.0539 with a % number format
 * (isPct) becomes -5.39.
 */
function assign(rec, key, value, isPct) {
  const n = toNumber(value);
  if (n == null) return;
  if (key.field) {
    if (rec[key.field] != null) return;
    rec[key.field] = key.field === 'roi' ? round2(isPct ? n * 100 : n) : round2(n);
  } else if (rec.expenses[key.expense] == null) {
    rec.expenses[key.expense] = round2(n);
  }
}

/** grid = sheet_to_json(header:1) of ws; cell(r, c) gives the worksheet cell behind grid[r][c]. */
function cellGetter(ws) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  return (r, c) => ws[XLSX.utils.encode_cell({ r: range.s.r + r, c: range.s.c + c })];
}
const isPctCell = (cell) => typeof cell?.z === 'string' && cell.z.includes('%');

/** Months as rows: header row contains "Month". */
function parseRowLayout(grid, cell, warnings) {
  const isMonthHead = (c) => ['month', 'period'].includes(norm(c));
  const h = grid.findIndex((row) => row.some(isMonthHead));
  if (h < 0) return null;
  const header = grid[h];
  const monthCol = header.findIndex(isMonthHead);
  const cols = header.map((c, i) => ({ i, label: c, key: i === monthCol ? null : labelToKey(c), opexTotal: OPEX_TOTAL_PREFIXES.some((p) => startsWithWords(norm(c), p)) }));
  cols.filter((c) => c.i !== monthCol && !c.key && norm(c.label) && !isIgnored(norm(c.label)))
    .forEach((c) => warnings.push(`Column "${c.label}" was not recognised and was skipped.`));
  const out = [];
  grid.slice(h + 1).forEach((row, r) => {
    if (row.every((c) => String(c ?? '').trim() === '')) return;
    const month = toMonth(row[monthCol]);
    if (!month) { if (!isIgnored(norm(row[monthCol]))) warnings.push(`Row ${h + r + 2}: "${row[monthCol] ?? ''}" is not a month, skipped.`); return; }
    const rec = emptyMonth(month);
    cols.forEach((c) => {
      if (c.key) assign(rec, c.key, row[c.i], isPctCell(cell(h + 1 + r, c.i)));
      else if (c.opexTotal) rec.fileOpex = toNumber(row[c.i]);
    });
    out.push(rec);
  });
  return out;
}

/** Months as columns: a row with at least two month headers; line items down the label column. */
function parseColumnLayout(grid, cell, warnings) {
  const h = grid.findIndex((row) => row.filter((c) => toMonth(c)).length >= 2);
  if (h < 0) return null;
  const monthCols = grid[h].map((c, i) => ({ i, month: toMonth(c) })).filter((c) => c.month);
  const firstMonthCol = monthCols[0].i;
  // Label column: the text column left of the months that most rows fill ("Category", not "SL.NO").
  let labelCol = 0, best = -1;
  for (let c = 0; c < firstMonthCol; c++) {
    const n = grid.slice(h + 1).filter((row) => typeof row[c] === 'string' && row[c].trim() && toNumber(row[c]) == null).length;
    if (n > best) { best = n; labelCol = c; }
  }
  const recs = new Map(monthCols.map((c) => [c.month, emptyMonth(c.month)]));
  grid.slice(h + 1).forEach((row, r) => {
    const label = row[labelCol];
    const n = norm(label);
    if (!n) return;
    if (OPEX_TOTAL_PREFIXES.some((p) => startsWithWords(n, p))) {
      monthCols.forEach((c) => { const rec = recs.get(c.month); if (rec.fileOpex == null) rec.fileOpex = toNumber(row[c.i]); });
      return;
    }
    const key = labelToKey(label);
    if (!key) {
      if (!isIgnored(n) && monthCols.some((c) => toNumber(row[c.i]) != null)) warnings.push(`Line "${label}" was not recognised and was skipped.`);
      return;
    }
    monthCols.forEach((c) => assign(recs.get(c.month), key, row[c.i], isPctCell(cell(h + 1 + r, c.i))));
  });
  return [...recs.values()];
}

export const opexOf = (m) => round2(Object.values(m.expenses).reduce((s, v) => s + (v || 0), 0));
const hasFigures = (m) => m.gross_sale != null || m.income_margin != null || m.depreciation != null
  || m.funds_cost != null || m.roi != null || Object.keys(m.expenses).length > 0;

/**
 * Parse the first sheet that yields months. Returns { months, warnings, sheet, layout, skipped }.
 * Months are sorted and de-duplicated; months with no figures are dropped (listed in `skipped`).
 */
export function parsePnLWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true, cellNF: true });
  for (const sheet of wb.SheetNames) {
    const ws = wb.Sheets[sheet];
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: true });
    const cell = cellGetter(ws);
    let warnings = [];
    let layout = 'rows';
    let months = parseRowLayout(grid, cell, warnings);
    if (!months || months.length === 0) { layout = 'columns'; warnings = []; months = parseColumnLayout(grid, cell, warnings); }
    if (!months || months.length === 0) continue;

    const byMonth = new Map();
    months.forEach((m) => {
      if (byMonth.has(m.period_month)) warnings.push(`${m.period_month.slice(0, 7)} appears more than once; the last one is used.`);
      byMonth.set(m.period_month, m);
    });
    const all = [...byMonth.values()].sort((a, b) => a.period_month.localeCompare(b.period_month));
    const list = all.filter(hasFigures);
    const skipped = all.filter((m) => !hasFigures(m)).map((m) => m.period_month.slice(0, 7));
    list.forEach((m) => {
      const ym = m.period_month.slice(0, 7);
      if (m.gross_sale == null) warnings.push(`${ym}: no Sales figure found.`);
      if (m.income_margin == null) warnings.push(`${ym}: no Income on Sales / margin found.`);
      if (Object.keys(m.expenses).length === 0) warnings.push(`${ym}: no expense lines found.`);
      // The file's own Opex total must equal the lines we read; if not, a line was missed or renamed.
      if (m.fileOpex != null && Math.abs(m.fileOpex - opexOf(m)) > 1) {
        warnings.push(`${ym}: expense lines add up to ${opexOf(m).toLocaleString('en-IN')} but the file's Opex total is ${round2(m.fileOpex).toLocaleString('en-IN')}.`);
      }
      delete m.fileOpex;
    });
    return { months: list, warnings, sheet, layout, skipped };
  }
  return { months: [], warnings: ['No sheet has a "Month" column or a row of month headers (e.g. Jul-2026).'], sheet: null, layout: null, skipped: [] };
}
