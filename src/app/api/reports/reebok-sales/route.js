// app/api/reports/reebok-sales/route.js
// Reebok Sales — Daywise + MTD report
//
// Returns:
//   { parts: [{ title, html }], reportDate, displayDate, subject, rows, noData, latestDate }

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { n, fmtINR, fmtPct, fmtNum, fmtDec, achColor, calcTarget, calcAchievement, MTD_TARGET } from '@/lib/email/reebokHelpers';

const STORE = 'R1157';

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Inline CSS builders ────────────────────────────────────────────────

const TH = 'background:#1e40af;color:#fff;font-size:11px;padding:7px 10px;text-align:left;font-weight:700;border:1px solid #93c5fd;';
const TH_R = TH.replace('text-align:left', 'text-align:right');
const TD = 'font-size:12px;padding:6px 10px;border:1px solid #e2e8f0;background:#fff;';
const TD_R = TD.replace('text-align:left', 'text-align:right');
const TOTAL = TD.replace('background:#fff', 'background:#f8fafc;font-weight:700;border-top:2px solid #cbd5e1;');
const TOTAL_R = TOTAL.replace('text-align:left', 'text-align:right');

function achBadge(pct) {
  if (pct == null || isNaN(Number(pct))) return `<span class="ach-cell" style="background:#f1f5f9;color:#64748b;">—</span>`;
  const v = Number(pct);
  const color = achColor(v);
  const bg = v >= 100 ? '#dcfce7' : v >= 80 ? '#dcfce7' : v >= 60 ? '#fef9c3' : v >= 40 ? '#ffedd5' : '#fee2e2';
  return `<span class="ach-cell" style="background:${bg};color:${color};">${fmtPct(v)}</span>`;
}

