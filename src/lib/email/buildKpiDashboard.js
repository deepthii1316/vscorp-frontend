/**
 * Builds the KPI Dashboard email section (Day or MTD) — grouped by cluster with
 * per-store KPIs, cluster subtotals and a grand total. Store rows get an
 * Excel-style per-column colour scale (min=red → max=green). Numbers are bold.
 * Email-safe inline styles.
 *
 * Usage:
 *   const html = buildKpiSectionHtml('Day: 2026-08-17', kpiRows);
 */

import { rangeOf, scaleBg } from './colorScale';

/**
 * KPI row data from the database.
 * @typedef {Object} KpiRow
 * @property {string} store_name
 * @property {number | null} cluster_key
 * @property {string | null} cluster_name
 * @property {number | string | null} total_sales
 * @property {number | string | null} total_qty
 * @property {number | string | null} total_mrp_value
 * @property {number | string | null} walkins
 * @property {number | string | null} bills
 * @property {number | string | null} footwear_qty
 * @property {number | string | null} footwear_value
 * @property {number | string | null} apparel_qty
 * @property {number | string | null} apparel_value
 * @property {number | string | null} accessories_qty
 * @property {number | string | null} accessories_value
 * @property {number | string | null} socks_qty
 * @property {number | string | null} socks_value
 * @property {number | string | null} shoes_qty
 */

/**
 * @param {KpiRow} r
 * @returns {{sales: number, qty: number, mrp: number, walkins: number, bills: number, fwQ: number, fwV: number, appQ: number, appV: number, accQ: number, accV: number, sockQ: number, shoeQ: number}}
 */
function toAgg(r) {
  const n = (v) => {
    const x = typeof v === 'string' ? parseFloat(v) : (v);
    return Number.isFinite(x) ? x : 0;
  };
  return {
    sales: n(r.total_sales),
    qty: n(r.total_qty),
    mrp: n(r.total_mrp_value),
    walkins: n(r.walkins),
    bills: n(r.bills),
    fwQ: n(r.footwear_qty),
    fwV: n(r.footwear_value),
    appQ: n(r.apparel_qty),
    appV: n(r.apparel_value),
    accQ: n(r.accessories_qty),
    accV: n(r.accessories_value),
    sockQ: n(r.socks_qty),
    shoeQ: n(r.shoes_qty),
  };
}

/**
 * @param {Object} a
 * @param {Object} b
 * @returns {Object}
 */
function aggSum(a, b) {
  return {
    sales: a.sales + b.sales,
    qty: a.qty + b.qty,
    mrp: a.mrp + b.mrp,
    walkins: a.walkins + b.walkins,
    bills: a.bills + b.bills,
    fwQ: a.fwQ + b.fwQ,
    fwV: a.fwV + b.fwV,
    appQ: a.appQ + b.appQ,
    appV: a.appV + b.appV,
    accQ: a.accQ + b.accQ,
    accV: a.accV + b.accV,
    sockQ: a.sockQ + b.sockQ,
    shoeQ: a.shoeQ + b.shoeQ,
  };
}

/**
 * Format as Indian Rupee.
 * @param {number | string | null} val
 * @returns {string}
 */
function fmtINR(val) {
  const f = Math.round(typeof val === 'number' ? val : (val || 0));
  return f.toLocaleString('en-IN');
}

/**
 * Format as integer with Indian grouping.
 * @param {number | string | null} val
 * @returns {string}
 */
function fmtNumber(val) {
  const f = Math.round(typeof val === 'number' ? val : (val || 0));
  return f.toLocaleString('en-IN');
}

/**
 * Format as percentage with 1 decimal.
 * @param {number | string | null} val
 * @returns {string}
 */
function fmtPct(val) {
  const v = typeof val === 'number' ? val : (val || 0);
  return v ? `${(v / 100).toFixed(1)}%` : '—';
}

/**
 * Build the HTML for a KPI section.
 * @param {string} title
 * @param {KpiRow[]} rows
 * @returns {string}
 */
