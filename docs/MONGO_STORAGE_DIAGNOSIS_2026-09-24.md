# Mongo storage diagnosis and sample-data attribution

Date: 24 September 2026. Read-only investigation against feature source `3ad1177353615eac831035803c11f4ee9140a54f` and main `226e1394d5af3f0c380593d58917b8d2ee5c13e8`.

## Outcome and authority

Authenticated Atlas inspection now establishes a **logical-storage capacity problem**, not evidence of a Mongo RAM problem. The shared `sourceborn` Free cluster in Project 0 displayed **513.13 MB / 512 MB** and 100% usage. Three open alerts concern logical size above 440 MB. No write was forced to reproduce an error; a particular failed AshStocks operation and its production exception still need runtime evidence.

The investigation read metadata, activity and one bounded aggregate. It made no database writes, deletions, index/TTL changes, backup purchases, cluster upgrades, permission changes, imports, deployments or trades. The project contains other applications' databases. Their existence or size does not authorize cleanup.

## Live Atlas observations

These are sampled UI readings, not a byte-consistent cluster backup. Logical data size and allocated/compressed storage are different measures. Rounded database totals did not exactly reconcile with the cluster overview; sampling/metric differences remain unresolved. Do not calculate guaranteed reclaimable quota from the storage column.

| Scope | Logical data | Storage | Documents | Indexes |
| --- | ---: | ---: | ---: | ---: |
| `ashstock` database | 316.28 MB | 72.42 MB | Four collections | 9 |
| `ashstock.scan_ledger` | 306.85 MB | 67.02 MB | 2,059, confirmed by aggregation | 2 |
| `ashstock.app_state` | 8.88 MB | 5.11 MB | 1 | 2 |
| `ashstock.paper_ledger` | 555.32 kB | 253.95 kB | 219 | 3 |
| `ashstock.upstox_auth` | 664 B | 36.86 kB | 1 | 2 |
| `sample_mflix` database | 101.11 MB | 103.17 MB | Six collections | 10 |

Authentication document bodies were not opened. `scan_ledger` has `_id_` and a regular descending `createdAt` index, not a TTL index. Scan history is protected audit evidence, not disposable data merely because it is large.

The three open logical-size alerts were created on 10 September 2026 at approximately 00:18 UTC, 00:27 UTC and 15:35 UTC. Corresponding activity entries show 05:48:15, 05:57:20 and 21:05:52 IST. An earlier threshold event at 05:30:12 IST is also visible. These concern replica nodes of the same cluster, not three separate databases.

### Bounded scan-history measurement

A read-only Data Explorer aggregation used `maxTimeMS: 15000`, with automatic preview disabled and no `$out` or `$merge`. It projected BSON size, converted `createdAtDate`, and row count before grouping totals/months. Only aggregate results are recorded here, not portfolio or individual scan content.

| Stored creation month | Documents | BSON bytes |
| --- | ---: | ---: |
| July 2026 | 272 | 32,375,960 |
| August 2026 | 1,091 | 168,592,829 |
| September 2026 | 696 | 105,883,539 |
| **Total** | **2,059** | **306,852,328** |

- Oldest stored creation time: `2026-07-13T00:40:39.682Z`.
- Newest stored creation time: `2026-09-21T09:40:11.424Z` (15:10:11.424 IST).
- Largest document: 176,313 BSON bytes; rows per document range from 60 to 75.
- Missing/unconvertible creation dates: zero.
- Month counts and byte totals reconcile exactly with the aggregate total.

These are the creation timestamps stored in existing records, not the database's last access, last attempted write, or proof that the scheduler stopped at that instant. A mode facet returned 192 groups but its values were not inspected and are not interpreted.

## Why storage can grow while prices still work

Source tracing establishes a plausible application failure path, separate from observed Atlas metrics:

