/**
 * reportClassifier.js — Intelligent report type detection
 *
 * Classifies Excel attachments by:
 * 1. Filename patterns (strong signal)
 * 2. Sheet names (medium signal)
 * 3. Column headers (medium signal)
 * Combined scoring approach with confidence threshold
 */

import ExcelJS from 'exceljs';

const REPORT_PATTERNS = {
  sales: {
    filenames: [
      /day\s*wise\s*sales/i,
      /bill\s*wise.*item/i,
      /mfl\s+bill/i,
      /mfl.*item/i,
      /sales.*report/i,
      /sale.*item/i,
      /mfl.*sales/i,
    ],
    sheets: [
      /sales/i,
      /bill/i,
      /item/i,
      /day\s*wise/i,
    ],
    headers: [
      /store\s*number/i,
      /bill\s*(?:no|number)/i,
      /bill\s*date/i,
      /quantity|qty/i,
      /taxable\s*amount|value/i,
      /sap\s*code/i,
    ],
    minHeaders: 3,
  },
  account_dsr: {
    filenames: [
      /\bacc\s*dsr\b/i,
      /\bdsr\b.*uppal/i,
      /acc.*dsr/i,
      /daily\s*sales.*register/i,
      /account.*dsr/i,
      /sales\s*register/i,
      /\bdsr\s/i,
      /^dsr/i,
    ],
    sheets: [
      /dsr/i,
      /account/i,
      /daily/i,
      /sales/i,
    ],
    headers: [
      /date/i,
      /store\s*(?:number|name|code)/i,
      /cash|card|upi|total\s*sales/i,
    ],
    minHeaders: 2,
  },
  inventory: {
    filenames: [
      /stock\s*balance/i,
      /inventory/i,
      /stock.*report/i,
      /soh\s*vs\s*dc/i,
      /warehouse/i,
      /inward/i,
      /closing.*qty/i,
    ],
    sheets: [
      /stock/i,
      /inventory/i,
      /warehouse/i,
      /balance/i,
    ],
    headers: [
      /store\s*(?:code|number)/i,
      /sap\s*code/i,
      /item\s*(?:description|name)|product\s*name/i,
      /stock\s*qty|closing\s*qty|quantity|stock/i,
    ],
    minHeaders: 2,
  },
};

/**
 * Classify a report file based on filename, sheets, and headers
 * Returns: { reportType, confidence, method, details }
 */
