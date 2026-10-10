// Asset Excel import: turns a workbook into asset rows for public.asset_import().
// Pure functions (no React, no database). No real asset file exists yet, so the reader is written
// to the layout in docs/ASSET_TRACKER_GUIDE.md and is forgiving about everything around it:
//
//   Store Name: Karkhana                         <- optional title rows; the store is guessed from them
//
//   Particulars | Item             | Brand | Qty | Remarks      <- found anywhere in the first 40 rows
//   Electronics | Laptop           | Dell  | 5   |
//               | Desktop Computer | HP    | 3   |              <- blank category = same as the row above
//   Furniture   | Office Chair     | IKEA  | 12  |
//
// * Columns are matched by header name (HEADER_ALIASES), in any order; other columns are ignored.
// * A sheet with no "Item" column but a "Particulars" column uses that as the item, and every row
//   goes under "Uncategorised".
// * A row with only a category is a section heading. "Total" rows are skipped.
// * Quantity: a whole number. Blank, "-", "NA", "nil" count as 0 (noted on the row). "5 nos" is 5.
// * An item that appears twice keeps its LAST row; earlier ones are skipped.
// Every sheet that has a header row is returned; the page shows each row before anything is saved.

import * as XLSX from 'xlsx';
import { cleanText, nameKey, assetKey, cleanAsset, MAX_QUANTITY } from '@/lib/assetShared';

export const HEADER_ALIASES = {
  category: ['particulars', 'category', 'asset category', 'group', 'type', 'asset type', 'head'],
  item: ['item', 'items', 'item name', 'item description', 'asset', 'asset name', 'asset description', 'description', 'name of the item', 'name of item'],
  brand: ['brand', 'brand name', 'make', 'company', 'manufacturer'],
  specification: ['specification', 'specifications', 'spec', 'specs', 'model', 'model no', 'size', 'details'],
  quantity: ['qty', 'quantity', 'nos', 'no', 'no of items', 'count', 'units', 'available qty', 'total qty'],
  remark: ['remark', 'remarks', 'note', 'notes', 'comment', 'comments', 'status'],
};
export const UNCATEGORISED = 'Uncategorised';
const HEADER_SCAN_ROWS = 40;

const headerKey = (v) => nameKey(v).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const cellText = (v) => (v instanceof Date ? v.toLocaleDateString('en-IN') : cleanText(v));

function findHeader(grid) {
  for (let r = 0; r < Math.min(grid.length, HEADER_SCAN_ROWS); r++) {
    const cols = {};
    (grid[r] || []).forEach((cell, c) => {
      const key = headerKey(cell);
      if (!key) return;
      for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
        if (cols[field] === undefined && aliases.includes(key)) { cols[field] = c; break; }
      }
    });
    // "Particulars | Qty" with no separate item column: the particulars ARE the items.
    if (cols.item === undefined && cols.category !== undefined) { cols.item = cols.category; delete cols.category; }
    if (cols.item !== undefined && cols.quantity !== undefined) return { row: r, cols };
  }
  return null;
}

/** The store named in the title rows above the header ("Store Name: Karkhana"), if any. */
function storeFromTitle(grid, headerRow) {
  for (let r = 0; r < headerRow; r++) {
    const cells = (grid[r] || []).map(cellText);
    for (let c = 0; c < cells.length; c++) {
      const inline = cells[c].match(/^(?:store|branch|location|outlet)(?:\s*name)?\s*[:\-–]\s*(.+)$/i);
      if (inline) return cleanText(inline[1]);
      if (/^(?:store|branch|location|outlet)(?:\s*name)?\s*:?$/i.test(cells[c])) {
        const next = cells.slice(c + 1).find(Boolean);
        if (next) return next;
      }
    }
  }
  return null;
}

/** Returns { quantity, note } or { error }. */
export function parseQuantity(value) {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) return { error: `Quantity ${value} is not a whole number.` };
    if (value < 0) return { error: 'Quantity cannot be negative.' };
    if (value > MAX_QUANTITY) return { error: 'Quantity is too large.' };
    return { quantity: value };
  }
  const text = cleanText(value);
  if (text === '' || /^[-–—.]+$/.test(text) || /^(na|n\/a|n\.a\.?|nil|none)$/i.test(text)) return { quantity: 0, note: 'Quantity not given, taken as 0' };
  const m = text.replace(/,/g, '').match(/^(\d+)(?:\.0+)?\s*(?:nos?|numbers?|pcs?|pieces?|units?|sets?)?\.?$/i);
  if (!m) return { error: `Quantity "${text}" is not a number.` };
  const n = Number(m[1]);
  return n > MAX_QUANTITY ? { error: 'Quantity is too large.' } : { quantity: n };
}

