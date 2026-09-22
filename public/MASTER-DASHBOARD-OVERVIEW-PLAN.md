# Master Dashboard (Overview tab) - Plan for Uppal Reebok

Status: DRAFT for approval. Nothing in this plan has been built yet.
Companion file: `public/master-dashboard-overview-layout.html` (open in a browser to see the sample layout).

Scope rules agreed so far
- Only the Overview tab is in scope. Discount vs Fresh is skipped.
- Lucide icons only. No emojis anywhere (UI text, code, docs).
- All value calculations use NSV (Taxable Amount), never RSV.
- One store (Uppal, R1157). No clusters, no store table, no L2L. Comparison is month-to-month (M2M).
- Filters stay minimal until the basic structure is in place.

Decisions received (20 Sep 2026)
- Table prefix: `reebok_`.
- July data will be loaded later, so the first month-on-month comparison appears once two months exist.
- Recharts is acceptable if needed (alternatives are listed in section 9).
- Store filters (cluster, state, grade, classification, store) are dropped. Date, week, month, half, quarter and division filters are kept, in a later phase (section 10).
- The DSR columns were provided (section 5).

---

## 1. What exists today, and what is wrong with it

Findings from reading the current page, API and database.

| # | Finding | Effect |
|---|---|---|
| 1 | The page uses CSS variables that do not exist in the app stylesheet (`--gradient-primary`, `--brand-primary`, `--surface`, `--surface-border`, `--content-bg`, `--text-tertiary`, `--status-success`, `--radius-sm`, `--shadow-sm`). The real tokens are `--bg-elevated`, `--border`, `--text-muted`, `--green`, `--r-sm`, and so on. | This is the cause of "text goes white after I select a filter": the selected pill has a white text colour on a background that resolves to nothing. It also explains missing borders and backgrounds across the page. |
| 2 | The header uses the class `page-header-icon`, but the stylesheet defines `page-header-icon-box`. The payment card title contains an emoji. | Header icon is unstyled and icons do not match the rest of the app. |
| 3 | Overview shows hard-coded numbers: "+28.8% YoY", "+19.5% YoY", "SSR 55.3%". The Category and Discount tabs show fixed figures such as 3.5Cr and 1.2Cr. | These are invented values on a business dashboard. They will be removed, not restyled. |
| 4 | Date filters are hard-coded to 2026-08-01 to 2026-08-18. | Wrong as soon as new data arrives. Default must be the latest date with data. |
| 5 | The API reads `gold.fact_master_dashboard` and `gold.fact_master_dashboard_payments`. For Reebok these tables were built with the old quantity logic (carry bags counted as units) and have no MRP-based, socks or shoes columns that match the sales report. | Overview quantity and SSR would disagree with the Sales Reports page. |
| 6 | Account DSR data is unreliable (details in section 5). | The payment breakdown looks confusing because the data itself is inconsistent. |
| 7 | The page shows "Top Stores" and a store table. | Meaningless with one store. |

---

## 2. Data architecture (gold tables)

Principle: the sales report, the dashboard and the Excel all read numbers that come from the same cleaned sales lines. So the new dashboard tables are built inside the existing Reebok refresh job (`refresh_reebok.py`), which already excludes carry bags and resolves blank divisions. No second copy of the rules.

### 2.1 Proposed gold tables

| Table | Grain | Purpose |
|---|---|---|
| `gold.reebok_master_dashboard` | one row per day | Overview KPIs, trend, division split, M2M |
| `gold.reebok_master_dashboard_payments` | one row per day | Payment mode split from Account DSR, cleaned |
| `gold.reebok_master_dashboard_granular` (later phase) | day x division x section x article | Category drill-down tab |

Suggested columns for `gold.reebok_master_dashboard`
- `full_date`, `nsv` (Taxable Amount), `gst_amount`, `gross_value` (Taxable + GST), `mrp_value`, `qty`, `bills`
- per division: `footwear_qty/nsv/mrp/bills`, `apparel_qty/nsv/mrp/bills`, `accessories_qty/nsv/mrp/bills`
- `socks_qty`, `shoes_qty` (shoes = Class Name "Shoes", i.e. closed footwear, for SSR)
- `loaded_at`

Suggested columns for `gold.reebok_master_dashboard_payments`
- `full_date`, `total_collected`, `upi_amount`, `cash_amount`, `card_amount`, `other_amount`, and bills per mode if the DSR provides them
- `source_file`, `loaded_at`

Naming: use a `reebok_` prefix (recommended) so the Skechers-style names are not reused for different logic.

### 2.2 Read path
- One RPC, `rpt_reebok_master_overview(p_from, p_to, p_prev_from, p_prev_to)`, returns day rows for the selected period and the comparison period.
- One API route returns those rows plus payments. The browser aggregates (sums first, then ratios), the same pattern the Skechers dashboard uses. With one store and at most a few hundred day rows this is instant.
- The old `gold.fact_master_dashboard*` tables are no longer read for Reebok.

