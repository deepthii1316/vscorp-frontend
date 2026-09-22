// Master Dashboard data access (server side). Reads the Reebok gold tables:
//   gold.reebok_master_dashboard           one row per day (sales)
//   gold.reebok_master_dashboard_payments  one row per day (Account DSR payment split)
// Built by backend/worker/pipeline/scripts/refresh_reebok.py.

import { comparisonRange, daysBetween } from './masterDashboardShared';

const SALES_TABLE = 'reebok_master_dashboard';
const PAYMENTS_TABLE = 'reebok_master_dashboard_payments';
const RETAIL_METRICS_TABLE = 'reebok_daily_metrics';

async function fetchRange(supabase, table, start, end) {
  const { data, error } = await supabase
    .schema('gold')
    .from(table)
    .select('*')
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
    .select('full_date, nsv, bills, qty_sold, footwear_qty, apparel_qty, socks_qty, fupt, sfr, afr')
    .eq('site_short_name', 'R1157')
    .eq('period_type', 'today')
    .gte('full_date', start)
    .lte('full_date', end)
    .order('full_date', { ascending: true })
    .limit(1000);
  if (error) throw new Error(`${RETAIL_METRICS_TABLE}: ${error.message}`);
  return data || [];
}

/** First and latest date that have sales data (latest is the anchor for the preset ranges). */
export async function loadDataBounds(supabase) {
  const edge = async (ascending) => {
    const { data, error } = await supabase
      .schema('gold')
      .from(SALES_TABLE)
      .select('full_date')
      .order('full_date', { ascending })
      .limit(1);
    if (error) throw new Error(`${SALES_TABLE}: ${error.message}`);
    return data?.[0]?.full_date || null;
  };
  const [firstDate, latestDate] = await Promise.all([edge(true), edge(false)]);
  return { firstDate, latestDate };
}

/**
 * Everything the Overview tab needs for [start, end]:
 * day rows for the period, day rows for the comparison period (or none), and the payment rows.
 * The comparison period is the same days one month earlier, unless an explicit window is passed
 * (Compare mode: Period B).
 * The browser aggregates them (sums first, ratios after).
 */
export async function loadOverview(supabase, start, end, compare = null) {
  const cmp = compare && compare.start && compare.end ? { start: compare.start, end: compare.end } : comparisonRange(start, end);
  const [days, prevDays, payments] = await Promise.all([
    fetchRange(supabase, SALES_TABLE, start, end),
    cmp ? fetchRange(supabase, SALES_TABLE, cmp.start, cmp.end) : Promise.resolve([]),
    fetchRange(supabase, PAYMENTS_TABLE, start, end),
  ]);
  const [retailMetricsDays, retailMetricsPrevDays] = await Promise.all([
    fetchRetailMetrics(supabase, start, end),
    cmp ? fetchRetailMetrics(supabase, cmp.start, cmp.end) : Promise.resolve([]),
  ]);
  return {
    range: { start, end, days: daysBetween(start, end) },
    comparison: cmp ? { ...cmp, days: daysBetween(cmp.start, cmp.end) } : null,
    days,
    prevDays,
    payments,
    retailMetricsDays,
    retailMetricsPrevDays,
  };
}