export function buildKpiSectionHtml(title, rows) {
  /**
   * @param {KpiRow} r
   * @returns {{sales: number, qty: number, mrp: number, walkins: number, bills: number, fwQ: number, fwV: number, appQ: number, appV: number, accQ: number, accV: number, sockQ: number, shoeQ: number}}
   */
  function toAgg2(r) {
    const n = (v) => {
      const x = typeof v === 'string' ? parseFloat(v) : (v);
      return Number.isFinite(x) ? x : 0;
    };
    return {
      sales: n(r.total_sales),
      qty: n(r.total_qty),
      mrp: n(r.total_mrp_value),
      walkins: n(r.walkins),
      bills: n(r.bills),
      fwQ: n(r.footwear_qty),
      fwV: n(r.footwear_value),
      appQ: n(r.apparel_qty),
      appV: n(r.apparel_value),
      accQ: n(r.accessories_qty),
      accV: n(r.accessories_value),
      sockQ: n(r.socks_qty),
      shoeQ: n(r.shoes_qty),
    };
  }

  const agg = rows.reduce((a, r) => aggSum(a, toAgg2(r)), {
    sales: 0, qty: 0, mrp: 0, walkins: 0, bills: 0,
    fwQ: 0, fwV: 0, appQ: 0, appV: 0, accQ: 0, accV: 0, sockQ: 0, shoeQ: 0,
  });

  const colStyles = {
    total_sales: `background:${scaleBg(agg.sales, 0, 5000000)};color:#222;font-weight:bold;`,
    total_qty: `background:${scaleBg(agg.qty, 0, 1000)};color:#222;font-weight:bold;`,
    total_mrp_value: `background:${scaleBg(agg.mrp, 0, 1000000)};color:#222;font-weight:bold;`,
    bills: `background:${scaleBg(agg.bills, 0, 500)};color:#222;font-weight:bold;`,
    footwear_qty: `background:${scaleBg(agg.fwQ, 0, 500)};color:#222;`,
    footwear_value: `background:${scaleBg(agg.fwV, 0, 500000)};color:#222;`,
    apparel_qty: `background:${scaleBg(agg.appQ, 0, 500)};color:#222;`,
    apparel_value: `background:${scaleBg(agg.appV, 0, 500000)};color:#222;`,
    accessories_qty: `background:${scaleBg(agg.accQ, 0, 200)};color:#222;`,
    accessories_value: `background:${scaleBg(agg.accV, 0, 200000)};color:#222;`,
    socks_qty: `background:${scaleBg(agg.sockQ, 0, 300)};color:#222;`,
    socks_value: `background:${scaleBg(agg.sockV, 0, 300000)};color:#222;`,
    shoes_qty: `background:${scaleBg(agg.shoeQ, 0, 300)};color:#222;`,
  };

  const rowHtml = rows.map((r) => `
    <div style="
      display:grid;
      grid-template-columns: 160px 1fr 1fr 1fr 1fr;
      gap:8px;
      border-bottom:1px solid #ddd;
      padding:6px 0;
      font-size:12px;
    ">
      <div style="font-weight:bold;color:#222;">${r.store_name}</div>
      <div style=${colStyles.total_sales}>${fmtINR(r.total_sales)}</div>
      <div style=${colStyles.total_qty}>${fmtNumber(r.total_qty)}</div>
      <div style=${colStyles.total_mrp_value}>${fmtINR(r.total_mrp_value)}</div>
      <div style=${colStyles.bills}>${fmtNumber(r.bills)}</div>
    </div>`).join('');

  return `
  <div style="
    font-family:Arial,Helvetica,sans-serif;
    color:#222;
    margin-bottom:24px;
    border:1px solid #ddd;
    border-radius:6px;
    overflow:hidden;
  ">
    <div style="
      background:#f8f9fa;
      padding:12px 16px;
      font-size:13px;
      font-weight:700;
      color:#333;
      border-bottom:1px solid #eee;
    ">
      ${title}
    </div>
    <div style='padding:16px'>
      ${rowHtml}
      <div style="
        margin-top:16px;
        padding-top:16px;
        border-top:1px solid #eee;
        font-size:11px;
        color:#666;
      ">
        Grand Total: Sales ${fmtINR(agg.sales)}, Qty ${fmtNumber(agg.qty)}, Bills ${fmtNumber(agg.bills)}
      </div>
    </div>
  </div>`;
}