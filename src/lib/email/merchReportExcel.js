// lib/email/merchReportExcel.js
// Reebok Merchandiser Report — styled Excel workbook builder.
//
// Every table is rendered from the SAME model as the on-screen report
// (lib/email/merchReportModel.js), through the sales workbook's writeTable, so the page, the
// images and the download carry identical rows and numbers.
//
// Sheets: Division Summary, Footwear, Apparel, Data (one row per EAN — the rows the three
// report sheets are summed from).

import { writeTable } from './reebokExcel';
import { ordinalDate } from './reebokHelpers';
import { fetchMerchReportRows, buildMerchReportModel, STORE, STORE_NM } from './merchReportModel';

const FONT_NAME = 'Inter';
const font = (bold, size, color) => ({ name: FONT_NAME, bold, size, color: { argb: `FF${color}` } });
const fill = (rgb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${rgb}` } });
const thin = { style: 'thin', color: { argb: 'FFB8C0CC' } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

function addReportSheet(wb, tab, meta) {
  const ws = wb.addWorksheet(tab.sheet);
  const count = Math.max(...tab.tables.map((t) => t.columns.length));
  // The detail tables lead with three text columns (Department, Category, Subclass).
  ws.columns = Array.from({ length: count }, (_, i) => ({ width: i === 0 ? 32 : i < 3 ? 22 : 18 }));
  ws.getCell(1, 1).value = `Virata Retail  ·  ${STORE_NM} (${STORE})  ·  ${tab.title}`;
  ws.getCell(1, 1).font = font(true, 14, '1F2A44');
  ws.getCell(2, 1).value = `Stock as of ${ordinalDate(meta.asOf)}  ·  Generated: ${new Date().toLocaleString('en-IN')}`;
  ws.getCell(2, 1).font = font(false, 10, '6B6B66');
  let row = 4;
  for (const t of tab.tables) row = writeTable(ws, row, t);
  return ws;
}

const DATA_COLUMNS = [
  ['Division', 'division', 14], ['Group Name', 'group_name', 14], ['Department', 'department', 26],
  ['Category', 'category', 16], ['Subclass', 'subclass', 24], ['Style Code', 'style_code', 22],
  ['EAN', 'barcode', 18], ['Product Name', 'product_name', 56], ['Size', 'size', 8],
  ['MRP', 'mrp', 12, '₹#,##0'], ['Quantity', 'stock_qty', 11, '#,##0'], ['MRP Value', 'stock_mrp_value', 14, '₹#,##0'],
  ['Last Inwarded Date', 'last_inward_date', 18],
  ['Sale Qty MTD', 'sales_qty_mtd', 13, '#,##0'], ['Sale Qty YTD', 'sales_qty_ytd', 13, '#,##0'],
];

function addDataSheet(wb, rows) {
  const ws = wb.addWorksheet('Data');
  ws.columns = DATA_COLUMNS.map(([, , width]) => ({ width }));
  DATA_COLUMNS.forEach(([label, , , fmt], i) => {
    const ref = ws.getCell(1, i + 1);
    ref.value = label;
    ref.font = font(true, 11, 'FFFFFF');
    ref.fill = fill('1F2A44');
    ref.border = BORDER;
    ref.alignment = { horizontal: fmt ? 'right' : 'left', vertical: 'middle' };
  });
  const sorted = [...rows].sort((a, b) =>
    a.division.localeCompare(b.division) || a.department.localeCompare(b.department)
    || String(a.style_code || '').localeCompare(String(b.style_code || '')) || a.barcode.localeCompare(b.barcode));
  sorted.forEach((r, n) => {
    DATA_COLUMNS.forEach(([, key, , fmt], i) => {
      const ref = ws.getCell(n + 2, i + 1);
      ref.value = r[key] ?? null;
      ref.font = font(false, 10, '111827');
      if (fmt) ref.numFmt = fmt;
    });
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: DATA_COLUMNS.length } };
  return ws;
}

/**
 * Fetch the report data and build the workbook. Always the latest stock snapshot.
 * Returns { buffer, reportDate, filename }; reportDate is null when no stock is loaded.
 */
export async function buildMerchWorkbook(supabase) {
  const rows = await fetchMerchReportRows(supabase);
  const { meta, tabs } = buildMerchReportModel(rows);

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator  = 'Virata Retail';
  wb.created  = new Date();
  wb.modified = new Date();

  for (const tab of tabs) addReportSheet(wb, tab, meta);
  addDataSheet(wb, rows);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, reportDate: meta.asOf, filename: `Virata_Retail_Reebok_Merchandiser_Stock_Report_${meta.asOf}.xlsx` };
}
