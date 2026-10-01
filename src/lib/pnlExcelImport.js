import * as XLSX from 'xlsx';

// Expected column indices in the P&L Excel file
const COL = {
  storeCode: 0,
  storeName: 1,
  month: 2,
  sale: 3,
  rent: 4,
  staffSalaries: 5,
  electricity: 6,
  telephone: 7,
  pettyCash: 8,
  houseKeeping: 9,
  staffIncentives: 10,
  bankEDC: 11,
  bankUPI: 12,
  incomeMargin: 13,
  depreciation: 14,
  fundsCost: 15,
  roi: 16,
};

const EXPENSE_COLUMNS = [
  { colIndex: 4, categoryName: 'Rent + CAM' },
  { colIndex: 5, categoryName: 'Staff Salaries' },
  { colIndex: 6, categoryName: 'Electricity Bill' },
  { colIndex: 7, categoryName: 'Telephone & Internet' },
  { colIndex: 8, categoryName: 'Petty Cash' },
  { colIndex: 9, categoryName: 'House Keeping' },
  { colIndex: 10, categoryName: 'Staff Incentives' },
  { colIndex: 11, categoryName: 'Bank EDC Charges' },
  { colIndex: 12, categoryName: 'Bank UPI Charges' },
];

/**
 * Parse Excel file and extract P&L data
 * Expected format: One row per month with all metrics
 */
export async function parsePnLWorkbook(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 0, defval: '' });

  const monthlyRows = [];
  const warnings = [];

  rows.forEach((row, idx) => {
    if (!row[0] || idx === 0) return; // Skip header or empty rows

    try {
      const monthStr = row[2]?.toString?.().trim();
      const saleValue = parseFloat(row[3]);
      const incomeMargin = parseFloat(row[13]);

      // Skip if missing key data
      if (!monthStr || (isNaN(saleValue) && isNaN(incomeMargin))) {
        return;
      }

      // Parse month (e.g., "Jul-2026", "July-2026", "July 2026")
      const monthDate = parseMonthString(monthStr);
      if (!monthDate) {
        warnings.push(`Row ${idx + 1}: Could not parse month "${monthStr}"`);
        return;
      }

      // Extract expense line items
      const expenses = {};
      EXPENSE_COLUMNS.forEach(({ colIndex, categoryName }) => {
        const amount = parseFloat(row[colIndex]) || 0;
        if (amount > 0) {
          expenses[categoryName] = amount;
        }
      });

      monthlyRows.push({
        storeName: 'REEBOK UPPAL',
        storeCode: '323865',
        periodMonth: monthDate,
        grossSale: saleValue || 0,
        incomeMargin: incomeMargin || 0,
        depreciation: parseFloat(row[14]) || 0,
        fundsCost: parseFloat(row[15]) || 0,
        roi: parseFloat(row[16]) || 0,
        expenses,
        originalRow: idx + 1,
      });
    } catch (err) {
      warnings.push(`Row ${idx + 1}: Error parsing - ${err.message}`);
    }
  });

  return {
    storeName: 'REEBOK UPPAL',
    monthlyRows,
    warnings,
    rowCount: monthlyRows.length,
  };
}

/**
 * Parse various month formats to Date
 */
function parseMonthString(str) {
  if (!str) return null;

  const patterns = [
    { regex: /(\w+)\s*-\s*(\d{4})/, format: 'MMM-YYYY' }, // "Jul-2026"
    { regex: /(\w+)\s+(\d{4})/, format: 'MMM YYYY' }, // "July 2026"
    { regex: /(\d{1,2})\/(\d{4})/, format: 'M/YYYY' }, // "7/2026"
  ];

  for (const { regex } of patterns) {
    const match = str.match(regex);
    if (match) {
      const monthPart = match[1];
      const year = parseInt(match[2]);

      let monthNum = 0;
      if (isNaN(monthPart)) {
        // Month name
        const monthNames = [
          'jan', 'feb', 'mar', 'apr', 'may', 'jun',
          'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
        ];
        monthNum = monthNames.indexOf(monthPart.toLowerCase().slice(0, 3)) + 1;
      } else {
        monthNum = parseInt(monthPart);
      }

      if (monthNum < 1 || monthNum > 12 || !year) return null;

      // Return first day of month
      return new Date(year, monthNum - 1, 1);
    }
  }

  return null;
}

/**
 * Generate preview data from parsed rows
 */
export function generateImportPreview(parsedData) {
  return {
    storeName: parsedData.storeName,
    summary: {
      totalMonths: parsedData.monthlyRows.length,
      dateRange:
        parsedData.monthlyRows.length > 0
          ? `${formatDate(parsedData.monthlyRows[0].periodMonth)} to ${formatDate(
              parsedData.monthlyRows[parsedData.monthlyRows.length - 1].periodMonth
            )}`
          : 'N/A',
      warnings: parsedData.warnings.length,
    },
    preview: parsedData.monthlyRows.slice(0, 5).map((row) => ({
      month: formatDate(row.periodMonth),
      sale: row.grossSale,
      incomeMargin: row.incomeMargin,
      roi: row.roi,
      expenseCount: Object.keys(row.expenses).length,
    })),
    warnings: parsedData.warnings,
  };
}

function formatDate(date) {
  if (!date) return '—';
  return date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short' });
}
