// app/api/reports/reebok-sales/route.js
// Reebok Sales — on-screen HTML tables.
//
// Table layout/values come from the shared model (lib/email/reebokReportModel.js),
// which the Excel export also uses. This file only fetches data and renders HTML.
//
// Returns:
//   { parts: [{ title, key, html }], reportDate, displayDate, subject, rows, noData, latestDate }

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { n, fmtINR, fmtPct, fmtNum, fmtDec, achColor } from '@/lib/email/reebokHelpers';
import { buildReportModel, formatCell, heatColor, ZEBRA, TOTAL_BG } from '@/lib/email/reebokReportModel';

const STORE = 'R1157';

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Inline CSS builders ────────────────────────────────────────────────

const FONT = "font-family:'Inter','Segoe UI',Arial,sans-serif;";
const TH = 'background:#1f2937;color:#fff;font-size:11.5px;padding:7px 10px;text-align:left;font-weight:700;border:1px solid #374151;white-space:nowrap;';
const TH_R = TH.replace('text-align:left', 'text-align:right');
const TD = 'font-size:12.5px;padding:5px 10px;border:1px solid #e5e7eb;color:#111827;font-variant-numeric:tabular-nums;text-align:left;';
const TD_R = TD.replace('text-align:left', 'text-align:right');
// TOTAL is the bold label-cell style (first column of each row); TOTAL_ROW is the real totals row.
const TOTAL = TD + 'font-weight:700;';
const TOTAL_R = TOTAL.replace('text-align:left', 'text-align:right');
const TOTAL_ROW = TD + 'border-top:3px double #6b7280;background:#e5e7eb;font-weight:700;';
const TOTAL_ROW_R = TOTAL_ROW.replace('text-align:left', 'text-align:right');
const TITLE_BAR = 'color:#111827;font-size:15px;font-weight:800;letter-spacing:0.02em;text-transform:uppercase;padding:2px 0 8px;';
const PERIOD_TONES = {
  today: { background: 'transparent', border: 'transparent', text: '#111827' },
  mtd: { background: 'transparent', border: 'transparent', text: '#111827' },
};

