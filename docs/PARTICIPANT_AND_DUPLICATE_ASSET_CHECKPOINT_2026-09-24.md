# Participant snapshots and duplicate-context checkpoint

Date: 24 September 2026. Source review against `3ad1177353615eac831035803c11f4ee9140a54f` on `codex/valuation-targets-market-refresh`.

This bounded evidence batch completes content coverage for **42 participant-report CSV members** and accepts **five context-confirmed duplicate member upgrades**. The accepted ledger now records **77 of 171 top-level assets** and **416 of 592 immediate ZIP members** as reviewed, with the limitations below. It does not establish that all repository data is read or ready for trading.

Only audit JSON and documentation are changed in this batch. No raw/V01 asset is modified or deleted, no data is imported, and no runtime, score, hard gate, universe, portfolio or provider setting is changed. Mongo diagnosis and the previously approved [formula-correction checkpoint](FORMULA_PARITY_CORRECTION_CHECKPOINT_2026-09-24.md) are separate work; their actions and test results are not attributed to this evidence batch.

## Participant reports: complete content read, sparse history

The [participant evidence](../data/asset-review/participant-snapshot-evidence-2026-09-24.json) covers every member of all 21 `Reports-Archives-Multiple-*.zip` assets. Each whole ZIP matches its pinned release size and SHA-256. All 42 member byte streams were read through CRC validation, and every CSV body row and field was consumed.

- **210 data rows:** 168 rows for the four categories `Client`, `DII`, `FII` and `Pro`, plus 42 `TOTAL` controls. There are 2,940 numeric cells and 3,150 data fields including category labels.
- **21 distinct report dates:** 13 November 2025 through 3 June 2026, across 203 calendar days. The largest adjacent gap is 32 days. Archive names, member names and explicit preamble dates agree for all 42 files.
- **One schema:** 15 columns after header whitespace normalization. All 42 double-quoted title lines fail strict CSV parsing as ordinary table records; preserve them as report metadata and read the real header from line 2. Every five-row body parses correctly.
- No duplicate member hashes or report-kind/date keys were found. Body numeric fields contain no missing, invalid, negative or fractional values. Genuine zero counts remain zero.

All original aggregate source rows, headers and preambles are retained in the evidence. No private investor or transaction records are included.

### Arithmetic findings

Each file was checked in three directions: six product components against each row's long/short total; four participant categories against the published `TOTAL` for each field; and long versus short on each published aggregate product pair.

| Check | Open interest: 21 files | Trading volume: 21 files |
| --- | ---: | ---: |
| Row-side component sums differing from stated totals | 45 of 210 | 0 of 210 |
| Four-category sums differing from published `TOTAL` | 35 of 294 | 0 of 294 |
| Files with either kind of residual | **21 of 21** | 0 of 21 |
| Published `TOTAL` long/short pairs that disagree | 0 of 147 | 0 of 147 |

Every nonzero component/category residual is **exactly +1 or -1 contract**. Their cause is unresolved; no rounding explanation, acceptable tolerance or repair has been established. Published `TOTAL` pairs balance, but sums of the four categories' net positions fail to equal zero in 29 product/total comparisons. Preserve both the reported values and the independently calculated residuals. Do not silently repair the report or add `TOTAL` as a fifth participant.

The two previously audited root June 8 OI/volume files were reread separately. They use the same schema and contract units, are not byte duplicates of these 42 members, and would add only one date to the research set: 22 dates altogether. They are comparison work, not two additional newly reviewed archive members. June 8 OI retains its previously documented one-contract discrepancies; its volume table reconciles.

The earlier PWOI evidence has the same 70 flattened participant/product/side numeric fields, but its historical range ends on 27 April 2023, **931 calendar days before** the first new snapshot. That comparison reuses the [prior full-content audit](../data/asset-review/additional-asset-evidence-2026-09-24.json); the old PWOI source was not re-audited in this batch. These sparse snapshots neither bridge the gap nor repair the prior derived rounding and missing-to-zero issues.

### Consumer boundary

These are **market-wide equity-derivative contract counts**. Open interest is a dated outstanding position; trading volume is a dated flow. Neither is a stock-ownership percentage, a cash amount in rupees/crore, or a company-level buying record. Options count differences are not delta-adjusted directional exposure.

- **NO09, FII Futures Position Shift:** the FII index-futures long/short fields are potential historical inputs, but the node remains `SOURCE_REQUIRED`. Verified continuous session history and the precise 60-day change/z-score window, timing and missingness contract are not established. Twenty-one sparse snapshots, or 22 with June 8, cannot be relabeled as a continuous 60D window. The diagnostic weekday gap list is not an official NSE session calendar.
- **NO03/NO04/NO05 ownership and NO08 cash regime:** these reports do not provide the required stock-specific ownership changes or five-session cash net flows.
- **NO10 price/OI/PCR confirmation:** no underlying ticker/ISIN, expiry, strike, price or lot-size linkage is supplied. Aggregate participant options counts do not establish a particular stock's PCR or long buildup.
- **Historical parser/reconciliation fixtures:** reusable with original dates, units and residuals preserved. No feed connection or rule activation is claimed.

## Five exact duplicates accepted after context checks

The [duplicate-context evidence](../data/asset-review/duplicate-context-evidence-2026-09-24.json) freshly verifies target and reference source hashes, byte-for-byte equality and prior full-content evidence pointers. The scope is **context-confirmed reuse**, with additional date/schema/quality checks—not five new unique financial datasets or automatic validation of sibling files.

