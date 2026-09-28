# 2019 monthly FPI workbook checkpoint

Reviewed: 29 September 2026. Baseline commit: `bbecb54690452f8a76684fe55b2fe68a387df09d`. Branch: `codex/valuation-targets-market-refresh`.

## Outcome and scope

All twelve preserved 2019 monthly-FPI archives have been fully serialized-content read: **1,367,086 transaction records, 25,974,634 business fields, 26,207,595 stored cells including headers/ordinals, and 192 package parts**. Independent ElementTree and lxml readers reconcile the shared source controls. This is source review, not data ingestion, complete exchange-session coverage or a live institutional feed.

The original workbooks and approximately 3 GB V01 remain untouched. No application code, Mongo data/index/TTL, credentials, scheduler, deployment, strategy activation or trade was changed. Aggregate-only evidence excludes raw investor, broker, custodian and transaction identifiers and document-author metadata.

## Source coverage

Each archive contains one genuine OOXML workbook with one visible `Sheet1` and sixteen internal package parts. All archive/member/package bytes were read with SHA-256 and CRC checks; primary readers parsed all XML parts and decoded all worksheet cells. Printer-settings binaries were fully byte-read and hashed but remain semantically opaque. No native Excel rendering or recalculation was performed.

| Archive | Workbook member | Transaction records | Observed trade-date range | ISIN syntax failures or missing markers |
| --- | --- | ---: | --- | ---: |
| `2019_1.zip` | `Jan 2019.xlsx` | 122,488 | 2019-01-01 to 2019-01-31 | 1 |
| `2019_2.zip` | `Feb 2019.xlsx` | 118,481 | 2019-02-01 to 2019-02-28 | 2 |
| `2019_3.zip` | `Mar 2019.xlsx` | 115,055 | 2019-03-01 to 2019-03-30 | 0 |
| `2019_4.zip` | `Apr 2019.xlsx` | 98,657 | 2019-04-01 to 2019-04-30 | 52 |
| `2019_5.zip` | `May 2019.xlsx` | 141,264 | 2019-05-02 to 2019-05-31 | 53 |
| `2019_6.zip` | `Jun 2019.xlsx` | 107,792 | 2019-06-01 to 2019-06-28 | 0 |
| `2019_7.zip` | `Jul 2019.xlsx` | 114,432 | 2019-07-01 to 2019-07-31 | 0 |
| `2019_8.zip` | `Aug 2019.xlsx` | 118,301 | 2019-08-01 to 2019-08-30 | 0 |
| `2019_9.zip` | `Sep 2019.xlsx` | 107,316 | 2019-09-03 to 2019-09-30 | 0 |
| `2019_10.zip` | `Oct 2019.xlsx` | 103,113 | 2019-10-01 to 2019-10-31 | 0 |
| `2019_11.zip` | `Nov 2019.xlsx` | 114,535 | 2019-11-01 to 2019-11-29 | 0 |
| `2019_12.zip` | `December 2019.xlsx` | 105,652 | 2019-12-02 to 2019-12-31 | 0 |
| **Total** | **12 workbooks** | **1,367,086** | **Observed dates, not verified sessions** | **108** |

Evidence:

- `data/asset-review/monthly-fpi-2019-jan-apr-workbook-evidence-2026-09-29.json`
- `data/asset-review/monthly-fpi-2019-may-aug-workbook-evidence-2026-09-29.json`
- `data/asset-review/monthly-fpi-2019-sep-dec-workbook-evidence-2026-09-29.json`
- `data/asset-review/monthly-fpi-2019-workbook-independent-replay-2026-09-29.json`

## Findings for future wiring

