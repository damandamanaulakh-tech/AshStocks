# Mongo archive-work follow-up — 24 September 2026

Repository: `damandamanaulakh-tech/AshStocks`; branch: `codex/valuation-targets-market-refresh`.
Starting published checkpoint: `85b11b901c873425e7b020adcfeaca8c2493e70a`.
User request: approve prior GitHub publication, fix the Mongo memory issue, and delete unwanted files.

## Confirmed scope and limits

The prior paper-flow implementation is published at `d40a8ee2a3e5eece421cdf897053a53ea7ce3930` with its exact tested tree verified. This is a separate follow-up, not deployment or a live database maintenance operation. Preserve holdings, archive history, raw datasets, formulas, main and V01.

The user has not yet supplied an error, metric or screenshot distinguishing Mongo server RAM, Atlas storage quota, Render heap usage, or memory-mode fallback. The code defect below is independently reproduced; it is not claimed as the confirmed cause of the production symptom.

## Reproduced defect

Mongo `getState()` invokes `archivePaperLedgerMongo(..., "startup-backfill")` on every read. The history endpoint invokes the archive again. Previously each call resubmitted the entire hot order/trade snapshot with `$setOnInsert`.

An offline execution of the existing helper and generated `getState` clause showed **20 unchanged reads × 500 events = 10,000 requested upserts**, with only 500 unique archive records. This is write/processing amplification, not evidence of 10,000 duplicate stored documents.

## Bounded fix — implemented and tested

- Keep existing archive call sites and archive-before-sanitize/save ordering.
- Memoize only successfully persisted content-derived event IDs, scoped to one Mongo store; never cache full payloads or skip new/changed events.
- Bound the cache to 2,000 hash/timestamp entries, the archive queue to 32 pending requests, and each bulk write to 500 events. Fixed five-minute expiry is measured from successful persistence, not extended by repeated reads. Queue overflow fails closed with `paper_ledger_archive_busy_retry` and recovers after work drains.
- Preserve deterministic IDs and `$setOnInsert`. Failed, partial or unconfirmed writes remain retryable and cannot authorize state truncation/overwrite.
- Do not prune Mongo collections, shrink historical retention, relax database readiness, or enable memory fallback.

The installed collection-level driver is MongoDB 6.21. Its `BulkWriteResult` is not `ClientBulkWriteResult`; confirmation uses the applicable matched/upserted operation counts rather than assuming an `acknowledged` property. See [MongoDB collection bulk-write documentation](https://www.mongodb.com/docs/drivers/node/current/crud/bulk-write/) and [write concern documentation](https://www.mongodb.com/docs/v8.0/reference/write-concern/).

## Regression verification

The new guard runs the actual generated Mongo helpers/store with a fake client and deterministic data: repeated reads, concurrent reads, duplicate history calls, changed events, rejected/partial writes, queue recovery/overflow, eviction, expiry, new-store replay, and archival of every raw record before hot-snapshot caps. It also exercises the installed driver 6.21 `BulkWriteResult` rather than inventing an acknowledgment flag. No real MongoDB, credentials or production data are used.

- Twenty sequential reads and twenty concurrent reads each archive 500 events once, rather than submitting 10,000 operations. This is a 95% reduction in repeated archive operations for that fixture, not a measured production RAM reduction.
- The raw-state test archives all 2,202 order/trade events before retaining only the existing hot-snapshot limits. Previous event versions remain stored; partial writes cannot permit state overwrite.
- `node scripts/run-local-checks.mjs check`: exit 0; all **75 package-defined commands passed**, including `test:mongo-memory` and existing paper-flow, formula, retention, valuation and importer checks. Node v24.19.0 was used locally; npm is absent, so the runner executes the same allowlisted package commands without installation.
- Final isolated four-command package-smoke equivalent: exit 0; **57 named smoke checks**, rotation unit/UI/storage/API, valuation integration and official-NSE unit/runtime passed in `/private/tmp/ashstocks-mongo-memory-smoke-nDudKq`.
- Final 146-file source/test/fixture manifest matched the worktree before and after smoke. Aggregate SHA-256: `041a02072d63d7aaa338065b87070cbbf975762df146ffbac6fd229fa7ae19c8`. Manifest construction is the same as the prior paper-flow checkpoint; documentation is excluded.
- Retention patch SHA-256: `ea7c98754a54cc36a1942fda3944b29911f04a3debd74123770bd5a28f4aa7b1`; new Mongo guard: `a17a1cb4329692d61945433abfb0c25ec3a21f0b8d1fe404a7f9c5c3f410ae11`; smoke harness: `b08d03a96b705e73781be737dcddca478ef75a79d34d6d2dc5f71be74d75a04f`.
- `git diff --check` passed. No changes to formula libraries, vendored baseline, tracked datasets, Python runtime, Render configuration or Procfile.

### Smoke isolation correction

The production-Mongo failure fixture formerly inherited alternate URI aliases and targeted a reserved TEST-NET address. It now clears all runtime Mongo URI aliases, creates an owned ephemeral `127.0.0.1` TCP stub that rejects connections, and asserts that the real Mongo client attempted that stub. Existing liveness 200, readiness 503, unavailable-storage and bounded-time assertions remain. Both test servers close in `finally`.

The final smoke copy used Git-listed files, only seven tracked data fixtures, and `env -i` with only PATH/TMPDIR. It excluded credentials, live data, ignored scratch, runtime output and Git metadata. Provider HTTP is mocked; the Mongo driver failure path uses only the owned localhost stub.

Published and independently fetched implementation: `2781c63e3b7b39b1b40f097b17b5598f37d64d51`, tree `923899d8271dd8258eca03cf070fba60e618d1ee`. The remote tree exactly matched the tested staged source before the existing feature ref was fast-forwarded with `force: false`. The local feature branch was then fast-forwarded to the same commit. Independent review of the actual diff and a repeat of the dedicated guard found no actionable defect. Publication is not deployment or a live memory/storage measurement.

## Cleanup inventory — no deletion authorized by an exact target yet

The inner feature checkout is approximately 16 MB including dependencies and Git. No ignored/untracked temporary files, logs, Python caches, `.DS_Store`, swap files or coverage outputs were found outside dependencies/Git. There is no meaningful disposable-file buildup to remove.

The large outer `V01-2026-09-07` directory is approximately 3.0 GB and is the explicitly preserved backup, not junk. Keep it. Also keep tracked snapshots, ledger/data files, active bundled runtime, historical algorithms, source/configuration and the tracked spreadsheet deliverable under `outputs`.

Only three outer pnpm cache files were identified as low-value housekeeping candidates: `.pnpm-store/v11/index.db`, `index.db-wal`, and `index.db-shm`, totaling 45,136 bytes. They are outside the inner repo and were not deleted. Removing them would not fix Mongo memory usage. Ask for exact cleanup scope before deleting ambiguous or historical files.

## Next evidence needed

Ask for the exact Mongo/Render error or metric without credentials to determine whether additional work is required. A live investigation, deployment or database cleanup remains separate from this code/test phase.
