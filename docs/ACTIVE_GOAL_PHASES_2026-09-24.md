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

Latest backup/diagnostic checkpoint: `docs/MONGO_BACKUP_AND_SCAN_FAILURE_CHECKPOINT_2026-09-24.md`, published as `6e7d3f9199d0c1f7a746775d30273157dd3fc8e4`. An independently rerun, immutable-source harness passes 11 offline scenarios covering repeated scan payloads, insert/state-save failure propagation, scheduler retry and the non-retention 250-record bound. This is not a captured production exception. The application GET exports can write backfills and are not complete Mongo backups; V01 explicitly excludes live database state. No dump artifact or isolated restore was verified in the scoped local audit. Official Free-tier limitations exclude access history/downloadable database logs, Atlas backups and oplog dump/replay. A consistent, protected backup/restore route, fresh Render access and approval of the separate offline scan-storage correction remain pending. No runtime correction or production operation was made in this checkpoint.

Latest live Mongo checkpoint: `docs/MONGO_STORAGE_DIAGNOSIS_2026-09-24.md`. Authenticated Atlas now shows logical storage pressure (513.13 MB / 512 MB), not a demonstrated RAM failure. `ashstock.scan_ledger` contains 2,059 records / 306,852,328 BSON bytes, with stored creation times through September 21. The regular createdAt index is not TTL and the source's 250-record bound does not limit Mongo growth. Backup/restore, exact runtime errors and recovery remain unverified; no cleanup occurred. The shared cluster also contains `sample_mflix` (101.11 MB logical). A May 29, 11:52:12 IST sample-load request is visible, but no consuming repository or last application use was established. Negative source/history searches do not authorize deletion. Fresh Render access currently redirects to sign-in.

Latest content checkpoint: `docs/DERIVED_DELIVERY_CONTEXT_CHECKPOINT_2026-09-24.md` completes seven delivery-context CSV members (5,036 rows), independently rereads the previously reviewed 32,201-row merged source, and accepts only those seven upgrades. Sequential baseline/overlay replay now accounts for 171 assets (78 reviewed, 22 partial, 70 inventory-only, one corrupt) and 592 immediate ZIP members (423 reviewed, six partial, 163 inventory-only). The saved one-day return crosses a 128-day observation gap, missing delivery can become zero aggregates, and trigger generation/calibration authority is unresolved. This sample does not supply current market-wide or stock-specific runtime readiness. No import or activation occurred.

Previous content checkpoint: `docs/PARTICIPANT_AND_DUPLICATE_ASSET_CHECKPOINT_2026-09-24.md`, published as `4cf8b5e689710e16eeea8ddafb7842bf8eb8f05f`, completed 42 participant CSV members and five context-confirmed duplicate upgrades. All 21 OI snapshots retain unresolved one-contract arithmetic residuals, and their sparse dates do not satisfy NO09's continuous 60D history. Earlier checkpoint counts below are historical, not current totals.

Latest approved offline formula correction: `docs/FORMULA_PARITY_CORRECTION_CHECKPOINT_2026-09-24.md` records four corrected executable contracts, twelve honestly unavailable IDs, preserved source formulas, bounded 266-observation scanner evidence and raw-input lineage. Verification: 85 package-check commands, 14 formula groups, 57 named assembled smoke checks including eight new formula-path cases, rotation/valuation/official-market suites and 43 asset tests. Ranking weights, primary Upstox scoring and hard gates remain unchanged; advisory/generic scores may change under the user's approval. This is not deployment, Mongo writing or live-data verification.

Latest read-only source checkpoint: `docs/RESEARCH_AND_REPORT_ASSET_CHECKPOINT_2026-09-24.md`, published as `4c20ac716c13f38022f6fa09c55e4b421a8f235c`, records the completed root binary-XLS/HTML/metadata pass, all-page PDF OCR with numeric limits, seven research-archive reviews, 140 preserved formula-definition rows, the India10Y historical candidate, and feature formula/ID drift. The subsequently approved correction is separately checkpointed above; unresolved definitions and historical performance constants remain unapproved for adoption. The baseline ledger plus accepted overlay accounts for 171 assets (54 whole-content read with limits, 22 partial, 94 inventory-only, one corrupt) and 592 ZIP members (369 read, six partial, 217 inventory-only). Nothing was imported or activated by the source audit; full asset review remains open.

Latest asset checkpoint: `docs/ADDITIONAL_ASSET_CHECKPOINT_2026-09-24.md`, published as `256aa127f5a0fecd645b20915a2b5eab5659da4a`, reconciles raw stock packs against existing delivery history, parses macro coverage, and audits additional institutional CSV/workbook content. Duplicate coverage, missing G-sec values, zero-filled derived institutional fields and unread exceptions remain explicit; no import occurred.

Approved offline institutional correction: `docs/INSTITUTIONAL_CORRECTION_CHECKPOINT_2026-09-24.md`, published as `efb8ca934464551f6db3e32ce31cb94f0ea98cd6`, records the bounded institutional backend/dashboard recovery, exact five-session and adjacent-quarter evidence, retries and freshness/identity guards. Verification at that checkpoint: 82 package commands, 23 backend institutional scenarios, 16 grouped UI scenarios, isolated smoke/integration and 43 asset tests. It advances a Phase 6 subtask but does not deploy, write Mongo or prove current provider access.

