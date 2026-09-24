# Mongo backup boundary and offline scan-failure checkpoint

Date: 24 September 2026. Source baseline: feature `c2a99bf97128d645eb1891e474743b522c9e26a6`; main `226e1394d5af3f0c380593d58917b8d2ee5c13e8`.

## Outcome and scope

The application exports and V01 preservation archive do **not** establish a recoverable backup of the live Mongo database. Source-derived offline diagnostics reproduce scan-payload repetition and a write-failure path that stops the paper-engine cycle before its planning, quotes, position-monitor and order callbacks. They do not reproduce an actual production exception.

This checkpoint adds only audit documentation, a pinned diagnostic harness and synthetic results. No application implementation, production database, index, setting, credential, deployment or trading behavior was changed. No backup, migration, cleanup, paid upgrade or scheduler pause was performed. The separately requested offline scan-storage correction remains pending approval.

## What the existing exports omit

Source paths below refer to the pinned feature baseline. The base file is `vendor/base-server-37a9e9ceacabd33bc5a2085ad621e368f8fc0cd8.mjs`.

| Existing path | Actual scope | Recovery limitation |
| --- | --- | --- |
| Scanner CSV (`app.js:2682-2685`) | Visible rows and 13 display columns | Not all scan evidence or other collections |
| Open/closed trade CSV (`app.js:2687-2725`) | Open positions or paginated closed-trade summaries | Omits archive envelopes and supporting fields; not raw history |
| `GET /api/state` (base `1870-1880`) | Sanitized application-state view | Not original BSON or all collections/indexes; hot paper-state arrays are bounded |
| `GET /api/scanner/ledger` (base `1931-1941`) | At most 250 re-sanitized records | No paging cursor; Mongo `_id`/`createdAtDate` removed; cannot export the earlier measured 2,059 records completely |
| `GET /api/paper-trader/history` (`server-paper-ledger-retention-patch.mjs:255-278`) | Paginated payloads/closed summaries | Drops the archive envelope and does not preserve database metadata |
| Generic state PUT/PATCH (`server-selection-settings-patch.mjs:97-100`) | Disabled in production | Not a full-database restore mechanism |

**GET is not necessarily read-only.** The retention patch injects `archivePaperLedgerMongo(..., "startup-backfill")` into Mongo `getState()` (`350-354`), and the history GET additionally invokes `archivePaperLedgerState` (`259-265`). Initialization also creates indexes. These paths can attempt writes under the current capacity problem; none was used as an emergency export in this audit.

The paper archive is in the same database and preserves only selected paper entities. It is not an independent recovery copy. History pagination has no export-wide consistent snapshot boundary. The browser also accumulates all history pages and then CSV/Blob data in memory (`app.js:2666-2671,2687-2701`), so it is not a bounded-memory backup implementation.

`upstox_auth` is persisted separately (`server-upstox-oauth-patch.mjs:348-372`). A recovery package containing it is sensitive. Do not place that package in Git, release assets, chat or ordinary exported reports; no authentication document bodies or credential values were read here.

## V01 and local backup search

`V01-2026-09-07/payload/README-V01.md:28` explicitly excludes live MongoDB, paper account state, Render environment and broker secrets. Its Git bundle/source archives restore code, not current application data.

The scoped local Ash filename/metadata audit found the existing 1,585,182,720-byte complete V01 TAR, 1,050,281-byte Git bundle, source ZIP, checksums and local verification metadata, all dated September 7. It found no matching standalone Mongo dump/BSON/archive artifact or implemented full restore route. This does not rule out a differently named or externally stored backup. The complete V01 archive was neither rewritten nor rehashed/restored during this checkpoint. The local environment had no configured Mongo URI and `mongodump` was not in PATH at the preceding access check.

## `sample_mflix`: why exact last use remains unresolved

The preceding [live diagnosis](MONGO_STORAGE_DIAGNOSIS_2026-09-24.md) records a May 29 sample-load request and negative searches across the checked repositories. Neither identifies a last application access or proves the database is unused.

