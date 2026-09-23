// Master Dashboard shared helpers: formatting and the pure calculations used by the Overview tab.
// No React and no database access here, so the same code is used by the page and by the tests.

// ─── Formatting ────────────────────────────────────────────────────────────

/** Compact rupees: 1.2L, 3.4Cr. Use for charts and axes. */
export function formatINR(val) {
  if (val === null || val === undefined || isNaN(val)) return '₹0';
  const num = Number(val);
  if (Math.abs(num) >= 10000000) return `₹${(num / 10000000).toFixed(2)}Cr`;
  if (Math.abs(num) >= 100000) return `₹${(num / 100000).toFixed(1)}L`;
  if (Math.abs(num) >= 1000) return `₹${(num / 1000).toFixed(1)}k`;
  return `₹${Math.round(num).toLocaleString('en-IN')}`;
}

/** Full rupees with Indian grouping: 1,16,932. Use for KPI tiles so they can be checked against reports. */
export function formatINRFull(val) {
  if (val === null || val === undefined || isNaN(val)) return '-';
  const n = Math.round(Number(val));
  return `${n < 0 ? '-' : ''}₹${Math.abs(n).toLocaleString('en-IN')}`;
}

export function formatNumber(val) {
  if (val === null || val === undefined || isNaN(val)) return '0';
  return Math.round(Number(val)).toLocaleString('en-IN');
}

export function formatPercent(val) {
  if (val === null || val === undefined || isNaN(val)) return '-';
  return `${Number(val).toFixed(1)}%`;
}

export const QUICK_RANGES = [
  { label: 'WTD', value: 'wtd' },
  { label: 'MTD', value: 'mtd' },
  { label: 'YTD', value: 'ytd' },
  { label: 'All', value: 'all' },
];

export const DIVISIONS = [
  { label: 'All divisions', value: 'ALL' },
  { label: 'Footwear', value: 'Footwear' },
  { label: 'Apparel', value: 'Apparel' },
  { label: 'Accessories', value: 'Accessories' },
];

// ─── Dates ─────────────────────────────────────────────────────────────────

const iso = (d) => d.toISOString().split('T')[0];
const utc = (s) => new Date(s + 'T00:00:00Z');

/** Inclusive number of days between two ISO dates. */
export function daysBetween(start, end) {
  return Math.round((utc(end) - utc(start)) / 86400000) + 1;
}

/** Shift an ISO date back by one calendar month, clamping the day (31 Mar -> 28 Feb). */
export function shiftOneMonth(dateStr) {
  const d = utc(dateStr);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const lastDayPrevMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return iso(new Date(Date.UTC(y, m - 1, Math.min(day, lastDayPrevMonth))));
}

/**
 * Month-on-month comparison window: the same day range one month earlier.
 * Only meaningful for ranges up to one month; longer ranges return null (no comparison).
 */
export function comparisonRange(start, end) {
  if (!start || !end || daysBetween(start, end) > 31) return null;
  return { start: shiftOneMonth(start), end: shiftOneMonth(end) };
}

// ─── Aggregation ───────────────────────────────────────────────────────────

const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);

const DIVISION_COLUMNS = {
  ALL:         { nsv: 'nsv',             mrp: 'mrp_value',       qty: 'qty',             bills: 'bills' },
  Footwear:    { nsv: 'footwear_nsv',    mrp: 'footwear_mrp',    qty: 'footwear_qty',    bills: 'footwear_bills' },
  Apparel:     { nsv: 'apparel_nsv',     mrp: 'apparel_mrp',     qty: 'apparel_qty',     bills: 'apparel_bills' },
  Accessories: { nsv: 'accessories_nsv', mrp: 'accessories_mrp', qty: 'accessories_qty', bills: 'accessories_bills' },
};

/**
 * Sum day rows into totals for one division. Ratios are NEVER summed: only their inputs are.
 * Note: a bill counts for every division it touched, so division bills can exceed store bills.
 */
