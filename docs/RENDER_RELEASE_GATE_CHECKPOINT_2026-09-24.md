# Render baseline and exact-release verification checkpoint

Date: 24 September 2026. Parent: Phase 1D `00a81c50436313c1735a91b30a78311cd4336b5d`.
This batch prepares Phase 4 verification and refreshes Phase 1/2 access evidence. It does not deploy, merge into main, change Render settings, query Mongo, import data or delete anything.

## Authenticated Render evidence

The authenticated Render dashboard was inspected read-only for **AshStocks**, service `srv-d9ftum6rnols73edgkvg`, in the `ash-stock` project. It is the service linked to `damandamanaulakh-tech/AshStocks` and `https://ashstocks.onrender.com`; similarly named or unrelated services were not treated as this application.

| Setting / observation | Observed value |
| --- | --- |
| Repository branch | `main` |
| Latest live deploy commit | `226e1394d5af3f0c380593d58917b8d2ee5c13e8` |
| Latest deploy | User manual deploy; `dep-daqhj5lg1s2s738gdri0`; September 24 logs show startup at about 18:08 IST and service live at 18:08:21 |
| Runtime / commands | Node; build `npm install`; start `npm start`; runtime log confirms `node server.js` |
| Root Directory | Blank |
| Auto-Deploy | On Commit |
| Health Check Path | **Blank in actual settings**, despite repository `render.yaml` specifying `/api/ready` |
| Compute | Free, 0.1 CPU / 512 MB RAM, Oregon |
| Shell | Not available for Free compute; no command executed and no upgrade selected |

This is fresh evidence that a recent redeploy still used old code. It explains why publishing the feature branch has not updated this main-linked service. It does not prove that deployment age caused every dashboard or trading issue. Main and the V01 tag remain unchanged; release-branch choice still requires confirmation.

The bounded application-log search for `Mongo` over the last seven days returned no matching entries. Recent startup logs were normal npm/Node/live messages. This is **not** evidence that Mongo is healthy, that no alarm exists, or that all logs were reviewed. Render's 512 MB application RAM allocation is not a Mongo storage-size measurement and must not be conflated with the preserved local V01 backup.

MongoDB Atlas redirected to sign-in. The login tab was left for the user to authenticate; no password/token was requested, viewed or entered. Actual alarm type, affected cluster, collection sizes/counts/indexes and growth metrics remain unavailable. The earlier bounded archive-work code fix is not a diagnosed explanation for the production alarm.

## Exact-release verification changes

- Successful `/api/ready` responses now include the same platform-provided commit metadata as liveness: `RENDER_GIT_COMMIT`, then `RENDER_COMMIT`, otherwise null. No storage, archive, trading or risk behavior is changed by this field.
- `scripts/check-live-render.mjs` requires explicit full `LIVE_EXPECTED_COMMIT` before any request. A known old/missing health commit prevents proceeding to readiness on that attempt.
- Success requires **health -> readiness -> health**, with the exact expected commit independently checked on all three responses. Provider/release/engine, paper-only mode, durable Mongo storage, persistence, auth configuration and Upstox credential visibility remain required.
- Requests use HTTPS origins, refuse redirects, bound retries/delay/duration/body bytes and emit only allowlisted output. Native error details, raw response bodies and arbitrary provider fields are not echoed.
- Importing the checker makes no requests. `scripts/live-render-guard.mjs` uses mocked fetch and offline CLI fixtures. The package guard and local Node-only runner execute that offline suite, not live readiness.
- The existing main-push GitHub workflow supplies `LIVE_EXPECTED_COMMIT` from `${{ github.sha }}`. The workflow trigger/release branch is not changed.

The three-response check detects **observed** mixed-version responses during a rolling deployment. It does not guarantee every instance is converged or prevent a load balancer from routing readiness to an old instance after a matching health response. Reported commit metadata is not a cryptographic attestation of deployed files. Successful credential-visibility checks do not establish valid tokens or functioning individual provider endpoints.

Readiness can initialize/read/persist application state under the existing implementation. Therefore the live verifier is a release-operation check, not a side-effect-free Mongo diagnostic. **It was not run against production in this batch.** Deployment itself may start schedulers or persistence paths; readiness and paper-flow proof require the agreed release and database gates first.

## Verification

Independent review found no blocking issue. Local verification against the final code:

- 78 package-check commands passed, including the 17-scenario exact-release guard. Guard fixtures make zero network requests and cover missing/invalid SHA, old health, readiness SHA mismatch, changing final health, unchanged safety assertions, retries, HTTP failures, redirects, error redaction, invalid JSON/UTF-8, bounded streamed bodies and timeouts.
- Isolated four-command package-smoke equivalent passed: 57 named legacy checks plus new primary/fallback/null readiness-commit assertions, then rotation, valuation integration and official-NSE unit/runtime suites. The 2,361 identities used by rotation are a test fixture, not a refreshed market count.
- 43 existing offline historical asset/identity tests passed. `git diff --check` passed.
- The first sandbox smoke attempt could not bind localhost (`listen EPERM`). The approved isolated rerun with loopback listeners passed; the failed sandbox attempt is not counted as a passing run.

The disposable copy is `/private/tmp/ashstocks-release-check-kcQrZ1`. It contains Git-listed source, the new offline guard and seven tracked data fixtures, with the installed dependency tree linked. It excludes credentials, live/ignored data and Git metadata. Runs used a cleared environment; provider HTTP was mocked and the production-Mongo failure test used an owned localhost rejection stub, not an external database.

The 149-file source/test/fixture manifest matched the working source before and after checks; SHA-256 `2ff34ee0599bf44734162427659ac4284ba4bb6a65131bc6023c4fd18d7a93ed`. Definition: sorted root `.js/.mjs/.json/.html/.css`, recursive `lib/scripts/vendor`, and seven copied tracked root-data JSON fixtures; each line is `<SHA256>  <relative path>\n`. Documentation, asset-review reports, live data and runtime outputs are excluded. The workflow file was compared separately and matched. Checker SHA-256: `033ef87f247cbd100b42a9174ca0c4c5764d259fc41c4cb093e9394acd6419e0`; offline guard: `da90e3cae99feece7868ef220387b6b9344d91fbbfe3ae68162a8a6fd62cfdd7`.

Local Node is v24.19.0; CI is configured for Node 20. This is not a claim of a remote CI run or production-runtime success. Ordinary feature-branch publication does not trigger the existing main-push/PR workflow.

## Release and Mongo gates still required

1. User chooses whether to merge reviewed feature work into main and keep Render on main, or explicitly repoint Render to the feature branch while preserving main. No silent branch change or merge.
2. Obtain the Atlas alarm/metrics and inspect existing history/collections read-only. If cleanup is necessary, propose exact collection/filter/count/backup/impact and obtain confirmation before deletion. Preserve holdings, orders, trades, audit, auth, settings, formulas and raw assets.
3. Record the chosen final full commit and rollback reference; complete intended-runtime/CI checks. Review the blank Render health-check setting and configure the agreed readiness check only as part of the authorized release.
4. Deploy the agreed commit. Verify platform build/start status and exact-response commits with the new gate, then separately prove provider endpoints, persistence/read-back, fresh universe, dashboard coverage and sequential paper flows.

Neither the CSV audit nor this release guard marks Phases 2–8 complete. The active nine-phase plan continues to track those outcomes separately.
