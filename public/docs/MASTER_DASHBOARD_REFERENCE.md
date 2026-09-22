# Master Dashboard — Complete Reference

Everything about `/reports/master-dashboard`: what is on the screen, where each
number comes from, the exact formula behind every metric, the libraries and layout
used, and the known quirks. Written against the code and the live database as of
**2026-09-20** (data through 2026-09-18).

This replaces `MASTER_DASHBOARD.md` (2026-09-04), which covered only part of the page
and contained two errors (see §17).

**Files**

| Piece | Path |
|---|---|
| Page (all 4 tabs except Discount) | `app/(dashboard)/reports/master-dashboard/page.tsx` (~1,920 lines) |
| Discount vs fresh tab | `components/dashboard/DiscountVsFreshTab.tsx` (~570 lines) |
| Shared helpers + `StatCard` | `components/dashboard/masterDashboardShared.tsx` |
| Main API | `app/api/reports/master-dashboard/route.ts` |
| Discount-tab API | `app/api/reports/master-dashboard/merch/route.ts` |
| Gold builders | `medallion-pipeline/refresh_gold.py` (`SQL_MASTER_DASHBOARD*`) |
| RPCs | migrations `053`, `055–057`, `062–068`, `075`, `076` |

---

## 1. What the page is

The **sales lens** of the business. It answers: how much did we sell, at what markdown,
in how many bills, how does that compare with last year (or any other period), and
which stores / divisions / categories drove it.

It has **four tabs**, one shared filter bar, and one optional head-to-head panel:

| Tab | Question it answers |
|---|---|
| **Overview** | Headline revenue, trend, division mix, store ranking, store table |
| **Retail metrics** | Basket quality: UPT, ATV, ASP and the footwear attach rates |
| **Category drill-down** | Which categories sell, at what markdown — four drill-down tables |
| **Discount vs fresh** | How much of sales is full price vs discounted, by band, store, division |

**Who can open it:** `admin`, `accounting`, `cluster_manager`. Anyone else gets an
"Access restricted" panel (page) or HTTP 403 (API). A cluster manager sees **only
their own cluster's stores**, enforced inside the database (§6).

---

## 2. Technology and libraries

| Layer | Technology | Notes |
|---|---|---|
| Framework | **Next.js 16** (App Router) | The page is a client component (`'use client'`, `force-dynamic`). Not the Next.js from older docs — read `node_modules/next/dist/docs/` before changing framework-level behaviour. |
| UI runtime | **React 19.2** | Hooks only: `useState/useEffect/useMemo/useCallback/useRef`, `Fragment`. |
| Styling | **Tailwind CSS 4** | Utility classes only, no CSS modules. Palette: slate neutrals + indigo brand. |
| Charts | **Recharts 3.8** | `AreaChart`, `BarChart`, `PieChart`, `ResponsiveContainer`, `LabelList`. All wrapped in `ResponsiveContainer debounce={100}`. |
| Icons | **lucide-react** | `IndianRupee, Package, Receipt, Percent, Tag, Footprints, Gauge, ListTree, TicketPercent, ChevronDown/Right, RefreshCw, CalendarDays…` |
| Class joining | `cn()` (`lib/utils/cn`) | A tiny in-house helper: drops falsy values and joins with spaces. It does **not** de-duplicate conflicting Tailwind classes (no `clsx`/`tailwind-merge`). |
| Number formats | `lib/utils/formatCurrency` | `compactCurrency` (₹X.XCr / ₹X.XL), `formatNumber` (Indian grouping) and `inr0` (₹, no decimals). |
| Data access | **Supabase** (`@supabase/ssr` server client) | The API routes call Postgres **RPC functions**; the browser never talks to the database. |
| Database | **Postgres (Supabase)** | `gold.*` tables read by `SECURITY DEFINER` SQL functions. |
| Sparklines | **Custom inline SVG** | `Sparkline` inside `StatCard` — no library. Green if the series ends ≥ where it started, red otherwise. |
| Heat-maps | **Custom** | `heat()` (red→yellow→green) and `heatBlue()` (light→dark blue), plus `heatText()` for a legible label colour. |
| Loading bar | `components/ui/TopLoadingBar` | Thin indigo bar at the top of the viewport while any fetch is in flight. |

There is **no state-management library and no data-fetching library** (no Redux, no
React Query, no SWR). State is local `useState`; fetching is plain `fetch()` with a
sequence guard (§7.6).

---

## 3. Page layout

### 3.1 Shell

```
┌───────────────┬──────────────────────────────────────────────────────┐
│               │  Header (top bar)                                    │
│   Sidebar     ├──────────────────────────────────────────────────────┤
│  (collapsible)│  <main>  ← the scroll container                      │
│               │   └─ <div class="p-4 md:p-6">  ← padding lives here   │
│               │        Master Dashboard page (max-w-screen-2xl)       │
└───────────────┴──────────────────────────────────────────────────────┘
```

`app/(dashboard)/layout.tsx`: a `flex h-screen overflow-hidden` row. **`<main>` is the
scroller.** Padding sits on the *inner* div, not on `<main>` — padding on a scroll
container sits inside its scrollport and leaves a gap above sticky table headers.

### 3.2 Page, top to bottom

