// Shared calculations for the Store Board (Uppal Reebok). Pure functions, no React.
//
// Targets follow the SAME rules as the Sales Reports (src/lib/email/reebokHelpers.js), so the
// Store Board and the daily report can never disagree:
//   daily target = that month's target ÷ days in the month
//   WTD target   = sum of the daily targets from Monday to the latest sales date
//   MTD target   = daily target × day of month        (MTD_TARGET)
//   YTD target   = completed months since 1 July + this month's MTD target   (YTD_TARGET)
// Every window ends on the latest date that has sales, never on today's date.
// Day rows come from gold.reebok_master_dashboard: one row per day with nsv, qty, bills,
// mrp_value, footwear_qty, apparel_qty, accessories_qty, socks_qty, shoes_qty.

import { calcTarget, MTD_TARGET, YTD_TARGET, monthlyTarget } from '@/lib/email/reebokHelpers';

const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);
const pad2 = (n) => String(n).padStart(2, '0');
const utc = (iso) => new Date(`${iso}T00:00:00Z`);
const toIso = (d) => d.toISOString().slice(0, 10);

export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Dates ─────────────────────────────────────────────────────────────────
export const addDays = (iso, n) => toIso(new Date(utc(iso).getTime() + n * 86400000));
export const monthStart = (iso) => `${iso.slice(0, 7)}-01`;
/** Monday of the week the date falls in. */
export const weekStart = (iso) => addDays(iso, -((utc(iso).getUTCDay() + 6) % 7));
/** YTD starts on the most recent 1 July. */
export function fiscalYearStart(iso) {
  const y = +iso.slice(0, 4), m = +iso.slice(5, 7);
  return `${m >= 7 ? y : y - 1}-07-01`;
}
export const lastDayOfMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate(); // month 1-12
/** The same date one calendar month earlier, clamped to that month's last day (31 Mar -> 28 Feb). */
export function monthEarlier(iso) {
  const y = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8, 10);
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
  return `${py}-${pad2(pm)}-${pad2(Math.min(d, lastDayOfMonth(py, pm)))}`;
}
export const dayLabel = (iso) => `${pad2(+iso.slice(8, 10))} ${MONTH_SHORT[+iso.slice(5, 7) - 1]}`;
export const dayLabelLong = (iso) => `${dayLabel(iso)} ${iso.slice(0, 4)}`;
export const weekdayOf = (iso) => DAY_SHORT[utc(iso).getUTCDay()];

/** The dates a quick button stands for. Anchored on the latest sales date. */
export function rangeForMode(mode, latestDate, customStart, customEnd) {
  if (!latestDate) return null;
  if (mode === 'custom') return customStart && customEnd && customStart <= customEnd ? { start: customStart, end: customEnd } : null;
  if (mode === 'today') return { start: latestDate, end: latestDate };
  if (mode === 'wtd') return { start: weekStart(latestDate), end: latestDate };
  if (mode === 'mtd') return { start: monthStart(latestDate), end: latestDate };
  if (mode === 'ytd') return { start: fiscalYearStart(latestDate), end: latestDate };
  return null;
}

// ─── Totals and KPIs ───────────────────────────────────────────────────────
export const inRange = (rows, start, end, field = 'full_date') => (rows || []).filter((r) => r[field] >= start && r[field] <= end);

/** Sum day rows. Ratios are never summed: only their inputs are. */
export function totals(days) {
  const t = { nsv: 0, qty: 0, bills: 0, mrp: 0, footwear: 0, apparel: 0, accessories: 0, socks: 0, shoes: 0, days: 0 };
  for (const r of days || []) {
    t.nsv += num(r.nsv);
    t.qty += num(r.qty);
    t.bills += num(r.bills);
    t.mrp += num(r.mrp_value);
    t.footwear += num(r.footwear_qty);
    t.apparel += num(r.apparel_qty);
    t.accessories += num(r.accessories_qty);
    t.socks += num(r.socks_qty);
    t.shoes += num(r.shoes_qty);
    t.days += 1;
  }
  return t;
}

const ratio = (a, b) => (b > 0 ? a / b : null); // null = cannot be worked out (shown as a dash)

/**
 * KPI values from summed totals, same definitions as REEBOOK_KPI_DEFINITIONS.md.
 * `footfall` is the number of walk-ins for the same dates (0 when none is recorded).
 */
export function kpisFrom(t, footfall = 0) {
  return {
    atv: ratio(t.nsv, t.bills),
    upt: ratio(t.qty, t.bills),
    asp: ratio(t.nsv, t.qty),
    fupt: ratio(t.footwear, t.bills),
    sfr: ratio(t.socks, t.footwear),                 // socks per footwear unit (a ratio, as in the Sales Reports)
    afr: ratio(t.apparel, t.footwear),               // apparel per footwear unit
    ssr: t.shoes > 0 ? (t.socks / t.shoes) * 100 : null,
    mdPct: t.mrp > 0 ? ((t.mrp - t.nsv) / t.mrp) * 100 : null,
    conversion: footfall > 0 ? (t.bills / footfall) * 100 : null,
  };
}

