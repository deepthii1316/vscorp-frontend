// Merchandiser Dashboard shared helpers: the pure calculations behind every tab.
// No React and no database access. Input rows come from public.rpt_merch_sku() — one row per EAN
// (see backend/database/migrations/2026_10_02_merch_dashboard_rpcs.sql for the definitions).
// Rule: sum the inputs first, compute every ratio from the sums (never average row ratios).

// ─── Health thresholds (idle days) ─────────────────────────────────────────
// idle_days = days since the later of last sale / last inward. Defaults agreed 02-Oct-2026;
// adjustable on screen.
export const DEFAULT_THRESHOLDS = { slow: 30, risk: 60, dead: 90 };

/** Whole days, strictly increasing: 1 <= slow < risk < dead <= 365. */
export function clampThresholds(t) {
  const int = (v, d) => (Number.isFinite(+v) ? Math.round(+v) : d);
  const slow = Math.min(363, Math.max(1, int(t.slow, DEFAULT_THRESHOLDS.slow)));
  const risk = Math.min(364, Math.max(slow + 1, int(t.risk, DEFAULT_THRESHOLDS.risk)));
  const dead = Math.min(365, Math.max(risk + 1, int(t.dead, DEFAULT_THRESHOLDS.dead)));
  return { slow, risk, dead };
}

// Status colours, validated with the dataviz palette checker (CVD + normal-vision separation pass;
// Slow's yellow is low-contrast on white, so every use is paired with a text label or a table).
export const BUCKETS = [
  { key: 'healthy', label: 'Healthy', color: '#2E9958' },
  { key: 'slow',    label: 'Slow',    color: '#DBA820' },
  { key: 'risk',    label: 'At Risk', color: '#D65A2A' },
  { key: 'dead',    label: 'Dead',    color: '#962538' },
];
export const BUCKET_BY_KEY = Object.fromEntries(BUCKETS.map((b) => [b.key, b]));

/** Health bucket of one EAN, or null when it holds no stock (sold out). */
export function bucketOf(row, t) {
  if (!(row.stock_qty > 0) || row.idle_days == null) return null;
  if (row.idle_days >= t.dead) return 'dead';
  if (row.idle_days >= t.risk) return 'risk';
  if (row.idle_days >= t.slow) return 'slow';
  return 'healthy';
}

export function bucketRange(key, t) {
  if (key === 'healthy') return `< ${t.slow} days idle`;
  if (key === 'slow') return `${t.slow}–${t.risk - 1} days idle`;
  if (key === 'risk') return `${t.risk}–${t.dead - 1} days idle`;
  return `${t.dead}+ days idle`;
}

// Age = days since Last Inwarded Date.
export const AGE_BANDS = [
  { key: 'a30',  label: '≤ 30 days',    max: 30 },
  { key: 'a60',  label: '31–60 days',   max: 60 },
  { key: 'a90',  label: '61–90 days',   max: 90 },
  { key: 'a180', label: '91–180 days',  max: 180 },
  { key: 'a365', label: '181–365 days', max: 365 },
  { key: 'aold', label: '> 365 days',   max: Infinity },
];
export function ageBandOf(age) {
  if (age == null) return 'unknown';
  return AGE_BANDS.find((b) => age <= b.max).key;
}

