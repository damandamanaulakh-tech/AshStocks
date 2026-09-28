# Mongo storage refresh and observed paper-engine timeouts

Date: 28 September 2026. Observation window: 18:06:40–18:11:03 UTC (23:36:40–23:41:03 IST). Feature baseline: `5904d6b57e6fb801a5585ba8f450ec7fe4ba30b6`; observed Render commit: `226e1394d5af3f0c380593d58917b8d2ee5c13e8`.

## Outcome and scope

Atlas collection inspection and authenticated Render access are working. The cluster is no longer shown at its September 24 over-limit reading: it now displays **333.58 MB / 512 MB (65%)**. However, retained Render logs show **three paper-engine invocations with Mongo-endpoint connection timeouts on September 28**. This supplies a concrete production symptom; it does not prove quota rejection, RAM exhaustion, the failing database operation or complete recovery.

This is a read-only diagnostic and audit-publication batch. No application code, Mongo data/index/TTL, credentials, security rules, deployment, scheduler or trades were changed. No backup, restore or deletion was performed. Raw/auth data and the endpoint address are excluded from the published evidence.

Evidence: [sanitized measurements and exact aggregation](../data/diagnostics/mongo-storage-refresh-2026-09-28.json). This refresh supersedes earlier collection-viewer/sign-in blockers and dated counts, not the preservation/approval gates in the [backup checkpoint](MONGO_BACKUP_AND_SCAN_FAILURE_CHECKPOINT_2026-09-24.md).

## Fresh storage and inventory

Atlas showed Free tier, MongoDB 8.0.32, AWS Mumbai, three replica nodes, 12/500 connections and inactive backups. Its warning still read “Nearing Storage Limit (65%).” The footer's platform status does not establish clearance of project alerts; project alert history was not refreshed here.

The visible database inventory contains nine entries: `AM07`, `G07`, `admin`, `ashstock`, `local`, `site_control`, `sourceborn`, `sourceborn_sburr`, and `test`. **`sample_mflix` is absent from this visible inventory.** This work did not remove it. Who changed it, when, whether it was backed up, and its last application/repository use remain unknown. Its absence and the overview decrease must not be presented as an agent cleanup or proven attribution.

`ashstock` displays 316.15 MB logical data, 72.42 MB allocated storage, four collections and nine indexes:

| Collection | Logical data | Allocated storage | Documents | Index bytes shown | Position |
| --- | ---: | ---: | ---: | ---: | --- |
| `scan_ledger` | 306.71 MB | 67.02 MB | 2,057 exact aggregate | 184.32 kB | Protected scan audit history; discuss archive first |
| `app_state` | 8.88 MB | 5.11 MB | 1 shown | 73.73 kB | Preserve |
| `paper_ledger` | 555.32 kB | 253.95 kB | 219 shown | 184.32 kB | Preserve |
| `upstox_auth` | 664 B | 36.86 kB | 1 shown | 73.73 kB | Preserve; no document body opened |

UI values are rounded samples, not a consistent backup. Collection/database/cluster readings are not exactly reconciled. The Free-tier quota includes uncompressed BSON documents and associated indexes; allocated storage is a different measurement. [MongoDB Free-tier limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/)

## Bounded aggregate and historical change