/** Percent change, null when there is nothing to compare with. */
export const pctChange = (current, previous) => (previous > 0 ? ((current - previous) / previous) * 100 : null);
export const achievement = (actual, target) => (target > 0 ? (actual / target) * 100 : null);
export const achClass = (pct) => (pct === null || pct === undefined ? '' : pct >= 100 ? 'positive' : pct >= 75 ? 'warning' : 'negative');

// ─── Targets ───────────────────────────────────────────────────────────────
/** Sum of the daily targets for every day in [start, end]. */
export function targetForRange(start, end) {
  let sum = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) sum += calcTarget(d) || 0;
  return sum;
}

/**
 * Target vs Achievement: WTD, MTD and YTD, each with its own dates, target and actuals.
 * "Previous" is the same number of days one step back (last week / last month); the store
 * opened in July 2026, so there is no last year to compare with yet.
 */
export function achievementRows(allDays, latestDate) {
  const row = (label, start, target, prevStart, prevEnd, prevName) => {
    const cur = totals(inRange(allDays, start, latestDate));
    const prev = prevStart ? totals(inRange(allDays, prevStart, prevEnd)) : null;
    // The earlier period is judged against its OWN target for those same days.
    const prevTarget = prev ? targetForRange(prevStart, prevEnd) : null;
    return {
      label, start, end: latestDate, target,
      actual: cur.nsv, qty: cur.qty, bills: cur.bills,
      gap: cur.nsv - target,
      ach: achievement(cur.nsv, target),
      prevName: prev ? prevName : null, prevStart: prev ? prevStart : null, prevEnd: prev ? prevEnd : null,
      prevActual: prev ? prev.nsv : null,
      prevTarget,
      prevAch: prev ? achievement(prev.nsv, prevTarget) : null,
      change: prev ? pctChange(cur.nsv, prev.nsv) : null,
    };
  };
  const wk = weekStart(latestDate), mo = monthStart(latestDate), fy = fiscalYearStart(latestDate);
  const prevMo = monthEarlier(mo);
  return [
    row('WTD', wk, targetForRange(wk, latestDate), addDays(wk, -7), addDays(latestDate, -7), 'Last week'),
    row('MTD', mo, MTD_TARGET(latestDate) || 0, prevMo, monthEarlier(latestDate), MONTH_NAMES[+prevMo.slice(5, 7) - 1]),
    row('YTD', fy, YTD_TARGET(latestDate) || 0, null, null, null),
  ];
}

// ─── Weekly Business Plan ──────────────────────────────────────────────────
// The month's target split into fixed blocks of days (1-7, 8-14, 15-21, 22-28, 29-end) with
// weighted shares, then into days with Saturday and Sunday weighing more (STORE_BOARD_REFERENCE §6).
// This is a PLAN for pacing the month; it is deliberately different from the even daily target
// used in Target vs Achievement and in the Sales Reports.
const WEEK_SHARES = { 5: [0.25, 0.20, 0.20, 0.20, 0.15], 4: [0.30, 0.25, 0.25, 0.20] };
const dayWeight = (iso) => { const d = utc(iso).getUTCDay(); return d === 0 || d === 6 ? 20 : 12; };

export function weeklyPlan(allDays, latestDate) {
  const year = +latestDate.slice(0, 4), month = +latestDate.slice(5, 7);
  const last = lastDayOfMonth(year, month);
  const monthTarget = monthlyTarget(latestDate);
  const shares = WEEK_SHARES[last > 28 ? 5 : 4];
  const byDate = new Map((allDays || []).map((r) => [r.full_date, num(r.nsv)]));
  const iso = (d) => `${year}-${pad2(month)}-${pad2(d)}`;

  const weeks = shares.map((share, i) => {
    const from = i * 7 + 1, to = i === shares.length - 1 ? last : (i + 1) * 7;
    const dates = [];
    for (let d = from; d <= to; d++) dates.push(iso(d));
    const weekTarget = monthTarget * share;
    const weightSum = dates.reduce((s, d) => s + dayWeight(d), 0);
    const days = dates.map((date) => {
      const target = Math.round((weekTarget * dayWeight(date)) / weightSum);
      const done = date <= latestDate;
      const actual = done ? (byDate.get(date) || 0) : null;
      return { date, target, actual, gap: done ? actual - target : null, ach: done ? achievement(actual, target) : null };
    });
    const started = dates[0] <= latestDate;
    const actual = started ? days.reduce((s, d) => s + (d.actual || 0), 0) : null;
    return {
      label: `Week ${i + 1}`, start: dates[0], end: dates[dates.length - 1], share, target: weekTarget, days,
      actual, gap: started ? actual - weekTarget : null, ach: started ? achievement(actual, weekTarget) : null,
      isCurrent: dates[0] <= latestDate && latestDate <= dates[dates.length - 1],
    };
  });
  const mtdActual = weeks.reduce((s, w) => s + (w.actual || 0), 0);
  return { year, month, monthTarget, weeks, mtdActual, mtdAch: achievement(mtdActual, monthTarget) };
}

