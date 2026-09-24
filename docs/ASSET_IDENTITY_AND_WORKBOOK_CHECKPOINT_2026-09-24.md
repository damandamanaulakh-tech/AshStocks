# Phase 1C: historical identity candidates and workbook content

Date: 24 September 2026. Starting commit: `a9451d89be01e5f26702f2b57e7c69629151f5dc`.
Branch: `codex/valuation-targets-market-refresh`. This is an offline audit/tooling checkpoint, not an import or deployment.

## What was actually read

The root audit scanned all stored worksheet cells of the 14 root XLSX files, all table text in 10 HTML files carrying `.xls` extensions, and every row/field in `NSE.1991.-.2010.csv`. It found 13,069,717 nonempty XLSX cells, no formula nodes and no typed error cells. Three binary XLS files remain unread: the bundled runtime has no `xlrd`. Their signatures/checksums were inspected; that is not content reading.

Separately, all stored rows of all 18 XLSX members in `AM.07.Parameter.Files.zip` were iterated with the bundled Python/openpyxl in read-only mode. This covered 199 sheets and 2,346,322 stored non-None values, including explicit empty strings. Formula cells and cached results were read separately: 22,321 formulas, 7,517 without cached values, 14,804 with cached values, no cached error values observed. These totals include two byte-identical workbook copies; they are not counts of unique market observations. No formula was executed, recalculated or rewritten; no external link was refreshed. Cached values are not proof of calculation correctness or freshness.

The full-cell passes provide structural content coverage plus targeted semantic review of important sheets, not proof that every formula is correct, every research instruction is implemented, or every release asset has been semantically reviewed. Other archive families, PDF/HTML content outside this scope and binary XLS remain on the Phase 1 backlog.

Evidence:

- `data/asset-review/root-workbook-content-audit-2026-09-24.json`: root asset hashes, actual sheet ranges, schemas, date/numeric/missing counts and limitations. Transaction-level investor samples are deliberately omitted.
- `data/asset-review/am07-workbook-content-audit-2026-09-24.json`: archive/member hashes, all sheet structural counts, formula/cache counts and exact ranges for targeted findings.
- `data/asset-review/back-test-claude-identity-candidates-2026-09-24.json`: deterministic candidate identity report, with both input JSON hashes and inherited source/member lineage.

## Important data findings and connection decisions

| Actual source | Finding | Intended role / unresolved requirement |
| --- | --- | --- |
| Ten NSE XLSX files plus `NSE.1991.-.2010.csv` | Same 1,417 symbol labels; one price column per symbol, not separate OHLCV. CSV dates 1991-01-02 to 2010-12-31; XLSX dates 2011-01-03 to 2024-07-05. Missing prices vary substantially. | Historical single-price research candidate. Verify price basis, lifecycle and corporate actions before return calculations; never manufacture high/low/volume or use these as current quotes. Header presence is not complete history. |
| `NSE.2019.xlsx` | Actual dates continue through 2020-08-27; `NSE.2020-24.xlsx` starts 2020-08-28. | Use parsed dates, not filename years. |
| Three root FPI transaction XLSX | 168,528 October 2023, 192,103 January 2022 and 150,530 April 2023 transaction rows; ISIN, reporting/trade dates, rate, quantity and value. | Historical institutional transaction research, not ownership percentages, company EPS or equity OHLCV. Reporting date and trade date must remain distinct. Repeated dates are expected here, not duplicate transactions by themselves. |
| January 2022 FPI workbook | Declares `A1`, but actual stored range is `A1:S192104`. | Do not trust worksheet dimensions as content coverage; dimension-limited readers can silently omit almost all records. |
| Root `fii_dii.xlsx` | 2,968 rows over 2,340 dates, 2014-01-01 to 2023-07-17; 628 identical duplicate date rows, no conflicting duplicate date values found. Actual range `A1:G2969`, dimension metadata absent. | Canonical aggregate must count each date once while retaining both raw row references. This is an asset finding, not evidence of Mongo duplicates or permission to delete anything. |
| Ten HTML-XLS files | Monthly category-level FPI net investments in INR crores. | Not per-stock DII data or daily shareholding. |
| AM07 `all_filled_REVIEW_FIXED_v0_3.xlsx`, `03_UPSTOX_RAW_IMPORT!A1:V187` | 186 rows, all 2026-06-03, with `Data_Source=yfinance`, no ISIN values. | One-date reference snapshot. The sheet title does not make these verified Upstox history. |
| Same workbook, `06_STOCK_UNIVERSE_30K!A1:S199` | Only 198 candidate rows, empty ISIN/raw-file paths; `Data_Available_15Y=Y` is just a field value. | Reference list, not proof of 30,000 identities or 15-year coverage. |
| AM07 `Stock_Asset_Master_v0_8_FILLED.xlsx`, `Stock_Slots_30000!A1:T30001` | 50 filled Dhan page-derived rows; 29,950 `DATA_NEEDED` slots. Notes say delayed/page value. | Preserve source and template. Do not import empty slots as stocks or treat the 50 P/E values as fresh sourced EPS/valuation coverage. |
| AM07 `Stock_Parameter_Master_Upstox_Ready_v1.xlsx`, `05_Stock_Slots_30000` | All 30,000 symbols are `DATA_NEEDED_n` placeholders. | Design template only, excluded from universe ingestion. |
| AM07 `Opportunity_Stock_Parameter_Master_v0_6.xlsx`, `03_Stock_Slots_30000` | All 30,000 rows explicitly mark `Is_Real_Stock=false`. | Design slots only, excluded from universe ingestion. |
| AM07 Google live workbook | 501 source-list rows feed repeated-slot/Google formulas; formulas were not run. | Not 30,000 unique companies or a functioning fresh provider. |
| AM07 `Master_Compiled_Upstox_Ready_v1.xlsx`, `Upstox_Fill_Ready!A1:V3` | One RELIANCE identity/template row with `DATA_NEEDED` metrics plus instructions. | Schema guidance, not supplied quote/fundamental observations. |
| AM07 `all_filled_REVIEW_FIXED_v0_3.xlsx` and `REVIEW_FIXED_v0_3.xlsx` | Identical SHA-256. | Keep originals; do not double-count independent evidence. No deletion proposed. |

