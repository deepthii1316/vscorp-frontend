// app/api/reports/merch-report/route.js
// Reebok Merchandiser Report — on-screen HTML tables (also what the page captures as images).
//
// Table layout/values come from the shared model (lib/email/merchReportModel.js), which the
// Excel export also uses. This file only fetches data and renders HTML. Admin only, like the
// Merch Dashboard. Always the latest stock snapshot, so there is no date to request.
//
// Returns:
//   { parts: [{ key, title, html }], reportDate, displayDate, subject, noData }

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/middleware/auth';
import { ordinalDate } from '@/lib/email/reebokHelpers';
import { formatCell, heatColor, ZEBRA, TOTAL_BG } from '@/lib/email/reebokReportModel';
import { fetchMerchReportRows, buildMerchReportModel } from '@/lib/email/merchReportModel';

export const dynamic = 'force-dynamic';

// ─── Inline CSS (same look as the sales report tables) ──────────────────
const FONT = "font-family:'Inter','Segoe UI',Arial,sans-serif;";
const TH = 'color:#fff;font-size:11.5px;padding:7px 10px;font-weight:700;border:1px solid #374151;white-space:nowrap;';
const TD = 'font-size:12.5px;padding:5px 10px;border:1px solid #e5e7eb;color:#111827;font-variant-numeric:tabular-nums;white-space:nowrap;';
const TITLE_BAR = 'color:#111827;font-size:15px;font-weight:800;letter-spacing:0.02em;text-transform:uppercase;padding:2px 0 8px;';

function renderTable(table) {
  const headers = table.columns
    .map((column) => `<th style="${TH}background:#${column.tone};text-align:${column.align === 'l' ? 'left' : 'right'};">${column.label}</th>`)
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
    <div style="overflow-x:auto;"><table style="border-collapse:collapse;">
      <thead><tr>${headers}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${table.footnotes?.length ? `<div style="font-size:10px;color:#64748b;margin-top:6px;font-style:italic;">${table.footnotes.map((note) => `<div>${note}</div>`).join('')}</div>` : ''}
  </div>`;
}

export async function POST(req) {
  const auth = await requireAuth(req, ['admin']);
  if (auth.response) return auth.response;

  try {
    const rows = await fetchMerchReportRows(createServerClient());
    if (rows.length === 0) return NextResponse.json({ parts: [], noData: true, reportDate: null });

    const { meta, tabs } = buildMerchReportModel(rows);
    const parts = tabs.map((tab) => ({ key: tab.key, title: tab.title, html: tab.tables.map(renderTable).join('') }));

    return NextResponse.json({
      parts,
      reportDate: meta.asOf,
      displayDate: ordinalDate(meta.asOf),
      subject: `Uppal Reebok Merchandiser Stock Report — stock as of ${ordinalDate(meta.asOf)}`,
      noData: false,
    });
  } catch (err) {
    console.error('[merch-report] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
