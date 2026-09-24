# Derived delivery context checkpoint

Date: 24 September 2026. Read-only source review against `c2a99bf97128d645eb1891e474743b522c9e26a6`.

The seven previously unread CSV members of `volume_delivery_batch_check_v0_1.zip` have now received a complete row-and-field review. The [evidence JSON](../data/asset-review/derived-delivery-context-evidence-2026-09-24.json) records **5,036 newly reviewed data rows and 69,770 fields**, including 800 empty fields. The archive's previously reviewed 32,201-row merged delivery table was also fully reread for independent arithmetic checks; it is not counted as another new coverage upgrade.

This completes serialized-content coverage of this one eight-file archive. It does **not** establish a current feed, a complete NSE universe, source-authoritative strategy definitions or trading readiness. No raw/V01 files, runtime, database, universe, portfolio or deployment were changed. After independent review, the coverage overlay accepts the seven proposed member upgrades and the archive's `partial` → `reviewed` transition. The evidence's proposal/overlay flags and prior overlay hash describe its preparation-time inputs; they are retained as historical provenance, not asserted as the post-acceptance overlay state.

## Exact coverage and source integrity

The 1,774,201-byte archive matches the [pinned release inventory](../data/asset-review/backenddata-release-inventory-2026-09-24.json): SHA-256 `cb8f516e21f7cac8c18b28b540035573b6277e4ea3540b902a2d9fa24c8d0061`. Every member was read through ZIP CRC verification. There is one directory entry, eight CSV files and no producer code, README or executable formula definition.

All member paths below start with `volume_delivery_batch_check_v0_1/`.

| Newly reviewed member | Data rows | Columns |
| --- | ---: | ---: |
| `industry_coverage_summary.csv` | 9 | 3 |
| `mini_delivery_trigger_counts_16stocks.csv` | 2,477 | 7 |
| `mini_market_internals_16stocks.csv` | 2,477 | 21 |
| `readiness_status.csv` | 11 | 3 |
| `source_file_summary.csv` | 30 | 7 |
| `symbol_coverage_summary.csv` | 16 | 7 |
| `symbol_industry_map.csv` | 16 | 2 |

All 82 rows of the five small summary/map files are retained in the evidence. Larger files retain exact identities, schema, full-scan profiles and calculation checks rather than duplicating their raw contents. Every parsed row has the expected width. Declared per-file keys have no duplicates; numeric fields have no invalid or nonfinite values. Missing data is retained, not coerced to zero by the audit.

The merged source SHA-256 is `03c8a3814e6eb00d3c9fd14e1f93f26decedb87121f2070933a2b622e7fc0e88`. Its [earlier duplicate-context evidence](../data/asset-review/duplicate-context-evidence-2026-09-24.json) and [prior raw-to-merged comparison](../data/asset-review/additional-asset-evidence-2026-09-24.json) remain the authority for byte-identical reuse and upstream reconciliation. Those upstream raw files were not reopened in this batch.

## What the source really covers

The tables cover 2,477 observed dates from **2 February 2016 through 8 June 2026**, ending 108 calendar days before this review. There are 16 symbols across the entire history, nine assigned industry groups, but **exactly 13 symbols per date**. BAJAJFINSV, M&M and TCS occur only in the earlier segment; BAJFINANCE, ICICIBANK and ONGC occur only in the later segment. The other ten symbols span both segments with a 128-calendar-day observation gap. Industry assignments are supplied mappings, not independently verified point-in-time classifications.

All symbol-row counts, date bounds, missing-delivery counts and average delivery percentages reproduce from the merged table. Industry counts and symbol membership also reconcile. Source-summary claims total 41,112 raw rows and 37,155 EQ rows; subtracting 4,954 claimed repeated EQ rows gives 32,201 merged rows. Thirty source filenames are declared, but only 26 appear in retained merged rows. Four unsuffixed labels are absent while corresponding suffixed labels remain. This reconciles stored summary claims; it is not a new inspection of the original 30 files. In particular, `files_received = 30` does not mean this derived ZIP physically contains 30 files.

Units must remain distinct: delivery percentages use a **0–100** scale, while breadth, return and count-percentage fields use **fractional units**. Turnover is rupees based on the previously reviewed upstream header, not crore. Traded and deliverable quantities are neither institutional cash flows nor ownership percentages. Saved `PASS`, `HOLD` and `MISSING` readiness labels are source claims, not runtime acceptance decisions.

## Recomputed arithmetic and material limitations

The saved internals reproduce from the merged table using per-symbol stored-close returns, sample-standard-deviation dispersion (`ddof = 1`), daily quantity/value sums, delivery/trade means, quantity-share Herfindahl concentration and five-observation tail fractions. Missingness was checked as well as values across all 2,477 rows. Default absolute tolerance is `1e-10`; turnover uses `0.0001` rupee to accommodate binary summation error, whose maximum observed difference is about `0.0000611` rupee. These are **inferred reproducing transformations**, not recovered original producer code.

Four limitations prevent promotion into live signals:

1. **Observation windows are not continuous session windows.** On 9 June 2021, the saved “1-day” equal-weight return is **+16.3776653%**: it averages ten returns from previous stored closes on 1 February, 128 calendar days earlier. The same 13 rows' own `prev_close` fields produce a diagnostic mean of **−0.8928271%**; this contrast is not an approved replacement or independently verified daily return. Three incoming symbols lack prior stored observations, yet breadth divides by all 13 symbols: eight positive returns become 8/13 instead of 8/10. Five-observation tails have the same missing-return denominator issue during the first five dates after the gap. The 10-observation damage cluster also crosses that gap. Calendar, reset, warmup and membership contracts are required.

2. **Missing delivery becomes a saved zero aggregate.** All 13 delivery quantities and percentages are absent on 28 January 2019 and 13 April 2020. Average delivery percentage and delivery concentration remain blank, but saved `total_delivery_qty` is zero and both trigger counts are zero. That is not evidence of zero actual delivery or a valid absence of a signal. The merged source retains 26 missing delivery pairs and 28 delivery-percentage discrepancies exceeding 0.011 percentage point when recalculated from quantities; no repair is applied.

3. **Calibration is not proven point-in-time.** All q90 and q95 damage flags reproduce with inclusive comparisons against full-sample tail thresholds **0.3846153846153846** and **0.5384615384615384**. Strict `>` comparisons disagree on 104 and 53 dates respectively. This is a full-sample reconstruction and a potential future-information-leakage concern—not proof that the original producer fitted the entire sample. No estimation timestamp or training-only contract is supplied. The trailing-10 count of q90 fires reproduces the cluster, but both one-observation and ten-observation minimum-window settings fit the saved outputs, so the warmup contract is not identifiable. Initial missing tails have zero damage flags, conflating unavailable input with no signal.

4. **Delivery-trigger generation is unresolved.** Saved distribution/accumulation counts sum to 870/843; maxima are 7/8 stocks per date. Every count fraction equals count/13, but no stock-level trigger flags or producer definition are provided. Both sides first fire on the seventh observed date, 10 February 2016. Twenty-four straightforward high-delivery/return candidate checks failed exact reproduction; these exploratory checks establish no alternative formula. The trigger definition, timing and warmup remain `SOURCE_REQUIRED`.

No corporate-action adjustment provenance is supplied. Extreme stored-close returns or source filenames are not sufficient to infer an adjustment policy, authoritative identity or provider acceptance.

## Consumer mapping and decision

| Existing consumer | Required contract | What this archive can support |
| --- | --- | --- |
| Catalog `NO07`, Delivery Percentage Spike | Own 60D delivery p80 threshold and positive CLV; readiness `NSE_DELIVERY_FEED_REQUIRED`. No explicit NO07 evaluator branch was found. | Historical per-stock research input only. Aggregate sample-trigger counts cannot satisfy this stock-specific contract. |
| Stock-selection library `DELIVERY_20` | `deliveryPercentile20 >= 0.75`, positive return1d; optional coverage-limited confirmation with score weight zero. | A different 20D contract, not NO07's own-60D rule and not a demonstrated producer of these saved counts. No field was wired by this review. |
| `B15_P016` up-volume/down-volume | Last 20 OHLCV volume buckets against prior closes; requires 21 candles. | Conceptual volume-source overlap only. The evaluator does not read deliverable quantity or this archive's aggregate trigger counts. |
| Market-internals research | Explicit sample membership, session continuity, missingness and as-of calibration. | Reproduction/parser fixtures with these limitations retained; not market-wide proof or a current buy signal. |

The mappings come from the current [parameter catalog](../data/parameter-catalog-175.json), [tunnel evaluator](../server-parameter-tunnel-patch.mjs), [stock-selection configuration](../config/stock-selection-parameters.v0.1.json) and [selection library](../lib/stock-selection-engine.mjs). Searches for the derived filenames and signal-field names in repository code/docs found only historical documentation references, not named runtime wiring or producer code. That bounded search does not rule out every possible generic loader.

## Validation and next boundary

The spreadsheet skill guided complete CSV reads and preservation of original values. Local Python independently reconstructed aggregates and flags; a separate bundled spreadsheet-tool pass consumed every used cell of all eight CSVs and agreed on member identities/counts, the gap example, missing-delivery example and inclusive quantile reconstruction. No supplied code, application regression suite, server, provider API or Mongo query was executed for this evidence batch.

Accepted coverage changes are limited to these **seven members**, with the already-reviewed merged member retained as such. The [coverage overlay](../data/asset-review/content-coverage-progress-2026-09-24.json) now leaves this archive with eight reviewed members and none unread. Independent sequential replay against the immutable baseline reconciles **171 assets: 78 reviewed, 22 partial, 70 inventory-only and one corrupt; 592 immediate ZIP members: 423 reviewed, six partial and 163 inventory-only**. Cumulative member upgrades are 118. All prior evidence hashes and pre-acceptance input pins validate. Neighboring delivery packs, AM07 siblings and other assets gain no coverage from this review.

Before any import or activation, agree the source/identity and adjustment authority, gap and missingness behavior, units, exact trigger contracts, and point-in-time threshold policy; then perform an authorized bounded dry-run, deduplication/readback and consumer-level verification. This checkpoint supplies neither import authority nor a claim that the dashboard's pending data is now connected.