export function sumDays(rows, division = 'ALL') {
  const c = DIVISION_COLUMNS[division] || DIVISION_COLUMNS.ALL;
  const t = { nsv: 0, mrp: 0, qty: 0, bills: 0, socks: 0, shoes: 0, days: 0 };
  for (const r of rows || []) {
    t.nsv += num(r[c.nsv]);
    t.mrp += num(r[c.mrp]);
    t.qty += num(r[c.qty]);
    t.bills += num(r[c.bills]);
    t.socks += num(r.socks_qty);
    t.shoes += num(r.shoes_qty);
    t.days += 1;
  }
  return t;
}

/**
 * KPI values from summed totals.
 *   MD %  = (MRP - NSV) / MRP x 100          (decided 20-Sep-2026)
 *   ATV   = NSV / Bills
 *   SSR   = socks qty / shoes qty x 100      (store-level; only for All and Footwear)
 * A ratio with no valid denominator is null (shown as a dash), never 0 or Infinity.
 */
export function kpisFrom(t, rangeDays, division = 'ALL') {
  const ssrApplies = division === 'ALL' || division === 'Footwear';
  return {
    nsv: t.nsv,
    avgPerDay: rangeDays > 0 ? t.nsv / rangeDays : null,
    mdPct: t.mrp > 0 ? ((t.mrp - t.nsv) / t.mrp) * 100 : null,
    qty: t.qty,
    bills: t.bills,
    atv: t.bills > 0 ? t.nsv / t.bills : null,
    ssr: ssrApplies && t.shoes > 0 ? (t.socks / t.shoes) * 100 : null,
    days: rangeDays,
  };
}

/**
 * Change versus the comparison period.
 *   kind 'pct'    -> growth in percent (cur/prev - 1) x 100
 *   kind 'points' -> difference in percentage points (for ratios such as MD % and SSR)
 * Returns null when there is nothing to compare against (shown as a dash, never as 0).
 */
export function change(cur, prev, kind = 'pct') {
  if (cur === null || cur === undefined || prev === null || prev === undefined) return null;
  if (kind === 'points') return cur - prev;
  return prev > 0 ? (cur / prev - 1) * 100 : null;
}

// ─── Payments ──────────────────────────────────────────────────────────────

export const PAYMENT_MODES = [
  { key: 'upi_amount',    label: 'UPI / QR',     color: '#1F6B45' },
  { key: 'card_amount',   label: 'Card',         color: '#2563EB' },
  { key: 'cash_amount',   label: 'Cash',         color: '#0D9488' },
  { key: 'amex_amount',   label: 'AMEX',         color: '#C97A1D' },
  { key: 'zomato_amount', label: 'Zomato',       color: '#B33A3A' },
  { key: 'gv_amount',     label: 'Gift voucher', color: '#8A8A82' },
];

/** Sum the daily payment rows. total = sum of the six modes; shares are of that total. */
export function sumPayments(rows) {
  const totals = { total: 0, dayCount: 0 };
  for (const m of PAYMENT_MODES) totals[m.key] = 0;
  for (const r of rows || []) {
    for (const m of PAYMENT_MODES) totals[m.key] += num(r[m.key]);
    totals.total += num(r.total_collected);
    totals.dayCount += 1;
  }
  const modes = PAYMENT_MODES.map((m) => ({
    ...m,
    amount: totals[m.key],
    pct: totals.total > 0 ? (totals[m.key] / totals.total) * 100 : 0,
  }));
  return { total: totals.total, dayCount: totals.dayCount, modes };
}

// ─── Chart data ────────────────────────────────────────────────────────────

/** Fixed chart colours (same hues as the app tokens; literal hex so charts also render in screenshots). */
export const CHART_COLORS = {
  green: '#1F6B45', blue: '#2563EB', teal: '#0D9488', amber: '#C97A1D', rose: '#B33A3A',
  grid: '#E8E5DC', axis: '#8A8A82', previous: '#8A8A82',
};
export const DIVISION_LIST = ['Footwear', 'Apparel', 'Accessories'];
export const DIVISION_COLORS = { Footwear: '#1F6B45', Apparel: '#2563EB', Accessories: '#C97A1D' };

