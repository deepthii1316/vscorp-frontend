# Project notes for Claude

## Sales Reports: keep the on-screen report and the Excel download in sync

Any change made to the Sales Reports (Uppal Reebok, `/reebok-reports`) must ALSO be
reflected in the Excel download, and only that: do not change unrelated sheets or
report content that was not part of the request.

- Table layout, rows, columns, formulas and header colours are defined ONCE in
  `src/lib/email/reebokReportModel.js` (layout spec: `public/SALES-REPORT-LAYOUT.md`).
  Both outputs below render from it; change the model first, then check both.
- On-screen HTML tables: `src/app/api/reports/reebok-sales/route.js` (rendered by
  `src/app/reebok-reports/page.js`).
- Excel download: `src/app/api/reports/reebok-export/route.js` (a GET endpoint, linked
  from the "Download .xlsx" button in `page.js`). It builds one sheet per report with ExcelJS.

When you add/remove/rename a column, row, section or sub-report in one, apply the
matching edit in the other in the same task.

## Email reports

Follow `public/EMAIL-REPORTS.md` (PNG capture via html2canvas, shared send route,
4.3 MB attachment cap, test mode by default). Not implemented yet.

## Editing notes

- Source files use Windows (CRLF) line endings; multi-line string replacements must
  account for that or they silently do nothing.
- Don't run `next build` while `next dev` is running; it corrupts the shared `.next` folder.
