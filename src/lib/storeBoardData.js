// Store Board data access (server side). Reads the Reebok gold tables for Uppal store only.
// Data structure is similar to Master Dashboard but focused on a single store.

import { comparisonRange, daysBetween } from './masterDashboardShared';

const SALES_TABLE = 'reebok_master_dashboard';
const RETAIL_METRICS_TABLE = 'reebok_daily_metrics';
const FOOTFALL_TABLE = 'reebok_footfall';

// Uppal store code in the system
const UPPAL_STORE_CODE = 'R1157';

async function fetchRange(supabase, table, start, end) {
  const { data, error } = await supabase
    .schema('gold')
    .from(table)
    .select('*')
    .eq('site_short_name', UPPAL_STORE_CODE)
    .gte('full_date', start)
    .lte('full_date', end)
    .order('full_date', { ascending: true })
    .limit(1000);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

async function fetchRetailMetrics(supabase, start, end) {
  const { data, error } = await supabase
    .schema('gold')
    .from(RETAIL_METRICS_TABLE)
    .select('*')
    .eq('site_short_name', UPPAL_STORE_CODE)
    .eq('period_type', 'today')
    .gte('full_date', start)
    .lte('full_date', end)
    .order('full_date', { ascending: true })
    .limit(1000);
  if (error) throw new Error(`${RETAIL_METRICS_TABLE}: ${error.message}`);
  return data || [];
}

async function fetchFootfall(supabase, start, end) {
  const { data, error } = await supabase
    .schema('gold')
    .from(FOOTFALL_TABLE)
    .select('*')
    .eq('site_short_name', UPPAL_STORE_CODE)
    .gte('full_date', start)
    .lte('full_date', end)
    .order('full_date', { ascending: true })
    .limit(1000);
  if (error) {
    console.warn(`Could not load footfall data: ${error.message}`);
    return [];
  }
  return data || [];
}

/** First and latest date that have sales data for Uppal store. */
export async function loadDataBounds(supabase) {
  const edge = async (ascending) => {
    const { data, error } = await supabase
      .schema('gold')
      .from(SALES_TABLE)
      .select('full_date')
      .eq('site_short_name', UPPAL_STORE_CODE)
      .order('full_date', { ascending })
      .limit(1);
    if (error) throw new Error(`${SALES_TABLE}: ${error.message}`);
    return data?.[0]?.full_date || null;
  };
  const [firstDate, latestDate] = await Promise.all([edge(true), edge(false)]);
  return { firstDate, latestDate };
}

/**
 * Everything the Store Board needs for [start, end]:
 * day rows for the period and day rows for the comparison period.
 */
export async function loadStoreBoard(supabase, start, end, compare = null) {
  const cmp = compare && compare.start && compare.end ? { start: compare.start, end: compare.end } : comparisonRange(start, end);
  const [days, prevDays, metrics, prevMetrics, footfall] = await Promise.all([
    fetchRange(supabase, SALES_TABLE, start, end),
    cmp ? fetchRange(supabase, SALES_TABLE, cmp.start, cmp.end) : Promise.resolve([]),
    fetchRetailMetrics(supabase, start, end),
    cmp ? fetchRetailMetrics(supabase, cmp.start, cmp.end) : Promise.resolve([]),
    fetchFootfall(supabase, start, end),
  ]);
  return {
    range: { start, end, days: daysBetween(start, end) },
    comparison: cmp ? { ...cmp, days: daysBetween(cmp.start, cmp.end) } : null,
    days,
    prevDays,
    metrics,
    prevMetrics,
    footfall,
  };
}
