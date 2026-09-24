# AshStocks active goal: connected data, Mongo recovery and verified deployment

Date: 24 September 2026. Repository: `damandamanaulakh-tech/AshStocks`.
Working/publishing branch: `codex/valuation-targets-market-refresh`.
Starting checkpoint: `23f5dcbd4c748918a60e2664f5059d243b8aaabe`.

## Objective and authority

Complete the nine phases below in small, reviewed, tested and published batches. The user explicitly requested an active goal, GitHub asset review, fresh online/API data for missing dashboard inputs, Mongo cleanup confirmation first, and an end-to-end sequential system. This document supersedes old backlog priorities, not historical formulas or evidence.

- Runtime application data is in MongoDB. GitHub release assets are potential historical sources, not evidence of a completed Mongo import.
- Preserve the approximately 3 GB local V01 backup unchanged. Do not delete Git/repository data as a substitute for diagnosing Mongo.
- Use the already configured Upstox connection. Verify each needed endpoint/response independently; working prices do not prove all other feeds work. Do not request or publish credentials.
- Mongo deletion requires an exact collection/filter/count/backup/impact proposal and user confirmation before execution. No blanket purge, arbitrary TTL, loss of ledger history or weakened durability checks.
- Preserve holdings, orders, trades, audit history, auth records, settings, formulas and raw historical sources. Quarantine invalid inputs logically; do not silently edit or delete originals.
- Keep `main`/V01 unchanged until the release target is specifically agreed. A feature-branch push is not Render deployment or production verification.
- Files should be connected where their role requires it. Historical references, fixtures and superseded implementations must not be executed merely to make every file appear connected. Record active/reference/quarantined/unwired roles.

## Verified starting evidence

Later asset checkpoint: `docs/ROOT_CSV_ASSET_CHECKPOINT_2026-09-24.md` records Phase 1D's full remaining root CSV pass (10 files, 982,154 rows), institutional window/scope limitations and independent workbook-date checks. Finding historical data does not authorize an import or satisfy fresh dashboard requirements.

Public `/api/health` was read on 24 September 2026 without running an import or paper cycle. It returned HTTP 200 and commit `226e1394d5af3f0c380593d58917b8d2ee5c13e8`, not the feature checkpoint. Its storage field was `mongodb-configured-unverified`; `persistent` and `ready` were null. This proves the old code is live, not that Mongo is healthy. Actual Render deployment time/branch/settings and the Mongo alarm still need authenticated evidence.

GitHub feature/main refs were independently read. Main remains `226e1394d5af3f0c380593d58917b8d2ee5c13e8`. The existing code checkpoint records 75 passed package check commands and 57 named smoke checks plus integration suites; those prior tests do not constitute live deployment evidence.

The Backenddata release was fetched with complete pagination: 171 assets, 1,578,878,073 bytes. All live asset IDs/names/sizes/SHA-256 digests match the preserved manifest; the 171 local raw files were freshly rehashed without modifying V01. Inventory: `data/asset-review/backenddata-release-inventory-2026-09-24.json`. Integrity and selected content review are not a complete reread or approval to import every dataset.

## Nine-phase sequence and completion gates