export const TREND_METRICS = [
  { key: 'nsv',    label: 'NSV',      kind: 'inr' },
  { key: 'qty',    label: 'Qty sold', kind: 'num' },
  { key: 'bills',  label: 'Bills',    kind: 'num' },
  { key: 'atv',    label: 'ATV',      kind: 'inr' },
  { key: 'mdPct',  label: 'MD %',     kind: 'pct' },
  { key: 'ssr',    label: 'SSR',      kind: 'pct' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function addDays(dateStr, n) { return iso(new Date(utc(dateStr).getTime() + n * 86400000)); }
export function shortLabel(dateStr) { const d = utc(dateStr); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; }

/** One day's value for a trend metric. Ratios come from that day's own inputs. */
function dayValue(row, division, key) {
  return kpisFrom(sumDays([row], division), 1, division)[key];
}

/**
 * Daily series for the trend chart and KPI sparklines. The comparison month is aligned by day
 * offset (day 1 of the range with day 1 of the comparison range).
 * Returns [{ offset, date, label, cur, prev }] with null where a day has no data.
 */
export function trendSeries(days, prevDays, division, key, rangeStart, rangeDays, prevStart) {
  const cur = new Map();
  for (const r of days || []) cur.set(daysBetween(rangeStart, r.full_date) - 1, dayValue(r, division, key));
  const prev = new Map();
  if (prevStart) for (const r of prevDays || []) prev.set(daysBetween(prevStart, r.full_date) - 1, dayValue(r, division, key));
  const out = [];
  for (let i = 0; i < rangeDays; i++) {
    const date = addDays(rangeStart, i);
    out.push({ offset: i, date, label: shortLabel(date), cur: cur.has(i) ? cur.get(i) : null, prev: prev.has(i) ? prev.get(i) : null });
  }
  return out;
}

/** NSV per week of the range (days 1-7, 8-14, ...), current versus the aligned comparison weeks. */
export function weeklyNsv(days, prevDays, division, rangeStart, rangeDays, prevStart) {
  const weeks = Math.ceil(rangeDays / 7);
  const out = [];
  for (let w = 0; w < weeks; w++) {
    const from = w * 7, to = Math.min(from + 7, rangeDays) - 1;
    const inWeek = (start) => (r) => { const o = daysBetween(start, r.full_date) - 1; return o >= from && o <= to; };
    out.push({
      label: `Week ${w + 1}`,
      sub: `${shortLabel(addDays(rangeStart, from))} - ${shortLabel(addDays(rangeStart, to))}`,
      cur: sumDays((days || []).filter(inWeek(rangeStart)), division).nsv,
      prev: prevStart ? sumDays((prevDays || []).filter(inWeek(prevStart)), division).nsv : null,
    });
  }
  return out;
}

/** Division split for the donuts: NSV and qty per division. */
export function divisionSplit(days) {
  const parts = DIVISION_LIST.map((d) => { const t = sumDays(days, d); return { name: d, nsv: t.nsv, qty: t.qty }; });
  const un = unclassifiedOf(days);
  return un ? [...parts, { name: 'Unclassified', nsv: un.nsv, qty: un.qty }] : parts;
}

/**
 * Sales lines that carry no division (a new class name the pipeline could not place) are in the
 * store total but in none of the three division columns. Returned so they are shown, never hidden.
 */
export function unclassifiedOf(days) {
  const total = sumDays(days, 'ALL');
  const parts = DIVISION_LIST.map((d) => sumDays(days, d));
  const nsv = total.nsv - parts.reduce((s, p) => s + p.nsv, 0);
  const qty = total.qty - parts.reduce((s, p) => s + p.qty, 0);
  return Math.abs(nsv) > 0.5 || Math.abs(qty) > 0.001 ? { nsv, qty } : null;
}

/** Rows for the division performance table, plus a total row (ratios recomputed from sums). */
export function divisionTable(days, prevDays, hasPrev) {
  const total = sumDays(days, 'ALL');
  const totalPrev = hasPrev ? sumDays(prevDays, 'ALL') : null;
  const line = (name, division, t, tp) => {
    const mdPct = t.mrp > 0 ? ((t.mrp - t.nsv) / t.mrp) * 100 : null;
    const tpMdPct = tp && tp.mrp > 0 ? ((tp.mrp - tp.nsv) / tp.mrp) * 100 : null;
    return {
      name,
      nsv: t.nsv,
      contribution: total.nsv > 0 ? (t.nsv / total.nsv) * 100 : null,
      qty: t.qty,
      bills: t.bills,
      mdPct,
      nsvChange: tp ? change(t.nsv, tp.nsv, 'pct') : null,
      qtyChange: tp ? change(t.qty, tp.qty, 'pct') : null,
      billsChange: tp ? change(t.bills, tp.bills, 'pct') : null,
      // MD% is already a percentage, so its own change is expressed in percentage points
      // (e.g. 32% -> 35% is "+3 pts"), never as a percent-of-a-percent.
      mdPctChange: tp ? change(mdPct, tpMdPct, 'points') : null,
    };
  };
  const rows = DIVISION_LIST.map((d) => line(d, d, sumDays(days, d), hasPrev ? sumDays(prevDays, d) : null));
  const un = unclassifiedOf(days);
  if (un) {
    rows.push({ name: 'Unclassified', nsv: un.nsv, contribution: total.nsv > 0 ? (un.nsv / total.nsv) * 100 : null, qty: un.qty, bills: null, mdPct: null, nsvChange: null, qtyChange: null, billsChange: null, mdPctChange: null, warning: true });
  }
  return { rows, total: line('Total', 'ALL', total, totalPrev) };
}

// ─── Filter date ranges ────────────────────────────────────────────────────
// Presets are anchored on the latest date that has data (never the system clock).
// Groups are mutually exclusive: quick range, week, month, half-year, quarter, custom dates.

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;          // m is 1-12
const lastDayOf = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const partsOf = (dateStr) => ({ y: +dateStr.slice(0, 4), m: +dateStr.slice(5, 7), d: +dateStr.slice(8, 10) });

/** WTD (Monday of the anchor's week), MTD, YTD (most recent 1 July) and All (from the first data date). */
export function quickRange(preset, anchor, firstDate) {
  const { y, m } = partsOf(anchor);
  if (preset === 'WTD') {
    const e = utc(anchor);
    const monday = new Date(e.getTime() - ((e.getUTCDay() + 6) % 7) * 86400000);
    return [iso(monday), anchor];
  }
  if (preset === 'MTD') return [ymd(y, m, 1), anchor];
  if (preset === 'YTD') return [ymd(m >= 7 ? y : y - 1, 7, 1), anchor];
  return [firstDate || anchor, anchor];
}

/** Week n (1-5) of a month: days 1-7, 8-14, 15-21, 22-28, 29-end. Null when the month has no such week. */
export function weekOfMonth(year, month, week) {
  const last = lastDayOf(year, month);
  const from = (week - 1) * 7 + 1;
  if (week < 1 || week > 5 || from > last) return null;
  return [ymd(year, month, from), ymd(year, month, week === 5 ? last : Math.min(week * 7, last))];
}

export function monthRange(year, month) {
  return [ymd(year, month, 1), ymd(year, month, lastDayOf(year, month))];
}

/** Weeks (1-5) that exist in the anchor month and have started by the anchor date. */
export function availableWeeks(anchor) {
  const { y, m, d } = partsOf(anchor);
  return [1, 2, 3, 4, 5].filter((w) => { const r = weekOfMonth(y, m, w); return r && partsOf(r[0]).d <= d; });
}

/**
 * Half-year (kind 'H', index 1-2) or quarter (kind 'Q', index 1-4).
 * financial = April to March year that contains the anchor date; calendar = January to December.
 */
export function periodBounds(kind, index, fiscal, anchor) {
  const { y, m } = partsOf(anchor);
  const size = kind === 'H' ? 6 : 3;
  const base = fiscal === 'financial' ? (m >= 4 ? y : y - 1) * 12 + 3 : y * 12;   // absolute month index of the year's first month
  const startAbs = base + (index - 1) * size;
  const endAbs = startAbs + size - 1;
  const sy = Math.floor(startAbs / 12), sm = (startAbs % 12) + 1;
  const ey = Math.floor(endAbs / 12), em = (endAbs % 12) + 1;
  return [ymd(sy, sm, 1), ymd(ey, em, lastDayOf(ey, em))];
}

/** Several halves/quarters selected: the range spans the earliest start to the latest end. */
function spanOf(ranges) {
  if (!ranges.length) return null;
  return [ranges.map((r) => r[0]).sort()[0], ranges.map((r) => r[1]).sort().slice(-1)[0]];
}

function clampToData(range, anchor) {
  if (!range) return { start: null, end: null, clamped: false, empty: true };
  let [start, end] = range;
  const clamped = end > anchor;
  if (clamped) end = anchor;
  return { start, end, clamped, empty: start > end };
}

/**
 * Turn the filter selection into a date range.
 * sel = { group: 'quick'|'week'|'month'|'half'|'quarter'|'custom', quick, week, month, halves[], quarters[], fiscal, from, to }
 * Returns { start, end, clamped, empty }; end is never later than the latest data date.
 */
export function resolveRange(sel, anchor, firstDate) {
  if (!anchor) return { start: null, end: null, clamped: false, empty: true };
  const { y, m } = partsOf(anchor);
  let range = null;
  if (sel.group === 'quick') range = quickRange(sel.quick, anchor, firstDate);
  else if (sel.group === 'week') range = weekOfMonth(y, m, sel.week);
  else if (sel.group === 'month') range = monthRange(y, sel.month);
  else if (sel.group === 'half') range = spanOf((sel.halves || []).map((i) => periodBounds('H', i, sel.fiscal, anchor)));
  else if (sel.group === 'quarter') range = spanOf((sel.quarters || []).map((i) => periodBounds('Q', i, sel.fiscal, anchor)));
  else if (sel.group === 'custom' && sel.from && sel.to && sel.from <= sel.to) range = [sel.from, sel.to];
  return clampToData(range, anchor);
}

/** One side of Compare mode: year + month, optionally a week (1-5, 0 or null = the whole month). */
export function periodRange(p, anchor) {
  const range = p.week ? weekOfMonth(p.year, p.month, p.week) : monthRange(p.year, p.month);
  return clampToData(range, anchor);
}

const addDaysTo = (dateStr, n) => iso(new Date(utc(dateStr).getTime() + n * 86400000));

/**
 * Compare mode windows. When either period is cut short by the data (for example the current month is
 * only partly loaded), both are limited to the same number of days so the comparison is like for like.
 * Returns { a, b, limitedTo } where limitedTo is the day count when limiting was applied.
 */
export function compareWindows(pa, pb, anchor) {
  const a = periodRange(pa, anchor);
  const b = periodRange(pb, anchor);
  if (a.empty || b.empty) return { a, b, limitedTo: null };
  const da = daysBetween(a.start, a.end), db = daysBetween(b.start, b.end);
  const full = (p) => (p.week ? weekOfMonth(p.year, p.month, p.week) : monthRange(p.year, p.month));
  const fa = full(pa), fb = full(pb);
  const aShort = a.end < fa[1], bShort = b.end < fb[1];
  if (!aShort && !bShort) return { a, b, limitedTo: null };
  const n = Math.min(da, db);
  return {
    a: { ...a, end: addDaysTo(a.start, n - 1) },
    b: { ...b, end: addDaysTo(b.start, n - 1) },
    limitedTo: n,
  };
}