1. **Map named headers, not fixed columns.** July and August use `B:T` with an unlabeled sequence column in `A`; the remaining months use `A:S`. All 232,733 sequence values match their data-row number and must remain separate from transaction identifiers. Date cells use the 1900 Excel epoch, style index 1 and number-format ID 14.
2. **Keep original types and missing markers.** No business field is physically absent or blank after trimming, yet 108 ISIN values fail syntax or are missing markers. There are zero checksum failures among valid-format ISINs. These tests do not establish issuer identity, corporate-action continuity or current NSE eligibility. Numeric and text identifier cells are not silently normalized; lost digits or leading zeroes cannot be reconstructed.
3. **Separate transaction time from availability.** Report-minus-trade lags span 0-7 calendar days, and reports extend into following months, through January 3, 2020. Twelve monthly files do not establish complete exchange-session coverage or exact publication time. A backtest cannot assume a transaction was known on its trade date.
4. **Duplicate tests have bounded scope.** No full nineteen-field duplicate or custodian-plus-transaction key repeat was found within any workbook under the compared definitions. Primary readers additionally retain their typed/normalized key diagnostics. No cross-month uniqueness, persistent masked identity or cancellation/replacement policy is established. No source record was deleted or merged.
5. **Exact serialized arithmetic is a control, not a trading signal.** RATE, QUANTITY and VALUE are finite and nonnegative. RATE and VALUE each contain 26,411 zero values; QUANTITY has 825 fractional values. All absolute `VALUE - RATE * QUANTITY` residuals are below INR 0.01; the maximum is **INR 0.00500026577718**, in November. Raw decimal tails remain intact. These checks neither prove economic validity nor produce signed cash flows, market bars, holdings or valuation inputs.
6. **Code and revision contracts remain unresolved.** All rows use report type `DL_RPT_TYPE_N`, but `DL_AMDMNT_DEL_15` occurs six times: July one, August one, September three and October one. Transaction code `23`, exchange code `99`, and instrument codes `REG_DL_INSTR_ID`/`REG_DL_INSTR_ME` occur without definitions in the inspected current reference. Preserve them; do not infer historical meaning, sign or amendment precedence.

The [official CDSL trade-wise FII/FPI page](https://www.cdslindia.com/Publications/EquityDataFII.html) was freshly inspected on September 29. It lists nineteen business fields, INR transaction values, masked party fields, code tables and twelve 2019 monthly links. Its historical effective version and complete revision semantics are not established. Current download bytes were not compared with preserved release bytes.

## Runtime consumer boundary

Five consumer-source hashes were freshly verified unchanged against the accepted 2018 checkpoint. This batch reuses that selected-line review and mapping; it is not another full repository reread.

| Consumer | Required evidence | 2019 transaction-workbook fit |
| --- | --- | --- |
| Current NO03 / NO04 / NO05 institutional factors | Identity-matched latest eligible adjacent-quarter ownership percentages | Not supplied. Transaction quantities are not reported ownership balances or percentages. |
| FII Holding dashboard | Freshly fetched reported ownership percentage, with historical labeling where applicable | Not supplied. Displaying a dated reported value is distinct from eligibility for a current factor. |
| NO08 / five-day FII cash flow | Current NSE market-wide cash evidence for five verified completed sessions | Not supplied by historical transaction records; no DII cash series. |
| OHLCV / EPS / P/E / selling targets | Valid market bars and dated company financial inputs | Not supplied by transaction RATE, QUANTITY and VALUE. |
| Historical FPI research | Agreed identity, instrument/exchange, revision and availability contracts | Candidate source after validation and approved normalization; no importer exists from this audit. |

The stock-selection manifest is metadata, not transaction ingestion. The legacy fixed June 8 institutional snapshot remains a separate, unapproved correction. No ranking weights or risk gates changed.

## Accepted coverage and verification

The immutable baseline plus sequential accepted updates now accounts for:

- **171 assets:** 115 reviewed, 16 partial, 39 inventory-only and one corrupt.
- **592 immediate ZIP members:** 497 reviewed, zero partial and 95 inventory-only.
- **Monthly-FPI family:** 36 reviewed archives, 37 inventory-only workbooks and corrupt `2021_06.zip`.
- **This batch:** twelve asset/member upgrades only. Missing June 2018, other unread families and partial PDFs gain no coverage credit.

Root reconciliation passes **637 grouped comparisons** covering all twelve source/member/package hashes, row and cell counts, field types, date distributions, reporting lags, code histograms, exact decimal controls and the bounded duplicate/ISIN diagnostics. Comparison labels are recorded in the independent evidence. Primary product-minus-value residual signs are explicitly inverted when compared with root value-minus-product results. Grouped dictionaries count as one comparison each. Root acceptance passes **169 checks**, including fresh original archive hashes, evidence pins, ordered coverage replay, documentation totals and exact seven-file scope. Final GitHub ref/tree/blob publication must be verified separately.

No application regression test, provider-account test, Mongo persistence check, Render release or trading acceptance test is claimed for this documentation/data-review batch.

## Next action

Continue the remaining monthly-FPI workbooks, beginning with preserved 2020 archives, then scope the other derived sources and partial PDFs. Missing June 2018 acquisition and corrupt archive replacement remain separate source recovery tasks. The live priority remains exact Mongo timeout diagnosis, protected consistent backup and isolated restore, separately approved cleanup/growth prevention, and an agreed Render release. This historical review does not satisfy or bypass those gates.