```
┌──────────────────────────────────────────────────────────────────────┐
│ Master Dashboard                                       [⟳ Refresh]   │
│ 2026-09-01 → 2026-09-18 · 18 days · L2L vs 2025-09-01 → 2025-09-18   │
├──────────────────────────────────────────────────────────────────────┤
│ FILTER CARD                                                          │
│  Row 1: [L2L|Compare]  From  To  [Apply]        [All|FW|App|Acc] →   │
│  Row 2 (L2L):  Quick range WTD/MTD/YTD · Week 1-5 · Month · H1/H2 ·  │
│                Q1-Q4 · Financial/Calendar                            │
│         (Compare): Period A [year][month][week]  Period B [...]      │
│  Row 3: Cluster ▾  State ▾  Grade ▾  Classification ▾  Store ▾   n stores │
├──────────────────────────────────────────────────────────────────────┤
│ TABS:  Overview │ Retail metrics │ Category drill-down │ Discount vs fresh │
├──────────────────────────────────────────────────────────────────────┤
│ (only when exactly 2 stores are selected)  HEAD-TO-HEAD panel        │
├──────────────────────────────────────────────────────────────────────┤
│ TAB CONTENT                                                          │
└──────────────────────────────────────────────────────────────────────┘
```

* **Header line** shows the range, day count, the comparison range, and — for cluster
  managers — a "· your cluster" tag. If the range is over 366 days an amber warning
  appears: *"range > 1 year — L2L window overlaps, growth not meaningful."*
* **Filter card** is a single white rounded card (`rounded-xl border shadow-sm`).
* **Division toggle** (All / Footwear / Apparel / Accessories) is right-aligned in row 1
  and applies to every tab (§9).

### 3.3 Overview tab

```
[ RSV ][ Avg/day ][ MD % ][ Qty sold ][ Bills ][ ATV ][ SSR ]      ← 7 StatCards, 2/3/7 columns by width
┌──────── Daily Trend (3/5) ────────┐ ┌──── Division split (2/5) ────┐
│ area chart + metric dropdown      │ │ two donuts: RSV | Qty        │
└───────────────────────────────────┘ └──────────────────────────────┘
┌─ Top stores by RSV (bar) ─┐ ┌─ L2L growth by store (bar) ─┐
└───────────────────────────┘ └─────────────────────────────┘
┌ Store Performance Overview table ─ RSV │ Bills │ Qty Sold │ MD % ┐
│  Cluster header → stores → "<Cluster> total" … → GRAND TOTAL     │
└──────────────────────────────────────────────────────────────────┘
```

Grid: `grid-cols-1 lg:grid-cols-5` for trend + donuts (3 + 2 columns);
`lg:grid-cols-2` for the two bar charts.

### 3.4 Retail metrics tab

```
[ UPT ][ ATV ][ ASP ][ SSR ][ FUPT ][ SFR ][ AFR ]     ← 7 StatCards with sparklines
┌ Metric by store (horizontal bars: this year vs last year) + metric dropdown ┐
┌ Store Performance table: 7 metric columns, each cell = value ▲/▼ growth, "LY: value" beneath ┐
```

### 3.5 Category drill-down tab

Four stacked tables, all with the same 9 columns
(`Category · Qty · LY Qty · Qty growth · RSV · LY RSV · RSV growth · Contribution · MD%`):

1. **Category drill-down** — Division › Section › Article (Footwear: Open/Closed › Article › Section)
2. **Footwear — by Department** — Open/Closed › Department › Section
3. **Category drill-down — by store** — Cluster › Store › Division › Section › Article
4. **Footwear — by Department — by store** — Cluster › Store › Open/Closed › Department › Section

### 3.6 Discount vs fresh tab

Seven sections (details in §10.4): KPI cards, fresh-vs-discount trend, discount-band
chart + table, division performance, store performance (searchable, sortable),
discount heat-map, top insights.

### 3.7 Conventions that keep it usable

* **Sticky table headers** — `<thead className="sticky top-0 z-10 bg-slate-50">`. The
  background is mandatory or rows scroll visibly through the header.
* **Horizontal scroll vs sticky are mutually exclusive.** `overflow-x: auto` forces
  `overflow-y: auto` and makes a new scroll container, which breaks sticky. Hence
  `overflow-x-auto xl:overflow-visible`: scroll on narrow screens, sticky on wide.
* The first column of wide tables is `sticky left-0` so the store name stays visible.
* Cluster header rows are indigo (`bg-indigo-50/60`), cluster totals amber
  (`bg-amber-50/70`), the **Grand total** is a dark slate row with light text.
* Growth colours: green ≥ 0, red < 0, grey `—` when there is no base.
* Loading: first load shows a spinner; later refetches keep the old data on screen and
  show only the top loading bar.

---

## 4. Architecture in one paragraph

**Fetch once per (date range, comparison range); filter and aggregate client-side.**
The API returns pre-aggregated **per-store** rows for the period and its comparison
period, plus a per-day trend. The browser then applies the Cluster / State / Grade /
Classification / Store / Division filters, builds cluster and grand totals, computes
every ratio, and draws the charts. Changing a filter re-renders instantly; only
changing the **date range or comparison period** hits the network. (The Category tab
is the exception — §7.5.)

```
staging.fact_sales  (one row per bill line; returns are negative rows)
        │  medallion pipeline: refresh_gold.py  (Stage 4 of the GitHub Action)
        ▼
gold.master_dashboard                    day × store, division/socks/shoes split into columns
gold.master_dashboard_granular           day × store × division × section × article × dept × size …
gold.master_dashboard_granular_footwear  same, footwear rows only, plus footwear_type Open/Closed
        │  SECURITY DEFINER SQL functions  rpt_*   (role-scoped via report_access())
        ▼
/api/reports/master-dashboard   (8 RPCs in parallel)   ┐
/api/reports/master-dashboard/merch   (3 RPCs)          ┘  → JSON
        ▼
page.tsx  →  filters, totals, ratios, charts
```

The **Discount vs fresh** tab is different: its three RPCs read **`staging.fact_sales`
directly**, not the gold tables (§17, item 1).

