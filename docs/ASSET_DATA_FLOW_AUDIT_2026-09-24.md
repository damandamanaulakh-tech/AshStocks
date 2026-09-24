# Phase 1A: Backenddata asset integrity and runtime connection audit

Date: 24 September 2026. Scope: read-only review; no Mongo import/deletion, no Render change, no raw asset modification.

## Verified inventory and reading scope

- Live GitHub release `Backenddata`, ID `362381967`: 171 assets, 1,578,878,073 bytes. Complete assets pagination checked, including the empty final page.
- Every live asset ID/name/size/digest agrees with the preserved `GITHUB-ASSETS-2026-09-07.json` manifest. Every one of the 171 local raw assets was freshly hashed and its byte size checked; no missing/extra files or size/SHA-256 mismatches.
- Top-level types: 116 ZIP, 14 XLSX, 13 XLS, 15 PDF, 11 CSV, one JSON and one HTML.
- 115 ZIP archive directories opened successfully, with 592 immediate file members. These counts are not recursive workbook-sheet counts or proof of every member's CRC/content validity.
- `2021_06.zip` cannot be opened as a valid archive directory (`BadZipFile`) even though its bytes agree with the published checksum. Preserve the original and exclude it from ingestion pending recovery/replacement.
- All 532,977 rows of the principal OHLCV CSV family were structurally parsed; selected other CSVs were scanned for coverage/missing fields. Representative headers/rows were inspected for other families.
- **Not completed:** every member's full row validation, XLS/XLSX cell reading, PDF/HTML content reading, point-in-time/corporate-action verification, authoritative identity resolution, full date/units reconciliation and runtime integration.

Machine-readable release inventory: [`backenddata-release-inventory-2026-09-24.json`](../data/asset-review/backenddata-release-inventory-2026-09-24.json). The preserved local copy was used to avoid downloading identical 1.58 GB again; live release checksums establish byte equivalence, not upstream financial accuracy.

## Reverified historical data and suitability

| Asset / member | Current read evidence | Required handling before use |
| --- | --- | --- |
| `Back.Test.Claude.zip` / 191 stock CSVs | 532,977 rows, 2014-06-30 through 2026-07-17; all CSV rows parsed for finite values, dates, OHLC bounds, negative volume and duplicate dates | Quarantine the invalid 2024-08-30 row in `IDEA.NS.csv`, volume -81,259,416. Do not silently repair. Resolve identities and corporate-action/adjustment basis. Only BSOFT among the twelve user-named stocks is represented in this family. |
| `AM.07.Parameter.Files.zip` / `Index_daily_15Y.csv` | 3,676 distinct dates, 2011-06-08 through 2026-06-05; NIFTY, Sensex, India VIX and Bank NIFTY OHLC | Historical baseline only. Sensex has 6 missing dates, VIX 17, Bank NIFTY one. Fresh provider observations are still necessary. |
| `delivery_batch_check_v0_1.zip` / `nse_volume_delivery_16stocks_eq_merged.csv` | 32,201 rows, 16 stocks, 2,477 dates, 2016-02-02 through 2026-06-08 | 26 missing delivery quantity/percentage pairs. Sample breadth is explicitly not market-wide NSE breadth. |
| `volume_derivatives_review_v0_3.zip` / `fii_dii_cash_full_history_clean.csv` | 3,770 dates, 2007-01-06 through 2022-12-08 | Stale historical overlay; reconcile date conventions/provenance and units before computing rolling signals. Initial derived windows have missing values. |
| `fii_derivatives_cash_review_v0_2_csv_pack.zip` / `fii_dii_cash_flow_2012_2023.csv` | 2,340 dates, actually 2014-01-01 through 2023-07-17 | Filename overstates coverage; retain actual parsed coverage. |
| Same archive / `pwoi_participant_oi_wide_2012_2023.csv` | 2,791 dates, 2012-01-02 through 2023-04-27 | Roughly 919-922 missing values in certain short/total fields; unknown is not zero. Full duplicate/unit/session reconciliation remains open. |
| Root `fii_symbol_daily.csv`, `fii_daily_aggregate.csv`, `fii_entity_daily.csv` | 89,931 / 905 / 647,249 rows; 905 distinct dates spanning 2009-01-01 through 2020-12-31 | Discontinuous historical transactions/aggregates, not continuous twelve-year daily history or current quarterly ownership. Map actual identities. |
| AM07 / `n200_live_report.csv` | 198 symbols with financial ratios and trailing EPS/P-E; 12 rows missing core fundamentals despite `sb_fetch_status=ok`; 15 missing trailing P/E | No reliable observation-date field. Do not treat as current EPS/P-E inputs without sourced verification. |
| AM07 NSE/BSE gzip instrument JSON | 86,140 NSE records, including 9,395 NSE_EQ; 27,089 BSE records | Multi-segment records, not approved ordinary-company universe. Use current official NSE membership and exact ISIN mapping. |
| F&O/bhavcopy/participant reports | Representative headers confirm derivatives OHLC/OI/turnover, options CE/PE and June 2026 snapshots | Family-specific parser required; do not coerce derivatives into equity candles or institutional shareholding percentages. |
| `master_30000_stock_list.csv` | All 30,000 symbols are `STOCK_*` placeholders | Preserve raw file; exclude from production universe and analytics. |
| `aqu.zip` | Contains unrelated MNIST digit datasets | Exclude unrelated members from market ingestion; preserve source archive. |
| Sampled monthly archives (`2009_1`, `2014_4`, `2021_03`, `Jun_2023`) | FPI transaction-level reports with differing formats/date styles | Not daily equity OHLCV; do not trust archive titles as a schema. |