---

## 3. Metric definitions (NSV based)

| Metric | Formula | Notes |
|---|---|---|
| NSV | SUM(Taxable Amount) | headline value |
| Avg / day | NSV / number of days in range | days counted inclusive |
| Qty sold | SUM(Qty) excluding carry bags | matches the sales report |
| Bills | distinct bills per day, summed | |
| ATV | NSV / Bills | recomputed from sums |
| SSR | socks qty / shoes qty x 100 | can exceed 100 percent |
| MD % | (MRP - NSV) / MRP x 100, MRP = SUM(MRP x Qty), NSV = Taxable Amount | decided 20 Sep 2026, see section 3a |
| M2M growth | current period vs previous month, same day range | dash when no prior data |

Rules
- Ratios are always recomputed from summed numerators and denominators, never summed or averaged.
- No accessories, footwear or apparel figures may be estimated. Every division figure comes from real columns.

### 3a. MD % definition (decided 20 Sep 2026): (MRP - NSV) / MRP
On 01 to 03 Aug: MRP x Qty = 1,93,316 and NSV = 1,16,932, so MD % = 39.5. MRP includes GST and NSV does not; a GST-inclusive comparison (amount paid 1,28,408) would give 33.6. Both `gross_value` and `nsv` are stored, so changing the definition later is a one-line change.

Earlier analysis kept below for reference.

Sales columns: MRP is tax-inclusive. Value = Taxable Amount + CGST + SGST + IGST (verified line by line, for example MRP 2,999 with a 50 percent discount gives Value 1,499.50 = Taxable 1,428.10 + GST 71.40).

If MD % compared Taxable Amount directly with MRP, markdown would be overstated by about 6 points:

| Days 01 to 05 Aug 2026 | Selling figure | MD % |
|---|---|---|
| Taxable Amount (NSV) | 1,70,384 | 40.2 |
| Value (Taxable + GST) | 1,86,626 | 34.5 |

MRP x Qty over the same days is 2,85,081. So the proposal is: NSV stays Taxable Amount everywhere it is used as a sales figure, and MD % uses Value against MRP so both sides include GST. Value is stored in the gold table as `gross_value`.

### M2M comparison rule
Previous period = the selected range shifted back exactly one month (day clamped to month end). Example: 01 Sep to 17 Sep is compared with 01 Aug to 17 Aug. Where the previous window has no data (the database currently starts on 01 Aug 2026), the delta shows a dash, never zero and never a fake percentage.

---

## 4. Overview tab layout (see the HTML sample)

Top to bottom
1. Page header: icon box, title, subtitle, and a line with the range, day count and comparison range.
2. Filter card (minimal): From and To dates, quick ranges (WTD, MTD, YTD, Last month), division segmented control (All, Footwear, Apparel, Accessories).
3. Tabs: Overview (active), Retail metrics and Category drill-down shown as "Soon" (disabled), Discount vs Fresh removed.
4. KPI row, 7 tiles: NSV, Avg/day, MD %, Qty sold, Bills, ATV, SSR. Each has a lucide icon, value, M2M delta and a small trend line.
5. Daily trend (wide) with a metric dropdown and a dashed line for the previous month. Division split (narrow) with two donuts, NSV and Qty.
6. Payment mode (Account DSR): a donut/pie of UPI, Cash, Card and Other with the total in the centre, plus a compact table beside it (amount, share). Replaces the four coloured strip cards. Next to it, a Month-over-month bar chart by week (current vs previous month).
7. Division performance table: rows Footwear, Apparel, Accessories, and a grey Total row. Columns NSV, Contribution, Qty, Bills, MD %, M2M growth.

Colour use
- Charts use a fixed categorical palette: Footwear green, Apparel blue, Accessories amber. Payment modes: UPI green, Cash blue, Card teal, Other amber.
- Growth values use green for good and red for bad. For MD % a fall is good (less markdown), so its colours are inverted. Nothing else is colour-coded.

Design system
- Use only the app tokens (`--bg-elevated`, `--border`, `--text`, `--green`, `--r-md`, ...). Selected pills use the solid green token with light text, so the selected state is always readable.
- Icons: lucide-react at one size (16 px in tiles and tabs) and one stroke width.
- Charts: Recharts (same library as the Skechers dashboard), wrapped in ResponsiveContainer. Needs to be added as a dependency. See question 6.

---

## 5. Payment mode (Account DSR)

