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
import { buildReportModel, formatCell, achLevel, ACH_FILL, ZEBRA, TOTAL_BG } from '@/lib/email/reebokReportModel';

const STORE = 'R1157';

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Inline styles (inline only so html2canvas capture renders identically) ──
const FONT = "font-family:'Inter','Segoe UI',Arial,sans-serif;";
const TH = 'color:#fff;font-size:12px;padding:7px 10px;font-weight:700;border:1px solid #ffffff55;white-space:nowrap;';
const TD = 'font-size:12.5px;padding:5px 10px;border:1px solid #d5dae1;color:#111827;font-variant-numeric:tabular-nums;white-space:nowrap;';
const TITLE_BAR = 'color:#111827;font-size:15px;font-weight:800;letter-spacing:0.02em;text-transform:uppercase;padding:2px 0 8px;';

function renderTable(t) {
  const head = t.columns
    .map((c) => `<th style="${TH}background:#${c.tone};text-align:${c.align === 'l' ? 'left' : 'right'};">${c.label}</th>`)
    .join('');

  let zebra = 0;
  const body = t.rows.map((row) => {
    const isTotal = row.kind === 'total';
    const rowBg = isTotal ? TOTAL_BG : ZEBRA[zebra++ % 2];
    const tds = row.cells.map((c, i) => {
      if (c.merged) return '';
      const align = t.columns[i].align === 'l' ? 'left' : 'right';
      let style = `${TD}text-align:${align};background:#${rowBg};`;
      let text = formatCell(c);
      if (c.rowspan) style += 'font-weight:700;vertical-align:middle;background:#F6F7F9;';
      if (isTotal) style += 'font-weight:700;';
      if (c.t === 'ach') {
        const level = achLevel(c.v);
        if (level) style += `background:#${ACH_FILL[level]};font-weight:700;`;
      }
      const span = c.rowspan ? ` rowspan="${c.rowspan}"` : '';
      return `<td${span} style="${style}">${text}</td>`;
    }).join('');
    return `<tr>${tds}</tr>`;
  }).join('');

  const notes = (t.footnotes || []).map((f) => `<div>${f}</div>`).join('');
  return `<div class="report-section" style="${FONT}margin-bottom:24px;">
    <div style="${TITLE_BAR}">${t.title}</div>
    <div style="overflow-x:auto;"><table style="border-collapse:collapse;width:100%;max-width:${Math.min(1200, Math.max(520, t.columns.length * 120))}px;">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table></div>
    ${notes ? `<div style="font-size:10px;color:#64748b;margin-top:6px;font-style:italic;">${notes}</div>` : ''}
  </div>`;
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