function renderPeriodPanel(period, title, headers, rows) {
  const tone = PERIOD_TONES[period];
  return `<details open style="margin:14px 0 6px;">
    <summary style="padding:4px 0 6px;cursor:pointer;color:${tone.text};font-size:12.5px;font-weight:800;letter-spacing:0.03em;text-transform:uppercase;">${title}</summary>
    <div style="overflow-x:auto;"><table style="border-collapse:collapse;width:100%;min-width:620px;">
      <thead><tr>${headers.map((header, index) => `<th style="${index ? TH_R : TH}">${header}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </details>`;
}

function renderTable(table) {
  const headers = table.columns
    .map((column) => `<th style="${TH}${column.align === 'l' ? 'text-align:left;' : 'text-align:right;'}">${column.label}</th>`)
    .join('');

  let zebra = 0;
  const rows = table.rows.map((row) => {
    const isTotal = row.kind === 'total';
    const rowBackground = isTotal ? TOTAL_BG : ZEBRA[zebra++ % 2];
    const cells = row.cells.map((cell, index) => {
      if (cell.merged) return '';
      const align = table.columns[index].align === 'l' ? 'left' : 'right';
      let style = `${TD}text-align:${align};background:#${rowBackground};`;
      if (cell.rowspan) style += 'font-weight:700;vertical-align:middle;background:#F6F7F9;';
      if (isTotal) style += 'font-weight:700;';
      if (cell.t === 'ach' && cell.heat !== undefined) style += `background:#${heatColor(cell.heat)};font-weight:700;`;
      const rowspan = cell.rowspan ? ` rowspan="${cell.rowspan}"` : '';
      return `<td${rowspan} style="${style}">${formatCell(cell)}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  return `<div class="report-section" style="${FONT}margin-bottom:24px;">
    <div style="${TITLE_BAR}">${table.title}</div>
    <div style="overflow-x:auto;"><table style="border-collapse:collapse;width:100%;max-width:${Math.min(1200, Math.max(520, table.columns.length * 120))}px;">
      <thead><tr>${headers}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${table.footnotes?.length ? `<div style="font-size:10px;color:#64748b;margin-top:6px;font-style:italic;">${table.footnotes.map((note) => `<div>${note}</div>`).join('')}</div>` : ''}
  </div>`;
}

function achBadge(pct) {
  if (pct == null || isNaN(Number(pct))) return `<span class="ach-cell" style="background:#f1f5f9;color:#64748b;">—</span>`;
  const v = Number(pct);
  const color = achColor(v);
  const bg = v >= 100 ? '#dcfce7' : v >= 80 ? '#dcfce7' : v >= 60 ? '#fef9c3' : v >= 40 ? '#ffedd5' : '#fee2e2';
  return `<span class="ach-cell" style="background:${bg};color:${color};">${fmtPct(v)}</span>`;
}

function wrapTable(title, headers, rows, footnotes) {
  let html = `<div class="report-section" style="${FONT}margin-bottom:0;">`;

  // Title bar — bold gradient header
  html += `<div style="${TITLE_BAR}">
    ${title}
  </div>`;

  html += `<table style="border-collapse:collapse;width:100%;max-width:960px;">`;

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
      const baseStyle = isTotal ? (isRight ? TOTAL_ROW_R : TOTAL_ROW) : (isRight ? TD_R : TD);

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
      { value: '—', style: 'bold' },
      { value: '—', style: 'bold' },
    ]},
    { cells: [
      { value: 'Achievement %', style: 'label' },
      { value: null, isAch: true },
      { value: null, isAch: true },
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
    `Target and Achievement % are shown as — until the manager confirms the target formula.`,
    `Ratios (ATV, UPT, ASP, FUPT, SFR, AFR) recalculated from totals — never averaged.`,
  ];

  const renderRows = (period) => tableRows.map((tr) => {
    const cells = tr.cells.map((cell, index) => {
      const baseStyle = index > 0 ? TD_R : TD;
      if (cell.isAch) return `<td style="${baseStyle}">${achBadge(cell.value)}</td>`;
      if (cell.isNsv) return `<td style="${baseStyle}"><span class="nsv-cell">${cell.value}</span></td>`;
      if (cell.style === 'bold') return `<td style="${baseStyle};font-weight:700;">${cell.value}</td>`;
      return `<td style="${baseStyle}">${cell.value}</td>`;
    });
    return `<tr>${cells[0]}${cells[period === 'today' ? 1 : 2]}</tr>`;
  });

  let html = `<div class="report-section" style="${FONT}margin-bottom:24px;">
    <div style="${TITLE_BAR}">Uppal Reebok — Daywise + MTD</div>`;
  html += renderPeriodPanel('today', `TODAY — ${fmtDate(reportDate)}`, ['Metric', 'Value'], renderRows('today'));
  html += renderPeriodPanel('mtd', `MTD — 01 ${fmtDate(reportDate).slice(3)}`, ['Metric', 'Value'], renderRows('mtd'));
  html += `<div style="font-size:10px;color:#64748b;margin-top:6px;font-style:italic;">`;
  for (const fn of footnotes) html += `<div>${fn}</div>`;
  html += `</div></div>`;
  return html;
}

// ─── Build the Staffwise table ──────────────────────────────────────────

function buildStaffTable(staffRows) {
  const ASSOCS = ['BALRAJ GADDAM', 'RAMBABU DHARAVATH', 'ERRI SRIJA'];

  let html = `<div class="report-section" style="${FONT}margin-bottom:24px;">`;
  html += `<div style="${TITLE_BAR}">
    Uppal Reebok — Staff KPI
  </div>`;
  html += `<table style="border-collapse:collapse;width:100%;max-width:960px;">`;
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
    Staff Qty and NSV use the salesperson attached to each actual sales record; targets are calculated separately.
  </div></div>`;

  return html;
}

