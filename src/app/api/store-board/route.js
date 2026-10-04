import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/middleware/auth';
import { loadDataBounds, loadStoreBoard } from '@/lib/storeBoardData';

// GET /api/store-board?meta=1                 -> { firstDate, latestDate } for Uppal store
// GET /api/store-board?startDate=..&endDate=.. -> day rows for the period and comparison period
//                                                  Reads the Reebok gold tables for Uppal store only

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

    const data = await loadStoreBoard(supabase, startDate, endDate, compare);
    return NextResponse.json({ success: true, ...data });
  } catch (err) {
    console.error('Store Board API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