---

## 5. The data behind the numbers

### 5.1 `gold.master_dashboard` (≈ 28,700 rows, 2022-01-01 → 2026-09-18)

One row per **store × day**. Carries the store attributes (city, state, grade,
store_type, classification, cluster) so no join is needed at read time.

| Column | Meaning |
|---|---|
| `selling_amount` | **RSV** — the amount actually charged (tax-inclusive) |
| `quantity` | Units sold, net of returns |
| `mrp_value` | Ticket value: `Σ abs(sale_mrp) × quantity` |
| `bills` | `count(DISTINCT bill_no)` for that store-day |
| `footwear_qty/value`, `apparel_…`, `accessories_…` | Division split (by `dim_product.division`) |
| `socks_qty/value` | Rows where `article_type = 'SOCKS'` |
| `shoes_qty/value` | Rows where `lower(article_type) = 'shoe'` |
| `footwear_mrp_value`, `apparel_…`, `accessories_…` | Real per-division MRP (needed for per-division MD%) |
| `footwear_bills`, `apparel_bills`, `accessories_bills` | Distinct bills that touched that division |

**Build rules** (`refresh_gold.py`, `SQL_MASTER_DASHBOARD`):

* **Net of returns.** `fact_sales` stores returns as negative rows, so plain `SUM` nets
  them automatically. (Live data: 789,747 SALE rows ₹341.0 Cr, 24,287 RETURN rows −₹14.4 Cr.)
* **RSV is tax-inclusive.** It is called *RSV*, not *NSV*, precisely because it is not
  net of tax. The code variable is still named `nsv` (a historical name); on screen it
  is always "RSV".
* **Unmapped products still count.** `dim_product` is `LEFT JOIN`ed, so a barcode with
  no product record contributes to totals — it just has no division.
* **NSM (non-sales-movement) rows are removed upstream** by the pipeline.
* `bills` is counted **per store-day** and stored, because `count(DISTINCT bill_no)`
  cannot be re-derived by summing arbitrary groupings.

### 5.2 `gold.master_dashboard_granular` (≈ 640,800 rows)

Same grain plus `division, section, article_type, department, size, disc_vs_fresh,
discount_band`. Feeds the Category tab. `article_type` is standardised
(`T-SHIRTS/T-Shirt → T-SHIRT`, `Shoe/SHOE → SHOE`, else upper-case).

`disc_vs_fresh` and `discount_band` exist in this table but **the dashboard does not
read them** — the Discount tab computes its own from `staging.fact_sales` (§17).

### 5.3 `gold.master_dashboard_granular_footwear` (≈ 453,600 rows)

Footwear rows only. `footwear_type`: **Closed** = `article_type` is Shoe; **Open** =
everything else in footwear (sandals, slides, socks…).

### 5.4 Freshness

`rpt_kpi_latest_date()` returns `max(full_date)` from `gold.store_daily_performance`.
That — **not today's date** — is the default end date and the anchor for every preset
(WTD/MTD/YTD/…), so the page is consistently "as of the last day with data" (T-1).

Gold is refreshed by **Stage 4 of the GitHub Action** (`process.yml`, run by the
*Process* button or manually). It is incremental: it rebuilds only from the earliest
date whose staging data changed (`gold.refresh_state`, `dirty_from`, and month
fingerprints). If a run says *"No staging rows loaded since the last gold refresh"*,
the dashboard is already current.

---

## 6. Access control

Enforced in **three layers**; the database layer is the one that cannot be bypassed.

1. **Page** — `useAuth()` role check; other roles see "Access restricted".
2. **API route** — verifies the Supabase session (`401`) and role in
   `admin | accounting | cluster_manager` (`403`).
3. **Database** — every RPC is `SECURITY DEFINER` and calls `report_access()`:

| Role | `is_all` | `allowed_cluster` | Result |
|---|---|---|---|
| `admin`, `accounting` (and `store_manager`) | true | — | all stores |
| `cluster_manager` | false | their cluster's name | only rows where `cluster_name = allowed_cluster` |
| anything else | false | NULL | nothing |

The three Discount-tab RPCs use `report_can_see(cluster_name)` for the same purpose
(admin/accounting → all; cluster_manager → own cluster; else false).

Cluster managers therefore also lose the **Cluster** filter (hidden in the UI — they
only have one).

---

## 7. Filters, dates and comparison

### 7.1 Two comparison modes

| Mode | Comparison window |
|---|---|
| **L2L** (default) — like-for-like vs last year | The same range shifted back **exactly one calendar year** (`shiftOneYear`: `2026-09-02 → 2025-09-02`; Feb-29 → Feb-28) |
| **Compare** — Period A vs Period B | Both chosen by the user as year + month + optional week (1–5). Period A becomes the main range, Period B the comparison |

Either way the API receives `date_from`, `date_to` and (Compare only) `b_from`, `b_to`,
and every RPC returns *current and previous on the same row* (`nsv` / `prev_nsv`, …).
Growth is computed client-side; there is no second query.

In Compare mode every "LY" label becomes the Period B label (e.g. `Aug 2026`), and
"L2L" growth headings do the same.

### 7.2 Quick ranges (L2L mode)

All anchored on the latest data date, never the system clock. The groups are mutually
exclusive — picking one clears the others.

