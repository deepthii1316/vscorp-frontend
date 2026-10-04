/**
 * reportValidator.js — Validate Excel report structure
 *
 * Before attempting to ingest, validate that the file:
 * - Has required columns for its report type
 * - Contains data rows (not empty)
 * - Doesn't have parsing errors
 */

import ExcelJS from 'exceljs';

const REQUIRED_COLUMNS = {
  sales: [
    /store\s*number/i,
    /bill\s*(?:no|number)/i,
    /bill\s*date/i,
    /qty|quantity/i,
    /taxable\s*amount|value/i,
  ],
  account_dsr: [
    /date/i,
    /store\s*(?:number|code|name)/i,
    /cash|card|upi|total\s*(?:bills|sales)/i,
  ],
  inventory: [
    /(?:product|item)\s*(?:name|description)|item\s*name/i,
    /store\s*(?:code|number)/i,
    /stock\s*(?:qty|quantity)|closing\s*qty/i,
  ],
};

/**
 * Validate a report file against its expected type
 * Returns: { isValid, headerCount, dataRowCount, requiredHeadersFound, errors }
 */
export async function validateReport(filepath, reportType) {
  console.log(`[VALIDATOR] Validating ${reportType}: ${filepath}`);

  const result = {
    isValid: false,
    headerCount: 0,
    dataRowCount: 0,
    requiredHeadersFound: 0,
    requiredHeadersExpected: 0,
    errors: [],
    warnings: [],
  };

  if (!REQUIRED_COLUMNS[reportType]) {
    result.errors.push(`Unknown report type: ${reportType}`);
    return result;
  }

  try {
    const workbook = new ExcelJS.Workbook();

    try {
      // Try reading the file directly
      await workbook.xlsx.readFile(filepath);
    } catch (fileError) {
      console.warn(`  Direct read failed: ${fileError.message}, trying stream method...`);

      // Fallback: use fs stream
      const fs = await import('fs');
      const stream = fs.createReadStream(filepath);
      await workbook.xlsx.read(stream);
    }

    if (workbook.worksheets.length === 0) {
      result.errors.push('Excel file has no worksheets');
      return result;
    }

    const ws = workbook.worksheets[0];
    console.log(`  Sheet: "${ws.name}"`);

    // Find header row
    const headerInfo = findAndValidateHeaders(ws, reportType);
    result.headerCount = headerInfo.count;
    result.requiredHeadersFound = headerInfo.foundCount;
    result.requiredHeadersExpected = headerInfo.expectedCount;
    result.errors.push(...headerInfo.errors);
    result.warnings.push(...headerInfo.warnings);

    if (headerInfo.errors.length > 0) {
      workbook.close();
      return result;
    }

    // Count data rows (skip empty rows)
    let dataRowCount = 0;
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > 1) { // Skip header row
        const hasData = row.values && row.values.some(v => v && v.toString().trim());
        if (hasData) dataRowCount += 1;
      }
    });

    result.dataRowCount = dataRowCount;
    console.log(`  Data rows: ${dataRowCount}`);

    if (dataRowCount === 0) {
      result.errors.push('No data rows found (file contains only headers)');
    }

    try {
      workbook.close?.();
    } catch (e) {
      // Ignore close errors (stream-based reads may not support close)
    }

    // Mark as valid if no critical errors
    result.isValid = result.errors.length === 0 && dataRowCount > 0;
    return result;
  } catch (err) {
    console.error(`  Error reading file: ${err.message}`);
    result.errors.push(`Failed to read Excel file: ${err.message}`);
    return result;
  }
}

/**
 * Find header row and check for required columns
 */
function findAndValidateHeaders(worksheet, reportType) {
  const required = REQUIRED_COLUMNS[reportType] || [];
  const result = {
    count: 0,
    foundCount: 0,
    expectedCount: required.length,
    errors: [],
    warnings: [],
  };

  // Try to find header row (rows 0-15)
  let headerRow = null;
  let headerRowNum = -1;

  for (let rowNum = 1; rowNum <= 15; rowNum++) {
    const row = worksheet.getRow(rowNum);
    const values = [];
    let knownTermCount = 0;

    const knownTerms = [
      'store', 'site', 'bill', 'date', 'barcode', 'item', 'product',
      'qty', 'quantity', 'amount', 'value', 'cash', 'card', 'upi',
      'category', 'department', 'division', 'sap', 'code', 'sales',
    ];

    row.eachCell((cell) => {
      const val = cell.value?.toString()?.trim() || '';
      if (val) {
        values.push(val);
        if (knownTerms.some(t => val.toLowerCase().includes(t))) {
          knownTermCount += 1;
        }
      }
    });

    // Heuristic: if row has known terms and multiple values, it's likely the header
    if (knownTermCount >= 2 && values.length >= 3) {
      headerRow = values;
      headerRowNum = rowNum;
      break;
    }
  }

  if (!headerRow) {
    // Fallback to row 1
    const row = worksheet.getRow(1);
    const values = [];
    row.eachCell((cell) => {
      const val = cell.value?.toString()?.trim() || '';
      if (val) values.push(val);
    });
    headerRow = values;
    headerRowNum = 1;
  }

  if (!headerRow || headerRow.length === 0) {
    result.errors.push('Could not find header row');
    return result;
  }

  result.count = headerRow.length;
  console.log(`  Headers (${result.count}): ${headerRow.slice(0, 5).join(', ')}${headerRow.length > 5 ? '...' : ''}`);

  // Check for required columns
  for (const requiredPattern of required) {
    let found = false;
    for (const header of headerRow) {
      if (requiredPattern.test(header)) {
        result.foundCount += 1;
        found = true;
        console.log(`    ✓ Found required column: ${header}`);
        break;
      }
    }
    if (!found) {
      result.warnings.push(`Missing expected column matching: ${requiredPattern}`);
    }
  }

  // Check: must have at least 50% of required columns (more lenient)
  const percentFound = (result.foundCount / result.expectedCount) * 100;
  if (percentFound < 40) {
    result.errors.push(
      `Only ${result.foundCount}/${result.expectedCount} required columns found (${percentFound.toFixed(0)}%). ` +
      `Expected headers: ${REQUIRED_COLUMNS[reportType].map(r => r.source).join(', ')}`
    );
  } else if (percentFound < 60) {
    result.warnings.push(
      `Only ${result.foundCount}/${result.expectedCount} expected columns found (${percentFound.toFixed(0)}%). Consider reviewing.`
    );
  }

  return result;
}

/**
 * Get validation summary for logging/display
 */
export function getValidationSummary(validation, filename) {
  const lines = [];
  lines.push(`File: ${filename}`);
  lines.push(`Headers: ${validation.headerCount}`);
  lines.push(`Data rows: ${validation.dataRowCount}`);
  lines.push(`Required columns: ${validation.requiredHeadersFound}/${validation.requiredHeadersExpected}`);

  if (validation.errors.length > 0) {
    lines.push(`Errors: ${validation.errors.join('; ')}`);
  }
  if (validation.warnings.length > 0) {
    lines.push(`Warnings: ${validation.warnings.join('; ')}`);
  }

  lines.push(`Valid: ${validation.isValid ? 'YES ✓' : 'NO ✗'}`);

  return lines.join('\n');
}
