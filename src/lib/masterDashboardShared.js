// Master Dashboard Shared Helpers & Types

export function formatINR(val) {
  if (val === null || val === undefined || isNaN(val)) return '₹0';
  const num = Number(val);
  if (Math.abs(num) >= 10000000) {
    return `₹${(num / 10000000).toFixed(2)}Cr`;
  } else if (Math.abs(num) >= 100000) {
    return `₹${(num / 100000).toFixed(1)}L`;
  } else if (Math.abs(num) >= 1000) {
    return `₹${(num / 1000).toFixed(1)}k`;
  }
  return `₹${Math.round(num).toLocaleString('en-IN')}`;
}

export function formatNumber(val) {
  if (val === null || val === undefined || isNaN(val)) return '0';
  return Math.round(Number(val)).toLocaleString('en-IN');
}

export function formatPercent(val) {
  if (val === null || val === undefined || isNaN(val)) return '0%';
  return `${Number(val).toFixed(1)}%`;
}

export const QUICK_RANGES = [
  { label: 'WTD', value: 'wtd' },
  { label: 'MTD', value: 'mtd' },
  { label: 'YTD', value: 'ytd' },
  { label: 'All', value: 'all' },
];

export const DIVISIONS = [
  { label: 'All divisions', value: 'ALL' },
  { label: 'Footwear', value: 'Footwear' },
  { label: 'Apparel', value: 'Apparel' },
  { label: 'Accessories', value: 'Accessories' },
];