| Preset | Range |
|---|---|
| **WTD** | Monday (ISO) of the anchor's week → anchor |
| **MTD** | 1st of anchor month → anchor |
| **YTD** | 1 Jan of anchor year → anchor |
| **Week 1–5** | Days 1–7, 8–14, 15–21, 22–28, 29–end of the anchor month (week 5 clamps on short months) |
| **Month Jan–Dec** | Whole calendar month in the anchor year |
| **H1 / H2** | Half-years (multi-select; both = the whole year) |
| **Q1–Q4** | Quarters (multi-select; the range spans min-from to max-to) |
| **Financial / Calendar** | Switches H1/H2/Q1–Q4 between **Apr–Mar** (Indian FY) and Jan–Dec |

Week and Month are deliberately **single-select**: a date range cannot have holes, so
"Week 2 + Week 4" would silently include Week 3 and corrupt the L2L comparison.

FY logic: `fyStartYear(y, m) = m ≥ 4 ? y : y − 1`. Financial Q1 = Apr–Jun, Q2 = Jul–Sep,
Q3 = Oct–Dec, Q4 = Jan–Mar.

### 7.3 Store filters

Cluster, State, Grade, Classification, Store — all multi-select. Options **cascade**:
choosing clusters narrows the Store list, and stale store selections are dropped.
Values currently present: 3 clusters (Nagendra 6 stores, Purnachander 8, Sreekar 7),
grades `A+ A B+ B FO B FO`, classifications `L2L NEW RENO`, store type `FOFO`.

### 7.4 Division toggle

Does **not** filter rows. It swaps *which columns are read* (§9). "Accessories" has no
socks/shoes/footwear, so SSR/SFR/AFR/FUPT read 0 there.

### 7.5 Where each filter is applied

| Filter | Overview & Retail metrics | Category tab | Discount tab |
|---|---|---|---|
| Date range / Compare | server (refetch) | server (refetch) | server (refetch) |
| Cluster / State / Grade / Class / Store | **client** (instant) | **server** — the selected store keys are sent as `store_keys`, debounced 250 ms | client (store set passed down) |
| Division | client | client (only the donut) | client |

The Category tab needs server-side filtering because its rows are too granular to ship
unfiltered for all stores.

### 7.6 Fetch safety

* `fetchSeqRef` — every request gets a sequence number and only the newest may write
  state, so a slow Compare fetch cannot overwrite a fast L2L one.
* `storeKeysRef` / `cmpRef` — filter and Period-B values are read through refs so
  `fetchData` keeps a stable identity and the effects don't loop.
* Switching into Compare snapshots the L2L range; switching back restores it exactly.
* Compare's Period A/B are re-anchored once onto the latest data date so the defaults
  (this month vs last month) never point at an empty month.

---

## 8. The metric dictionary

All ratios go through `ratio(a, b)` = `b > 0 ? a / b : 0` — never `Infinity` or `NaN`.
`growth(cur, prev)` = `prev > 0 ? (cur/prev − 1) × 100 : null` (rendered `—`).

### 8.1 Base measures

| Name | Definition |
|---|---|
| **RSV** (`nsv` in code) | `Σ selling_amount` — actual amount charged, tax-inclusive, net of returns |
| **MRP** | `Σ abs(sale_mrp) × quantity` — what it would have sold for at ticket price |
| **Qty** | `Σ quantity`, net of returns |
| **Bills** | Distinct bill numbers (per store-day, then summed) |
| **Avg / day** | `RSV ÷ dayCount` (`dayCount` = days in the range, inclusive) |

### 8.2 Headline metrics

| Metric | Formula | Format | Meaning |
|---|---|---|---|
| **MD %** (markdown) | `(MRP − RSV) / MRP × 100` | 2 dp + % | How far below ticket price we actually sold. 0 if MRP ≤ 0 |
| **ATV** | `RSV / Bills` | ₹, 0 dp | Average transaction (bill) value |
| **UPT** | `Qty / Bills` | 2 dp | Units per transaction |
| **ASP** | `RSV / Qty` | ₹, 0 dp | Average selling price per unit |

### 8.3 Footwear attach metrics

| Metric | Formula | Meaning |
|---|---|---|
| **SSR** | `socks_qty / shoes_qty × 100` | Socks per **closed shoe** |
| **SFR** | `socks_qty / footwear_qty × 100` | Socks per **all footwear** (incl. sandals/slides) |
| **AFR** | `apparel_qty / footwear_qty × 100` | Apparel units per 100 footwear units |
| **FUPT** | `footwear_qty / bills` | Footwear units per bill |

SSR vs SFR is a real distinction: a store selling mostly sandals has a much lower SFR
than SSR. Note SSR can exceed 100 % (more socks than shoes).

### 8.4 Comparison metrics

| Metric | Formula |
|---|---|
| **Growth / L2L %** | `growth(current, previous)` — for RSV, Qty, Bills, and each ratio |
| **Contribution %** | `node RSV ÷ total category RSV × 100` (Category tab) |
| **MD % growth** | Growth of the *MD% itself*, only when both periods have RSV and MRP |

### 8.5 Discount-tab metrics

| Metric | Formula |
|---|---|
| **Fresh sales** | RSV of lines with `discount_derived` NULL or ≤ 0 |
| **Discount sales** | RSV of lines with `discount_derived > 0` |
| **Fresh mix %** | `fresh ÷ (fresh + discount) × 100` |
| **Discount mix %** | `discount ÷ (fresh + discount) × 100` |
| **Avg discount %** | `Σ discount_derived ÷ Σ (sale_mrp × qty) on discounted lines × 100` |
| **Revenue lost to discounts** | `Σ discount_derived` (MRP − selling amount, discounted lines) |
| **Discount band** | Line's `discount_derived ÷ (sale_mrp × qty)` bucketed: No Discount · 0-10 · 10-20 · 20-30 · 30-40 · 40-50 · 50%+ |

### 8.6 Worked example (real data)

