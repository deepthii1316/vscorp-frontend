import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/middleware/auth';
import { loadDataBounds, loadOverview } from '@/lib/masterDashboardData';

// GET /api/reports/master-dashboard?meta=1                 -> { firstDate, latestDate }
// GET /api/reports/master-dashboard?startDate=..&endDate=.. -> day rows for the period, the comparison
//                                                              period and payments. Optional compareStart /
//                                                              compareEnd give Period B (Compare mode);
//                                                              otherwise the same days one month earlier.
// Reads the Reebok gold tables (see lib/masterDashboardData.js). The old fact_master_dashboard
// tables are no longer used.

export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.response) return auth.response;

  const { searchParams } = new URL(request.url);
  try {
    const supabase = createServerClient();

    if (searchParams.get('meta')) {
      return NextResponse.json({ success: true, ...(await loadDataBounds(supabase)) });
    }

    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    if (!ISO_DATE.test(startDate || '') || !ISO_DATE.test(endDate || '') || startDate > endDate) {
      return NextResponse.json({ success: false, error: 'startDate and endDate (YYYY-MM-DD) are required, start on or before end.' }, { status: 400 });
    }

    const compareStart = searchParams.get('compareStart');
    const compareEnd = searchParams.get('compareEnd');
    let compare = null;
    if (compareStart || compareEnd) {
      if (!ISO_DATE.test(compareStart || '') || !ISO_DATE.test(compareEnd || '') || compareStart > compareEnd) {
        return NextResponse.json({ success: false, error: 'compareStart and compareEnd must both be valid dates, start on or before end.' }, { status: 400 });
      }
      compare = { start: compareStart, end: compareEnd };
    }

    const data = await loadOverview(supabase, startDate, endDate, compare);
    return NextResponse.json({ success: true, ...data });
  } catch (err) {
    console.error('Master Dashboard API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