All workbook titles, embedded sources, quality flags and adjustment flags are source assertions, not independently verified authority. No new market or financial conclusion is based on these stale/template values.

## Historical identity reconciliation

`scripts/reconcile_asset_identities.py` accepts only the versioned OHLCV dry-run report and dated official-reference schema. It bounds regular-file bytes, JSON values, symbols, reference rows and diagnostics; rejects duplicate JSON keys and inconsistent count/date/provenance envelopes; and records malformed/duplicate reference identities without silently repairing them. Exact match means exact symbol text: no whitespace repair, case folding, punctuation stripping, aliases or automatic renames.

Actual result: all 191 historical candidates have an unambiguous exact-symbol candidate in the 2,279-row **13 September 2026 reference snapshot**; zero absent, ambiguous or invalid results. BSOFT is the only one of the twelve requested stocks in this OHLCV family. The wider single-price matrices contain eleven requested symbol labels, but do not supply full OHLCV or TRANSRAIL history.

An exact match does not establish which ISIN applied on every historical date, corporate-action basis, exchange session validity, current NSE membership or present tradability. The result deliberately keeps `historical_identity_verified`, `current_tradability_verified`, `activation_allowed`, `import_allowed` and `production_import_ready` false. Missing matches would mean absent from this dated eligible-equity reference, not automatically delisted.

Input JSON SHA-256 values are recomputed and optionally pinned. Archive/member/feed hashes inherited from those inputs are explicitly **not revalidated by this reconciliation utility**. The archive itself was validated in Phase 1B; the dated official-reference files are not fetched again or passed off as today's universe. Existing Mongo coverage remains unknown because no database is queried.

## Required sequential storage and consumer contract — proposed, not activated

