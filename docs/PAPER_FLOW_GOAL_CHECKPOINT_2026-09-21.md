# AshStocks code goal — opened 21 September 2026

Repository: `damandamanaulakh-tech/AshStocks`; working branch: `codex/valuation-targets-market-refresh`.
Starting commit: `51463fa3c850299c2e647614681ef29f02a86bfb`. Last reviewed: 24 September 2026.
This document records code work and its release boundary, not production deployment.

## Scope and boundaries

The user reports working real-time stock/index prices and requests code fixes, divided into bounded phases. Preserve the saved formulas, thresholds, paper holdings/ledger, `main` and V01. Do not force purchases, pad the stock universe, change Render settings or treat a successful local test as production proof.

## Work pieces

1. **Backend selection pipeline — implemented and tested.** Scheduled/manual runs now use persisted universe rotation. The engine reuses only a trusted, current, unconsumed committed batch. Nested mutation locks are avoided, and the final paper-state save retains the committed cursor. Holding history comes from the provider before selection, not from missing persisted candle fields. Every non-self holding must also have a finite comparison using the existing correlation helper.
2. **Dashboard outcome reporting — implemented and tested.** The browser displays the exact engine scan and separates SELECT, buy tickets, fills, rejections and pending counts. It observes scheduled results at startup and every 60 seconds, even with no local SELECT rows. A persistent outcome card shows blockers and failures without replacing manual-action notices. No second UI-only buy rule is added.
3. **Regression verification — passed.** All 72 commands in the package `check` script passed against the final frozen source using the Node-only runner. The final isolated smoke passed all 57 named checks, followed by passing rotation, valuation-integration and official-NSE unit/runtime suites. Sources matched before and after the run.
4. **Release handoff — in progress.** Save the final tested implementation, publish only the existing feature branch without force, verify the remote ref, and record the exact commit/tree. Deployment, live universe import and actual paper fills remain separate milestones.

## Confirmed defects at the starting commit

- `runPaperEngineOnce` bypasses `runNextUniverseBatch`, so unattended runs can repeatedly scan the prioritized first 200 names.
- Persisted positions contain no candles. Passing them directly into correlation without fetching histories can put new candidates into `DATA_NEEDED` even with working quote access.
- The UI refreshes orders but retains the old scan, labels post-filter tickets as SELECT count, and can display “BUY Ready” alongside a rejection.

## Requirement-to-evidence map

| Requirement | Implementation / regression evidence |
| --- | --- |
| Reach the saved universe rather than repeatedly scanning the first 200 | `server-universe-rotation-patch.mjs`; `paper-engine-flow-guard.mjs` proves disjoint 2 + 2 + 1 batches, cursor persistence, same-day fresh-import reset and changed-identity invalidation. Production batch size remains capped at 200. |
| Safe scan reuse | Internally committed batches only; checks universe revision/fingerprint, saved settings revision, holding fingerprint, age, date and rotation progress; consumed once. Regressions reject ad-hoc, expired, future-dated, changed-settings and changed-holdings scans. |
| Complete holding inputs | `server-holdings-history-patch.mjs`; real history resolved by exact instrument identity, unique saved-master fallback only, bounded concurrency and retry. Fetch/identity/short-history failures return `holding_history_incomplete` without advancing rotation or changing the ledger. Successful fetches with non-overlapping dates, constant prices, duplicate dates or too few overlapping returns produce candidate-level `DATA_NEEDED` with missing-holding identities. Runtime tests prove rotation continues but no SELECT/tickets/fills are created for affected candidates. |
| Explain why a candidate was not bought | Server diagnostics distinguish no SELECT, already held, disabled automatic buying, Kelly risk, position capacity, buying power and run capacity; existing quote/depth rejections remain authoritative. Missing UI counts are not reported as zero. |
| Synchronize both manual and scheduled outcomes | `app.js` and `paper-engine-ui-guard.mjs`: exact returned scan, dated rejection labels, stale-response protection, duplicate-button lock, deduplicated status polling and once-per-new-success order refresh. Polling does not submit orders or start scans. The existing orders GET may persist refreshed quote marks. |
| Fresh official NSE integration | Existing three-source company-membership importer passes route/unit/store regressions; fresh-source failure preserves prior data, fund-like/non-company rows are excluded, and counts are never padded to 2,400. These are mocked integration tests, not a new live import. |
| Preserve formulas and valuation behavior | Bundled-source hash, selection, parameter, capital, paper-lifecycle and annual EPS × base P/E / 3-9-12-month valuation guards pass. No saved thresholds, assumption dates, target activation rules or formula library files were changed in this phase. |
| Recoverable progress | Feature-branch commits and this dated checkpoint; no merge, reset, main-branch write or V01 modification. |

