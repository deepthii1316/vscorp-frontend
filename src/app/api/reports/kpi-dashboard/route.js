import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { buildKpiSectionHtml } from '@/lib/email/buildKpiDashboard';
import { buildDataQualityAlert } from '@/lib/email/buildDataQualityAlert';

// RENDER step: resolves the report date and returns the dashboard HTML (no email).
// The browser screenshots this HTML and posts the image to /send.
// Body: { date?: 'YYYY-MM-DD', force?: boolean }
//  - defaults date to yesterday (IST)
//  - no data for that day & not forced → { noData, requestedDate, latestDate }
//  - forced → renders the latest available day instead

function istYesterday() {
  const todayIst = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const d = new Date(todayIst + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const displayDate = (iso) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

const mtdLabel = (iso) => {
  const d = new Date(iso + 'T00:00:00');
  const day = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleDateString('en-IN', { month: 'short' });
  return `01–${day} ${mon} ${d.getFullYear()}`;
};

export async function POST(req) {
  const supabase = await createServerClient();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({})));
  const force = !!body.force;
  const requestedDate = body.date ?? istYesterday();

  let reportDate = requestedDate;
  const first = await supabase.rpc('rpt_kpi_dashboard', { p_date: requestedDate });
  if (first.error) return NextResponse.json({ error: first.error.message }, { status: 500 });
  let rows = first.data || [];

  if (rows.length === 0) {
    const { data: latest } = await supabase.rpc('rpt_kpi_latest_date');
    if (!latest) return NextResponse.json({ error: 'No KPI data available at all.' }, { status: 404 });
    if (!force) return NextResponse.json({ noData: true, requestedDate, latestDate: latest });
    reportDate = latest;
    const second = await supabase.rpc('rpt_kpi_dashboard', { p_date: reportDate });
    if (second.error) return NextResponse.json({ error: second.error.message }, { status: 500 });
    rows = second.data || [];
    if (rows.length === 0) return NextResponse.json({ error: 'No KPI data available.' }, { status: 404 });
  }

  const mtd = await supabase.rpc('rpt_kpi_dashboard_mtd', { p_date: reportDate });
  if (mtd.error) return NextResponse.json({ error: mtd.error.message }, { status: 500 });
  const mtdRows = mtd.data || [];

  // ── Data Quality Alert for DAY section ──────────────────────────────────
  const expectedStoresRes = await supabase.rpc('rpt_expected_stores', { p_date: reportDate });
  let dayAlert = buildDataQualityAlert(reportDate, []);
  if (!expectedStoresRes.error) {
    dayAlert = buildDataQualityAlert(reportDate, expectedStoresRes.data || []);
  }

  // Build DAY HTML with data quality alert banner prepended if missing stores exist
  const dayHtml = dayAlert.hasMissing
    ? dayAlert.banner + buildKpiSectionHtml(`Day: ${displayDate(reportDate)}`, rows) + dayAlert.sectionNote
    : buildKpiSectionHtml(`Day: ${displayDate(reportDate)}`, rows);

  // Two separate images: Day and MTD. MTD never shows the alert.
  return NextResponse.json({
    parts: [
      { html: dayHtml },
      { html: buildKpiSectionHtml(`MTD: ${mtdLabel(reportDate)}`, mtdRows) },
    ],
    reportDate,
    displayDate: displayDate(reportDate),
    subject: `Virata Retail KPI Dashboard — ${displayDate(reportDate)} (Day + MTD)`,
    stores: rows.length,
    dataQuality: dayAlert.stats,
  });
}