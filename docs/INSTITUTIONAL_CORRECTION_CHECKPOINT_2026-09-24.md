# Institutional evidence and dashboard recovery checkpoint

Date: 24 September 2026. Branch: `codex/valuation-targets-market-refresh`.
Parent: `256aa127f5a0fecd645b20915a2b5eab5659da4a` (additional-asset audit).

## Authority and completion boundary

The user explicitly approved an **offline institutional-data correction**: preserve unknown values, reject stale/duplicate evidence from current signals, require honest five-session coverage, and retry failed dashboard feeds. This batch implements and tests that scope only. It does not deploy, change Render settings or branch, connect to Mongo, import historical assets, refresh the production universe, alter strategy/risk thresholds, or execute production paper/broker trades. Main and local V01 remain unchanged.

This advances the Phase 6 institutional subtask, not all Data Needed items or the overall nine-phase goal. Real endpoint access, coverage, persistence and dashboard results remain to be verified after the existing Mongo/release gates. The dashboard screenshot mentioned by the user has not been supplied in the visible task, so its exact items remain unmapped.

## Defects corrected

| Previous behavior | New contract |
| --- | --- |
| Numeric conversion could turn null into zero; missing ownership components/comparisons could appear evaluated | Strict finite JSON numbers; percentages 0–100; absent components, adjacent-quarter comparison and incomplete breadth remain null |
| Any nonempty daily result could produce a value labelled five days, including two stale April records | Exact latest five completed NSE session dates must be verified and covered; insufficient, conflicting or stale records cannot produce five-day evidence |
| Quarterly ownership was labelled LIVE | Ownership is REPORTED with source, quarter-end date, original fetched timestamp and currentness; only the latest completed quarter is eligible for current advisory comparison |
| FII/DII requests failed together; one recent timestamp could hide the older feed | Independent FII/DII results, per-feed observed/fetched dates, coverage and safe error reasons; a valid peer remains independently usable |
| Failures and old success objects could stay in the dashboard indefinitely | Bounded positive/negative caches, expiry-aware display, one in-flight request, a 50-second browser deadline and a gated 60-second recovery poll |
| The first twelve failing stocks could monopolize future requests | Never-attempted/oldest-attempted due identities are tried first, with a twelve-stock request cap |
| Async work crossing session close or quarter end could attach earlier currentness | Calendar completion is evaluated after timing reads; IST day changes invalidate collection; final response and attachment recheck expiry and quarter/session context |
| Symbol-only attachment and late responses could overwrite newer evidence | Exact symbol/instrument identity; explicit ISIN consistency; new-scan revision protection; unsolicited, missing or ambiguous returned identities are not accepted as valid evidence |

## Connected flow and preserved behavior

```text
Existing Upstox token -> bounded GET-only analytics requests
  -> strict quarter / amount / identity / duplicate validation
  -> official date-specific NSE timings -> exact five completed sessions
  -> per-feed and per-stock provenance / expiry / explicit unknowns
  -> current-evidence recheck -> advisory NO03 / NO04 / NO05 / NO08
  -> scanner response -> dashboard cache / dated display / bounded retry
```

The server's institutional API and scanner attachment are wired through `server-upstox-institutional-patch.mjs` and the existing `server.js` patch chain. The dashboard uses one merge/freshness path for explicit fetches, manual scans and paper-engine scan synchronization. `index.html` loads the revised `app.js?v=20260924.2`; all cache-version guards are updated. The new backend/UI guards run under `test:institutional`, the package `guard`/`check`, the local Node-only runner and therefore the existing CI check step.

The primary scanner score/rank and hard-gate decision remain preserved; institutional scoring stays advisory. This does not force a purchase, lower a threshold, activate a sell target or change the current paper-only safety model. The new retry timer requests only the existing read-analytics POST route; it does not invoke a paper engine, import, order or valuation activation.

Historical archive derivatives identified in the additional-asset audit are **not** connected to these live provider paths. Missing-to-zero PWOI features, incomplete cash windows and dated snapshots remain ineligible source material pending source review and explicit integration. Raw files and the approximately 3 GB V01 backup are untouched.

## Provider contracts and bounds