This table records the inspected material, not a declaration that every asset has been read or adopted. Undated/stale data may still be research-useful but cannot clear current-market readiness checks.

## Actual Node runtime connection map

| Data product | Current producer/transform/store/consumer | Gap or integration gate |
| --- | --- | --- |
| Release catalog | `server-stock-selection-patch.mjs:10` reads `config/release-data-manifest.Backenddata.json`; counts are embedded in parameter audit metadata | No ZIP/CSV history is ingested by this path. |
| Separate release-vetted selector | `/api/stock-selection/evaluate` calls `selectTradeInCandidates`; source: `server-stock-selection-patch.mjs:39` | Separate endpoint, not the automatic buying selector. Adopting it as execution authority requires explicit strategy discussion, not merely connecting another file. |
| Fresh company universe | `server-official-nse-master-patch.mjs` -> official sources/identity validation -> `saveUniverseMetadata` -> `app_state.state.universe` and revision | Metadata only; does not supply historical candles or all-stock fundamentals. |
| Scanner candles | Upstox historical fetch in pinned base server, OAuth token substitution, pacing in `server.js`, `runUpstoxScanner` -> `runScanner` | Approximately 470-calendar-day provider window; no canonical asset-backed history store/provider found. |
| Saved batch rotation | `server-universe-rotation-patch.mjs:56` -> saved universe/settings/holdings -> filtered batch -> scanner -> scan ledger -> committed cursor | Already implemented, not yet deployed to the public commit observed today. Any new provider must preserve this sequence and failure semantics. |
| Automatic paper engine | `server-paper-engine-autobuy-patch.mjs:358` -> committed selection scan -> latest state -> `buildPaperTraderPlan` -> fresh quote/depth checks -> lifecycle -> saved state | This is the actual automatic buying path; do not substitute the separate research selector without an agreed policy change. |
| Institutional evidence | `server-upstox-institutional-patch.mjs` -> configured provider URLs -> normalization -> process-memory caches -> first 12 scanner rows / UI route | Endpoint availability/current schema remains unverified. No durable historical asset adapter found. |
| Market displays | Top dashboard strip uses Upstox (`app.js:1074`); separate `/api/market-context` uses Yahoo chart data and a paper-ranking breadth proxy | Distinct providers. A working top strip does not prove separate cards work; ranking breadth is not daily exchange breadth. |
| Valuation | Dated seed + saved reviewed assumptions -> `lib/valuation-targets.mjs` -> explicitly activated target -> lifecycle monitor | No general all-stock financial importer. Missing/unreviewed values must remain explicit. |
| Pre-rise | Compiled config + tracker are injected into scanner by `server-pre-rise-pattern-patch.mjs` | Compiled evidence is connected; raw research CSVs are not a runtime data source just because the tracker exists. |
| Q1/Python/older UI | Separate research output files and compatibility modules; `index.html` loads current `app.js` | Do not activate all historical scripts. Map required data products to the active Node path while preserving reference implementations. |

## Newly identified bounded fixes, not implemented in Phase 1A

1. **Institutional failed-result retry:** `app.js:1135-1139` skips any symbol with an existing institutional object; failure objects are stored at `1162-1167`. Add status-aware retry/expiry with tests, not credential replacement.
2. **Institutional freshness/completeness:** `server-upstox-institutional-patch.mjs:158-190` may label partial rows as five-day totals and market LIVE when only one side has rows. Align dated sessions, require honest coverage labels and distinguish partial/stale/unavailable without changing strategy thresholds.
3. **Market missing-input truthfulness:** `server-market-context-patch.mjs:51-68` can treat absent VIX change as zero and describe volatility as easing even when the card failed. Unknown values must remain unknown; test all/partial feed failure.
4. **Mongo growth investigation:** `scan_ledger` records both rotation and engine views of a fresh scan. Measure size/growth and purpose before considering redundant payload reduction. Audit records are not pre-authorized deletion targets.
5. **Capacity-aware history design:** application state is a single Mongo document. Do not put the entire archive into `app_state`; design bounded keyed history storage only after measuring capacity and discussing any infrastructure expansion.
6. **Deployment proof:** live health reports old commit `226e1394d5af3f0c380593d58917b8d2ee5c13e8`. Existing live verifier does not assert an expected SHA; add exact-version proof before calling release complete.

## Next small batches

- 1B: reproducible bounded OHLCV parser and rejected-row/coverage dry run, plus remaining workbook/member inventory. No production import; establish identity and adjustment limitations.
- 2A: scoped authenticated Mongo resource/collection diagnostics and recovery/cleanup proposal. If access is missing, report it; do not infer an alarm cause from archive file size.
- 6A (after prerequisites): targeted DATA_NEEDED retry/freshness/unknown handling with regression tests and unchanged thresholds.
- Later: approved canonical history persistence/provider and current-data adapters; source -> stored read-back -> actual consumer contract tests; then live acceptance.

## Verification and preservation record

This batch only adds plan/audit documentation and a public release inventory. Validate JSON schema/count/bytes/digests/unique IDs and names, referenced paths, whitespace and exact publication blob/tree/ref. No application test rerun is claimed for this documentation-only batch. Raw V01, runtime code, `main`, deployed settings, Mongo collections and portfolio state are unchanged. Goal stays active; Phase 1 as a whole is still incomplete.
