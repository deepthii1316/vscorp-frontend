This one covers 8/1/2026 to 8/31/2026, so the August dates are in it. Running the full audit now.**A is much closer to correct, but it is off by 1 unit on three apparel numbers.** B counts the 54 free carry bags as units and dumps every blank-division row into Accessories. This file covers all of August (636 rows, 196 bills), and its Grand Total row ties to my row sums (qty 986, taxable 8,47,984.48). The 1-3 Aug slice is 82 rows and 25 bills.

## Main table (MTD 1-3 Aug)

"Correct" means excluding carry bags and assigning the 3 blank-division clothing rows to Apparel.

| Metric | A | B | Correct (Excel) | As exported, all rows | Right? |
|---|---|---|---|---|---|
| Total qty | 66 | 120 | **66** | 120 | A |
| Qty Balraj / Rambabu / Erri | 25/22/19 | 42/44/34 | **25/22/19** | 42/44/34 | A |
| Apparel per staff | 13/11/14 | 12/11/13 | **14/11/14** | 12/11/13 | Neither. A is 1 short on Balraj, B is 2 short on Balraj and 1 short on Erri. |
| Accessories per staff | 1/2/1 | 20/24/17 | **1/2/1** | 1/2/1 | A |
| Unisex qty | 6 | 60 | **6** | 60 | A |
| Footwear / Apparel / Accessories | 23/38/4 | 23/36/61 | **23/39/4** | 23/36/4 (+57 blank) | Neither. A is 1 short on Apparel. |
| Men apparel | 31 | 29 | **32** | 29 | Neither. A is 1 short. |
| Unisex accessories | 4 | 58 | **4** | 4 | A |
| NSV | ~1,16,932 | same | **1,16,932.02** | same | Both |
| Distinct bills | 25 | 25 | **25** | 25 | Both |

## Which method reproduces A and B

| Method | Total | Apparel per staff | FW / APP / ACC | Men apparel | Result |
|---|---|---|---|---|---|
| All rows, blank division → Accessories | 120 | 12/11/13 | 23/36/61 | 29 | **Reproduces B exactly** on all 8 metrics |
| Excl. bags, 3 blank clothing rows left blank | 66 | 12/11/13 | 23/36/4 (+3 blank) | 29 | Reproduces A's non-apparel numbers only |
| Excl. bags, all 3 blank clothing rows → Apparel | 66 | 14/11/14 | 23/39/4 | 32 | **The correct numbers** |

A's apparel figures (13/11/14, 38, 31) match neither variant. They match "2 of the 3 blank clothing rows fixed". Erri's hoodie (bill …225) and one of Balraj's two rows on bill …232 were classified, and the other Balraj row was left out. The numbers can't tell me whether that was the ₹2,475.24 T-shirt or the ₹2,189.52 shorts.

## Task 1: correct method (excluding bags, clothing reassigned)

**MTD 1-3 Aug: 66 units, NSV 1,16,932.02, 25 bills**

| Salesman | Qty | NSV | Bills |
|---|---|---|---|
| Balraj Gaddam | 25 | 53,867.25 | 9 |
| Rambabu Dharavath | 22 | 35,235.59 | 10 |
| Erri Srija | 19 | 27,829.18 | 6 |

| Division | Qty | NSV | Bills |
|---|---|---|---|
| Footwear | 23 | 62,365.59 | 16 |
| Apparel | 39 | 52,474.99 | 17 |
| Accessories | 4 | 2,091.44 | 4 |

| Section | Qty | NSV | Bills |
|---|---|---|---|
| RB MEN | 51 | 88,232.14 | 24 |
| RB WOMEN | 9 | 18,296.34 | 8 |
| RB UNISEX | 6 | 10,403.54 | 6 |

Gender x Division, shown as qty (NSV):

| | Footwear | Apparel | Accessories |
|---|---|---|---|
| Men | 19 (46,589.11) | 32 (41,643.03) | 0 |
| Women | 2 (7,464.38) | 7 (10,831.96) | 0 |
| Unisex | 2 (8,312.10) | 0 | 4 (2,091.44) |

Salesman x Division, shown as qty (NSV):

| | Footwear | Apparel | Accessories |
|---|---|---|---|
| Balraj | 10 (29,721.06) | 14 (23,670.95) | 1 (475.24) |
| Rambabu | 9 (23,138.65) | 11 (11,146.46) | 2 (950.48) |
| Erri | 4 (9,505.88) | 14 (17,657.58) | 1 (665.72) |