1. In the unchanged vendored base, `MAX_SCAN_LEDGER_RECORDS = 250` bounds in-memory/read results, **not Mongo retention**. `appendScanRecord` inserts a new document; `buildScanRecord` assigns a new UUID/time. There is no deduplication or Mongo pruning in that path. See `vendor/base-server-37a9e9ceacabd33bc5a2085ad621e368f8fc0cd8.mjs:57,503,605-606,627-636,1163-1165,1214-1224`.
2. Main's paper-engine cycle appends a scan record even when reusing a recent scan. That awaited append precedes quote/position monitoring and order processing (`server-paper-engine-autobuy-patch.mjs` at main, approximately lines 346-364). A rejected Mongo insert can therefore stop that cycle even while Upstox price calls work. This is source-supported causality, not a captured production exception.
3. The feature branch additionally appends a full compact scan from universe rotation and from the engine (`server-universe-rotation-patch.mjs:81`, `server-paper-engine-autobuy-patch.mjs:381`). A fresh engine batch can store two payloads. This feature-only path is **not the explanation for currently deployed main's history**, but it is a pre-deployment growth risk.
4. The previous paper-archive work fix reduces repeated paper-ledger upserts; it does not solve scan-ledger accumulation. Compact scan rows retain metrics/gates/targets and derived candle/pre-rise results, not the raw 266-candle history or the complete formula tunnel. New offline formula lookback work is not established as the cause of the current 306.85 MB collection.

Proposed prevention, not implemented or approved here: preserve every audit event but store immutable scan evidence once per verified scan identity, with small references for repeat/rotation/engine events; enforce explicit serialized-size and growth budgets; test crash/retry/read-back compatibility. Any archive/retention policy requires an independently verified backup/restore path and exact user-approved scope. Do not substitute an arbitrary 250-record TTL. Turning off auto-buy alone does not stop scan appends; pausing the whole scheduler can also pause exit monitoring and requires an operational decision.

## `sample_mflix`: when and which repository?

The user explicitly requested attribution before considering cleanup. Current result: **cluster-level sample-load request supported; consuming repository and last application use not established**.

### Atlas history and metadata

The project Activity Feed was filtered to **Sample dataset load requested**, over 1 May through 24 September 2026. It returned one visible event, with previous/next pagination disabled:

- **29 May 2026, 11:52:12 AM IST** (`2026-05-29T06:22:12Z`).
- Cluster: `sourceborn`; initiated by **System**; severity **AUDIT**; category **General**.

The event records a cluster-level sample-load request, not a successful completion timestamp for `sample_mflix`, not its last read/write, and not a GitHub repository association. Its name and collections align with MongoDB's documented sample movie database; no claim is made that every live document is still identical to the original sample.

| Collection | Logical size | Displayed document count |
| --- | ---: | ---: |
| `comments` | 11.69 MB | 41K |
| `embedded_movies` | 54.92 MB | 3.5K |
| `movies` | 34.12 MB | 21K |
| `sessions` | 540 B | 1 |
| `theaters` | 349.83 kB | 1.6K |
| `users` | 29.57 kB | 185 |

Abbreviated counts above are UI approximations, not exact counts. No users/sessions document bodies were inspected. The `movies` index panel showed `_id_` usage 1 and its text index usage 0, both since 9 September 2026. Our preceding Data Explorer read may itself explain the one operation. Index counters are node/window-specific, can reset, do not include all collection-scan activity and do not identify a repo or last-use timestamp. They are not proof of inactivity.

### Repository search coverage

Literal `sample_mflix`, name variants and broader `mflix` searches found no matches in the checked source/configuration or available Git history:

| Local project / configured GitHub target | Available history checked | Current text files checked |
| --- | --- | ---: |
| AshStocks / `damandamanaulakh-tech/AshStocks` | 17 refs, 443 reachable commits; non-shallow | 244 |
| C-SB / `damandamanaulakh-tech/C-SB` | 12 refs, 759 reachable commits; non-shallow | 345 |
| LLM / configured `damandamanaulakh-tech/XURR` | Local Git has unborn HEAD, zero refs/commits; no history claim | 270 |