| Target asset and member | Confirmed context and retained limits | Coverage result |
| --- | --- | --- |
| `AM.07.Parameter.Files.zip` — `AM 07 Parameter Files/nse_volume_delivery_16stocks_eq_merged.csv` | Exact existing delivery-table bytes; 32,201 EQ rows, 16 symbols, 2016-02-02 through 2026-06-08. Preserve 26 missing delivery pairs, 28 ratio discrepancies and inherited 128-day gaps for 10 symbols. | Member reviewed; archive remains partial. |
| `volume_delivery_batch_check_v0_1.zip` — `volume_delivery_batch_check_v0_1/nse_volume_delivery_16stocks_eq_merged.csv` | Same delivery-table bytes and limitations, not additional history or another universe. Source-file labels do not verify provider authority, ISIN identity or corporate-action adjustment. | Member reviewed; archive becomes partial, with seven members still inventory-only. |
| `FO.Gold.COmm.zip` — `FO Gold COmm/fo_report_pack_summary_2026_06_03.csv` | Two-row summary, not raw OHLCV. Referenced counts include footnotes: actual contracts are 624 futures and 12,886 options, each across two instrument types. The embedded `USED` status is a research claim. | Summary reviewed; archive remains partial. Underlying contract numeric tables are not promoted. |
| `Jan_2022.zip` — `January_Equity_2022.xlsx` | Exact standalone workbook bytes; prior full-cell read reused. Fresh context check confirms 192,103 transaction rows and January trade dates, with reporting dates extending to 7 February 2022. Declared dimension `A1` is wrong; actual range is `A1:S192104`. | Single-member archive reviewed. |
| `Oct_2023.zip` — `Oct 2023.xlsx` | Exact standalone workbook bytes; prior full-cell read reused. Fresh context check confirms 168,528 transaction rows, October trade dates and reporting dates extending to 7 November 2023. | Single-member archive reviewed. |

The monthly workbooks contain masked institutional transaction events, not equity OHLCV, company fundamentals or ownership percentages. Their value column explicitly says rupees; instrument and transaction codes remain uninterpreted. Repeated dates are expected across transactions. Month completeness, transaction-key uniqueness, economic correctness, source authority and reconciliation with Mongo are not established. Reporting availability must not be backdated to trade dates. The evidence retains counts/schema/date context, not investor/broker/transaction identifiers or raw transaction values.

For the FO summary, June 3 is a filename-derived trade-date claim; contract expiry fields are not trade dates. Its relative files were checked for structure and contract/footer counts, not promoted to fully validated price/OI/turnover datasets. AM07 and other containing packs retain their unresolved sibling content.

## Accepted coverage and provenance

The immutable [baseline ledger](../data/asset-review/remaining-content-baseline-2026-09-24.json) remains at `efb8ca934464551f6db3e32ce31cb94f0ea98cd6`. The [progress overlay](../data/asset-review/content-coverage-progress-2026-09-24.json) preserves all earlier updates and appends this batch's 47 member upgrades. Apply its updates in order; repeated asset names represent sequential member-level progress, not additional assets. Do not add baseline and overlay counts together.

| Unit | Reviewed | Partial | Inventory only | Corrupt | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Top-level release assets | **77** | 23 | 70 | 1 | 171 |
| Immediate files in readable ZIPs | **416** | 6 | 170 | 0 | 592 |

Relative to the [preceding content checkpoint](RESEARCH_AND_REPORT_ASSET_CHECKPOINT_2026-09-24.md), reviewed members increase from 369 to 416: **42 direct participant reads + five context-confirmed duplicates**. Cumulative accepted member upgrades from baseline increase from 64 to 111. Twenty-one participant ZIPs and two single-member monthly ZIPs become reviewed. The delivery-check archive moves from inventory-only to partial; AM07 and FO.Gold.COmm remain partial.

“Reviewed” establishes complete serialized-content coverage through direct reading or proven byte-identical reuse in a confirmed context. It does not certify every calculation, native workbook feature, economic interpretation, date/source authority, currentness or fitness for ingestion/trading. PDF numeric review remains partial. Corrupt `2021_06.zip` remains preserved with unknown member count. No other monthly workbook, raw contract table or neighboring member is upgraded by this checkpoint.

The overlay hashes both new evidence files and records the previous progress digest. The duplicate-context evidence intentionally retains the **pre-acceptance** progress digest `d5dea34be7ae9f3603502e8d93c225b46f6c81850a9f8e78e2d957f5e633fa4a` as a historical input, not as a claim about the updated overlay's bytes. Its “after only this batch” counts exclude the separate participant batch; the combined totals above are authoritative for this checkpoint.

## Validation and next boundary

Participant verification includes strict body parsing, complete field checks, whole-asset pins, per-member SHA/CRC and independent Node/BigInt re-reading of all 42 members to reproduce source rows and arithmetic totals. Duplicate verification includes fresh target/reference byte equality, prior evidence resolution and the bounded context checks documented in its JSON. The combined ledger is validated by replaying every update from the unchanged baseline, recounting all 171 assets and 592 members, checking accepted evidence digests and resolving local documentation links.

No application regression suite or live provider test is run for these evidence-only changes. No Mongo cleanup/import, deployment, new stock addition, current institutional signal or purchase eligibility is claimed. Remaining content review and live-data acceptance remain open. Any later import still requires agreed date/unit/identity and discrepancy policies, a bounded dry-run against existing storage, authorization, idempotent persistence, readback and consumer-level proof.