### 5.1 The real DSR columns (provided)
Store name, Date, UPI, CARD, AMEX, ZOMATO, GV, CARD OFFERS %, CASH, SYSTEM DAY SALE, PHYSICAL DAY SALE, Diff, Manual Bill, Manual Conv, CN Issued, CN Redeem, CASH USED, Deposit amount, CASH RUNNING BALANCE, Remarks for Excess / Shortage, Total Card Sales, (1) Pine Labs, (2) Pine Labs, PAYTM CARD, PAYTM.

### 5.2 Root cause of the confusing payment section
Inspected read-only. The current DSR loader (`ingest_account_dsr_file` in `ingest_file.py`) was written for a different file layout and keeps only five money fields: Total Sales, Cash, Card, UPI, Other.

| Problem | Evidence |
|---|---|
| AMEX, ZOMATO, GV, PAYTM, PAYTM CARD, Pine Labs and credit-note columns are dropped | "Other" is 0 on every row; on 01 Aug UPI 45,487 + Cash 6,598 + Card 0 = 52,085 against a total of 62,929, so 10,844 has nowhere to go |
| Card is 0 although Pine Labs terminals exist | the loader looks for a "Total Card Sales" column and reads 0 |
| Same file loaded four times | 4 upload files, about 32 rows each; the gold table holds two or more rows per date and totals are double counted (gold payments total 23.47 lakh; sales for the whole data range 01 Aug to 17 Sep are about 11 lakh) |
| Non-data rows | "Opening Cash" in the Date column; a row with Date "500" and store "01.09.26" |
| Future dates | 28 gold rows dated after the last sales date, running to 01 Oct 2026 |
| "Total Sales" is really PHYSICAL DAY SALE | it is picked up by the fuzzy name match, not by design |

### 5.2a Confirmed by a real DSR row (Uppal, 01 Aug)
UPI 45,487 + CARD 10,844 + CASH 6,598 = 62,929 = SYSTEM DAY SALE = PHYSICAL DAY SALE. The CARD column holds exactly the 10,844 the loader missed, so the pie modes are the money columns UPI, CARD, AMEX, ZOMATO, GV and CASH, which add up to the day's sale. Other columns on that row (for example 27,100 and 6,632 further right, likely credit-note or manual-bill figures) are not payment modes and stay out of the pie.

### 5.3 GST question answered
The DSR total is GST-inclusive. It equals Taxable + GST from the sales data on 4 of 5 days checked: 01 Aug 62,929, 03 Aug 4,045, 04 Aug 28,988 and 05 Aug 29,230 all match exactly. 02 Aug differs: DSR 57,693 against sales 61,434, a gap of 3,741 that should be explained by the Diff or Remarks columns.