Total: 859 current text files, including JSON; dependencies, raw datasets, backups and generated runtime files excluded. The outer Ash repository is empty/unborn and does not add independent history. The LLM nested Sourceborn files were searched as current files, not invented Git history. Local environment examples and available historical environment-file searches were handled as presence/file metadata only, without exposing values. An additional connected-owner GitHub default-branch code search returned no result; that search does not prove coverage of inaccessible/unindexed repositories or all remote branches.

AshStocks explicitly selects `ENV.MONGODB_DB || 'ashstock'` in the vendored base at line 602, and `render.yaml:25-26` names `ashstock`. This supports separation from `sample_mflix`, but a deployed override still needs verification. The local nested Sourceborn Node connector uses `mongoose.connect(process.env.MONGODB_URI)` without a `dbName` override; an external URI could select a database not named in source. Its local-only launcher clears that URI. The Python LLM compose configuration uses SQLite; current non-raw C-SB code/docs had no Mongo connector references.

**Conclusion:** no checked repository is evidenced as a consumer of `sample_mflix`. No precise last-application-use date can be reported. External deployment configuration and retained client/audit records could change attribution. Do not label the database unused or delete it from these negative searches alone.

## Backup, access and remaining gates

- Atlas Backup displayed an introductory upgrade page, with no available backup/snapshot shown. No live Mongo backup or restore was verified. The existing V01 code/raw archive is not a substitute for a database backup.
- The local process had no configured Mongo URI and `mongodump` was not in PATH. No credential was requested in chat or extracted from authentication records. A securely configured, scoped backup route remains required.
- A fresh Render visit redirected to sign-in. Earlier same-day deployment evidence in `RENDER_RELEASE_GATE_CHECKPOINT_2026-09-24.md` remains historical, not refreshed here. No production readiness endpoint with write behavior was invoked.
- Before cleanup: establish ownership, export/verify relevant collections and indexes, prove restore, measure exact candidate counts/bytes, present preservation/impact plan, and obtain separate deletion confirmation. No candidate is approved by this checkpoint.
- Before deployment: resolve the release target and scan-growth risk, verify intended commit/health/readiness and rollback. Do not bulk-load market assets into the current full cluster.

## Additional Data Needed / release hazard

The legacy `server-data-intelligence-patch.mjs:115-119` contains a hardcoded **8 June 2026** FII/DII snapshot. `server-intelligence-score-patch.mjs:30-32` scores that flow without a freshness guard, with a 10% legacy intelligence weight. `server.js:269` installs this path. It is separate from the recently corrected institutional/Upstox NO08 path; those corrections do not establish that every institutional consumer is fresh. Add historical-only labeling or a validated dated replacement to the discussion/approval queue. Do not silently change weights, thresholds or activation. No automatic hard-gate bypass was established from this finding.

## Primary references

- [Atlas storage FAQ](https://www.mongodb.com/docs/atlas/reference/faq/storage/): storage limits and write consequences; example errors are documentation, not captured errors from this application.
- [Atlas cluster comparison](https://www.mongodb.com/docs/atlas/manage-clusters/): Free storage allowance.
- [Free cluster limitations](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/): backup limitations and manual backup alternative.
- [MongoDB sample movie database](https://www.mongodb.com/docs/manual/sample-data/sample-mflix/) and [loading sample datasets](https://www.mongodb.com/docs/atlas/sample-data/load-sample-data/): sample origin, not live-use attribution.
- [Index usage statistics](https://www.mongodb.com/docs/v8.0/reference/operator/aggregation/indexstats/): operation counters, observation start and reset limitations.

Documentation/audit only. No application regression suite was rerun for this checkpoint. Code review and structured debugging separated current observations, source-supported failure paths, proposals and unknowns.