Independent final review of the correlation wrapper and its production injection found no further actionable issue in the bounded normal/missing/self-history scope. Original complete-input correlation results are compared directly in tests; the availability wrapper is intentionally stricter only when a required comparison cannot be computed.

## Reproduction and isolation

Use the repository's Node scripts. On a normal npm-equipped machine:

```sh
npm run check
npm run test:rotation
```

This workspace has Node `v24.19.0` but no npm executable. The checked-in fallback expands the exact allowlisted package scripts and invokes them with the same Node executable; it does not install dependencies or run arbitrary shell/lifecycle commands:

```sh
node scripts/run-local-checks.mjs check
node scripts/run-local-checks.mjs test:rotation
```

Run `npm run smoke` only in a disposable source copy or clean CI checkout: the legacy harness writes fixture data beneath its working tree. The equivalent four commands are `node scripts/smoke-test.mjs`, `node scripts/universe-rotation-guard.mjs`, `node scripts/valuation-integration-guard.mjs`, and `node scripts/official-nse-master-guard.mjs`. The local run uses isolated fixture stores, mocked upstream prices/history/master responses and loopback-only servers; never point it at the user's database or credentials.

The smoke fixture now seeds a persisted fixture universe and mocks instrument-specific histories instead of using an ad-hoc scanner response as execution authority. Its distinct return series pass the unchanged correlation threshold; it continues to test full ask-depth fills, insufficient-depth rejection, pending candidates, no duplicate holdings, GTT, exits and concurrent mutations.

### Final proof — 24 September 2026

- `node scripts/run-local-checks.mjs check`: exit 0; all 72 package-defined commands passed after the final comparability change.
- All four package-smoke commands: exit 0 in `/private/tmp/ashstocks-final-paper-smoke-xHw08e`. The 57 named legacy checks passed, as did rotation unit/UI/storage/API checks (a 2,361-identity **fixture** in 12 disjoint batches), valuation integration, and official-NSE unit/runtime checks.
- `git diff --check`: passed. No tracked changes beneath `lib/`, `vendor/`, `data/`, `ashstocks/`, or deployment configuration in this phase.
- The 145-file isolated source/test/fixture manifest matched the working source before and after the final smoke run. Aggregate SHA-256: `d056b7a4f62c05ac2fb859587f2ec45fc96e0245de090c31023ebbf88a05cef6`.
- Manifest definition: sorted relative paths for root-level `.js`, `.mjs`, `.json`, `.html` and `.css` files plus recursive `lib/`, `scripts/`, `vendor/` files and copied tracked `data/` fixtures. Each line is `<file SHA256>  <relative path>\n`; the aggregate hashes the concatenated manifest. Live data, credentials, `.git`, runtime outputs and documentation are excluded. Dependencies are supplied by the installed dependency tree, not copied user configuration.
- Final holdings patch SHA-256: `6ca20955cb73976bd42e4e857789c0e11f1503ff601353bbb9a4cdf4046cd03b`; holdings guard: `0bf581cf984278a34c0d7308f44d0f9b646a7dd230d258f59b7546c83784890b`.

## Baseline and publication status

Before publication on 24 September, GitHub's feature ref was verified at the starting commit above and remote `main` at `226e1394d5af3f0c380593d58917b8d2ee5c13e8`. Local `main`, `origin/main` and `V01-2026-09-07` also resolve to that baseline. The exact remote V01 tag was not returned by `ls-remote`; this phase does not claim V01 release-asset publication.

Final implementation and smoke proof are complete. The implementation commit and verified publication will be recorded in a documentation-only follow-up after the feature push succeeds; no deployment is implied.

## Remaining release boundary

- No Render settings, deployed branch or production database was changed. September 16 observations remain historical; this phase did not recheck production behavior.
- No live official master was imported, no round-number stock count was fabricated, no real-market scan was triggered and no user portfolio order was placed by this work.
- Local regression success is not CI, deployed-build or real-provider proof. CI currently uses Node 20; local verification used Node 24.19.0. A feature-branch push alone does not trigger the main-only push workflow.
- Production follow-up needs a separately agreed release target, deployed commit verification, a backed-up metadata-only official import and read-back, then observed scheduled scan/candidate/blocker results. Do not lower selection rules to manufacture a purchase.
- V01 release-asset publication remains a separate earlier outstanding item.

## Resume protocol

1. Read this file and `NSE_REPLACEMENT_CHECKPOINT_2026-09-14.md` before resuming.
2. Verify the exact feature ref, clean worktree and preserved baseline; do not infer push or deployment from a local commit.
3. If code changes, repeat the guards and isolated smoke against the new source before publishing.
4. Keep the next production/import phase distinct from this code goal and discuss its specific target and evidence first.