**3 Aug only: 2 units, NSV 3,852.03, 2 bills.** Both units are Men Footwear sold by Rambabu (a slider at ₹1,903.80 and a slipper at ₹1,948.23), so the division and section split is 2 / 100% Footwear and Men. There are no bag rows that day, so both methods agree. The MTD split by day is 1 Aug 12 bills (₹56,827.10), 2 Aug 11 bills (₹56,252.89) and 3 Aug 2 bills.

Counting all rows as exported, MTD is 120 units with 57 in blank division. NSV and bills are identical to the correct method.

## Task 2: row-level evidence

**2a. Carry Bag, whole month.** These are free packaging, not merchandise.

| Rows | Qty | Taxable | Section | Item Division | MRP | Item discount |
|---|---|---|---|---|---|---|
| 179 | 547 | 0.00 | RB UNISEX (100%) | blank (100%) | ₹1 | ₹547 (100%) |

- **SKUs:** Large (8010383360) is 94 rows and 319 units. Small (8010383361) is 85 rows and 228 units.
- **Bills:** 112 of the 196 bills have bags, and every bill also has real merchandise. Bags never create a bill.
- **Share of units:** bags are 547 of 986 units in the month (55%). In MTD it is 54 of 120 (16 rows).
- **Cosmetic issue:** the promo text on many bag rows says "LARGE" or "SMALL" on the wrong size.

**2b. Blank Item Division: 186 rows.** 179 are Carry Bags and 7 are clothing.

| Date | Bill | Class | Section | Qty | Taxable | Salesman | Description | Belongs to |
|---|---|---|---|---|---|---|---|---|
| 2 Aug | …225 | GL HOODIE | MEN | 1 | 1,809.04 | Erri | Embroidery branded tracktop S | Apparel |
| 2 Aug | …232 | T Shirt | MEN | 1 | 2,475.24 | Balraj | Tshirt performance M | Apparel |
| 2 Aug | …232 | Shorts | MEN | 1 | 2,189.52 | Balraj | Lifestyle mens OD shorts L | Apparel |
| 15 Aug | …305 | GL HOODIE | MEN | 1 | 1,809.04 | Erri | Embroidery branded tracktop L | Apparel |
| 16 Aug | …320 | GL HOODIE | MEN | 1 | 1,809.04 | Rambabu | Embroidery branded tracktop L | Apparel |
| 29 Aug | …391 | Jogger | WOMEN | 1 | 1,903.80 | Rambabu | Womens performance jogger XS | Apparel |
| 30 Aug | …401 | GL HOODIE | MEN | 1 | 1,809.04 | Rambabu | Embroidery branded tracktop M | Apparel |

The first three rows are the ones inside the MTD window. For T Shirt and Shorts, every non-blank row with those classes is Apparel (94 and 12 rows). GL HOODIE and Jogger never appear with a division filled, so I assigned Apparel from the item description. The Excel itself can't confirm that.

**2c. Distinct values, whole month**

| Item Division | Rows | Qty | Class Names (rows / qty) |
|---|---|---|---|
| FOOTWEAR | 162 | 157 | Shoes 114/109, Slippers 21/21, SLIDER 21/21, Sandal 6/6 |
| APPAREL | 221 | 207 | T Shirt 94/82, POLO 57/57, TRACK PANT 28/28, RB TRAINING 14/14, Shorts 12/10, TRACK TOP 10/10, PANT 2/2, Tank Top 2/2, RB ATHLEISURE 1/1, Tights 1/1 |
| ACCESSORIES | 67 | 68 | Socks 51/52, Cap 11/11, Bag 5/5 |
| **(blank)** | **186** | **554** | **Carry Bag 179/547**, GL HOODIE 4/4, T Shirt 1/1, Shorts 1/1, Jogger 1/1 |

Only the blank is outside the three divisions. Two other flags: "Bag" (5 rows, ₹10,166, in Accessories) is real merchandise, so don't confuse it with "Carry Bag", and class-name casing is inconsistent (POLO, SLIDER and TRACK PANT are caps).

**2d. Duplicate-looking lines: all are separate units.** MTD has 7 such pairs, all clothing or footwear and none in bags.

