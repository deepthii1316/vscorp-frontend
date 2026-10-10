// Shared calculations for Store Board. Follows the metric definitions from STORE_BOARD_REFERENCE.md

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Sum a numeric field across day rows
 */
export function sumDays(days, field) {
  return days.reduce((sum, day) => sum + (parseFloat(day[field]) || 0), 0);
}

/**
 * Calculate KPIs from aggregated day data
 */
export function kpisFrom(days) {
  const revenue = sumDays(days, 'nsv');
  const bills = sumDays(days, 'bills');
  const units = sumDays(days, 'qty_sold');
  const footwear_qty = sumDays(days, 'footwear_qty');
  const apparel_qty = sumDays(days, 'apparel_qty');
  const accessories_qty = sumDays(days, 'accessories_qty');
  const socks_qty = sumDays(days, 'socks_qty');
  const shoes_qty = sumDays(days, 'shoes_qty');
  const mrp_value = sumDays(days, 'mrp_value');
  const walkins = sumDays(days, 'walkins');
  const male_walkins = sumDays(days, 'male_walkins');
  const female_walkins = sumDays(days, 'female_walkins');

  return {
    revenue,
    bills,
    units,
    footwear_qty,
    apparel_qty,
    accessories_qty,
    socks_qty,
    shoes_qty,
    mrp_value,
    walkins,
    male_walkins,
    female_walkins,
    // Calculated KPIs
    atv: bills > 0 ? revenue / bills : 0,
    upt: bills > 0 ? units / bills : 0,
    asp: units > 0 ? revenue / units : 0,
    sfr: walkins > 0 ? (bills / walkins) * 100 : 0,
    fupt: bills > 0 ? footwear_qty / bills : 0,
    sockPercent: footwear_qty > 0 ? (socks_qty / footwear_qty) * 100 : 0,
    ssr: shoes_qty > 0 ? (socks_qty / shoes_qty) * 100 : 0,
    afr: footwear_qty > 0 ? (apparel_qty / footwear_qty) * 100 : 0,
    mdPercent: mrp_value > 0 ? ((mrp_value - revenue) / mrp_value) * 100 : 0,
  };
}

/**
 * Percent change between two periods
 */
export function change(current, previous) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * Format Indian Rupees for display
 */
export function formatINRFull(value) {
  if (!value) return '₹0';
  const abs = Math.abs(value);
  if (abs >= 10000000) {
    return `₹${(value / 10000000).toFixed(1)}Cr`;
  }
  if (abs >= 100000) {
    return `₹${(value / 100000).toFixed(1)}L`;
  }
  if (abs >= 1000) {
    return `₹${(value / 1000).toFixed(1)}K`;
  }
  return `₹${value.toFixed(0)}`;
}

/**
 * Format as compact currency
 */
export function formatCurrency(value) {
  return formatINRFull(value);
}

/**
 * Format number with decimals
 */
export function formatNumber(value, decimals = 0) {
  if (!value) return '0';
  return parseFloat(value).toFixed(decimals);
}

/**
 * Format as percentage
 */
export function formatPercent(value, decimals = 1) {
  if (value === null || value === undefined) return '—';
  return `${parseFloat(value).toFixed(decimals)}%`;
}

/**
 * Get the target for a date range. For now, returns null as targets need to be fetched separately.
 * TODO: Fetch from salesperson_targets and fact_targets tables
 */
export function getTargetForPeriod(periodStart, periodEnd) {
  return null;
}

/**
 * Compare two date ranges to determine if dates are one year apart
 */
export function areOneYearApart(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diff = Math.abs(d1.getFullYear() - d2.getFullYear());
  return diff === 1 || (diff === 0 && d1.getMonth() !== d2.getMonth());
}

/**
 * Calculate day of week weight for weekly plan
 * Sunday and Saturday = 20, Mon-Fri = 12
 */
export function getDayWeight(date) {
  const d = new Date(date + 'T00:00:00Z');
  const dayOfWeek = d.getUTCDay();
  return dayOfWeek === 0 || dayOfWeek === 6 ? 20 : 12;
}

/**
 * Calculate week number in month (1-5)
 */
export function getWeekOfMonth(date) {
  const d = new Date(date + 'T00:00:00Z');
  const day = d.getUTCDate();
  if (day <= 7) return 1;
  if (day <= 14) return 2;
  if (day <= 21) return 3;
  if (day <= 28) return 4;
  return 5;
}

/**
 * Get the week range for a given date
 */
export function getWeekRange(date) {
  const d = new Date(date + 'T00:00:00Z');
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();

  let weekStart, weekEnd;
  if (day <= 7) {
    weekStart = new Date(Date.UTC(year, month, 1));
    weekEnd = new Date(Date.UTC(year, month, 7));
  } else if (day <= 14) {
    weekStart = new Date(Date.UTC(year, month, 8));
    weekEnd = new Date(Date.UTC(year, month, 14));
  } else if (day <= 21) {
    weekStart = new Date(Date.UTC(year, month, 15));
    weekEnd = new Date(Date.UTC(year, month, 21));
  } else if (day <= 28) {
    weekStart = new Date(Date.UTC(year, month, 22));
    weekEnd = new Date(Date.UTC(year, month, 28));
  } else {
    weekStart = new Date(Date.UTC(year, month, 29));
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    weekEnd = new Date(Date.UTC(year, month, lastDay));
  }

  return {
    start: weekStart.toISOString().split('T')[0],
    end: weekEnd.toISOString().split('T')[0],
  };
}