One explicit aggregate ran with automatic preview disabled and `maxTimeMS: 15000`; no `$out`, `$merge` or saved pipeline. It measured each original document using `$bsonSize`, then returned only totals, monthly groups and date types. `$bsonSize` measures BSON document bytes, not compressed disk allocation or guaranteed reclaimable quota. [MongoDB operator definition](https://www.mongodb.com/docs/manual/reference/operator/aggregation/bsonsize/)

| Stored creation month (UTC) | Documents | BSON bytes |
| --- | ---: | ---: |
| July 2026 | 270 | 32,238,134 |
| August 2026 | 1,091 | 168,592,829 |
| September 2026 | 696 | 105,883,539 |
| **Total** | **2,057** | **306,714,502** |

- Oldest stored creation timestamp: `2026-07-13T00:40:39.682Z`.
- Newest: `2026-09-21T09:40:11.424Z`, unchanged from the September 24 measurement.
- Largest document: 176,313 bytes; array row counts range from 60 to 75.
- All 2,057 `createdAtDate` values have BSON date type; none failed conversion. Converting `createdAt` to a date matched `createdAtDate` in all measured records.
- The two existing indexes are regular `_id_` ascending/unique and `createdAt_-1` descending, both READY; no TTL index is shown.

Relative to the [September 24 snapshot](MONGO_STORAGE_DIAGNOSIS_2026-09-24.md), the net change is **two fewer records and 137,826 fewer BSON bytes**, entirely in July's aggregate. There is no old/new raw-record comparison: this does not identify two particular deletions, an actor, or rule out offsetting inserts/updates. Stored creation dates are not last access, last attempted write or proof of scheduler inactivity.

### Conditional archive discussion—not a deletion instruction

July plus August now totals **1,361 documents / 200,830,963 BSON bytes** (200.830963 decimal MB). Keeping September would leave 696 records / 105,883,539 BSON bytes at this observation. These figures replace the old 1,363-record candidate for discussion only.

No archive destination, recoverable backup, isolated restore or deletion approval is established. The application's 250-row response limit is not an approved retention policy. Date conversion equality is useful, but no exact before/after latest-250 API comparison was performed; older point-in-time audit evidence cannot be regenerated from a fresh scan. Any eventual proposal must refresh the exact filter/count/bytes immediately before confirmation, preserve protected collections, and report actual quota effects afterward rather than promise these BSON bytes as recovered capacity.

## Production failure now observed

Authenticated Render still links **AshStocks** to `main`; its last successfully deployed commit link resolves to `226e1394d5af3f0c380593d58917b8d2ee5c13e8`. The latest deployment is displayed as Manual, “12h ago,” not the feature checkpoint. The service remains Node/Free. No deployment/settings action was taken.

A completed Application logs search for **`failed`**, **Last 7 days**, returned these three visible messages on September 28 (endpoint redacted):

| Time shown (IST) | UTC | Message |
| --- | --- | --- |
| 14:54:41 | 09:24:41 | `Upstox OAuth paper-engine run failed: connection 12 to [Mongo endpoint]:27017 timed out` |
| 17:44:28 | 12:14:28 | `Upstox OAuth paper-engine run failed: connection 4 to [Mongo endpoint]:27017 timed out` |
| 23:32:31 | 18:02:31 | `Upstox OAuth paper-engine run failed: connection 18 to [Mongo endpoint]:27017 timed out` |

The unfiltered latest-hour view independently showed the last timeout after normal `npm start` / `node server.js` startup messages. This is a scoped retained-log observation, not an exhaustive search for every error, a stack trace, or proof of the cause of every missed purchase.

The exact prefix maps to deployed `server-upstox-oauth-patch.mjs:255-256`: after `exchangeUpstoxOAuthCode` resolves, the callback schedules `runPaperEngineOnce("upstox-oauth")` and catches its rejection. Therefore **“Upstox OAuth” labels the trigger, not a failed upstream token exchange**. It does not prove all provider endpoints work either.

The engine contains multiple Mongo operations, including initial state reads/backfill, scan inserts and later state saves. Without an operation tag or stack, these messages cannot identify which one timed out or prove whether monitoring/orders had already run. The earlier offline insert-failure test remains a demonstrated possible path, not the diagnosed operation in these live failures. A connection timeout is not the same as a recorded quota-write rejection, nor evidence of RAM exhaustion. Later-day failures are outside market hours; the 14:54 invocation still lacks enough detail to establish why an eligible purchase did or did not occur.

## Recovery and next action

The current shell has no configured `MONGODB_URI`, `MONGODB_URL`, `MONGO_URI` or `MONGO_URL`; `mongosh`, `mongodump` and `mongorestore` are absent from PATH. This is scoped presence checking, not a disk-wide credential/tool search. Browser authentication does not supply a standalone export connection.

1. Securely configure an existing authorized, scoped read/export connection and agree a protected backup destination outside Git/V01. Do not put credentials in chat or exported evidence; new users/network permissions require separate approval.
2. Review the timeout with operation-level evidence from an approved standalone client or separately approved safe instrumentation. Do not boot the application or call side-effecting state/readiness/history routes as read-only diagnostics. Do not increase timeouts, weaken durability, widen network access or force writes from these symptoms alone.
3. Establish a consistent backup window and isolated restore target before cleanup. Free Atlas lacks managed backup and the oplog dump/replay options; a plain dump with concurrent writes is not a single-time snapshot. Any pause of all writers, including monitoring/exit implications, requires a separate operational decision. [Free-tier limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/), [mongodump consistency](https://www.mongodb.com/docs/database-tools/mongodump/)
4. After restore verification, present the exact archival/removal scope for user confirmation. Independently discuss scan-payload growth prevention; it is not implemented or authorized by this evidence batch.
5. Agree and verify the Render release target after the database/release gates. Current spare capacity does not justify a blind asset import, and old-code redeployment does not activate the approved feature corrections.

## Verification and limits

The monthly counts/bytes, July-August candidate, dated deltas and UTC/IST conversions were reconciled independently. Root acceptance passed 44 local checks; independent acceptance passed 49 assertions plus a three-file prose/diff and pinned-main source review. The exact aggregate contains no write stages. JSON/Markdown links, source anchors and diff were checked; no application regression suite is claimed for a documentation/evidence-only batch. The debugging skill kept measurements, source-derived interpretation, unresolved cause and proposed recovery actions separate. Main and V01 remain untouched; publishing this checkpoint is not database recovery or deployment.
