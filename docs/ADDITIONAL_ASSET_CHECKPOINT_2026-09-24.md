# Additional asset checkpoint: macro, raw equity and institutional archives

Date: 24 September 2026. Scope: read-only historical-content audit, not ingestion, strategy activation or deployment. Raw assets and V01 remain unchanged. No Mongo or current-provider request was made.

The main result is reusable historical evidence with explicit gaps, not a fresh universe: the two raw stock packs reproduce the existing 32,201-row EQ delivery panel exactly; institutional cleaned cash files reproduce previously audited root histories; macro data ends in June 2026 and its Indian G-sec yield column is wholly empty. Some supplied institutional derivatives replace missing operands with zero and must remain outside eligible signal inputs pending review.

## Exact review coverage

Consolidated evidence: [additional-asset-evidence-2026-09-24.json](../data/asset-review/additional-asset-evidence-2026-09-24.json). It records archive/member hashes, schemas, dates, counts, duplicate links, transformation checks and limitations. All ten archive sizes/SHA-256 values match the pinned [Backenddata inventory](../data/asset-review/backenddata-release-inventory-2026-09-24.json). Member-byte reads and CRC checks are distinct from content interpretation.

| Family | Content actually interpreted | Explicit exclusions |
| --- | --- | --- |
| `5.years.for.Stocks.zip`, `15.stock.10.years.trades.zip` | All 26 and 30 CSV members, respectively; 77,251 row occurrences across 26 distinct contents | Identity periods, adjustment basis and exchange-session completeness remain unverified |
| `FO.Gold.COmm.zip` | Entire `feed9_fx_commodity_daily_15Y.csv`, 3,905 rows | Other 14 archive members not parsed in this batch |
| `delivery_batch_check_v0_1.zip` | Entire `nse_volume_delivery_16stocks_eq_merged.csv`, 32,201 rows, for reconciliation | Other seven members not parsed in this batch |
| `FII.DII.Nifty.zip`, `volume_derivatives_review_v0_3.zip`, `fii_volume_derivatives_review_v0_3_csv_pack.zip`, `fii_derivatives_cash_review_v0_2_csv_pack.zip` | 31 CSV instances representing 24 distinct contents and 113,536 rows; all stored cell content in three XLSX files/25 sheets/47,345 nonempty cells; one README | Two binary XLS members remain content-unread. Native charts, pivots, slicers, formatting, external links and recalculation were not verified |
| `IFR_FII_Cash_Stack_Test_v0_6_CSV.zip`, `ifr_fii_cash_stack_test_v0_6.zip` | Member names, byte hashes and CRC checks only, 15 files | No interpretation or validation of their strategy results, formulas or joined signals |

Across these scopes, 110 selected member byte streams were checked. Content interpretation covers 89 CSV member instances/52 distinct CSV hashes, three XLSX files and one README. These are member-instance counts containing duplicates and earlier-audit overlap, **not counts of new market observations**. This checkpoint does not claim all 171 release assets or all nested content have been read.

`FII.zip` is absent from both the pinned release inventory and the preserved raw-assets root. Its occurrence in embedded `source_file` strings is an unresolved provenance claim, not an available or verified source container.

## Raw equity and delivery: exact reuse, not another import

The raw packs contain 36,139 unique `(symbol, series, date)` keys: 32,201 EQ and 3,938 non-EQ. No conflicting numeric values were found for repeated keys. All 26 distinct file contents occur in both packs; the larger pack has four additional duplicate member occurrences. Preserve copies as provenance, not independent observations.

The 32,201 unique EQ keys match the existing merged delivery panel exactly across all 12 numeric columns after explicit Decimal/grouping-comma/missing-marker normalization: zero raw-only keys, merged-only keys, conflicting values or duplicate merged keys. This establishes no net additional EQ coverage and does not establish whether Mongo already stores it.

- Coverage is 16 symbols, not a fresh 2,400-stock universe. Ten symbols span 2016-02-02–2026-06-08 but have a 128-calendar-day gap between 2021-02-01 and 2021-06-09. BAJAJFINSV, M&M and TCS have only the earlier window; BAJFINANCE, ICICIBANK and ONGC have only the later window. Calendar gaps are not verified missing-session counts.
- There are 26 unique EQ stock-days with both delivery fields missing. On 28 stock-days across 13 symbols, supplied delivery percentage differs from `delivery quantity / traded quantity × 100` by more than 0.011 percentage points. Dates: 2019-06-17, 2019-06-18 and 2025-10-21. Differences range from about 0.0183 to 6.5687 percentage points. The tolerance is an audit diagnostic, not an approved strategy rule or automatic correction.
- No missing/nonpositive OHLC, invalid OHLC bounds or invalid volume was found in the unique EQ rows under these checks. Non-EQ series remain separate; some T0 rows fail OHLC bounds.

Potential consumer: a validated historical bar/delivery adapter. The current [selection engine](../lib/stock-selection-engine.mjs) consumes caller-supplied `deliveryPercentile20`; [parameters](../config/stock-selection-parameters.v0.1.json) make it an optional, 16-symbol-limited tie-break with zero score weight. The [evaluation route](../server-stock-selection-patch.mjs) does not load these CSVs. Do not convert this reference into an automatic entry requirement or silently connect it to the automatic paper path.

## Macro history: useful observations, missing series and instrument mapping

The macro CSV has 3,905 unique ascending weekday dates, 2011-06-08–2026-06-08, using DD-MM-YYYY. Its latest row is 108 calendar days old at this checkpoint.

| Field | Populated | Missing |
| --- | ---: | ---: |
| USD/INR, EUR/INR | 3,905 each | 0 |
| Gold, silver, US 10-year yield | 3,766 each | 139 each |
| Brent | 3,741 | 164 |
| WTI | 3,767 | 138 |
| Indian 10-year G-sec yield | 0 | 3,905 |

