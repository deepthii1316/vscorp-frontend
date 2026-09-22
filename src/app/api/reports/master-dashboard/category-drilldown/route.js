import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { comparisonRange } from '@/lib/masterDashboardShared';

// GET /api/reports/master-dashboard/category-drilldown?startDate=..&endDate=..
//   optional compareStart / compareEnd (Compare mode); otherwise the same
//   days one month earlier, same convention as /api/reports/master-dashboard.
// Reads gold.reebok_category_drilldown (built by
// backend/worker/pipeline/scripts/refresh_category_drilldown.py). Returns raw
// rows for both periods; the browser aggregates them — see
// src/lib/categoryDrilldownShared.js.

export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TABLE = 'reebok_category_drilldown';

async function fetchRange(supabase, start, end) {
  const { data, error } = await supabase
    .schema('gold')
    .from(TABLE)
    .select('full_date, division, department, section, article_type, footwear_type, qty, mrp_value, nsv')
    .gte('full_date', start)
    .lte('full_date', end)
    .limit(10000);
  if (error) throw new Error(`${TABLE}: ${error.message}`);
  return data || [];
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  try {
    const supabase = createServerClient();

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
    } else {
      compare = comparisonRange(startDate, endDate);
    }

    const [rows, prevRows] = await Promise.all([
      fetchRange(supabase, startDate, endDate),
      compare ? fetchRange(supabase, compare.start, compare.end) : Promise.resolve([]),
    ]);

    return NextResponse.json({
      success: true,
      rows,
      prevRows,
      comparison: compare,
    });
  } catch (err) {
    console.error('Category Drill-down API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