| Phase | Work | Completion gate / current boundary |
| --- | --- | --- |
| 1. Baseline, asset review and connection map | Verify repository/live commit; inventory all release assets; inspect actual formats/fields/dates/symbols/quality; map each usable dataset to the intended consumer; identify backup/access gaps. | Batch 1A `7996da6`; 1B `a9451d8` validates the OHLCV family. Batch 1C reads root/AM07 workbook content and adds exact identity-candidate reconciliation (43 combined tests). Remaining asset families, historical identity/corporate-action validation, screenshot mapping and live Mongo baseline remain open. |
| 2. Mongo alarm diagnosis | Obtain actual error and resource metrics; inspect collections/index sizes, document counts and growth; distinguish storage, RAM, connections and write failures. | Evidence-backed cause and bounded remediation proposal. The earlier archive-work fix is not assumed to be the cause of this alarm. |
| 3. Confirmed Mongo cleanup/recovery | Verify backup; present exact collection/filter/count/estimated impact and preservation rules; obtain confirmation; execute only approved targets; reconcile protected records. | Persistence/read-back and alarm/resource checks pass. No deletion is authorized by this plan alone. |
| 4. Verified Render release | Agree service/branch/runtime/commit; test in intended runtime and CI; deploy reviewed code; check commit, assets, auth and durable readiness; record rollback. | Exact intended commit running on Render and key user flows checked. A successful GitHub upload alone is insufficient. |
| 5. Fresh NSE universe | Fetch current official NSE company membership, Upstox identities and suspensions; validate; back up metadata; replace only universe metadata; persist/read back. | Actual eligible/add/remove/exclusion counts and source dates, all requested stocks reconciled, holdings/ledger preserved. Never pad to 2,400. |
| 6. Data Needed completion | Validate asset history first; refresh/extend through configured Upstox and verified official sources; implement bounded/idempotent storage and consumer adapters; distinguish historical/current/as-of data and informational/entry-blocking fields. | Each card/parameter has real values and provenance or an explicit unresolved reason. Exact screenshot items remain to be identified. |
| 7. Valuation/target verification | Verify sourced annual EPS, base P/E, EPS x P/E and 3/9/12-month calculations, dated assumptions, corporate actions, persistence and explicit activation. | Reviewed numerical inputs match calculated/stored/displayed targets. Never infer fundamentals from OHLCV or silently shift reference dates. |
| 8. Sequential paper-flow proof | Prove current universe -> candle/history inputs -> scanner/selection -> risk/quote/depth checks -> paper order -> ledger/portfolio -> dashboard, including scheduled runs and rotation. | Actual outcomes, cursor progress and blockers recorded; restart/idempotency/no-duplicate tests pass; no forced purchases or live broker trades. |
| 9. Recovery and final handover | Finish outstanding V01 release-asset publication; verify backup/restoration references; record deployed version, data versions, metrics and remaining limitations. | Recoverable release record and honest final live status. |

Phase order is a dependency order, not permission to skip gates. Read-only asset work may continue while production access is unavailable. If Mongo capacity prevents deployment, resolve the approved recovery step first; do not bulk-import the assets into a full database.

## Phase 6 data checklist

| Input | Historical asset opportunity | Fresh/online task | Required consumer proof |
| --- | --- | --- | --- |
| Symbol/ISIN/instrument identity | Inspect masters; reject placeholder identities | Current official NSE membership + Upstox exact identity/suspension checks | Saved universe and requested stocks resolve unambiguously |
| OHLCV and holding histories | Validate Back.Test.Claude and other actual OHLCV tables; keep close-only tables separate | Upstox candles for missing/recent coverage and held instruments | Correct units/session dates/identity; no stale historical row can authorize a current trade |
| Volume, trend, volatility, turnover | Derive only from validated compatible bars | Refresh inputs, not invented indicator values | Existing formulas receive adequate lookbacks with freshness/quality reasons |
| NIFTY/Sensex/Bank Nifty/India VIX/macro | Index_daily_15Y and macro histories | Verify available current provider contracts | Current cards and historical calibration remain distinct; breadth proxy is not exchange-wide daily breadth |
| FII/DII market cash | Reconcile cash history units/dates/duplicates | Verify supported institutional/official endpoints and access | Sufficient dated sessions and truthful rolling windows, not stale history labeled live |
| Stock institutional holdings | Inspect stock/entity files and map actual identities | Verify supported shareholding/company filings | Quarterly ownership, daily trading flow and market-wide totals are not interchangeable |
| Delivery/bhavcopy/PWOI/F&O | Validate actual schemas, instrument/session coverage and duplicate keys | Official refresh/contract validation where available | Correct parameter IDs; no automatic promotion of one-date or research samples into entry signals |
| EPS/P/E and targets | Inventory reports/workbooks for dated sourced financial inputs; do not assume coverage | Verified company filings/available licensed feeds | Source/date/units/consolidated basis and reviewed assumptions match target inputs |
| Parameter proof and dashboard | Match historical research evidence to implemented parameter registry | Retry/freshness/error status per feed | Informational vs execution-required status is explicit; missing inputs cannot become fake PASS |