The current Atlas **Free** tier does not expose database access history or downloadable database logs and does not support database auditing. This rules out those retrospective attribution routes on the present tier; an upgrade now would not create missing historical evidence. Client/deployment configuration and retained application logs are the remaining checks. The Render sign-in flow is still incomplete; no authenticated service/log view was reached. [MongoDB Free cluster limitations](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/)

## Reproducible offline scan diagnostics

Harness: `scripts/audits/scan-ledger-offline-audit-2026-09-24.mjs`.
Results: `data/diagnostics/scan-ledger-offline-evidence-2026-09-24.json`.

Run with Node from the repository root. The harness uses immutable Git source pins, extracts actual engine/rotation/ledger function bodies, and evaluates them in a disposable VM with in-memory storage, a fixed clock, dummy token and explicitly mocked provider/planning/risk/lifecycle callbacks. It does not boot the application, open sockets or contact Mongo. It is not wired into application startup.

| Diagnostic group | Observed offline outcome |
| --- | --- |
| Main cached scan | Three successful runs insert three distinct IDs containing one repeated compact payload; a cache older than five minutes triggers a new scan |
| Feature fresh/committed scans | Two fresh runs insert four records: a rotation and an engine event for each batch, repeating compact evidence; successful state saves consume the committed cache |
| Insert rejection | Main and feature reject before plan/quotes/monitor/orders; a rotation insert failure also prevents cursor/cache commitment |
| Feature engine append retry | Successful rotation remains committed but unconsumed after engine append rejection; retry can reuse it without rescanning |
| Later state-save rejection | A successful scan append can be repeated on retry after state saving fails; mocked lifecycle calls do not prove duplicate real fills |
| Scheduler | Both source versions record the failure, skip retry in the same slot and attempt the next eligible two-minute slot |
| Mongo append count | The actual append body accepts 251 synthetic records; the 250 read/memory bound is not Mongo retention |

There are 11 passing scenarios. The real `getState()` startup-backfill path is explicitly mocked out and can fail earlier; this test does not exonerate it. Real concurrency, scoring, fills, provider access, BSON/index sizes and production failure messages are not tested. Synthetic JSON sizes must not be used to estimate live cleanup savings. Separate rotation/engine events remain audit history even where their large payloads match.

## Recovery route required before any cleanup

This is a proposal/checklist, **not an executed backup or authorization to change production**:

1. Establish a securely configured, scoped read/export connection and compatible Database Tools; do not paste a URI/password in chat or command output. Agree a protected backup destination outside Git and the untouched V01 archive.
2. Capture all four observed `ashstock` collections (`app_state`, `scan_ledger`, `paper_ledger`, `upstox_auth`) plus their actual collection options and index definitions. Refresh namespace inventory first. Other databases require separate scope/ownership decisions; `sample_mflix` is not approved for deletion.
3. Define and verify the consistency boundary. Free clusters do not provide Atlas backups or support `mongodump --oplog`/`mongorestore --oplogReplay`. Do not suggest those options as a solution for this tier. [MongoDB Free cluster limitations](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/)
4. A plain dump while writes continue is not guaranteed to represent one instant. Any required pause of all relevant writers must be separately agreed and verified, including its impact on position/exit monitoring; this audit has paused nothing. Matching before/after counts alone do not establish consistency. [mongodump documentation](https://www.mongodb.com/docs/database-tools/mongodump/)
5. Validate the artifact, tool exit status, namespaces, identifiers/counts, BSON types, options and index metadata; record an artifact hash without exposing content. Prove an isolated restore to a compatible non-production Mongo instance. Database users/roles and deployment secrets are separate recovery concerns, not assumed to be in this application-data dump.
6. Only then present exact cleanup target/filter/count/estimated quota effect, protected-record checks and recovery instructions for separate user confirmation. No blanket purge, TTL, hidden audit loss or readiness write is authorized.

For prevention, discuss immutable scan payloads referenced by separate small audit events, with crash/retry/legacy-read compatibility and measured byte/growth budgets. That design does not reclaim existing history by itself and is not implemented by this checkpoint. Main/V01 remain unchanged; GitHub publication is separate from deployment and live recovery.
