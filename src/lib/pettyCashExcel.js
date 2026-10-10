// Petty cash Excel reader: turns the Account DSR workbook into ledger lines for /api/petty-cash/upload.
// Pure functions (no React). Written against the real file, "ACC DSR 31-Aug-26.xlsx", tab "Petty cash":
//
//   PETTY CASH  Month of AUG-2026
//   STORE LOCATION | UPPAL-323865
//   STORE MANAGER  | N.GOPI KRISHNA
//   DATE       | VOUCHER NO | DESCRIPTION                | EXPENSES | CREDIT | BALANCE
//              |            | Cash received to srihari   |          | 19000  |           <- no date
//   20.06.2026 | 1          | G pulla reddy sweets ...   | 1684     |        |
//   ...
//              |            |                            | 100523   | 96175  | 4348      <- the sheet's totals
//
// Columns are found by header name. Dates are text ("20.06.2026"), date cells or Excel serials.
// BALANCE is not read (it is recalculated; the sheet's column is one row out of step). The sheet's
// own totals row is read only to check that every line was picked up. Anything odd becomes a
// warning the store manager sees in the preview before saving.

import * as XLSX from 'xlsx';
import { creditSourceOf } from '@/lib/pettyCashShared';

const text = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const pad2 = (n) => String(n).padStart(2, '0');

function isoFrom(y, m, d) {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** A cell as 'YYYY-MM-DD', or null. Accepts "20.06.2026", "20/06/26", "2026-06-20", Date cells and Excel serials. */
export function toDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : isoFrom(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null; // not a plausible Excel date serial (1954 - 2119)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
    return isoFrom(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = text(v);
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return isoFrom(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/); // day first, as the store writes it
  if (m) return isoFrom(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  return null;
}

/** A money cell as a number; '' / '-' / null are 0; anything else that is not a number is NaN. */
function toAmount(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  const s = text(v).replace(/[₹,\s]/g, '');
  if (s === '' || s === '-') return 0;
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

const HEADERS = {
  date: /^date$/,
  voucher: /voucher/,
  description: /descr|particular|narration/,
  expense: /expens|debit|paid/,
  credit: /credit|receiv/,
};

function findHeader(grid) {
  for (let r = 0; r < Math.min(grid.length, 30); r++) {
    const cells = (grid[r] || []).map((c) => text(c).toLowerCase());
    const cols = {};
    Object.entries(HEADERS).forEach(([key, re]) => {
      const i = cells.findIndex((c) => re.test(c));
      if (i >= 0) cols[key] = i;
    });
    if (cols.date !== undefined && cols.description !== undefined && cols.expense !== undefined && cols.credit !== undefined) return { row: r, cols };
  }
  return null;
}

/**
 * Reads the workbook. Returns
 *   { sheet, title, entries: [{ entry_date, line_no, voucher_no, description, expense, credit, credit_source }],
 *     warnings: [string], sheetTotals: { expense, credit } | null }
 * Throws when there is no petty cash sheet or its header row cannot be found.
 */
export function parsePettyCashWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const sheet = wb.SheetNames.find((n) => /petty/i.test(n)) || (wb.SheetNames.length === 1 ? wb.SheetNames[0] : null);
  if (!sheet) throw new Error(`no "Petty cash" tab found (tabs: ${wb.SheetNames.join(', ')})`);
  const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, raw: true, defval: null, blankrows: true });
  const header = findHeader(grid);
  if (!header) throw new Error(`tab "${sheet}" has no header row with DATE, DESCRIPTION, EXPENSES and CREDIT`);
  const { cols } = header;

  const warnings = [];
  const entries = [];
  let sheetTotals = null;

  for (let r = header.row + 1; r < grid.length; r++) {
    const row = grid[r] || [];
    const excelRow = r + 1;
    const rawDate = row[cols.date];
    const voucher = cols.voucher === undefined ? '' : text(row[cols.voucher]);
    const description = text(row[cols.description]);
    const expense = toAmount(row[cols.expense]);
    const credit = toAmount(row[cols.credit]);

    if (Number.isNaN(expense) || Number.isNaN(credit)) {
      warnings.push(`Row ${excelRow}: the amount is not a number, so the line was skipped ("${description || 'no description'}").`);
      continue;
    }
    if (!expense && !credit) continue; // blank, or a line with no money on it
    const hasDate = !(rawDate === null || rawDate === undefined || text(rawDate) === '');
    if (!hasDate && !voucher && !description) { // amounts only: the sheet's totals row
      sheetTotals = { expense, credit };
      continue;
    }
    if (/^total\b/i.test(description) || /^total\b/i.test(text(rawDate))) {
      sheetTotals = { expense, credit };
      continue;
    }
    if (expense < 0 || credit < 0) {
      warnings.push(`Row ${excelRow}: negative amount, so the line was skipped ("${description || 'no description'}").`);
      continue;
    }
    const date = toDate(rawDate);
    if (hasDate && !date) warnings.push(`Row ${excelRow}: "${text(rawDate)}" is not a date; the date of the line above is used.`);
    if (!description) warnings.push(`Row ${excelRow}: no description (voucher ${voucher || '—'}, ₹${expense || credit}).`);
    entries.push({
      entry_date: date, voucher_no: voucher || null, description, expense, credit,
      credit_source: credit > 0 ? creditSourceOf(description) : null,
      excelRow, hadDate: hasDate,
    });
  }

  // Lines without a date take the date of the line above; leading ones take the first date below.
  const firstDated = entries.find((e) => e.entry_date);
  if (entries.length > 0 && !firstDated) throw new Error(`tab "${sheet}" has no readable dates in the DATE column`);
  let last = firstDated?.entry_date || null;
  entries.forEach((e) => {
    if (e.entry_date) { last = e.entry_date; return; }
    e.entry_date = last;
    if (!e.hadDate) warnings.push(`Row ${e.excelRow}: no date ("${e.description || 'no description'}"); saved as ${last.split('-').reverse().join('.')}.`);
  });
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].entry_date < entries[i - 1].entry_date) {
      warnings.push(`Row ${entries[i].excelRow}: dated before the line above it; the ledger is shown in date order.`);
    }
  }

  const seen = new Map();
  entries.forEach((e) => { if (e.voucher_no) seen.set(e.voucher_no, (seen.get(e.voucher_no) || 0) + 1); });
  const repeated = [...seen.entries()].filter(([, n]) => n > 1).map(([v, n]) => `${v} (${n} times)`);
  if (repeated.length) warnings.push(`Voucher number used more than once: ${repeated.join(', ')}.`);

  const total = (f) => Math.round(entries.reduce((s, e) => s + f(e), 0) * 100) / 100;
  const totals = { expense: total((e) => e.expense), credit: total((e) => e.credit) };
  if (sheetTotals && (Math.abs(sheetTotals.expense - totals.expense) > 0.5 || Math.abs(sheetTotals.credit - totals.credit) > 0.5)) {
    warnings.push(`The sheet's own totals (expenses ${sheetTotals.expense}, credit ${sheetTotals.credit}) differ from the lines read (expenses ${totals.expense}, credit ${totals.credit}). Check the SUM ranges in the sheet.`);
  }

  return {
    sheet,
    title: text((grid[0] || []).find((c) => text(c)) || ''),
    entries: entries.map(({ excelRow, hadDate, ...e }, i) => ({ ...e, line_no: i + 1 })),
    warnings,
    sheetTotals,
  };
}
