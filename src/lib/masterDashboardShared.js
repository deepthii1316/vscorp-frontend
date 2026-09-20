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
  const line = (name, division, t, tp) => ({
    name,
    nsv: t.nsv,
    contribution: total.nsv > 0 ? (t.nsv / total.nsv) * 100 : null,
    qty: t.qty,
    bills: t.bills,
    mdPct: t.mrp > 0 ? ((t.mrp - t.nsv) / t.mrp) * 100 : null,
    nsvChange: tp ? change(t.nsv, tp.nsv, 'pct') : null,
  });
  const rows = DIVISION_LIST.map((d) => line(d, d, sumDays(days, d), hasPrev ? sumDays(prevDays, d) : null));
  const un = unclassifiedOf(days);
  if (un) {
    rows.push({ name: 'Unclassified', nsv: un.nsv, contribution: total.nsv > 0 ? (un.nsv / total.nsv) * 100 : null, qty: un.qty, bills: null, mdPct: null, nsvChange: null, warning: true });
  }
  return { rows, total: line('Total', 'ALL', total, totalPrev) };
}