Chain-wide, 1–18 Sep 2026 vs the same days of 2025 (from `gold.master_dashboard`):

| | 2026 | 2025 (L2L) | Growth |
|---|---|---|---|
| Stores trading | 21 | 17 | |
| **RSV** | ₹4,05,12,682 | ₹2,82,22,295 | **+43.5 %** |
| MRP | ₹4,27,77,012 | ₹3,05,78,958 | |
| **MD %** | (4,27,77,012 − 4,05,12,682) ÷ 4,27,77,012 = **5.29 %** | 7.71 % | −31.4 % |
| Qty | 8,164 | 6,442 | +26.7 % |
| Bills | 5,130 | 3,888 | +31.9 % |
| **ATV** | 4,05,12,682 ÷ 5,130 = **₹7,897** | ₹7,259 | +8.8 % |
| **UPT** | 8,164 ÷ 5,130 = **1.59** | 1.66 | −4.0 % |
| **ASP** | ₹4,962 | ₹4,381 | +13.3 % |
| **SSR** | 59.87 % | 62.38 % | |
| SFR | 42.25 % | 46.72 % | |
| AFR | 11.85 % | 13.31 % | |
| FUPT | 1.02 | 1.03 | |
| Avg / day | ₹22,50,705 | | |

Note the L2L comparison is against **17 stores** — new stores inflate growth. That is
what the `classification` filter (`L2L` / `NEW` / `RENO`) is for: filter to `L2L` for
a true like-for-like number.

---

## 9. Aggregation rules (the ones that matter)

### 9.1 Never sum or average ratios

> **Ratios are recomputed from summed numerators and denominators at every level.**

A cluster's ATV is `Σ store RSV ÷ Σ store bills`, **not** the average of its stores'
ATVs (which would weight a 20-bill store the same as a 2,000-bill one). Cluster totals,
the Grand total, category rows and KPI cards all follow this. When adding a metric, put
its **inputs** in the accumulator (`FullAgg`), not its result.

### 9.2 Division scoping — `scopeAgg(row)`

For `All divisions` the row passes through unchanged. For a division it swaps in that
division's own columns:

| Quantity | Footwear | Apparel | Accessories |
|---|---|---|---|
| RSV | `fwV` | `appV` | `accV` |
| Qty | `fwQ` | `appQ` | `accQ` |
| MRP | `fwMrp` | `appMrp` | `accMrp` |
| Bills | `fwBills` | `appBills` | `accBills` |
| Prev RSV / MRP / Bills | `prevFwV`, `prevFwMrp`, `prevFwBills` | `prevApp…` | `prevAcc…` |
| Prev Qty | `prevFwQ` | `prevAppQ` | **residual** `prevQty − prevFwQ − prevAppQ` (no dedicated column) |
| Socks / shoes | real values | 0 | 0 |

No "estimate by NSV-mix ratio" remains anywhere on the Overview / Retail-metrics tabs —
every division figure, current **and** last-year, is real. (The Discount tab is the one
exception, §17.)

### 9.3 Bills overlap across divisions

A bill counts toward **every division it touched**, so
`footwear_bills + apparel_bills + accessories_bills` can exceed the store's total bill
count. That is correct for per-division ATV/UPT, but the three must not be added up.

### 9.4 Heat-map colouring

`heat(value, min, max, invert = true)`: `invert = true` (default) means **lower is
better** — right for MD%, where a deeper markdown is worse. Store rows are coloured
against the min/max of *store* MD% values; **total rows carry no heat**, because
grading an aggregate against the store distribution implies a comparison that doesn't
exist.

---

## 10. Tab by tab

### 10.1 Head-to-head panel (any tab)

Appears when **exactly two stores** are selected (Store filter or by clicking bars).
A two-column table: RSV, growth, MD %, Bills, ATV, UPT, SSR, Avg/day. The better value
is highlighted indigo (for MD % the *lower* wins). Uses the unfiltered `rows`, so it
ignores the division toggle.

### 10.2 Overview

**KPI tiles** (division-aware, from `kpiTotals`):

| Tile | Value | Subtext |
|---|---|---|
| RSV | `compactCurrency(RSV)` | growth vs comparison |
| Avg / day | `RSV ÷ days` | "over N days" |
| MD % | `(MRP−RSV)/MRP` | "(MRP − RSV) / MRP" |
| Qty sold | `Σ qty` | growth |
| Bills | `Σ bills` | — |
| ATV | `RSV / bills` | "sales / bill" |
| SSR | `socks / shoes` | "socks / shoes" |

Tiles with a sparkline (RSV, MD %, Qty, ATV, SSR) draw the **daily** series for the
selected division.

**Daily Trend** — Recharts `AreaChart` (indigo gradient). Dropdown chooses the series:
`RSV`, `AVG / DAY` (the same daily RSV), `MD %`, `Qty Sold`, `Bills`, `ATV`, `SSR`.
Per day: MD% = `(mrp − rsv)/mrp`; ATV = `rsv/bills`; SSR = `socks/shoes`. Tooltip is
formatted per metric (₹ compact / % / number).

**Division split** — two `PieChart` donuts, RSV and Qty. On *All divisions* they show
Footwear / Apparel / Accessories (colours `#4f46e5 / #c2410c / #0f766e`) and clicking a
slice or legend item sets the Division toggle. On a single division they show that
division's **top 7 article types + "Other"** (from the category data). A "← all
divisions" chip clears it.

**Top stores by RSV** — horizontal `BarChart`, ₹ lakh, sorted high→low, division-aware.
Clicking a bar toggles that store in the Store filter; unselected bars dim to 35 %.
Tooltip adds the store's L2L growth (total RSV growth, see §17 item 6).