function parseSheet(name, sheet) {
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '', blankrows: true });
  const header = findHeader(grid);
  if (!header) return null;
  const { cols } = header;
  const at = (row, field) => (cols[field] === undefined ? '' : row[cols[field]]);
  const warnings = [];
  const rows = [];
  let category = '';

  for (let r = header.row + 1; r < grid.length; r++) {
    const row = grid[r] || [];
    const item = cellText(at(row, 'item'));
    const rowCategory = cols.category === undefined ? '' : cellText(at(row, 'category'));
    const qtyRaw = at(row, 'quantity');
    const hasQty = cleanText(qtyRaw) !== '';
    if (!item && /\btotal\b/i.test(rowCategory)) continue; // a total line under the category column
    if (rowCategory) category = rowCategory;
    if (!item) {
      const others = ['brand', 'specification', 'remark'].some((f) => cellText(at(row, f)));
      if (hasQty || others) {
        rows.push({ line: r + 1, category: category || UNCATEGORISED, item: '', error: 'Item name is missing.' });
      }
      continue; // blank row, or a category heading
    }
    if (/^(grand\s+|sub\s*)?total\b/i.test(item)) continue;

    const qty = parseQuantity(qtyRaw);
    const draft = {
      category: category || UNCATEGORISED, item,
      brand: cellText(at(row, 'brand')), specification: cellText(at(row, 'specification')), remark: cellText(at(row, 'remark')),
      quantity: qty.quantity ?? 0,
    };
    const { asset, error } = qty.error ? { error: qty.error } : cleanAsset(draft);
    rows.push({ line: r + 1, ...(asset || draft), note: qty.note || null, error: error || null });
  }

  if (cols.category === undefined) warnings.push(`Sheet "${name}" has no category column, so every item goes under "${UNCATEGORISED}".`);
  ['brand', 'specification', 'remark'].forEach((f) => { if (cols[f] === undefined) warnings.push(`No ${f} column found; ${f} is left as it is.`); });

  // An item listed twice: the last row wins, earlier ones are skipped.
  const last = new Map();
  rows.forEach((row, i) => { if (!row.error) last.set(assetKey(row.category, row.item), i); });
  rows.forEach((row, i) => { if (!row.error && last.get(assetKey(row.category, row.item)) !== i) row.duplicateOf = rows[last.get(assetKey(row.category, row.item))].line; });

  const title = storeFromTitle(grid, header.row);
  return { sheet: name, storeGuess: title || (/^sheet\s*\d*$/i.test(name) ? null : cleanText(name)), storeFromTitle: Boolean(title), headerLine: header.row + 1, rows, warnings };
}

/** Every sheet with an asset header row. Throws when the workbook has none. */
export function parseAssetWorkbook(bytes) {
  const workbook = XLSX.read(bytes, { type: 'array', cellDates: true });
  const sheets = workbook.SheetNames.map((name) => parseSheet(name, workbook.Sheets[name])).filter(Boolean);
  if (sheets.length === 0) {
    throw new Error('No sheet has a header row with an item column ("Item" or "Particulars") and a quantity column ("Qty").');
  }
  return { sheets, skippedSheets: workbook.SheetNames.filter((n) => !sheets.some((s) => s.sheet === n)) };
}

/**
 * What the import will do to each row for a store that already holds `assets`:
 * status 'insert' | 'update' (with `from`, the saved quantity) | 'skip' (listed again later) | 'error'.
 */
export function planImport(rows, assets) {
  const saved = new Map((assets || []).map((a) => [assetKey(a.category, a.item), a]));
  const plan = rows.map((row) => {
    if (row.error) return { ...row, status: 'error' };
    if (row.duplicateOf) return { ...row, status: 'skip' };
    const existing = saved.get(assetKey(row.category, row.item));
    return existing ? { ...row, status: 'update', from: existing.quantity } : { ...row, status: 'insert' };
  });
  const count = (s) => plan.filter((r) => r.status === s).length;
  return { rows: plan, insert: count('insert'), update: count('update'), skip: count('skip'), error: count('error') };
}

function editDistance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

/**
 * The saved store a name from the file most likely means: same name or code, one name containing
 * the other, or a small spelling difference. Returns { store, exact } or null (a new store).
 */
export function matchStore(guess, stores) {
  const key = nameKey(guess).replace(/[^a-z0-9 ]/g, '');
  if (!key) return null;
  const keyed = (stores || []).map((s) => ({ store: s, name: nameKey(s.name).replace(/[^a-z0-9 ]/g, ''), code: nameKey(s.code) }));
  const exact = keyed.find((s) => s.name === key || (s.code && s.code === key));
  if (exact) return { store: exact.store, exact: true };
  const within = keyed.find((s) => key.length >= 4 && (s.name.includes(key) || key.includes(s.name)));
  if (within) return { store: within.store, exact: false };
  const close = keyed.map((s) => ({ ...s, d: editDistance(key, s.name) })).filter((s) => s.d <= Math.max(1, Math.floor(Math.max(key.length, s.name.length) * 0.2))).sort((a, b) => a.d - b.d)[0];
  return close ? { store: close.store, exact: false } : null;
}

/** An empty workbook in the expected layout, for whoever prepares the asset list. */
export function buildTemplate(storeName) {
  const sheet = XLSX.utils.aoa_to_sheet([
    [`Store Name: ${storeName || ''}`],
    [],
    ['Particulars', 'Item', 'Brand', 'Specification', 'Qty', 'Remarks'],
  ]);
  sheet['!cols'] = [{ wch: 22 }, { wch: 34 }, { wch: 18 }, { wch: 28 }, { wch: 8 }, { wch: 30 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Assets');
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
}