No invalid numeric strings were found. One WTI observation is negative on 2020-04-20; preserve it for instrument-specific interpretation, not blanket zeroing or equity-price validation. Original instrument definitions, units and yield conventions remain source claims.

The [market-context module](../server-market-context-patch.mjs) retrieves separate live Yahoo USD/INR and `GC=F` gold cards. The historical `gold_usd` column is not proven equivalent to that gold futures instrument, and no asset adapter is established here. Potential use is historical macro/regime research after mapping; this file cannot fill today's cards as live data or supply its entirely empty G-sec field.

## Institutional archives: new reference coverage and unsafe derived fields

| Source or transformation | Verified finding | Reuse/quarantine decision |
| --- | --- | --- |
| FII/DII/Nifty workbook | `Nifty Data!A1:B2359` contains 2,358 close dates, 2014-01-01–2023-07-14. Its 2,968-row Raw Data sheet equals root `fii_dii.xlsx`; the combined sheet joins only 2,339 dates. Nineteen Nifty dates lack cash dates; cash includes 2023-07-17 without Nifty. | Nifty close is an additional historical benchmark reference, not equity OHLCV/current quotes. Do not duplicate the cash source or assume the joined sheet is complete. |
| Cleaned cash CSVs | The 2,340-row table equals deduplicated root `fii_dii.xlsx`; the 3,770-row history equals root `Fii.Dii.Trading.activity.csv` under its unresolved day-first interpretation. Some 5d/10d outputs exist before full windows. | Reuse lineage, not a second import. Preserve inherited date/arithmetic issues and recompute approved gap/warmup-aware derived fields separately. |
| PWOI raw to wide | 3,078 raw rows, 2,791 dates, 287 exact duplicates. Wide keeps the date set/missingness but rounds 243 fractional source counts on 21 dates to integers, maximum change 0.5. | Preserve raw and derived separately; original count fractions and rounding policy need explanation. Participant derivative contracts are not company ownership. |
| PWOI feature and long tables | Stock-futures net is populated by zero-filled differences on 922 dates with missing operands; total net does this on 920 dates. Each direct FII index-future side has two missing observations replaced by zero. Long has 9,193 missing-operand rows with populated net/total and omits 2013-08-22. | Logical quarantine from eligible risk/buy inputs. Missing data must not become observed zero positioning. No file movement, deletion or production-rule repair occurs in this checkpoint. |
| Monthly parser output | 135 rows: 113 dated months, 21 footnotes and one undated partial June 2026 row; June is partial through June 8. | Footnotes are not observations. Keep partial period/status explicit; do not invent a full-month value/date. |
| June 2026 F&O/participant/cash snapshots | Futures sample has 624 contract rows plus one footnote, 216 symbols and two true categories, not the embedded 625/three claim. Trade date is filename-derived; row dates are expiries. The options file named PCR has only SYMBOL/CE/PE columns, no explicit ratio. | Dated derivatives/parser references only; not current cash-equity universe, live institutional feeds or stock ownership. |
| Parameter and READY descriptions | No Excel formula nodes were found, but one parameter CSV contains nine textual formula/proposal rows; its two copies are byte-identical. A workbook claims continuous cash readiness through 2026 although the clean history ends in 2022 and June 2026 is a separate snapshot. | Preserve algorithms/claims as source material. Neither READY labels nor formula descriptions authorize activation or prove current data coverage. |

Relevant runtime consumers remain separate: [institutional provider handling](../server-upstox-institutional-patch.mjs) supplies endpoint-specific market/stock evidence; [stock selection](../lib/stock-selection-engine.mjs) consumes typed inputs. No loader connects these historical archive rows to those providers or to automatic risk gates in this audit. Market cash flows, stock transactions, participant contracts, ownership and prices must not share one interchangeable schema.

## Preservation, verification and remaining review

The underlying audits used bounded in-memory ZIP reads, full selected CSV/cell scans, pinned hashes and explicit cross-source comparisons. No extraction, dependency installation, original edits, recalculation, Mongo access or current-provider verification occurred. Published evidence compacts repeated numeric-coverage/header details while retaining hashes, member status, date/key checks and transformation findings. It contains no raw investor/entity transaction samples, credentials or workstation paths. These are exploratory audit reports, not production import validators. No application regression rerun is claimed for this documentation-only batch.

Earlier completed scopes remain in [OHLCV validation](OHLCV_VALIDATION_CHECKPOINT_2026-09-24.md), [identity/root/AM07 workbook review](ASSET_IDENTITY_AND_WORKBOOK_CHECKPOINT_2026-09-24.md), and [root CSV review](ROOT_CSV_ASSET_CHECKPOINT_2026-09-24.md). Do not add their totals to this checkpoint as disjoint data: overlap is intentional.

Still open: three binary root XLS files (the two nested FII-stat XLS copies add no new decoded content); all 15 IFR-test member interpretations; other archive families, PDFs and remaining HTML semantics; a valid recovery source for `2021_06.zip`; native workbook behavior and formula correctness; historical identities/corporate actions, units/date conventions and provider authority. Asset review also does not close the exact dashboard screenshot list, current feed proof, Mongo alarm/capacity/coverage or Render deployment gates.

Next sequence: inspect existing Mongo history and capacity; agree source meaning and accepted/quarantined records; compare compound keys and provenance; only then implement approved bounded persistence and consumer adapters with read-back. Exact repeats are no-ops, conflicts remain explicit, and raw originals stay preserved. Mongo cleanup still requires the exact backup/target/impact proposal and user confirmation. The [active goal](ACTIVE_GOAL_PHASES_2026-09-24.md) remains open.