**L2L growth by store** — same shape, bar = `growth(RSV, prevRSV)` rounded to 1 dp,
sorted best→worst; green ≥ 0, red < 0, grey when the store had no comparison-period
sales ("No prior-year sales" — a new store). Heading becomes *Growth by store* in
Compare mode.

**Store Performance Overview** — one row per store, grouped by cluster:

| Column | Cell shows |
|---|---|
| RSV | value · ▲/▼ growth · `LY: value` |
| Bills | same |
| Qty Sold | same |
| MD % | same, with heat colouring on store rows; MD% growth is the growth of the ratio |

Each cluster ends with an amber "*<Cluster> total*" row and the table ends with the dark
**Grand total**. Under each store name: `State · Grade · Classification`.

### 10.3 Retail metrics

Seven StatCards (UPT, ATV, ASP, SSR, FUPT, SFR, AFR) computed from `kpiTotals`, each
with growth vs comparison and a daily sparkline.

**Metric by store** — dropdown picks one of the seven; a horizontal bar chart shows
*this year* (indigo) and *last year* (grey) for every store, sorted by the current
value. ATV/ASP round to 0 dp, the rest to 2.

**Store Performance table** — all seven metrics side by side; each cell shows the
value, ▲/▼ growth, and "LY: value" underneath. Cluster totals and Grand total are
recomputed from summed inputs (§9.1).

Formats: ATV/ASP `₹#,##0`; SSR/SFR/AFR `x.x%`; UPT/FUPT `x.xx`.

### 10.4 Category drill-down

Data comes from `gold.master_dashboard_granular` and the footwear table via 6 RPCs,
scoped server-side by the store filters (§7.5).

| Table | Levels | Source RPC |
|---|---|---|
| Category drill-down | Division › Section › Article. **Footwear's children are Open/Closed › Article › Section** | `rpt_master_dashboard_categories` + `rpt_footwear_by_article` |
| Footwear — by Department | Open/Closed › Department › Section | `rpt_footwear_by_department` |
| Category — by store | Cluster › Store › Division › Section › Article (Footwear branch substitutes Open/Closed › Article › Section) | `rpt_master_dashboard_categories_by_store` + `rpt_footwear_by_article_by_store` |
| Footwear by Department — by store | Cluster › Store › Open/Closed › Department › Section | `rpt_footwear_by_department_by_store` |

* Click a row to expand; expansion state is one `Set<string>` of node keys.
* Siblings sort by RSV descending, except Open/Closed which always lists **Closed first**.
* Every node shows Qty, LY Qty, Qty growth, RSV, LY RSV, RSV growth, a contribution
  bar, and MD %.
* **Contribution** = node RSV ÷ total RSV of the *first* table's data (`catTotalNsv`),
  so a store's rows in the by-store tables show their share of the **chain** total, not
  of that store.
* The by-store tables use one generic `DrillNode` tree and one row renderer
  (`renderDrillRows`, indentation by depth) rather than hand-written JSX per level.

### 10.5 Discount vs fresh

Fetches `/api/reports/master-dashboard/merch` once per date range (plus Period B in
Compare mode). Everything else is client-side. The store list comes from the parent's
`filtered` set, so Cluster/State/Grade/Class/Store filters apply; the Division toggle
scopes sections 1, 2, 3, 5 and 6 (section 4 is always by division).

| # | Section | Detail |
|---|---|---|
| 1 | **8 KPI cards** | Fresh Sales · Discount Sales (both with growth) · Fresh Mix % · Discount Mix % · Avg Discount % · Fresh Quantity · Discount Quantity · Revenue Lost to Discounts |
| 2 | **Fresh vs Discount trend** | Two-series `AreaChart` (emerald / amber), daily |
| 3 | **Discount Band Analysis** | Bar chart + table (Band · Sales · Qty · Contribution %) over 7 bands, colour-coded |
| 4 | **Division Performance** | Footwear / Apparel / Accessories: Fresh, Discount, Fresh %, Discount %, Avg Disc %, Qty, Sales (bar) |
| 5 | **Store Performance** | Same columns per store; searchable; every header sortable (`SortHeader`); default sort Sales ↓ |
| 6 | **Discount Heat-map** | Store × band grid; metric dropdown (Sales / Quantity / Transactions) |
| 7 | **Top Insights** | 5 cards, each showing Highest and Lowest: Fresh Sales—Store, Discount Sales—Store, Avg Discount %—Store, Fresh Sales—Division, Discount Sales—Division |

**Heat-map shading** is *rank-based per band column*, not linear min-max, so one large
store cannot flatten everyone else into a sliver of the scale. "No Discount" uses
red→green (more full-price sales is better); the other bands use a light→dark blue
intensity scale.

---

## 11. Components and helpers inventory

| Name | File | Purpose |
|---|---|---|
| `StatCard` | `masterDashboardShared.tsx` | KPI tile: label, value, sub, icon, tint, optional sparkline |
| `Sparkline` | same | Inline SVG mini-trend, stroke colour by direction |
| `shortStore` | same | Strips the `V S CORP -` prefix from store names |
| `ratio`, `growth`, `pctCls`, `pctStr` | same | Safe divide, growth %, colour class, `+12.3%` / `—` |
| `inr0` | same | `₹1,23,456` (Indian grouping, 0 dp) |
| `heat`, `heatText` | same | Red→yellow→green fill and a legible label colour (relative luminance > 0.38 → dark text) |
| `selCls` | same | Shared select/input styling |
| `MultiSelect` | `page.tsx` | Checkbox dropdown with Select all / Clear, closes on outside click |
| `GrowthBadge` | `page.tsx` | `+x.x% L2L`, or "no L2L" when null |
| `ScopeChip` | `page.tsx` | "← all divisions" / "n selected" reset chip |
| `kpiCell`, `compactMetricTd`, `metricTds` | `page.tsx` | Table-cell renderers (value + arrow + LY line) |
| `scopeAgg`, `kSum` | `page.tsx` | Division scoping and total accumulation |
| `SortHeader`, `PerfTable` | `DiscountVsFreshTab.tsx` | Sortable/searchable tables |
| `heatBlue` | `DiscountVsFreshTab.tsx` | Light→dark blue for discounted bands |