Contracts were checked against primary documentation: [share holdings](https://upstox.com/developer/api-documentation/get-share-holdings/), [FII activity](https://upstox.com/developer/api-documentation/get-fii-data/), [DII activity](https://upstox.com/developer/api-documentation/get-dii-data/) and [date-specific market timings](https://upstox.com/developer/api-documentation/get-market-timings/). Documentation confirms the schemas, not the configured account's live access or successful responses.

- Each cold market request examines fourteen explicit calendar dates through the timings endpoint. NSE start/end timestamps must belong to the requested date. Special weekend sessions and year boundaries use returned timings, not weekday guesses. Calendar failure is explicit UNVERIFIED, not an inferred five-session window.
- Provider requests have a four-second deadline, 262,144-byte body limit, redirect refusal, safe allowlisted error codes and a shared maximum of four active requests. Shared pending work is capped at 32 and cache entries at 256. Twelve stock identities retain input order during bounded parallel reads.
- Successful stock data has a six-hour ceiling, market activity a fifteen-minute ceiling, and failed/incomplete results a thirty-second retry cache. Expiry is clipped to relevant session/IST-day/quarter boundaries. Cache hits retain original fetched timestamps.
- Identical daily duplicates collapse; conflicts fail closed. Market amounts convert INR to crore only after validation. A thirty-row provider history is acceptable when its exact five-date window is present; row count alone is not coverage proof.
- Stock observations can remain visibly historical while being ineligible for a current signal. Latest-completed-quarter eligibility is a conservative application evidence policy, not a claim about statutory filing deadlines. Legal reporting delays can therefore legitimately leave current comparisons unavailable.
- Cached past-date timings can remain cached for up to six hours. Unexpected exchange calendar amendments during that interval are a residual source-freshness limitation. No claim is made of exchange-wide streaming institutional activity or stock-wise daily FII cash attribution.

## Verification and review

Independent code review identified and resolved the longer-history UI mismatch, request-boundary freshness race and failed-first-batch starvation. The final review found no remaining blocking issue within the approved scope. An additional wording-only change retains the provider label in the ownership display.

Final local execution evidence:

- **82 package-check commands passed**, including **23 backend institutional scenarios** and **16 grouped UI scenarios**. The new guards execute the actual embedded backend helpers and actual dashboard script with fixture providers/DOM/clock, not an alternative implementation. They make no network or Mongo requests.
- **All four package-smoke-equivalent commands passed sequentially** in an isolated copy: 57 named legacy smoke checks with corrected quarterly/five-session institutional fixtures; universe rotation; valuation integration; and official-NSE unit/runtime guards. The 2,361 rotation identities are fixtures, not a new market count.
- **43 historical asset/identity Python tests passed**. `git diff --check` passed.
- Early check attempts stopped on outdated static source/cache-version assertions. Those assertions were updated to the new helper path and `app.js` version, then the entire check suite passed; failed intermediate attempts are not reported as successful checks.

The disposable copy is `/private/tmp/ashstocks-institutional-check-3hN28b`. It contains tracked source plus the two new guards and seven tracked root-data fixtures. It excludes credentials, ignored/live data and Git metadata, and links the already installed dependencies. Tests used a cleared environment, mocked external providers and owned localhost test listeners/rejection stubs. No production API or Mongo connection was made. All test-created records/files are confined to the disposable test environment.

The **151-file** source/test/fixture manifest matched the working source before and after final tests: SHA-256 `dff358509725ef23b1fcf66de64cb31138b8a9428f0056d95e62c343d266d658`. Definition: sorted root `.js/.mjs/.json/.html/.css`, recursive `lib/scripts/vendor`, and the seven copied tracked root-data JSON fixtures; each line is `<SHA256>  <relative path>\n`. Documentation, asset-review reports, runtime outputs and live data are excluded. No CI workflow file changed.

Local Node is v24.19.0; the existing CI workflow targets Node 20 and runs on main pushes/PRs, not ordinary feature pushes. Local results are not proof of a remote CI run, deployed runtime, production database health or real provider success.

## Next gates

1. Obtain the actual Atlas alarm/metrics and existing collection/history coverage read-only. A Mongo cleanup proposal still needs exact backup, collection/filter/count and impact before user confirmation and any deletion.
2. Resolve the release choice: merge reviewed work into main and keep Render on main, or explicitly change the Render branch. The last authenticated deployment evidence remains main at `226e139`; this batch does not refresh or change production.
3. After the agreed release, verify the exact deployed commit and separately test live institutional endpoint responses, dates, coverage and failure recovery. Do not treat credential presence or working prices as proof of every analytics endpoint.
4. Continue remaining asset/Data Needed coverage, including the exact screenshot list, current universe/read-back, EPS/P/E source validation, VIX/macro gaps and sequential paper-flow proof. VIX changes are not included in this institutional approval.
5. Preserve the local V01 tag/backup and complete the still-pending remote tag/release recovery publication in Phase 9.

The additional-asset audit was published separately as `256aa127f5a0fecd645b20915a2b5eab5659da4a`. This correction is a separate feature-branch publication; its final immutable SHA is reported after remote verification. Neither publication is a deployment.
