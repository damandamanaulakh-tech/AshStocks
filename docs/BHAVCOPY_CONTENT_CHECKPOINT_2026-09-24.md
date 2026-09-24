# Bhavcopy, equity snapshot and position-limit content checkpoint

Date: 24 September 2026. Read-only review against `edc22309d60311e46b115a7bc60103dbd1016e51` on `codex/valuation-targets-market-refresh`.

All six CSV members of `BhavCopy_NSE_FO_0_0_0_20260608_F_0000.csv.zip` were fully read: **86,615 data rows and 2,808,822 fields**. The [machine-readable evidence](../data/asset-review/bhavcopy-content-evidence-2026-09-24.json) includes per-member hashes, original schemas, missingness/numeric profiles, strict CSV verification, exact arithmetic checks, dated source references and consumer limits. No source, application runtime, universe, Mongo record, deployment or trade was changed.

This completes content reading of this archive, not the overall asset review or live data wiring. Historical presence is not current provider readiness, source authority or permission to import. Both equity copies remain preserved.

## Scope and integrity

The archive has one directory and six data files. Its **2,679,420 bytes** and SHA-256 `81341ff03db112396a09711b22dc352984f67b8bfb5a712ba6f71e3529b17757` match release asset ID `495311445` in the [pinned inventory](../data/asset-review/backenddata-release-inventory-2026-09-24.json). All members were consumed through ZIP CRC verification. Every member path below begins with `BhavCopy_NSE_FO_0_0_0_20260608_F_0000.csv/`.

| Member | Data rows | Columns | Distinct symbols |
| --- | ---: | ---: | ---: |
| `BhavCopy_NSE_FO_0_0_0_20260603_F_0000.csv` | 39,115 | 34 | 216 |
| `BhavCopy_NSE_FO_0_0_0_20260608_F_0000.csv` | 40,604 | 34 | 216 |
| `fopl_jun2026.csv` | 211 | 4 | 211 |
| `mpl_jun2026.csv` | 211 | 2 | 211 |
| `sec_bhavdata_full_08062026 (2).csv` | 3,237 | 15 | 3,237 |
| `sec_bhavdata_full_08062026.csv` | 3,237 | 15 | 3,237 |

Bundled spreadsheet-tool imports consumed every used data cell. Independent Python `zipfile` and strict `csv.reader` checks agreed on member SHA-256, row/column/blank counts and derivative group sums. They found no malformed row widths, duplicate headers or invalid filled dates. Declared keys have no duplicate rows. Both readers independently found zero differing equity cells after whitespace and numeric normalization. These are content checks, not application regression tests.

## Historical equity and the requested stocks

The two equity files contain the same 3,237 date/symbol/series keys and semantically equal values across all 15 columns. They are **not byte-identical**; number formatting and whitespace differ. No duplicate is deleted or selected for production here.

On **8 June 2026**, each contains 2,446 `EQ` rows and 791 rows across other series, all retained in the audit. EQ alone is not an independently verified company-only membership filter. All 12 requested symbols occur as EQ rows: `BBL`, `LATENTVIEW`, `JWL`, `RAILTEL`, `KEC`, `TRANSRAILL`, `GODFRYPHLP`, `BSOFT`, `ZENSARTECH`, `RHIM`, `SURYAROSNI` and `THERMAX`. The existing dated valuation assumptions confirm the intended Transrail spelling `TRANSRAILL`. This does not prove current Upstox identities, today's saved universe, Mongo persistence, holdings or new additions.

There are 2,980 comparable delivery pairs in each copy: no quantity exceeds traded quantity and no recomputed delivery percentage differs by more than 0.011 percentage point. The other **257 delivery quantity/percentage pairs are missing markers**, not zero delivery. `DELIV_PER` uses a 0–100 scale; `TURNOVER_LACS` retains its declared lakh units. A single date cannot fill a 20D/60D lookback or verify fundamentals/EPS/P/E.

## Derivative quality and corporate-action boundaries

The derivative snapshots are **3 June and 8 June 2026**, five calendar days apart, not proof of consecutive trading-session coverage. All 39,115 earlier instrument IDs appear later, alongside 1,489 additional IDs. Do not label a difference between these snapshots as a one-day change in OI.

June 3 has 25,605 zero-volume rows and June 8 has 26,426. These equal the counts with all open/high/low prices zero. Active-volume rows have no zero open/high/low and no high-below-low condition. Preserve the inactive records; they are not equity OHLCV bars to repair or feed indiscriminately into the stock scanner. ISIN is blank throughout both derivative files. Ninety-seven rows per date have OI not divisible by the row's current lot size; this diagnostic alone does not establish corruption or its cause.

Across shared IDs, 468 rows change strike and/or lot attributes. Exact Decimal checks reproduce every change, with zero arithmetic mismatches, under these dated notices:

| Symbol | Changed rows | Consistent adjustment | Primary source |
| --- | ---: | --- | --- |
| TRENT | 109: 106 options, 3 futures | Lots ×1.5; option strikes ÷1.5 with nearest 0.05 diagnostic rounding; June lots 150, later lots 225 | [NSE FAOP74486, 1 June 2026](https://nsearchives.nseindia.com/content/circulars/FAOP74486.pdf) |
| BANKBARODA | 163 options | Strikes −₹8.50, lots unchanged; effective 5 June | [NCL CMPT74187, 13 May 2026](https://www.archive.nseclearing.in/content/circulars/CMPT74187.pdf) |
| HDFCAMC | 196 options | Strikes −₹54, lots unchanged; effective 5 June | [NCL CMPT74497, 2 June 2026](https://nsearchives.nseindia.com/content/circulars/CMPT74497.pdf) |

This is observed arithmetic consistency, not a complete point-in-time contract-master validation or authority to rewrite historical prices. The TRENT [clearing notice CMPT74492](https://nsearchives.nseindia.com/content/circulars/CMPT74492.pdf) has a source-text discrepancy: its extracted options paragraph says factor 2, while the stated factor and worked examples use 1.5. The exchange notice explicitly states 1.5. Keep the discrepancy and require the dated contract master before an importer applies adjustments. PDF text was inspected; screenshot attempts failed with cache misses, so no independent visual confirmation is claimed.

The official [NSE format page](https://www.nseindia.com/static/resources/forms-formats-members) exposes a UDiFF formats workbook, but retrieval failed: unsupported web content type, then HTTP/2 failure and a bounded HTTP/1.1 timeout. Its contents were not inspected. The exact derivative volume/OI/turnover unit contract remains `SOURCE_REQUIRED`; the linked 30 June version also needs applicability checked against these earlier files. Group totals in the evidence are arithmetic checks only, not comparable cash flow or a production PCR/long-buildup signal.

## FPI limits are not FPI purchases

The two June position-limit tables match on all 211 symbols. Their three category limits divided by MWPL are approximately 30%, 20% and 10%, with no ratios above those comparators. This is consistent with the dated [NCL CMPT70271 notice](https://nsearchives.nseindia.com/content/circulars/CMPT70271.pdf), effective 1 October 2025. Exact source rounding and completeness of subsequent regulatory changes are not certified. These are **permitted-position limits**, not actual ownership, buying/selling flows or independent ranking evidence.

## Runtime connection map

| Existing consumer | Observed role | Remaining contract |
| --- | --- | --- |
| `ashstocks/data/nse_fo_bhavcopy.py::parse_nse_fo_bhavcopy_csv` | Schema mapping/coercion with dataframe and summary; no named runtime caller found in bounded Python/JS search | Units, as-of contract identity, strict rejection, duplicate/session/freshness handling and explicit caller tests |
| Catalog `NO10` | `price_up and OI_up and 0.8 <= PCR <= 1.3`; `FNO_FEED_REQUIRED`; no explicit tunnel evaluator branch found | Current per-stock/expiry PCR, price and OI definitions; compatible units and as-of inputs |
| Selection `foOi` | Snapshot annotation/confirmation, score weight zero | Validated `oiRegime`; file-wide OI sums do not supply it automatically |
| Selection `fpiMwpl` | Audit-only deterministic ratio, score weight zero; library emits `FPI_MWPL_PROFILE_UNVALIDATED` | No promotion of position limits into holdings/flow evidence |
| Catalog `NO07` and `NO09` | Stock delivery own-60D and participant net index-futures 60D, respectively | One-date delivery and whole-market contract OI cannot substitute for these distinct histories |

Source inspection is bounded; lack of a named caller does not rule out every generic loader. Static availability metadata is not proof of a refreshed feed. No adapter, score, threshold or readiness status was changed by this review.

## Coverage acceptance and next work

The [coverage overlay](../data/asset-review/content-coverage-progress-2026-09-24.json) accepts exactly six `inventory_only` → `reviewed` member upgrades and this archive's matching transition. Sequential replay against the immutable baseline yields **171 assets: 79 reviewed, 22 partial, 69 inventory-only and one corrupt; 592 immediate ZIP members: 429 reviewed, six partial and 157 inventory-only**. Cumulative member upgrades are 124. Evidence retains the pre-acceptance overlay digest as historical provenance.

`FO.Gold.COmm.zip` gained only header sampling, not a content upgrade. Parallel monthly-FPI/2018-workbook/AM07 assignments stopped on worker usage errors without completed evidence; none is counted. Full asset review remains open. The spreadsheet audit skill guided full-cell and missingness checks; the code-review skill guided the consumer-path distinction. No source-provided code, server or provider API was executed.

Next: continue remaining asset batches and settle unit/identity/contract authority before proposing any importer. Production priority remains a verified Mongo backup/isolated restore, actual failure evidence, separate approval of scan-storage changes and an agreed Render release target. `sample_mflix` ownership and last application use remain unresolved; its observed load request does not authorize deletion. The [nine-phase goal](ACTIVE_GOAL_PHASES_2026-09-24.md) remains active.