function buildStaffPeriodTables(staffRows, reportDate) {
  const associates = ['BALRAJ GADDAM', 'RAMBABU DHARAVATH', 'ERRI SRIJA'];
  const headers = ['Salesperson', 'Role', 'NSV', 'Bills', 'Qty', 'ATV', 'UPT', 'ASP', 'SFR', 'AFR'];
  const rowsFor = (period) => associates.map((name) => {
    const row = (staffRows || []).find((item) => item.period_type === period && item.salesperson_name === name) || {};
    return `<tr><td style="${TOTAL}">${name}</td><td style="${TD}">${row.role || 'Sales Associate'}</td><td style="${TD_R}">${fmtINR(n(row.nsv))}</td><td style="${TD_R}">${fmtNum(row.bills)}</td><td style="${TD_R};font-weight:700;">${fmtNum(row.qty)}</td><td style="${TD_R}">${fmtINR(n(row.atv))}</td><td style="${TD_R}">${fmtDec(row.upt)}</td><td style="${TD_R}">${fmtINR(n(row.asp))}</td><td style="${TD_R}">${fmtDec(row.sfr)}</td><td style="${TD_R}">${fmtDec(row.afr)}</td></tr>`;
  }).join('');
  return `<div class="report-section" style="${FONT}margin-bottom:24px;"><div style="${TITLE_BAR}">Uppal Reebok — Staffwise KPI</div>${renderPeriodPanel('today', `TODAY — ${fmtDate(reportDate)}`, headers, rowsFor('today'))}${renderPeriodPanel('mtd', 'MTD — 01 Aug to report date', headers, rowsFor('mtd'))}</div>`;
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

  let html = `<div class="report-section" style="${FONT}margin-bottom:24px;">`;
  html += `<div style="${TITLE_BAR}">
    Uppal Reebok — FW / APP / ACC
  </div>`;
  html += `<table style="border-collapse:collapse;width:100%;max-width:700px;">`;
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

function buildCategoryPeriodTables(catRows, reportDate) {
  const cats = ['footwear', 'apparel', 'accessories'];
  const labels = { footwear: 'Footwear', apparel: 'Apparel', accessories: 'Accessories' };
  const data = { today: {}, mtd: {} };
  for (const row of catRows || []) data[row.period_type][row.category] = row;
  const headers = ['Category', 'Qty', 'NSV'];
  const rowsFor = (period) => cats.map((cat) => { const row = data[period][cat] || {}; return `<tr><td style="${TOTAL}">${labels[cat]}</td><td style="${TD_R}">${fmtNum(row.qty)}</td><td style="${TD_R}">${fmtINR(n(row.nsv))}</td></tr>`; }).join('');
  return `<div class="report-section" style="${FONT}margin-bottom:24px;"><div style="${TITLE_BAR}">Uppal Reebok — Division Wise Report</div>${renderPeriodPanel('today', `TODAY — ${fmtDate(reportDate)}`, headers, rowsFor('today'))}${renderPeriodPanel('mtd', 'MTD — 01 Aug to report date', headers, rowsFor('mtd'))}</div>`;
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

  let html = `<div class="report-section" style="${FONT}margin-bottom:24px;">`;
  html += `<div style="${TITLE_BAR}">Uppal Reebok — Gender / Division Split</div>`;
  html += `<table style="border-collapse:collapse;width:100%;max-width:700px;">`;
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

function buildGenderDivisionPeriodTables(gdRows) {
  const genders = ['men', 'women', 'unisex'];
  const divisions = ['footwear', 'apparel', 'accessories'];
  const labels = { men: 'Men', women: 'Women', unisex: 'Unisex', footwear: 'Footwear', apparel: 'Apparel', accessories: 'Accessories' };
  const data = { today: {}, mtd: {} };
  for (const row of gdRows || []) data[row.period_type][`${row.gender}__${row.division}`] = row;
  const rowsFor = (period) => genders.flatMap((gender) => {
    const total = divisions.reduce((sum, division) => sum + Number(data[period][`${gender}__${division}`]?.qty || 0), 0);
    return divisions.map((division) => { const row = data[period][`${gender}__${division}`] || {}; const mix = total ? `${((Number(row.qty || 0) / total) * 100).toFixed(1)}%` : '—'; return `<tr><td style="${TD}">${labels[gender]}</td><td style="${TOTAL}">${labels[division]}</td><td style="${TD_R}">${fmtNum(row.qty)}</td><td style="${TD_R}">${fmtINR(n(row.nsv))}</td><td style="${TD_R}">${mix}</td></tr>`; });
  }).join('');
  const headers = ['Gender', 'Division', 'Qty', 'NSV', '% within Gender'];
  return `<div class="report-section" style="${FONT}margin-bottom:24px;"><div style="${TITLE_BAR}">Uppal Reebok — Division Split Within Gender</div>${renderPeriodPanel('today', 'TODAY', headers, rowsFor('today'))}${renderPeriodPanel('mtd', 'MTD — 01 Aug to report date', headers, rowsFor('mtd'))}</div>`;
}

function buildGenderPeriodTables(gdRows) {
  const genders = ['men', 'women', 'unisex'];
  const labels = { men: 'Men', women: 'Women', unisex: 'Unisex' };
  const grouped = { today: {}, mtd: {} };
  for (const row of gdRows || []) {
    grouped[row.period_type][row.gender] ||= { qty: 0, nsv: 0 };
    grouped[row.period_type][row.gender].qty += Number(row.qty || 0);
    grouped[row.period_type][row.gender].nsv += Number(row.nsv || 0);
  }
  const rowsFor = (period) => { const total = genders.reduce((sum, gender) => sum + Number(grouped[period][gender]?.qty || 0), 0); return genders.map((gender) => { const row = grouped[period][gender] || {}; const mix = total ? `${((Number(row.qty || 0) / total) * 100).toFixed(1)}%` : '—'; return `<tr><td style="${TOTAL}">${labels[gender]}</td><td style="${TD_R}">${fmtNum(row.qty)}</td><td style="${TD_R}">${fmtINR(row.nsv)}</td><td style="${TD_R}">${mix}</td></tr>`; }).join(''); };
  const headers = ['Group', 'Qty', 'NSV', '% Mix'];
  return `<div class="report-section" style="${FONT}margin-bottom:24px;"><div style="${TITLE_BAR}">Uppal Reebok — Gender Wise Report</div>${renderPeriodPanel('today', 'TODAY', headers, rowsFor('today'))}${renderPeriodPanel('mtd', 'MTD — 01 Aug to report date', headers, rowsFor('mtd'))}</div>`;
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

    const tables = buildReportModel({
      reportDate: effectiveDate,
      daywiseRows: daywiseRows || [],
      staffRows: staffRows || [],
      catRows: catRows || [],
      gdRows: gdRows || [],
    });
    const parts = tables.map((t) => ({ title: t.title, key: t.key, html: renderTable(t) }));

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