// ─── Annual Business Plan ──────────────────────────────────────────────────
/** One row per month from 1 July to the month of the latest sales date. */
export function annualPlan(allDays, latestDate) {
  const months = [];
  let y = +fiscalYearStart(latestDate).slice(0, 4), m = 7;
  const endY = +latestDate.slice(0, 4), endM = +latestDate.slice(5, 7);
  while (y < endY || (y === endY && m <= endM)) {
    const key = `${y}-${pad2(m)}`;
    const actual = totals((allDays || []).filter((r) => r.full_date.startsWith(key))).nsv;
    const prev = months[months.length - 1];
    const isCurrent = y === endY && m === endM;
    const fullTarget = monthlyTarget(`${key}-01`);
    // The month in progress is measured against its target to date, like MTD everywhere else.
    const target = isCurrent ? (MTD_TARGET(latestDate) || 0) : fullTarget;
    months.push({
      key, label: `${MONTH_SHORT[m - 1]} ${y}`, target, fullTarget, actual, isCurrent,
      ach: achievement(actual, target),
      // a part-month is not compared with the full month before it
      m2m: prev && !isCurrent ? pctChange(actual, prev.actual) : null,
    });
    if (++m > 12) { m = 1; y += 1; }
  }
  const actual = months.reduce((s, r) => s + r.actual, 0);
  const target = YTD_TARGET(latestDate) || 0; // completed months + this month's target to date
  return { months, ytd: { target, actual, ach: achievement(actual, target) } };
}

// ─── Merchandise mix (category drill-down rows) ────────────────────────────
// Rows: { division, department, section, article_type, footwear_type, qty, nsv } per day.
const title = (s) => String(s || 'Unclassified').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** Group rows into a two-level tree: keyOf(row) -> childOf(row), with previous-period values. */
export function mixTree(rows, prevRows, keyOf, childOf, order = []) {
  const build = (list) => {
    const map = new Map();
    for (const r of list || []) {
      const k = keyOf(r);
      if (!k) continue;
      const node = map.get(k) || { qty: 0, nsv: 0, children: new Map() };
      node.qty += num(r.qty); node.nsv += num(r.nsv);
      const c = childOf(r);
      const child = node.children.get(c) || { qty: 0, nsv: 0 };
      child.qty += num(r.qty); child.nsv += num(r.nsv);
      node.children.set(c, child);
      map.set(k, node);
    }
    return map;
  };
  const cur = build(rows), prev = build(prevRows);
  const hasPrev = (prevRows || []).length > 0;
  const total = [...cur.values()].reduce((s, n) => s + n.nsv, 0);
  const line = (name, c, p, share) => ({
    name: title(name), qty: c.qty, nsv: c.nsv,
    prevQty: hasPrev ? (p?.qty || 0) : null, prevNsv: hasPrev ? (p?.nsv || 0) : null,
    qtyChange: hasPrev ? pctChange(c.qty, p?.qty || 0) : null,
    nsvChange: hasPrev ? pctChange(c.nsv, p?.nsv || 0) : null,
    contribution: share > 0 ? (c.nsv / share) * 100 : null,
  });
  const rank = (name) => { const i = order.indexOf(String(name).toLowerCase()); return i === -1 ? order.length : i; };
  return [...cur.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || b[1].nsv - a[1].nsv)
    .map(([name, node]) => ({
      ...line(name, node, prev.get(name), total),
      children: [...node.children.entries()].sort((a, b) => b[1].nsv - a[1].nsv)
        .map(([cn, c]) => line(cn, c, prev.get(name)?.children.get(cn), node.nsv)),
    }));
}

// ─── Display ───────────────────────────────────────────────────────────────
const dash = '—';
export const fmtINR = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? dash
  : `${Number(v) < 0 ? '-' : ''}₹${Math.abs(Math.round(Number(v))).toLocaleString('en-IN')}`);
export const fmtInt = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? dash : Math.round(Number(v)).toLocaleString('en-IN'));
export const fmtDec = (v, places = 2) => (v === null || v === undefined || Number.isNaN(Number(v)) ? dash : Number(v).toFixed(places));
export const fmtPct = (v, places = 1) => (v === null || v === undefined || Number.isNaN(Number(v)) ? dash : `${Number(v).toFixed(places)}%`);
export const fmtChange = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? dash : `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}%`);