// ─── Labels ────────────────────────────────────────────────────────────────
const titleCase = (s) => String(s || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
export const divisionLabel = (d) => titleCase(d);

/**
 * Article name without the size. Source names look like "UJ SPORT TEE M L :  : L" (sales) or
 * "ENERGEN TECH PLUS 2 95 / ENERGEN TECH PLUS 2 55 :  : 5.5" (stock). In the stock form the part
 * before " / " carries some OTHER size of the style, so the part after it (this size's own name)
 * is used, and its trailing size token is dropped — written either as the size ("10", "XL") or
 * without the decimal point ("55" for 5.5).
 */
export function cleanName(name, size) {
  const parts = String(name || '').split(' : ')[0].split(' / ');
  let s = parts[parts.length - 1].replace(/\s{2,}/g, ' ').trim();
  const sz = String(size || '').trim().toUpperCase();
  for (const token of sz ? [sz, sz.replace('.', '')] : []) {
    if (s.toUpperCase().endsWith(` ${token}`)) { s = s.slice(0, -token.length - 1).trim(); break; }
  }
  return s;
}

// ─── Formulas ──────────────────────────────────────────────────────────────
/** Sell-through % = sold ÷ (sold + on hand) × 100; null when there is neither. */
export function sellThrough(sold, stock) {
  const den = sold + stock;
  return den > 0 ? Math.max(0, (sold / den) * 100) : null;
}

/**
 * Cover (days) = stock ÷ average daily sales. The rate is sales over the last min(182, days the
 * store has traded) days — the template's "stores open < 6 months: months open" rule. Null
 * (shown —) when nothing sold in that window.
 */
export function coverDays(stock, rateQty, rateDays) {
  return rateQty > 0 && rateDays > 0 ? stock / (rateQty / rateDays) : null;
}

export const COVER_TIP = 'Stock ÷ average daily sales since the store opened (up to the last 6 months)';

// ─── Filtering ─────────────────────────────────────────────────────────────
export const LEVELS = [
  { key: 'division',     label: 'Division' },
  { key: 'department',   label: 'Department' },
  { key: 'section',      label: 'Section' },
  { key: 'article_type', label: 'Article type' },
];
export const EMPTY_FILTER = { division: 'ALL', department: 'ALL', section: 'ALL', article_type: 'ALL' };

export function applyFilter(rows, f) {
  return rows.filter((r) => LEVELS.every(({ key }) => f[key] === 'ALL' || r[key] === f[key]));
}

/** Cascading options: each level's choices respect the levels above it. */
export function filterOptions(rows, f) {
  const out = {};
  LEVELS.forEach(({ key }, i) => {
    const above = LEVELS.slice(0, i);
    const pool = rows.filter((r) => above.every((l) => f[l.key] === 'ALL' || r[l.key] === f[l.key]));
    out[key] = [...new Set(pool.map((r) => r[key]))].sort();
  });
  return out;
}

// ─── Aggregation ───────────────────────────────────────────────────────────
function emptyAgg() {
  return {
    lines: 0, stockLines: 0, stockQty: 0, mrpValue: 0, costValue: 0,
    qty30: 0, nsv30: 0, qtyMtd: 0, nsvMtd: 0, qtyRate: 0, ageQty: 0, ageUnits: 0,
    buckets: Object.fromEntries(BUCKETS.map((b) => [b.key, { qty: 0, mrp: 0, cost: 0, lines: 0 }])),
  };
}

function addRow(a, r, t) {
  a.lines += 1;
  if (r.stock_qty > 0) a.stockLines += 1;
  a.stockQty += r.stock_qty;
  a.mrpValue += r.stock_mrp_value;
  a.costValue += r.stock_cost_value;
  a.qty30 += r.sales_qty_30d;
  a.nsv30 += r.nsv_30d;
  a.qtyMtd += r.sales_qty_mtd;
  a.nsvMtd += r.nsv_mtd;
  a.qtyRate += r.sales_qty_rate;
  if (r.stock_qty > 0 && r.age_days != null) { a.ageQty += r.age_days * r.stock_qty; a.ageUnits += r.stock_qty; }
  const b = t ? bucketOf(r, t) : null;
  if (b) {
    const s = a.buckets[b];
    s.qty += r.stock_qty; s.mrp += r.stock_mrp_value; s.cost += r.stock_cost_value; s.lines += 1;
  }
  return a;
}

/** Finish an aggregate: derived ratios computed from the sums. */
function finish(a, rateDays) {
  a.sellThrough = sellThrough(a.qty30, a.stockQty);
  a.cover = coverDays(a.stockQty, a.qtyRate, rateDays);
  a.avgAge = a.ageUnits > 0 ? a.ageQty / a.ageUnits : null;
  return a;
}

export function summarize(rows, t, rateDays) {
  return finish(rows.reduce((a, r) => addRow(a, r, t), emptyAgg()), rateDays);
}

/** valueKey: 'mrp' | 'cost' — which stock value the page shows. */
export const valueOf = (a, valueKey) => (valueKey === 'cost' ? a.costValue : a.mrpValue);
export const bucketValueOf = (b, valueKey) => (valueKey === 'cost' ? b.cost : b.mrp);

/**
 * Division › Department › Section › Article type tree. Siblings sorted by stock value (desc).
 * Each node: { path, label, depth, children, ...aggregate }.
 */
export function categoryTree(rows, t, rateDays, valueKey = 'mrp') {
  const levels = LEVELS.map((l) => l.key);
  const build = (subset, depth, prefix) => {
    if (depth >= levels.length) return [];
    const key = levels[depth];
    const groups = new Map();
    subset.forEach((r) => {
      const g = groups.get(r[key]) || [];
      g.push(r);
      groups.set(r[key], g);
    });
    const nodes = [...groups.entries()].map(([val, g]) => {
      const path = `${prefix}/${val}`;
      const node = finish(g.reduce((a, r) => addRow(a, r, t), emptyAgg()), rateDays);
      return {
        ...node,
        path, depth,
        label: depth === 0 ? divisionLabel(val) : val,
        children: build(g, depth + 1, path),
      };
    });
    return nodes.sort((x, y) => valueOf(y, valueKey) - valueOf(x, valueKey) || y.stockQty - x.stockQty);
  };
  return build(rows, 0, '');
}

/** Age profile: stock qty / value per age band. */
export function ageProfile(rows) {
  const bands = [...AGE_BANDS, { key: 'unknown', label: 'Unknown' }].map((b) => ({ ...b, qty: 0, mrp: 0, cost: 0 }));
  const byKey = Object.fromEntries(bands.map((b) => [b.key, b]));
  rows.forEach((r) => {
    if (!(r.stock_qty > 0)) return;
    const b = byKey[ageBandOf(r.age_days)];
    b.qty += r.stock_qty; b.mrp += r.stock_mrp_value; b.cost += r.stock_cost_value;
  });
  return bands.filter((b) => b.key !== 'unknown' || b.qty > 0);
}

/**
 * Article level for Sell-Through: style code + colour (falls back to the cleaned name), with
 * its sizes (EAN rows) kept for drill-down.
 */
export function articleRows(rows, rateDays) {
  const groups = new Map();
  rows.forEach((r) => {
    const name = cleanName(r.article_name, r.size);
    const key = `${r.style_code || name}|${r.color || ''}`;
    const g = groups.get(key) || { key, name, style: r.style_code, color: r.color, division: r.division, department: r.department, section: r.section, articleType: r.article_type, mrp: r.mrp, sizes: [] };
    g.sizes.push(r);
    if (name.length > g.name.length) g.name = name;   // SAP truncates long names at different points per size
    groups.set(key, g);
  });
  return [...groups.values()].map((g) => {
    const a = finish(g.sizes.reduce((acc, r) => addRow(acc, r, null), emptyAgg()), rateDays);
    g.sizes.sort((x, y) => String(x.size).localeCompare(String(y.size), undefined, { numeric: true }));
    const lastSale = g.sizes.reduce((m, r) => (r.last_sale_date && (!m || r.last_sale_date > m) ? r.last_sale_date : m), null);
    return { ...g, ...a, lastSale };
  });
}

/** Sell-through speed class for an article / size row. */
export const ST_FAST = 60;
export const ST_SLOW = 15;
export function speedOf(a) {
  if (a.stockQty <= 0 && a.qty30 > 0) return 'soldout';
  if (a.qty30 <= 0) return 'none';
  if (a.sellThrough >= ST_FAST) return 'fast';
  if (a.sellThrough < ST_SLOW) return 'slow';
  return 'mid';
}
export const SPEED_LABEL = { fast: 'Fast', mid: 'Moderate', slow: 'Slow', none: 'No sales 30d', soldout: 'Sold out' };

// ─── Formatting ────────────────────────────────────────────────────────────
export function formatDays(v) {
  return v == null || !Number.isFinite(v) ? '—' : `${Math.round(v).toLocaleString('en-IN')}d`;
}
export function shortDate(iso) {
  if (!iso) return '—';
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