## Intended sequential connection contract

```text
GitHub raw assets (preserved) ----> format / quality / identity validation ----+
                                                                          |
Configured Upstox / official feeds -> endpoint / schema / freshness checks -+
                                                                          v
                    staged normalized records + rejects + provenance
                                      |
                         dry-run / capacity / approval gate
                                      |
                         bounded idempotent Mongo persistence
                                      |
                       read-back / consumer coverage validation
                                      |
                scanner indicators -> selection and unchanged risk gates
                                      |
              fresh quote / depth / market checks -> paper order lifecycle
                                      |
                     append-only ledger -> portfolio -> dashboard
```

This is the target contract, not a claim that asset ingestion exists today. Keep historical data storage separate from the hot application state unless measured limits and tests justify another design. Research-only sources stay out of the execution path until validated and explicitly adopted.

## Phase publication protocol

1. Record starting commit, clean/dirty state, phase scope and preservation rules.
2. Inventory/read actual inputs; keep pending or unsupported sources explicit.
3. Make the smallest coherent approved change; add input validation, idempotency, source/freshness and failure-path tests as appropriate.
4. Review the actual diff and run proportionate tests. Documentation/data catalogs require JSON/link/count/integrity validation; do not claim an application regression rerun if none ran.
5. Publish on the existing feature branch without force; independently verify returned blob/tree/ref against local evidence. Do not leave a phase only locally staged.
6. Report code/tested/published/deployed/live-verified as separate states. Save next step, exact blocker and recovery instructions before beginning another batch.

## Release and wiring hazards to verify

- `server-stock-selection-patch.mjs` embeds the Backenddata manifest as audit metadata; it does not ingest ZIP/CSV history. Existing manifest statements are historical evidence, not new validation or Mongo coverage.
- `/api/stock-selection/evaluate` is a separate evaluator. Its existence does not prove all its formulas run in the automatic paper path. Trace and test which formulas should be shared before changing execution policy.
- `render.yaml`/`package.json` specify Node, while `Procfile` specifies Python. Inspect the actual service command before removing or switching entrypoints.
- `docs/RENDER_CONNECTION_GUIDE_v0_1.md` and several July data-bank rows contain old fallback/provider/deployment advice. They are not current configuration authority; reconcile them in the release batch instead of rotating credentials based on stale text.
- CI currently runs on main pushes and pull requests, not ordinary feature pushes. `scripts/check-live-render.mjs` reports a commit but does not assert it equals an intended deployment SHA. Release verification must check the exact commit.
- Credentials already installed do not prove endpoint support, data licensing, symbol coverage or successful retries. Capture safe errors, never tokens.

## Next bounded batch

Read `OHLCV_VALIDATION_CHECKPOINT_2026-09-24.md` and `ASSET_IDENTITY_AND_WORKBOOK_CHECKPOINT_2026-09-24.md` for the completed diagnostics and explicit source limitations. Phase 1C found 191 exact-symbol candidates, substantial single-price history, workbook templates/one-date snapshots, missing formula caches and duplicated historical flow rows; none establishes current Mongo coverage or import approval. Remaining Phase 1 content includes binary XLS and other archive/PDF/HTML families, historical identity/adjustment verification and source-to-parameter coverage. Continue safe content review and bounded source contracts while obtaining the scoped authenticated Mongo alarm/history metrics and dashboard evidence. Before any new ingestion inspect existing Mongo history and capacity; absence of a Node adapter does not establish absence of stored data. Before production cleanup show exact targets and request confirmation; before deployment resolve the service/release target. Keep goal active until the live acceptance gates are genuinely complete.