`masterDashboardShared.tsx` is also imported by the Merchandiser Dashboard, so changes
there affect both.

---

## 12. API contracts

### 12.1 `GET /api/reports/master-dashboard`

| Query param | Meaning |
|---|---|
| `date_from`, `date_to` | Range; default = 1st of latest month → latest data date |
| `b_from`, `b_to` | Optional Period B (Compare mode); both must be `YYYY-MM-DD` |
| `store_keys` | Optional comma-separated store keys — scopes the **Category/Footwear** RPCs only |

Returns: `storeRows`, `trend`, `categories`, `footwearByArticle`,
`footwearByDepartment`, `categoriesByStore`, `footwearByArticleByStore`,
`footwearByDepartmentByStore`, `range`, `prevRange`, `dayCount`, `latestDate`,
`storeCount`. Numbers arrive from Postgres as strings and are coerced by `n()`
(non-finite → 0). Errors: `401` no session, `403` wrong role, `500` with the RPC's
message.

### 12.2 `GET /api/reports/master-dashboard/merch`

`date_from`, `date_to`, `b_from`, `b_to` (same rules). Returns `storeRows`
(fresh/discount × qty/sales/derived/MRP per store, per division, plus `prev*`), `trend`
(daily fresh/discount by division), `heatmap` (store × band).

### 12.3 RPC reference

| RPC | Reads | Grain returned |
|---|---|---|
| `rpt_master_dashboard_stores(start,end,prev_start,prev_end)` | `gold.master_dashboard` | store (current + prev on one row) |
| `rpt_master_dashboard_trend(start,end)` | `gold.master_dashboard` | day |
| `rpt_master_dashboard_categories(…, store_keys)` | `…_granular` | division × section × article |
| `rpt_master_dashboard_categories_by_store(…)` | `…_granular` | + cluster, store |
| `rpt_footwear_by_article(…)` | `…_granular_footwear` | type × article × section |
| `rpt_footwear_by_department(…)` | `…_granular_footwear` | type × department × section |
| `rpt_footwear_by_article_by_store(…)` / `…_department_by_store(…)` | `…_granular_footwear` | + cluster, store |
| `rpt_merch_store_summary(start,end,prev_start,prev_end)` | **`staging.fact_sales`** | store |
| `rpt_merch_trend(start,end)` | **`staging.fact_sales`** | day |
| `rpt_merch_heatmap(start,end)` | **`staging.fact_sales`** | store × band |
| `rpt_kpi_latest_date()` | `gold.store_daily_performance` | scalar date |

All are `STABLE SECURITY DEFINER`, use a fixed `search_path`, and are granted to
`authenticated` only (revoked from `anon`).

---

## 13. Performance design

* **Why gold tables:** the dashboard never scans `fact_sales` (≈ 814,000 rows) for the
  main tabs — a day × store roll-up is ~28,700 rows, so range queries are milliseconds.
* **One round trip:** the eight main RPCs run with `Promise.all`.
* **Instant filtering:** client-side filter/aggregate means no network call for
  Cluster/State/Grade/Class/Division changes on Overview and Retail metrics.
* **Database timeouts matter:** the `authenticated` role has an **8-second**
  statement timeout. A slow RPC returns an error and the UI shows a red banner or a
  blank tab — that is the usual cause of "the report isn't loading". Stale statistics
  or dead tuples after a large rebuild are the typical trigger (fixed by
  `VACUUM ANALYZE`, which the pipeline now runs after rebuilds).
* **Recharts** charts are wrapped in `ResponsiveContainer debounce={100}` so resizing
  the window or sidebar does not thrash re-renders.

---

## 14. Operations and troubleshooting

### 14.1 How fresh is the data?

Sales export → *Data Upload* page → GitHub Action (`process.yml`): Raw → Staging dims →
Staging facts → **Gold**. The dashboard is only as fresh as the last successful Stage 4.
Header shows the range end; if it is behind, the pipeline has not run (or failed).

### 14.2 Symptom guide

| Symptom | Likely cause | Where to look |
|---|---|---|
| Numbers much higher than the source CSV | Stale/duplicate `staging.fact_sales` rows or gold not rebuilt | Compare gold vs staging for the same window; re-run pipeline |
| Latest days missing | Pipeline not run, or gold run failed | GitHub Actions log, Stage 4 |
| Blank tab / red error banner / spinner forever | RPC exceeded the 8 s timeout, or DB flipped read-only | Browser network tab → the failing `/api/reports/master-dashboard*` call; Supabase status/plan |
| "cannot execute … in a read-only transaction" in a pipeline log | Supabase project over its plan quota (read-only mode) | Supabase billing / usage |
| Discount tab total ≠ Overview RSV | By design of current implementation — see §17 item 1 | — |
| Discount tab empty after choosing a division | Known defect — see §17 item 2 | — |
| Growth shows `—` for a store | No comparison-period sales (new store) | Expected |
| All growth meaningless | Range > 366 days → L2L windows overlap | Shorten the range |

### 14.3 Pipeline safeguards behind the numbers