| Bill | Class | Qty / NSV | Stock No. (barcode) | Size |
|---|---|---|---|---|
| …213 | Shorts | 1 / 951.42 | …424790 vs …563673 | M / M |
| …217 | Shoes | 1 / 2,380.48 | …617291 vs …617468 | 10 / 9 |
| …218 | T Shirt | 1 / 1,094.76 | …263460 vs …263538 | L / L |
| …219 | SLIDER | 1 / 1,903.80 | …193880 vs …193903 | 8 / 9 |
| …222 | Shoes | 1 / 2,380.48 | …842198 vs …277207 | 8.5 / 10 |
| …226 | TRACK PANT | 1 / 951.90 | …563598 vs …565424 | L / L |
| …230 | T Shirt | 1 / 1,190.00 | …948630 vs …686389 | M / XS |

Across the whole month there are 34 such merchandise pairs, and every one has different Stock Nos. No two rows share the same Bill No. and Stock No. (0 rows), and there are 0 fully identical rows. There is no line-number column and no "Bar Code" column, so Stock No. (the EAN) plus Size and Style Code decided it. Don't dedupe on Class + Qty + Taxable.

**2e. Returns, blanks, other stores, dates**

| Check | Result |
|---|---|
| Negative qty / Returns | 10 rows, −10 units, NSV −29,060.20, all between 5 and 28 Aug (none in MTD) |
| Blank Bill No. | 0 data rows (only the 4 footer rows) |
| Other stores | 0 |
| Dates outside 1-31 Aug | 0 |
| Transaction types | Sales 626, Returns 10 |
| Bill numbers | 210 to 405, continuous, no gaps |

| Date | Return bill (original) | Class | Section | NSV | Salesman |
|---|---|---|---|---|---|
| 5 Aug | …246 (…243) | Shorts | MEN | −475.72 | Balraj |
| 5 Aug | …246 (…243) | T Shirt | MEN | −475.72 | Balraj |
| 8 Aug | …263 (…241) | T Shirt | MEN | −1,332.66 | Balraj |
| 9 Aug | …267 (…257) | T Shirt | MEN | −1,713.34 | Rambabu |
| 14 Aug | …304 (…217) | Shoes | MEN | −2,380.48 | Erri |
| 15 Aug | …306 (…303) | Shoes | MEN | −14,405.94 | Erri |
| 20 Aug | …338 (…332) | T Shirt | WOMEN | −951.42 | Erri |
| 20 Aug | …338 (…332) | T Shirt | WOMEN | −951.42 | Erri |
| 21 Aug | …344 (…336) | Shoes | MEN | −4,660.16 | Erri |
| 28 Aug | …382 (…015) | T Shirt | WOMEN | −1,713.34 | Balraj |

All returns sit inside exchange bills, meaning the same bill number also has new sale rows. They net off units and NSV and add no extra bills. Original bill …015 isn't in this file, so it is a prior-month bill. Bill …304 also has two salesmen: the return is credited to Erri and the new sales to Balraj.

## Task 4: where A contradicts itself

- **Division sum:** 23 + 38 + 4 = **65**, but A's total is 66.
- **Footwear:** A's per-staff implied footwear is 25−13−1 = 11, 22−11−2 = 9 and 19−14−1 = 4, totalling **24**. A's division footwear is 23.
- **Gender total vs division total:** can't check, because A only gives unisex and men apparel.

Both contradictions come from the same single Balraj row that was counted in his total but never put in a division. B is internally consistent, but consistently wrong.

## Conclusion

1. **Carry bags:** don't count them as units. They're a ₹1-MRP, 99.99%-discounted, ₹0-taxable packaging line, and they make up 55% of the month's "units". Exclude them from Qty, division, gender and salesman counts. NSV and bill count don't change. If you want bag issuance tracked, report it as a separate line.
2. **Blank Item Division:** bags go to a separate "Packaging" bucket or are excluded, and real clothing gets its division from Class Name or description (T Shirt, Shorts, hoodie/tracktop and jogger are all Apparel). Never default blanks to Accessories, which is exactly what created B's 61 accessories and 58 unisex accessories. Better still, keep a class-to-division lookup and require zero blank divisions on non-bag rows. Only 7 of 457 non-bag rows are blank, but even that shifts three numbers.
3. **Other things that break a report:**
   - **Footer total:** the footer qty of 986 includes bags, so it isn't units sold. Merchandise net of returns is 439 for the month.
   - **Returns:** these are negative rows in exchange bills, so keep them netted and don't drop them.
   - **Original bills:** returns can point at bills from before the period, like …015.
   - **Class Name casing:** it is inconsistent, so normalise it before grouping.
   - **Column names:** they don't match your spec. "Section" is `GROUP` and "Qty" is `Quantity`.
   - **Date type:** Bill Date is a real Excel date, not dd-mm-YYYY text.