1. **Inspect existing Mongo first.** Obtain the actual alarm, collection names/types, sizes/counts/indexes and representative non-secret schemas for existing history. The OHLCV archive itself claims export from Mongo; missing Node integration is not evidence that the data is absent. Do not reimport 532,976 bars without this check.
2. **Measure capacity and preserve recovery.** Record current storage/RAM/connection evidence and change budget, then backup references. Measure document/index sizes using the actual chosen schema and a small approved pilot; source ZIP size is not a database/RAM estimate. Do not create collections/indexes/TTL or dump histories into the single `app_state` document during diagnostics.
3. **Keep separate data products.** Daily equity bars, single-price history, market cash flow, monthly FPI categories, transaction events, quarterly ownership and fundamentals each retain their own schema, units, dates and consumer. A common file-import path must not erase these distinctions.
4. **Establish identities and observation meaning.** Every production bar needs reviewed identity period, interval, exchange/session date, timezone, currency and corporate-action/adjustment basis. Preserve original symbol, raw date/value text and lineage. Unknown basis stays unknown and cannot be silently mixed with fresh provider bars.
5. **Normalize into staging, not authority.** Preserve archive/member hashes, row references, source-observation/fetch timestamps, transformation version and reject reasons. Separate structural validity from accepted identity/currentness and consumer eligibility. Keep the rejected IDEA row out of normalized OHLCV while preserving the raw source.
6. **Reconcile before bounded persistence.** Compare coverage by verified instrument/session/interval/basis against existing stored records. Exact repeats are no-ops; differing values create an explicit conflict/correction record, not last-writer-wins. Use bounded batches, resumable checkpoints, acknowledged writes and read-back. No cleanup/deletion follows automatically from a duplicate diagnostic.
7. **Adapt to actual consumers.** The runtime scanner expects ordered `{date, open, high, low, close, volume}` bars, normally 253 daily candles for its full indicator lookback. Holding correlation separately requires at least 31 prices and comparable return dates for every non-self holding. A future history adapter must provide validated data plus provenance/quality status before these existing functions; it must not bypass their failure or fresh quote/depth/risk checks. Current code still uses provider fetches; this checkpoint does not replace them.
8. **Prove each link.** Test raw source -> accepted/staged keys -> approved persistence -> identical read-back -> scanner metrics -> unchanged selection/risk gates -> paper lifecycle -> ledger/portfolio/dashboard. Test partial feeds, stale data, conflicts, resumes and duplicate delivery. Never use an old asset row to label a failed current feed LIVE.

No collection name/index design is approved here: select the adapter after inspecting existing history instead of creating a competing store. The actual protected Node collections include `app_state`, `scan_ledger`, `paper_ledger` and `upstox_auth`; other historical collections may exist. Database cleanup still needs the exact collection/filter/count/backup/impact proposal and separate confirmation.

## Verification and next batch

The new identity regression suite and earlier OHLCV suite run together through `.github/workflows/verify.yml` using `test_asset_*.py`. All **43 tests passed** locally (23 identity tests plus the existing 20 OHLCV tests), both for the main agent and independent reviewer. A malformed rejected-only input that omitted date keys was caught during review, corrected and covered by regression tests. No remaining blocking reconciler finding was reported. Remote CI is not triggered merely by an ordinary feature push; CI wiring is not a remote passing run.

```sh
python3 -B -m unittest discover -s tests -p 'test_asset_*.py'
python3 -B scripts/reconcile_asset_identities.py \
  --report data/asset-review/back-test-claude-ohlcv-dry-run-2026-09-24.json \
  --reference data/official-nse-master-2026-09-13.json \
  --as-of 2026-09-24 \
  --expected-report-sha256 2e2d71cd044f52f3b7dd47c937903291cd1a83f43f83614beddde56d0937f92c \
  --expected-reference-sha256 ce0d9d57746bf8725738feb275f57b8d71e3c21fdbea0fe0d742ffa507130d82
```

The saved compact identity report is compared as JSON with the repeat actual-input CLI output, not compared by pretty-print whitespace. Source hashes and summary sums in both workbook reports are cross-checked against the pinned release inventory and stored sheet records. Core reconciler SHA-256: `ed7e57b3959fff1f6282ee6b13729f67fb4bc9195fcaf5a7ff02da0188698761`. Test SHA-256: `479e18d8c1452ac704547be4664b9d08a06d2fcc08761092dbc22dfdd09fcc87`. No broad Node application smoke rerun is claimed because this batch changes no application runtime module.

No runtime modules, formulas, scanner thresholds, Mongo data, V01/raw assets, `main`, Upstox credentials or Render settings change in this batch. Phase 1 is materially further along but remains open. The next useful actions are scoped Mongo alarm/history evidence and agreed Render release target; safe remaining asset review can continue while those are unavailable. Dashboard retry/freshness/unknown handling and the exact screenshot items remain in Phase 6, not silently cleared by finding a historical workbook.