### 5.4 Proposed fix
1. Widen `raw.account_dsr` (or add a Reebok DSR table) so every column above is stored, and change the loader to map the exact Reebok headers instead of guessing by name.
2. Re-upload the existing DSR files once.
3. Build `gold.reebok_master_dashboard_payments` with one row per date: latest upload wins, only real dates up to the last sales date, Opening Cash and other non-sales rows ignored.
4. Pie slices: UPI, Card, AMEX, Zomato, Gift voucher (GV), Cash (the columns that add up to the day's sale; verified on 01 Aug). PAYTM and Pine Labs columns are checked against CARD on more days before being added.
5. A reconciliation line under the chart: collections (GST-inclusive) versus Value from sales, with the daily difference.

---

## 5.5 Phase 1 status (built, not yet applied to the database)
Migration `2026_09_20_reebok_master_dashboard.sql`, DSR loader with exact Reebok headers, and the two gold tables filled by `refresh_reebok.py`. The 02 Aug gap is explained: UPI 25,430 + CARD 32,263 + CASH 3,740 = 61,433, which matches the sales file (61,434); the DSR day-sale figure 57,693 is UPI + CARD only. So the pie and Total collected use the six mode columns, and the DSR day sale is kept as a reference figure.

## 5.6 Phase 2 status (built)
The API route reads the two gold tables directly with the server client (same pattern as the other report routes), so no separate RPC or migration was needed. It returns the period rows, the same days one month earlier (only for ranges up to one month) and the payment rows; the browser sums first and computes ratios after (`src/lib/masterDashboardShared.js`). Verified against the live database: 1 to 3 Aug gives NSV 1,16,932.02, 66 units, 25 bills, MD % 39.5, SSR 25.0; 1 to 17 Sep payments are within Rs 10 of sales including GST.

## 5.7 Phase 3 status (built)
Overview tab: 7 KPI tiles with sparklines and change versus last month, daily trend (metric dropdown, dashed previous month), division split donuts (click to filter), payment pie with table and GST reconciliation line, month-on-month weekly bars, and the division performance table with a grey total row. Charts use Recharts 3. An Unclassified row appears automatically if some sales lines carry no division, so a mapping gap can never be hidden (found on 17 Sep: class SLIP ONS, fixed in refresh_reebok.py; needs a refresh run). Verified in a real browser against the live database: 1 to 17 Sep, Footwear filter, YTD.
Known refinements: the weekly chart is less useful for ranges over one month (it has no comparison then); filters beyond date range, quick range and division are Phase 4.

## 5.8 Phase 4 status (built): filters
Month on month / Compare toggle; From, To and Apply; quick range (WTD, MTD, YTD, All); Week 1 to 5 (weeks that have started); Month; H1 / H2; Q1 to Q4 (multi-select spans the earliest start to the latest end); Financial (Apr to Mar) / Calendar; Period A vs Period B (year, month, optional week); division. Rules: presets are anchored on the latest data date; the end of any range is cut at that date; groups are mutually exclusive (choosing one clears the others); month-on-month comparison only for ranges up to one month; in Compare mode, when a period is only partly loaded both periods are limited to the same number of days. Date logic lives in src/lib/masterDashboardShared.js (35 unit checks) and was verified in a real browser against database sums for 20 filter scenarios.

## 6. Build phases

| Phase | Work | Verification |
|---|---|---|
| 0 | Fix the styling foundation: swap invalid CSS variables for real tokens, fix header icon class, remove emoji, remove all hard-coded numbers, fix selected pill colour | Visual check of selected states |
| 1 | Data: migration for the two gold tables, extend `refresh_reebok.py` to fill them, fix the DSR loader and re-upload the DSR files (section 5.4), backfill | NSV, qty and bills equal the Sales Reports page for the same days (for example 01 to 03 Aug: 66 units, 25 bills, NSV 1,16,932.02) |
| 2 | RPC and API route with the M2M comparison window | Spot-check totals against SQL |
| 3 | Overview UI with Recharts | Charts match table totals; empty and no-prior-data states |
| 4 | Filters beyond the minimum, then Retail metrics and Category drill-down | Later |

Definition of done for Phase 3
- Every number on the tab can be traced to a gold table row.
- Selecting any filter never makes text unreadable.
- No emoji, no non-lucide icons, no invented figures.

---

## 7. Risks and decisions carried forward

- MD % depends on whether MRP is tax-inclusive while NSV is not; the wrong choice would inflate markdown.
- DSR quality: even after cleaning, the payment split is only as good as the file. A confirmed column meaning is needed.
- M2M has no meaning for August until July data is loaded (or until September has data alongside August).
- The dashboard API currently has no login check; align with whatever auth decision is taken for the other report routes.

---

## 8. Remaining questions

1. MD %: answered (MRP only). Confirm it should be discount divided by MRP, i.e. (MRP - amount paid) / MRP.
2. DSR: 01 Aug row received and it reconciles. Please paste the 02 Aug row too.
3. 02 Aug: DSR 57,693 versus sales 61,434, a gap of 3,741. Check that row's Diff, Remarks and credit-note columns.
4. Filters: agree with the phasing in section 10.

---

## 9. Chart library options

| Option | Fit for this project |
|---|---|
| Recharts 3 (recommended) | React components over SVG, easy tooltips and responsive sizing, same library as the Skechers dashboard, works with the html2canvas capture already used for emailing. Enough for one store and a few hundred points. |
| Hand-drawn SVG | Zero dependency, used in the sample layout for donuts and sparklines. Good for small static shapes, costly for tooltips and animation. |
| Apache ECharts | Very capable, handles large data and many chart types, but a much heavier bundle than this dashboard needs. |
| visx | Low-level primitives, maximum control, noticeably more code to write. |
| Nivo | Attractive defaults, heavier, less needed here. |
| Chart.js | Canvas based, lightweight, less natural in React. |
| Tremor and shadcn charts | Both need Tailwind (not used in this app); shadcn charts are a wrapper over Recharts anyway. |

Recommendation: Recharts for the trend, bar and donut charts; hand-drawn SVG only for the tiny KPI sparklines.

---

## 10. Filters (from the Skechers screenshot) and phasing

| Filter | Reebok decision | Phase |
|---|---|---|
| L2L / Compare toggle | L2L dropped (no last-year data). Default is month on month. "Compare" (Period A vs Period B) kept | Compare in phase 4 |
| From, To, Apply | keep | 1 |
| Division pills (All, Footwear, Apparel, Accessories) | keep | 1 |
| Quick range WTD, MTD, YTD | keep | 1 |
| Refresh button | keep | 1 |
| Week 1 to 5, Month, H1 / H2, Q1 to Q4, Financial / Calendar | keep | 4 |
| Cluster, State, Grade, Classification, Store, "n stores" | drop, single store | never |

Tabs: Overview now; Retail metrics and Category drill-down as "Soon"; Discount vs Fresh hidden.

---