function wrapTable(title, headers, rows, footnotes) {
  let html = `<div class="report-section" style="font-family:Arial,sans-serif;margin-bottom:0;">`;

  // Title bar — bold gradient header
  html += `<div style="background:linear-gradient(135deg,#1e40af,#3730a3);color:#fff;font-size:14px;font-weight:800;padding:10px 14px;border-radius:8px 8px 0 0;">
    ${title}
  </div>`;

  html += `<table style="border-collapse:collapse;width:100%;max-width:960px;border-radius:0 0 8px 8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">`;

  // Header
  html += `<thead><tr>`;
  for (let i = 0; i < headers.length; i++) {
    const isRight = headers[i] !== 'Metric' && headers[i] !== 'Period' && headers[i] !== 'Sales Associate' && headers[i] !== 'Category' && headers[i] !== 'Gender';
    html += `<th style="${isRight ? TH_R : TH}">${headers[i]}</th>`;
  }
  html += `</tr></thead><tbody>`;

  // Rows
  for (const row of rows) {
    const isTotal = row.bold;
    html += `<tr>`;
    for (let ci = 0; ci < row.cells.length; ci++) {
      const cell = row.cells[ci];
      const isRight = ci > 0;
      const baseStyle = isTotal ? (isRight ? TOTAL_R : TOTAL) : (isRight ? TD_R : TD);

      if (cell.isAch) {
        html += `<td style="${baseStyle}">${achBadge(cell.value)}</td>`;
      } else if (cell.isNsv) {
        html += `<td style="${baseStyle}"><span class="nsv-cell">${cell.value}</span></td>`;
      } else if (cell.isQty) {
        html += `<td style="${baseStyle};font-weight:700;">${cell.value}</td>`;
      } else {
        html += `<td style="${baseStyle}">${cell.value}</td>`;
      }
    }
    html += `</tr>`;
  }

  html += `</tbody></table>`;

  // Footnotes
  if (footnotes && footnotes.length) {
    html += `<div style="font-size:10px;color:#64748b;margin-top:6px;font-style:italic;">`;
    for (const fn of footnotes) {
      html += `<div>${fn}</div>`;
    }
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

// Helper: make a cell
function c(text, opts = {})  { return { cells: [{ value: text, ...opts }] }; }
function r(text, opts = {})  { return { cells: [{ value: text, isQty: true, ...opts }] }; }
function nsv(text, opts = {}) { return { cells: [{ value: text, isNsv: true, ...opts }] }; }
function achCell(pct, opts = {}) { return { cells: [{ value: pct, isAch: true, ...opts }] }; }
function row(...cells) { return { cells }; }
function total(...cells) { return { bold: true, cells }; }

// ─── Build the Daywise HTML table ────────────────────────────────────────

function buildDaywiseTable(daywiseRows, reportDate) {
  const today = daywiseRows.find(r => r.period_type === 'today') || {};
  const mtd   = daywiseRows.find(r => r.period_type === 'mtd')   || {};

  const todayAch = calcAchievement(today.nsv, calcTarget(today.full_date));
  const mtdAch   = calcAchievement(mtd.nsv,   MTD_TARGET(reportDate || today.full_date));

  const headers = ['Metric', 'TODAY', 'MTD'];

  const rows = [
    // Metric label | TODAY value | MTD value
    // Each entry is { cells: [label, todayVal, mtdVal] }
    // Simpler: array of {cells} where each cell is label|today|mtd
    // Actually let's build as array-of-arrays with per-cell metadata
  ];

  // We'll use a flat approach: each row = [label, todayVal, mtdVal]
  // with extra metadata on the value cells
  const tableRows = [
    { cells: [
      { value: 'NSV (Taxable Amount)', style: 'label' },
      { value: fmtINR(n(today.nsv)), isNsv: true },
      { value: fmtINR(n(mtd.nsv)),  isNsv: true },
    ]},
    { cells: [
      { value: 'Target', style: 'label' },
      { value: fmtINR(calcTarget(today.full_date)), style: 'bold' },
      { value: fmtINR(MTD_TARGET(reportDate || mtd.full_date)), style: 'bold' },
    ]},
    { cells: [
      { value: 'Achievement %', style: 'label' },
      { value: todayAch, isAch: true },
      { value: mtdAch,   isAch: true },
    ]},
    { cells: [
      { value: 'Bills', style: 'label' },
      { value: fmtNum(today.bills), style: 'bold' },
      { value: fmtNum(mtd.bills),   style: 'bold' },
    ]},
    { cells: [
      { value: 'Qty Sold', style: 'label' },
      { value: fmtNum(today.qty_sold), style: 'bold' },
      { value: fmtNum(mtd.qty_sold),   style: 'bold' },
    ]},
    { cells: [
      { value: 'ATV (NSV / Bills)', style: 'label' },
      { value: fmtINR(n(today.atv)), style: 'bold' },
      { value: fmtINR(n(mtd.atv)),   style: 'bold' },
    ]},
    { cells: [
      { value: 'UPT (Qty / Bills)', style: 'label' },
      { value: fmtDec(today.upt), style: 'bold' },
      { value: fmtDec(mtd.upt),   style: 'bold' },
    ]},
    { cells: [
      { value: 'ASP (NSV / Qty)', style: 'label' },
      { value: fmtINR(n(today.asp)), style: 'bold' },
      { value: fmtINR(n(mtd.asp)),   style: 'bold' },
    ]},
    { cells: [
      { value: 'FUPT (FW Qty / Bills)', style: 'label' },
      { value: fmtDec(today.fupt), style: 'bold' },
      { value: fmtDec(mtd.fupt),   style: 'bold' },
    ]},
    { cells: [
      { value: 'Footwear Qty', style: 'label' },
      { value: fmtNum(today.footwear_qty), style: 'bold' },
      { value: fmtNum(mtd.footwear_qty),   style: 'bold' },
    ]},
    { cells: [
      { value: 'Footwear NSV', style: 'label' },
      { value: fmtINR(n(today.footwear_nsv)), isNsv: true },
      { value: fmtINR(n(mtd.footwear_nsv)),   isNsv: true },
    ]},
    { cells: [
      { value: 'Apparel Qty', style: 'label' },
      { value: fmtNum(today.apparel_qty), style: 'bold' },
      { value: fmtNum(mtd.apparel_qty),   style: 'bold' },
    ]},
    { cells: [
      { value: 'Apparel NSV', style: 'label' },
      { value: fmtINR(n(today.apparel_nsv)), isNsv: true },
      { value: fmtINR(n(mtd.apparel_nsv)),   isNsv: true },
    ]},
    { cells: [
      { value: 'Accessories Qty', style: 'label' },
      { value: fmtNum(today.accessories_qty), style: 'bold' },
      { value: fmtNum(mtd.accessories_qty),   style: 'bold' },
    ]},
    { cells: [
      { value: 'Accessories NSV', style: 'label' },
      { value: fmtINR(n(today.accessories_nsv)), isNsv: true },
      { value: fmtINR(n(mtd.accessories_nsv)),   isNsv: true },
    ]},
    { cells: [
      { value: 'SFR (Socks / FW Qty)', style: 'label' },
      { value: fmtDec(today.sfr), style: 'bold' },
      { value: fmtDec(mtd.sfr),   style: 'bold' },
    ]},
    { cells: [
      { value: 'AFR (APP / FW Qty)', style: 'label' },
      { value: fmtDec(today.afr), style: 'bold' },
      { value: fmtDec(mtd.afr),   style: 'bold' },
    ]},
  ];

  const footnotes = [
    `NSV = SUM(Taxable Amount) per REEBOOK_KPI_DEFINITIONS.md.`,
    `Target = ₹8L monthly × week/day fraction. Achievement % = NULL until manager confirms.`,
    `Ratios (ATV, UPT, ASP, FUPT, SFR, AFR) recalculated from totals — never averaged.`,
  ];

  // Render the table rows
  let html = `<div class="report-section" style="font-family:Arial,sans-serif;margin-bottom:24px;">`;
  html += `<div style="background:linear-gradient(135deg,#1e40af,#3730a3);color:#fff;font-size:14px;font-weight:800;padding:10px 14px;border-radius:8px 8px 0 0;">
    Uppal Reebok — Daywise + MTD
  </div>`;
  html += `<table style="border-collapse:collapse;width:100%;max-width:960px;border-radius:0 0 8px 8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">`;
  html += `<thead><tr>`;
  for (const h of headers) {
    const isRight = h !== 'Metric';
    html += `<th style="${isRight ? TH_R : TH}">${h}</th>`;
  }
  html += `</tr></thead><tbody>`;

  for (const tr of tableRows) {
    const isBoldRow = tr.cells[1]?.style === 'bold' || tr.cells[1]?.isNsv || tr.cells[1]?.isAch;
    html += `<tr>`;
    for (let ci = 0; ci < tr.cells.length; ci++) {
      const cell = tr.cells[ci];
      const isRight = ci > 0;
      if (cell.isAch) {
        const v = cell.value;
        const isRightAlign = isRight;
        const baseStyle = isRightAlign ? TD_R : TD;
        html += `<td style="${baseStyle}">${achBadge(v)}</td>`;
      } else if (cell.isNsv) {
        const baseStyle = isRight ? TD_R : TD;
        html += `<td style="${baseStyle}"><span class="nsv-cell">${cell.value}</span></td>`;
      } else if (cell.style === 'bold') {
        const baseStyle = isRight ? TD_R : TD;
        html += `<td style="${baseStyle};font-weight:700;">${cell.value}</td>`;
      } else {
        const baseStyle = isRight ? TD_R : TD;
        html += `<td style="${baseStyle}">${cell.value}</td>`;
      }
    }
    html += `</tr>`;
  }

  html += `</tbody></table>`;
  html += `<div style="font-size:10px;color:#64748b;margin-top:6px;font-style:italic;">`;
  for (const fn of footnotes) html += `<div>${fn}</div>`;
  html += `</div></div>`;
  return html;
}

// ─── Build the Staffwise table ──────────────────────────────────────────

function buildStaffTable(staffRows) {
  const ASSOCS = ['BALRAJ GADDAM', 'RAMBABU DHARAVATH', 'ERRI SRIJA'];

  let html = `<div class="report-section" style="font-family:Arial,sans-serif;margin-bottom:24px;">`;
  html += `<div style="background:linear-gradient(135deg,#1e40af,#3730a3);color:#fff;font-size:14px;font-weight:800;padding:10px 14px;border-radius:8px 8px 0 0;">
    Uppal Reebok — Staff KPI
  </div>`;
  html += `<table style="border-collapse:collapse;width:100%;max-width:960px;border-radius:0 0 8px 8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">`;
  const headers = ['Period', 'Sales Associate', 'Total Qty', 'Total NSV',
                   'FW Qty', 'FW NSV', 'APP Qty', 'APP NSV', 'ACC Qty', 'ACC NSV'];
  html += `<thead><tr>`;
  for (let i = 0; i < headers.length; i++) {
    const isRight = i > 1;
    html += `<th style="${isRight ? TH_R : TH}">${headers[i]}</th>`;
  }
  html += `</tr></thead><tbody>`;

  for (const period of ['today', 'mtd']) {
    const rows = (staffRows || []).filter(r => r.period_type === period);
    const label = period === 'today' ? 'TODAY' : 'MTD';
    for (const assoc of ASSOCS) {
      const row = rows.find(r => r.salesperson_name === assoc);
      if (!row) continue;
      html += `<tr>`;
      html += `<td style="${TD}">${label}</td>`;
      html += `<td style="${TOTAL}">${row.salesperson_name}</td>`;
      html += `<td style="${TD_R};font-weight:700;">${fmtNum(row.qty)}</td>`;
      html += `<td style="${TD_R}"><span class="nsv-cell">${fmtINR(n(row.nsv))}</span></td>`;
      html += `<td style="${TD_R};font-weight:700;">${fmtNum(row.footwear_qty)}</td>`;
      html += `<td style="${TD_R}"><span class="nsv-cell">${fmtINR(n(row.footwear_nsv))}</span></td>`;
      html += `<td style="${TD_R};font-weight:700;">${fmtNum(row.apparel_qty)}</td>`;
      html += `<td style="${TD_R}"><span class="nsv-cell">${fmtINR(n(row.apparel_nsv))}</span></td>`;
      html += `<td style="${TD_R};font-weight:700;">${fmtNum(row.accessories_qty)}</td>`;
      html += `<td style="${TD_R}"><span class="nsv-cell">${fmtINR(n(row.accessories_nsv))}</span></td>`;
      html += `</tr>`;
    }
  }

  html += `</tbody></table>`;
  html += `<div style="font-size:10px;color:#64748b;margin-top:6px;font-style:italic;">
    NSV from actual salesperson field in raw.sales — not distributed equally.
  </div></div>`;

  return html;
}

// ─── Build the Category table ────────────────────────────────────────────

function buildCategoryTable(catRows) {
  const cats = ['footwear', 'apparel', 'accessories'];
  const catsLabel = { footwear: 'Footwear', apparel: 'Apparel', accessories: 'Accessories' };
  const today = {};
  const mtd   = {};
  for (const r of catRows) {
    if (r.period_type === 'today') today[r.category] = r;
    if (r.period_type === 'mtd')   mtd[r.category]   = r;
  }

  let html = `<div class="report-section" style="font-family:Arial,sans-serif;margin-bottom:24px;">`;
  html += `<div style="background:linear-gradient(135deg,#1e40af,#3730a3);color:#fff;font-size:14px;font-weight:800;padding:10px 14px;border-radius:8px 8px 0 0;">
    Uppal Reebok — FW / APP / ACC
  </div>`;
  html += `<table style="border-collapse:collapse;width:100%;max-width:700px;border-radius:0 0 8px 8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">`;
  html += `<thead><tr>`;
  html += `<th style="${TH}">Period</th>`;
  html += `<th style="${TH}">Category</th>`;
  html += `<th style="${TH_R}">Qty</th>`;
  html += `<th style="${TH_R}">NSV</th>`;
  html += `</tr></thead><tbody>`;

  for (const period of ['today', 'mtd']) {
    const data  = period === 'today' ? today : mtd;
    const label = period === 'today' ? 'TODAY' : 'MTD';
    for (const cat of cats) {
      const row = data[cat];
      if (!row) continue;
      html += `<tr>`;
      html += `<td style="${TD}">${label}</td>`;
      html += `<td style="${TOTAL}">${catsLabel[cat]}</td>`;
      html += `<td style="${TD_R};font-weight:700;">${fmtNum(row.qty)}</td>`;
      html += `<td style="${TD_R}"><span class="nsv-cell">${fmtINR(n(row.nsv))}</span></td>`;
      html += `</tr>`;
    }
  }

  html += `</tbody></table></div>`;
  return html;
}

// ─── Build the Gender / Division table ──────────────────────────────────

function buildGenderDivisionTable(gdRows) {
  const genders = ['men', 'women', 'unisex'];
  const gendersLabel = { men: 'Men', women: 'Women', unisex: 'Unisex' };
  const divisions = ['footwear', 'apparel', 'accessories'];
  const divisionsLabel = { footwear: 'Footwear', apparel: 'Apparel', accessories: 'Accessories' };

  const today = {};
  const mtd   = {};
  for (const r of gdRows) {
    const key = `${r.gender}__${r.division}`;
    if (r.period_type === 'today') today[key] = r;
    if (r.period_type === 'mtd')   mtd[key]   = r;
  }

  let html = `<div class="report-section" style="font-family:Arial,sans-serif;margin-bottom:24px;">`;
  html += `<div style="background:linear-gradient(135deg,#1e40af,#3730a3);color:#fff;font-size:14px;font-weight:800;padding:10px 14px;border-radius:8px 8px 0 0;">
    Uppal Reebok — Gender / Division Split
  </div>`;
  html += `<table style="border-collapse:collapse;width:100%;max-width:700px;border-radius:0 0 8px 8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">`;
  html += `<thead><tr>`;
  html += `<th style="${TH}">Period</th>`;
  html += `<th style="${TH}">Gender</th>`;
  for (const d of divisions) html += `<th style="${TH_R}">${divisionsLabel[d]} Qty</th>`;
  html += `</tr></thead><tbody>`;

  for (const period of ['today', 'mtd']) {
    const data  = period === 'today' ? today : mtd;
    const label = period === 'today' ? 'TODAY' : 'MTD';
    for (const g of genders) {
      html += `<tr>`;
      html += `<td style="${TD}">${label}</td>`;
      html += `<td style="${TOTAL}">${gendersLabel[g]}</td>`;
      for (const d of divisions) {
        const key = `${g}__${d}`;
        const row = data[key];
        html += `<td style="${TD_R};font-weight:700;">${row ? fmtNum(row.qty) : '—'}</td>`;
      }
      html += `</tr>`;
    }
  }

  html += `</tbody></table></div>`;
  return html;
}

// ─── POST handler ────────────────────────────────────────────────────────

export async function POST(req) {
  try {
    const supabase = createServerClient();
    const body = await req.json().catch(() => ({}));
    const requestedDate = body.date || null;

    let reportDate = requestedDate;
    let noData = false;
    let latestDate = null;

    if (!reportDate) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      reportDate = yesterday.toISOString().split('T')[0];
    }

    const { data: dateCheck } = await supabase
      .schema('gold')
      .from('reebok_daily_metrics')
      .select('full_date')
      .eq('site_short_name', STORE)
      .eq('period_type', 'today')
      .eq('full_date', reportDate)
      .limit(1)
      .maybeSingle();

    if (!dateCheck) {
      const { data: latestRows } = await supabase
        .schema('gold')
        .from('reebok_daily_metrics')
        .select('full_date')
        .eq('site_short_name', STORE)
        .eq('period_type', 'today')
        .lte('full_date', reportDate)
        .order('full_date', { ascending: false })
        .limit(1);
      latestDate = latestRows?.[0]?.full_date || null;
      noData = true;
    }

    const effectiveDate = latestDate || reportDate;

    const [{ data: daywiseRows }, { data: staffRows }, { data: catRows }, { data: gdRows }] =
      await Promise.all([
        supabase.rpc('rpt_reebok_daywise', { p_date: effectiveDate }),
        supabase.rpc('rpt_reebok_staffwise', { p_date: effectiveDate }),
        supabase.rpc('rpt_reebok_category', { p_date: effectiveDate }),
        supabase.rpc('rpt_reebok_gender_division', { p_date: effectiveDate }),
      ]);

    const allRows = (daywiseRows || []).concat(staffRows || [], catRows || [], gdRows || []);

    const parts = [
      { title: 'Reebok Daywise + MTD',   html: buildDaywiseTable(daywiseRows || [], effectiveDate) },
      { title: 'Reebok Staff KPI',       html: buildStaffTable(staffRows || []) },
      { title: 'Reebok FW / APP / ACC',  html: buildCategoryTable(catRows || []) },
      { title: 'Reebok Gender / Division', html: buildGenderDivisionTable(gdRows || []) },
    ];

    return NextResponse.json({
      parts,
      reportDate: effectiveDate,
      displayDate: fmtDate(effectiveDate),
      subject: `Uppal Reebok Sales — ${fmtDate(effectiveDate)}`,
      rows: allRows,
      noData,
      latestDate,
    });
  } catch (err) {
    console.error('[reebok-sales] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
