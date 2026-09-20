import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { loadLatestDate, loadOverview } from '@/lib/masterDashboardData';

// GET /api/reports/master-dashboard?meta=1                 -> { latestDate }
// GET /api/reports/master-dashboard?startDate=..&endDate=.. -> day rows for the period, the
//                                                              month-earlier comparison and payments.
// Reads the Reebok gold tables (see lib/masterDashboardData.js). The old fact_master_dashboard
// tables are no longer used.

export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  try {
    const supabase = createServerClient();

    if (searchParams.get('meta')) {
      return NextResponse.json({ success: true, latestDate: await loadLatestDate(supabase) });
    }

    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    if (!ISO_DATE.test(startDate || '') || !ISO_DATE.test(endDate || '') || startDate > endDate) {
      return NextResponse.json({ success: false, error: 'startDate and endDate (YYYY-MM-DD) are required, start on or before end.' }, { status: 400 });
    }

    const data = await loadOverview(supabase, startDate, endDate);
    return NextResponse.json({ success: true, ...data });
  } catch (err) {
    console.error('Master Dashboard API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
