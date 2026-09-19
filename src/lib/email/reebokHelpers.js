// reebokHelpers.js — Shared KPI helpers for Uppal Reebok reports
// All report layers (HTML, Excel, JSON API) MUST use these helpers.
// Do not re-implement KPI formulas elsewhere — change them here only.
//
// Source of truth: artifacts/docs/REEBOOK_KPI_DEFINITIONS.md

/**
 * Coerce a Postgres numeric (which arrives as a STRING over PostgREST)
 * to a proper Number. Returns 0 for null/undefined/empty.
 */
export function n(val) {
  if (val == null || val === '' || val === undefined) return 0;
  const f = parseFloat(val);
  return isNaN(f) ? 0 : f;
}

/** Safe division — returns null if denominator is 0 or null. */
export function safeDiv(a, b) {
  const av = n(a);
  const bv = n(b);
  if (!bv) return null;
  return av / bv;
}

/** Format a number as Indian Rupee (₹). */
export function fmtINR(val, compact = false) {
  const f = n(val);
  if (compact) {
    if (Math.abs(f) >= 10000000) return `₹${(f / 10000000).toFixed(2)}Cr`;
    if (Math.abs(f) >= 100000)   return `₹${(f / 100000).toFixed(1)}L`;
    if (Math.abs(f) >= 1000)     return `₹${(f / 1000).toFixed(1)}k`;
  }
  return `₹${Math.round(f).toLocaleString('en-IN')}`;
}

/** Format as percentage with 1 decimal. */
export function fmtPct(val) {
  if (val == null || val === undefined || val === '' || Number.isNaN(val)) return '—';
  return `${Number(val).toFixed(1)}%`;
}

/** Format as integer with Indian grouping. */
export function fmtNum(val) {
  const f = n(val);
  return Math.round(f).toLocaleString('en-IN');
}

/** Format as decimal with 1 place. */
export function fmtDec(val, places = 2) {
  if (val == null || val === '') return '—';
  const f = parseFloat(val);
  if (isNaN(f)) return '—';
  return f.toFixed(places);
}

/**
 * Return inline CSS colour for an achievement percentage.
 * Thresholds are pending manager confirmation — this uses safe defaults.
 * Returns a CSS color string.
 */
export function achColor(pct) {
  if (pct == null || pct === '' || isNaN(n(pct))) return '#666';
  const v = n(pct);
  if (v >= 100) return '#166534';   // dark green
  if (v >= 80)  return '#16a34a';  // green
  if (v >= 60)  return '#ca8a04';  // yellow-amber
  if (v >= 40)  return '#ea580c';  // orange
  return '#dc2626';                 // red
}

/**
 * Capitalise first letter only (title case for section/gender names).
 * "footwear" → "Footwear", "men" → "Men"
 */
export function titleCase(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Map the raw section value from the SAP export to a display gender label.
 * SAP uses 'RB MEN' / 'RB WOMEN' / 'RB UNISEX'.
 */
export function genderLabel(rawSection) {
  if (!rawSection) return 'Unisex';
  const s = String(rawSection).toUpperCase();
  if (s.includes('MEN') && !s.includes('WOMEN') && !s.includes('UNISEX')) return 'Men';
  if (s.includes('WOMEN')) return 'Women';
  if (s.includes('UNISEX')) return 'Unisex';
  return 'Unisex';
}

/**
 * Monthly sales target for Uppal Reebok (₹14,00,000).
 * Source of truth: REEBOOK_KPI_DEFINITIONS.md §4 "Target".
 */
export const MONTHLY_TARGET = 1400000;

/** Split 'YYYY-MM-DD' without timezone conversion. */
function parseYMD(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''));
  if (!m) return null;
  return { year: +m[1], month: +m[2], day: +m[3] };
}

/** Number of days in the month of the given date (28 / 29 / 30 / 31). */
export function daysInMonth(dateStr) {
  const p = parseYMD(dateStr);
  if (!p) return null;
  return new Date(Date.UTC(p.year, p.month, 0)).getUTCDate();
}

/**
 * Daywise target = monthly target ÷ number of days in that month.
 * Not rounded here (rounding is display-only) so MTD sums stay exact.
 * Returns null if the date is missing/invalid.
 */
export function calcTarget(dateStr) {
  const days = daysInMonth(dateStr);
  return days ? MONTHLY_TARGET / days : null;
}

/**
 * Compute Achievement % as (NSV / Target) * 100.
 * Returns null if target is 0 or missing.
 */
export function calcAchievement(nsv, target) {
  if (target == null || target === 0) return null;
  return (n(nsv) / Number(target)) * 100;
}

/**
 * MTD target = sum of the daywise targets from the 1st of the month through
 * the report date (i.e. daywise target × day of month).
 * Returns null if the date is missing/invalid.
 */
export function MTD_TARGET(dateStr) {
  const p = parseYMD(dateStr);
  const daily = calcTarget(dateStr);
  return p && daily != null ? daily * p.day : null;
}

/**
 * YTD target (calendar year) = ₹14,00,000 for every completed month since 1 January
 * + the current month's MTD target. YTD actuals (NSV / Bills / Qty) come from the
 * 'ytd' row in gold.reebok_daily_metrics, computed by the pipeline.
 * Returns null if the date is missing/invalid.
 */
export function YTD_TARGET(dateStr) {
  const p = parseYMD(dateStr);
  const mtd = MTD_TARGET(dateStr);
  return p && mtd != null ? MONTHLY_TARGET * (p.month - 1) + mtd : null;
}

/**
 * Find the latest date in gold.reebok_daily_metrics for a given month.
 * Used by the "no data" fallback to surface the most recent available date.
 */
export async function findLatestDate(supabase, year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end   = `${year}-${String(month).padStart(2, '0')}-31`;
  const { data, error } = await supabase
    .schema('gold')
    .from('reebok_daily_metrics')
    .select('full_date')
    .eq('site_short_name', 'R1157')
    .eq('period_type', 'today')
    .gte('full_date', start)
    .lte('full_date', end)
    .order('full_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data.full_date;
}