export async function classifyReport(filepath, filename) {
  console.log(`[CLASSIFIER] Analyzing: ${filename}`);

  const scores = {
    sales: { filename: 0, sheets: 0, headers: 0, total: 0 },
    account_dsr: { filename: 0, sheets: 0, headers: 0, total: 0 },
    inventory: { filename: 0, sheets: 0, headers: 0, total: 0 },
  };

  // ─── Step 1: Filename matching ──────────────────────────────────────────
  console.log(`  [1/3] Filename matching...`);
  for (const [reportType, patterns] of Object.entries(REPORT_PATTERNS)) {
    for (const pattern of patterns.filenames) {
      if (pattern.test(filename)) {
        scores[reportType].filename += 1;
        console.log(`    ✓ Matched "${reportType}" pattern: ${pattern}`);
      }
    }
  }

  // ─── Step 2: Sheet names ───────────────────────────────────────────────
  console.log(`  [2/3] Sheet name matching...`);
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

    const sheetNames = workbook.worksheets.map(ws => ws.name);
    console.log(`    Found sheets: ${sheetNames.join(', ')}`);

    for (const [reportType, patterns] of Object.entries(REPORT_PATTERNS)) {
      for (const sheetName of sheetNames) {
        for (const pattern of patterns.sheets) {
          if (pattern.test(sheetName)) {
            scores[reportType].sheets += 1;
            console.log(`    ✓ Matched "${reportType}" sheet: ${sheetName}`);
            break; // Count each sheet once per report type
          }
        }
      }
    }

    // ─── Step 3: Header matching ───────────────────────────────────────────
    console.log(`  [3/3] Header matching...`);
    const ws = workbook.worksheets[0];
    if (!ws) throw new Error('No worksheets found');

    // Get header row (try to find it intelligently)
    const headers = findHeaderRow(ws);
    console.log(`    Found ${headers.length} columns`);

    for (const [reportType, patterns] of Object.entries(REPORT_PATTERNS)) {
      let matches = 0;
      for (const header of headers) {
        for (const pattern of patterns.headers) {
          if (pattern.test(header)) {
            matches += 1;
            console.log(`    ✓ Matched "${reportType}" header: ${header}`);
            break; // Count each header once
          }
        }
      }
      scores[reportType].headers = matches;
    }

    try {
      workbook.close?.();
    } catch (e) {
      // Ignore close errors (stream-based reads may not support close)
    }
  } catch (err) {
    console.warn(`  [!] Excel read failed: ${err.message}`);
    console.warn(`  [!] Will classify using filename/sheet matches only`);
  }

  // ─── Step 4: Calculate confidence ──────────────────────────────────────
  console.log(`  Scoring...`);

  // Weight: filename > headers > sheets
  for (const reportType of Object.keys(scores)) {
    const s = scores[reportType];
    s.total = (s.filename * 5) + (s.headers * 2) + (s.sheets * 1);
    console.log(`    ${reportType}: filename=${s.filename}, headers=${s.headers}, sheets=${s.sheets}, total=${s.total}`);
  }

  // Find best match
  const sorted = Object.entries(scores).sort((a, b) => b[1].total - a[1].total);
  const [bestType, bestScore] = sorted[0];

  // Confidence calculation
  const topScore = bestScore.total;
  const secondScore = sorted[1]?.[1]?.total || 0;
  const maxPossible = 15; // 5 filenames + headers + sheets

  let confidence = 0;
  let method = 'combined';

  if (topScore === 0) {
    // No matches at all
    confidence = 0;
    method = 'no_match';
  } else if (bestScore.filename >= 2) {
    // Strong filename match (multiple patterns matched)
    confidence = Math.min(0.95, 0.85 + (bestScore.filename * 0.05));
    method = 'filename_strong';
  } else if (bestScore.filename >= 1 && topScore - secondScore >= 2) {
    // Single or double filename match with clear lead over others
    confidence = Math.min(0.80, 0.70 + (bestScore.filename * 0.10));
    method = 'filename_solid';
  } else if (bestScore.headers >= REPORT_PATTERNS[bestType].minHeaders) {
    // Good header match
    confidence = Math.min(0.85, 0.75 + (bestScore.headers * 0.05));
    method = 'headers_strong';
  } else if (bestScore.filename >= 1 && topScore > secondScore) {
    // Filename match beats others (even without headers)
    confidence = Math.min(0.75, 0.65 + (bestScore.filename * 0.05));
    method = 'filename_only';
  } else if (topScore > secondScore) {
    // Any match beats others
    confidence = Math.min(0.65, topScore / maxPossible);
    method = 'combined_weak';
  } else {
    // Ambiguous
    confidence = 0;
    method = 'ambiguous';
  }

  const result = {
    reportType: confidence >= 0.60 ? bestType : 'unknown',
    confidence,
    method,
    details: `Score: ${topScore}/${maxPossible}. Filename:${bestScore.filename}, Headers:${bestScore.headers}, Sheets:${bestScore.sheets}`,
  };

  console.log(`  Result: ${result.reportType} (confidence: ${(result.confidence * 100).toFixed(1)}%, method: ${result.method})`);
  return result;
}

/**
 * Find the header row in an Excel sheet
 * Returns array of header names (strings)
 */
function findHeaderRow(worksheet) {
  const knownTerms = [
    'store', 'site', 'bill', 'date', 'barcode', 'bar code',
    'item', 'product', 'section', 'department', 'division',
    'mrp', 'value', 'amount', 'qty', 'quantity', 'hsn',
    'gstin', 'salesman', 'promo', 'size', 'category',
    'sap', 'code', 'upi', 'card', 'cash', 'sales',
  ];

  // Try rows 0-15
  for (let rowNum = 1; rowNum <= 15; rowNum++) {
    const row = worksheet.getRow(rowNum);
    const values = [];
    let scoreThisRow = 0;
    let unnamedCount = 0;

    row.eachCell((cell) => {
      const val = cell.value?.toString()?.trim() || '';
      if (val) {
        values.push(val);
        const lower = val.toLowerCase();
        if (knownTerms.some(t => lower.includes(t))) {
          scoreThisRow += 1;
        }
      } else {
        unnamedCount += 1;
      }
    });

    // If this row has known terms and few empty cells, likely header row
    if (scoreThisRow >= 3 && unnamedCount < values.length / 2 && values.length > 0) {
      return values;
    }
  }

  // Fallback: use row 1
  const row = worksheet.getRow(1);
  const values = [];
  row.eachCell((cell) => {
    const val = cell.value?.toString()?.trim() || '';
    if (val) values.push(val);
  });

  return values.length > 0 ? values : ['No headers found'];
}