Duplicate-sales protection lives in the pipeline (not the dashboard): the raw layer
supersedes overlapping cumulative exports; staging detects and purges rows whose source
file has been removed from raw (`source_file_name` file-level comparison, including
deleted files); gold's incremental refresh is driven by a content-based watermark
(`dirty_from`, per-month fingerprints) so a re-upload of any past day rebuilds from
that day.

---

## 15. Extending the page

### 15.1 Add a metric to Overview / Retail metrics

1. Make sure its **inputs** are columns on `gold.master_dashboard` (add them in
   `refresh_gold.py` → `SQL_MASTER_DASHBOARD`, plus a migration for the table).
2. Add them to `rpt_master_dashboard_stores` (`RETURNS TABLE`, both `cur` and `prev`).
3. Add to `RpcStoreRow` and `MdStoreRow` in the route, and the `StoreRow` interface in
   the page.
4. Add to the `Metric` union, `metricOf`, `metricOfPrev`, `metricOfAgg`,
   `metricOfPrevAgg`, `metricFmt`, `metricLabel`, `ALL_METRICS`.
5. Add the raw **inputs** to `FullAgg` / `scopeAgg` / `kSum` — **not** the ratio.
   (Skipping this is the classic bug: totals that are subtly wrong only when stores
   have uneven weights.)
6. Add a sparkline series in `sparkSeries` if it should have one.

### 15.2 Add a new tab

Add its id to `Tab`, an entry in `TABS`, a new `tab === '…'` branch in the render, and
if it needs its own data, its own route + RPCs (the Discount tab is the template:
separate route so the other tabs are untouched).

### 15.3 Add a new filter

Add state, options in `opts`, the predicate in `filtered`, a `MultiSelect`, and
include it in the effect dependency array that re-fetches the Category data.

---

## 16. Glossary

| Term | Meaning |
|---|---|
| **RSV** | Retail Sales Value — `selling_amount`, tax-inclusive, net of returns |
| **NSV** | Legacy name for RSV still used in code variables |
| **MRP** | Maximum retail (ticket) price |
| **MD %** | Markdown percentage — `(MRP − RSV) / MRP` |
| **ATV** | Average transaction value |
| **UPT / FUPT** | Units / footwear units per transaction |
| **ASP** | Average selling price per unit |
| **SSR / SFR** | Socks-to-shoes / socks-to-footwear ratio |
| **AFR** | Apparel-to-footwear ratio |
| **L2L** | Like-for-like — same date range, one year earlier |
| **Period A / B** | The two windows in Compare mode |
| **Fresh / Discount** | Sold with no discount / with any discount |
| **Open / Closed footwear** | Closed = shoes; Open = everything else in footwear |
| **Cluster** | Group of stores under one cluster manager (3 today) |
| **Grade** | Store grade (A+, A, B+, B, FO, B FO) |
| **Classification** | L2L (established), NEW, RENO (renovated) |
| **Gold / Staging / Raw** | Pipeline layers: consumption tables / cleaned facts / ingested files |
| **T-1** | "Yesterday" — the latest complete data day |

---

## 17. Known limitations and inconsistencies (verified 2026-09-20)

These are real behaviours found while writing this document. None is a data-corruption
bug; they are places where the page can mislead. Listed so nobody rediscovers them the
hard way.

1. **The Discount tab does not reconcile to the Overview.** Overview/Category read
   `gold.*`, which **nets returns**. The Discount tab reads `staging.fact_sales`
   filtered to `sales_type = 'SALE'`, so returns are **excluded**. For 1–18 Sep 2026:
   Overview RSV = **₹4,05,12,682**; Discount tab Fresh + Discount = **₹4,30,70,898**
   (**6.3 % higher**). The "fresh" definition also differs from the unused gold
   `disc_vs_fresh` column (which tests MRP × qty = selling amount).
2. **Choosing a division blanks the discount bands and heat-map.** The live
   `rpt_merch_heatmap` returns `store_key, band, sales, qty, txns` — no `division`
   column (migration `065_merch_heatmap_division.sql` is in the repo but the deployed
   function is the older 2-column version). The tab filters heatmap rows by
   `h.division === division`, which is never true, so with Footwear/Apparel/Accessories
   selected sections 3 and 6 show zeros. "All divisions" works.
3. **Daily-trend charts ignore the store filters.** `rpt_master_dashboard_trend` and
   `rpt_merch_trend` take no store parameter, so the Overview Daily Trend, the KPI
   sparklines and the Discount trend always show the whole accessible set even though
   the caption says "all stores in view". Only the Division toggle applies.
4. **Discount-tab last-year division figures are estimates.** `scopeRow` scales prior
   year by the division's share of *current* sales. The Overview/Retail tabs use real
   prior-year division numbers. Fresh/Discount growth under a division filter is
   therefore approximate.
5. **Accessories has no daily quantity.** The trend RPC returns no accessories qty, so
   the Qty trend and quantity sparklines read 0 when Division = Accessories.
6. **Store-ranking tooltips ignore the division toggle.** The bar length follows the
   division, but the "% L2L" in the tooltip and the growth chart are total-store RSV
   growth.
7. **Contribution % in the by-store tables is a share of the chain total** (§10.4), not
   of the parent store.
8. **The Head-to-head panel ignores the division toggle** (§10.1).

*Superseded-document errors (for the record):* the 2026-09-04 `MASTER_DASHBOARD.md`
listed a **Conv %** metric (`bills ÷ walk-ins`) — the page has no walk-in/footfall data
and no Conv % — and described **RSV as an extra "trend-only" measure** distinct from
NSV; on screen RSV *is* the headline measure (the `nsv` variable), and it is tax-inclusive.
