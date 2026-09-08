# Full-universe NSE batch rotation

Approved scope: refresh the existing official NSE master and cover the entire eligible universe in non-repeating, paced batches. Do not loosen entry gates, change formulas/capital policy, replace existing holdings, or enable live orders.

The old dashboard selected a date/horizon-seeded subset of at most 200 symbols. Repeated refreshes on the same day could select the same subset. A display such as `199/2350` described one scanned subset versus the master count; it did not prove that all 2,350 stocks had been evaluated.

## Controls

- **Refresh**: evaluate the next unscanned batch, up to the existing server limit of 200. It no longer sends a client-selected daily subset.
- **Scan all / Resume**: sequentially request batches until the current cycle is exhausted. The button becomes **Pause after batch**; pausing lets the current request finish, then stops. Keep the page open for the sweep. A later resume continues from server-saved progress.
- **NSE Master**: use the existing official Upstox loader to replace instrument metadata, clear previous cycle progress and stale scan cache, then start a full sweep. A current exchange master mostly overlaps the old master; it does not create thousands of different companies.
- The table shows the **current batch**, not every historical row. The coverage label reports unique symbols attempted, remaining symbols, and fetch failures across the cycle. Current-batch SELECT/WATCH counts are not whole-universe totals.

The existing paper automation remains active: qualifying SELECT rows can cause the existing paper engine to attempt entries. This change adds no broker-order endpoint and does not make live trading available. It does not guarantee SELECT candidates, new holdings, or returns.

## Server contract

`POST /api/scanner/next-batch` accepts an optional `horizon` (`intraday`, `swing`, `positional`, `portfolio`). It uses saved universe/settings/holdings, not client overrides. The existing scan algorithm and Upstox pacing/retry policy are reused.

Progress is stored in `scannerRotation`, separately from `scannerSettings` and `paperTrader`. A universe fingerprint, master revision, selection-settings revision, IST date and horizon identify a cycle. A different master/day/settings revision starts new coverage. A completed cycle wraps only on the next request. Normal source-list reorderings do not reset progress. Only NSE_EQ instrument keys are eligible; existing fund-name and suspended-instrument filters remain in force. The old dashboard-only exclusion of familiar names is removed so the complete eligible master can be visited.

Overlapping rotation calls return `409 universe_batch_busy`. An all-fetch-failed or truncated scan does not advance progress. Partial fetch failures advance attempted coverage and are counted/listed explicitly; they are not labeled successful evaluations. The next cycle retries those stocks. Changes to the master/settings during a batch invalidate its progress update. Paper-state mutations are locked only for the short progress/ledger commit, not for the full network scan.

Metadata updates are restricted to `universe`, `scannerRotation`, and `universeRevision`. They do not re-save formulas or the paper ledger: the file backend retains raw ledger values, and Mongo uses dotted-path metadata updates instead of replacing the state document. Ordinary state/trading validation is unchanged. The paper-engine scan cache is updated only after a rotation batch passes validation and its progress is saved.

The overlap/state lock is process-local, matching the existing single-server mutation model; this is not a distributed lock for multiple app instances. Mongo metadata writes do not overwrite concurrent paper-ledger fields, but shared non-repeating coverage across multiple server processes would need a separate distributed claim mechanism.

The unattended paper-engine scheduler is unchanged; its existing cached-scan/fallback behavior is not converted into a new full-universe background job by this batch. Full sweeps are driven by the dashboard controls.

## Verification and release boundary

Run `npm run check`, `npm run test:rotation`, and `npm run smoke`. Rotation tests use isolated temporary storage and mocked upstream data; they do not call a live broker or modify the live database. They cover all 2,361 symbols in 12 disjoint batches, source reordering, horizon/day/master changes, partial/total failures, API concurrency, mid-batch master/settings changes, empty-master rejection, missing tokens, governed settings and paper-ledger preservation. Generated storage methods are exercised for memory/file ledger preservation and Mongo metadata-only update paths; this does not substitute for a live Mongo deployment test.

Development branch: `codex/full-universe-batch-rotation`. Local baseline tag: `V01-2026-09-07` at `226e1394d5af3f0c380593d58917b8d2ee5c13e8`. As verified on 2026-09-09, the complete V01 archive is verified locally, but the GitHub V01 release is still an unpublished draft with no uploaded assets and is not immutable. Do not treat that draft as a completed remote backup.

Code completion, commit/push, production deployment, and an actual live master reload/sweep are separate outcomes. Do not describe a tested local change as a completed live scan. The V01 archive preserves the previous code and release assets; it does not back up the live MongoDB ledger or environment secrets.