Later asset checkpoint: `docs/ROOT_CSV_ASSET_CHECKPOINT_2026-09-24.md`, published as `00a81c5`, records Phase 1D's full remaining root CSV pass (10 files, 982,154 rows), institutional window/scope limitations and independent workbook-date checks. Finding historical data does not authorize an import or satisfy fresh dashboard requirements.

Earlier authenticated deployment checkpoint: `docs/RENDER_RELEASE_GATE_CHECKPOINT_2026-09-24.md` confirms Render uses `main` and a September 24 manual redeploy still runs `226e139`; its actual Health Check Path is blank. Atlas access has since become available; the release-branch choice and fresh Render sign-in remain required. The exact-commit health/readiness/health verification gate was published as `2eab137` and tested offline, not deployed or run against production. The local V01 tag remains intact, but the exact GitHub tag-ref lookup returned 404; remote tag/release publication stays on Phase 9.

Public `/api/health` was read earlier on 24 September 2026 without running an import or paper cycle. It returned HTTP 200 and commit `226e1394d5af3f0c380593d58917b8d2ee5c13e8`, not the feature checkpoint. Its storage field was `mongodb-configured-unverified`; `persistent` and `ready` were null. This proved the old code was live at that check, not Mongo health. Subsequent authenticated Render and Mongo observations are separately checkpointed above; no new production readiness success is claimed.

GitHub feature/main refs were independently read. Main remains `226e1394d5af3f0c380593d58917b8d2ee5c13e8`. The existing code checkpoint records 75 passed package check commands and 57 named smoke checks plus integration suites; those prior tests do not constitute live deployment evidence.

The Backenddata release was fetched with complete pagination: 171 assets, 1,578,878,073 bytes. All live asset IDs/names/sizes/SHA-256 digests match the preserved manifest; the 171 local raw files were freshly rehashed without modifying V01. Inventory: `data/asset-review/backenddata-release-inventory-2026-09-24.json`. Integrity and selected content review are not a complete reread or approval to import every dataset.

## Nine-phase sequence and completion gates

| Phase | Work | Completion gate / current boundary |
| --- | --- | --- |
| 1. Baseline, asset review and connection map | Verify repository/live commit; inventory all release assets; inspect actual formats/fields/dates/symbols/quality; map each usable dataset to the intended consumer; identify backup/access gaps. | OHLCV/root/workbook/research/participant/delivery-context checkpoints reviewed in bounded batches; current 78/171 whole assets and 423/592 immediate ZIP members reviewed. Mongo collection baseline measured. Remaining content, identity/corporate-action validation and screenshot mapping stay open. |
| 2. Mongo alarm diagnosis | Obtain actual error and resource metrics; inspect collections/index sizes, document counts and growth; distinguish storage, RAM, connections and write failures. | Live storage-limit/collection evidence obtained; 11 offline source-derived failure/growth scenarios pass. Exact failed production operation/error and approved prevention policy remain open. See Mongo diagnosis and backup/scan-failure checkpoints. |
| 3. Confirmed Mongo cleanup/recovery | Verify backup; present exact collection/filter/count/estimated impact and preservation rules; obtain confirmation; execute only approved targets; reconcile protected records. | Required gate: verified consistent backup and isolated restore, then approved recovery and persistence/resource checks. None is complete; existing app exports and V01 are not live DB backups. No deletion is authorized by this plan alone. |
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
- CI currently runs on main pushes and pull requests, not ordinary feature pushes. The exact-commit health/readiness/health gate is now implemented and tested (`2eab137`); running it against production remains an agreed-release operation, not a side-effect-free diagnostic.
- Credentials already installed do not prove endpoint support, data licensing, symbol coverage or successful retries. Capture safe errors, never tokens.
- Scan persistence is unbounded in Mongo on main; the feature's rotation/engine path can additionally duplicate full scan payloads. Before deployment discuss evidence-preserving deduplication, byte/growth bounds and backup-backed retention; do not delete protected audit history or silently pause monitoring.
- The legacy intelligence overlay still scores its hardcoded June 8 FII/DII snapshot without a freshness guard, separate from the corrected institutional/NO08 path. Add historical labeling/validated fresh replacement to the approval queue; do not claim every institutional consumer is corrected.

## Next bounded batch

Read the asset, institutional-correction, formula-parity, participant/duplicate, delivery-context, Mongo diagnosis and backup/scan-failure checkpoints for completed work and limitations. Participant/context-checked duplicate batches and the eight-file volume-delivery archive are now fully read; next content batches are large monthly FPI history and remaining AM07/aqu/bhavcopy/other derived sources. PDF numerical content remains partial. Current live priority is a securely configured, consistent Mongo backup with isolated restore proof, exact production failure evidence, and discussion of scan-growth prevention. Do not use side-effecting application GET exports or unsupported Free-tier oplog options as a backup shortcut. The read-only backup audit and 11-scenario scan harness are complete; the requested offline scan-storage implementation approval remains pending. No cleanup target is approved; sample-data last use/ownership remains unresolved despite its observed load request, and Free-tier access-history/log limitations are now verified. The two newly identified runtime hazards above require discussion before code changes. The approved formula-ID/warmup/null/availability batch is complete offline, not deployed. Do not promote archived backtests to live proof or bulk-import into the full cluster. Obtain the missing dashboard screenshot and fresh Render sign-in, and agree the service/release target before production changes. Keep the goal active until live acceptance gates are genuinely complete.
