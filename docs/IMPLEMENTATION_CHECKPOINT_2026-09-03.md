# ASH Stock implementation checkpoint — 2026-09-03

This file is the restart point for the current release. It records facts only; an item is not complete until its verification and GitHub state are explicitly marked complete below. Last updated: 2026-09-04.

## Repository state

- Repository: `damandamanaulakh-tech/AshStocks`
- Worktree: `C:\Users\j005607\Documents\Ash Stock\.codex-work\dashboard-selection-20260829`
- Branch: `codex/dashboard-selection-phases`
- Starting `origin/main`: `067c4d6659620c3db9a08f012a99492ab1ca4ce8`
- Snapshot commit: `afa171b` (`checkpoint-ashstock-portable-snapshot`)
- Push: **PENDING**
- Pull request / merge: **PENDING**
- Render deployment verification: **PENDING**

## Phase 1 — dashboard and ledger separation

Status: **IMPLEMENTED AND LOCALLY TESTED, NOT YET MERGED OR DEPLOYED**

- Separate Holdings, Performance, Paper Book, open-position, and closed-trade views.
- Closed-trade and open-trade CSV downloads.
- Left-rail routes and larger typography.
- Append-only paper ledger archive and paginated history endpoint.
- Validated editable paper-selection settings with revision/audit controls.
- Production `/api/state` ledger replacement blocked.

## Phase 2 — capital and portfolio capacity

Status: **IMPLEMENTED, WITH TWO RELEASE BLOCKERS RECORDED BELOW**

Approved current policy:

- Starting paper capital: `50000000` INR (₹5 crore).
- Maximum simultaneous positions: `500`.
- Minimum entry: `100000` INR (₹1 lakh).
- Minimum/base allocation: `0.2%` of starting capital.
- Cost-inclusive initial affordable minimum entries: `499` at the configured `0.08%` one-way cost.
- Per-cycle candidate/buy cap remains `80`; 500 is portfolio capacity, not 500 buys in one cycle.

Implemented:

- Canonical parameter registry and capital policy mirror updated.
- Server capital ledger and governed scanner locks updated to ₹5 crore / 500 positions.
- UI/help/docs and major guard/smoke expectations updated.
- Upstox quote request ceiling raised from 50 to the documented 500 instruments per call; multi-call batching is still required below.
- The Python compatibility API now reports the same ₹5 crore, 500-slot, ₹1 lakh, and 0.2% values.

Release blockers found in final review:

- Automatic BUY must reject incomplete visible ask depth. It currently can use partial ask depth or LTP and then fill the entire requested quantity.
- One-share rounding must be handled explicitly: at non-divisible prices, `ceil(₹100000 / price)` can exceed the exact ₹100000 cap by less than one share and be rejected.
- A single 500-key quote request is not sufficient when the run contains existing positions/GTT exits plus up to 80 new candidates. Requests must be batched or exit monitoring must be prioritized so no active position is silently omitted.

## Phase 3 — insufficient Upstox depth exit fix

Status: **MANUAL EXIT IMPLEMENTED AND LOCALLY TESTED; AUTOMATIC PATH NEEDS FINAL REVIEW**

Root cause:

- Upstox Full Market Quote exposes only the top five bid/ask levels.
- The server rejected an entire SELL whenever those five displayed bids did not cover the full requested quantity.
- Exact old error: `insufficient_upstox_depth_for_full_paper_fill`.

Chosen safe behavior:

- BUY stays full-depth-only.
- SELL fills only the quantity proven by visible Upstox bids at weighted bid price.
- Any unfilled SELL remainder is cancelled for that simulated IOC attempt and remains open in the paper position.
- Zero visible bid quantity remains blocked; no LTP or invented-liquidity fallback is allowed.
- Filled/unfilled quantities, consumed depth levels, price source, quote timestamp, and quote-snapshot key are persisted.

Implemented:

- Direct MARKET SELL preparation now supports server-verified partial depth execution.
- Lifecycle accounting uses actual filled quantity while retaining the original requested quantity for idempotency.
- UI notice reports actual filled and remaining quantities.

Verified locally:

- Partial visible-depth SELL, zero-bid rejection, replay protection, and quote-snapshot reuse blocking are covered by the smoke suite.
- Full-depth BUY enforcement is covered for the manual lifecycle route.
- Automatic target/stop and SELL-GTT code was implemented, but final independent review did not finish before the usage boundary. Re-review it before merge.

## Phase 4 — Watchlist viewport scrolling

Status: **IMPLEMENTED AND LOCALLY TESTED; VISUAL BROWSER ATTACHMENT UNAVAILABLE**

- The Watchlist table has an explicit viewport-height vertical scroll owner.
- Header and left navigation remain fixed; the table header stays sticky.
- Focused static guard and served-page smoke assertions pass.
- The in-app visual browser failed to attach (`Cannot redefine property: process`), so perform a live 100%-zoom interaction check after deployment.

## Phase 5 — release verification and delivery

Status: **LOCAL VERIFICATION PASSED; GITHUB SNAPSHOT AND RELEASE FIXES PENDING**

Required before claiming completion:

1. **PASS:** 38 JavaScript/MJS syntax checks.
2. **PASS:** all 14 guard scripts listed by `package.json`.
3. **PASS:** full `scripts/smoke-test.mjs`, including exit/capital/scroll assertions.
4. **PASS:** Python compile and compatibility API smoke. Full pytest was not run because pytest is not installed in the bundled local runtime.
5. **PENDING:** rerun `git diff --check` after the final checkpoint edit and inspect the complete diff/status.
6. **PENDING:** fetch `origin/main`, resolve drift, commit, and push `codex/dashboard-selection-phases`.
7. **BLOCKED FOR MERGE:** fix the three Phase 2 release blockers, rerun all verification, then create/merge the PR.
8. **PENDING AFTER MERGE:** verify the deployed commit, the Watchlist interaction at 100% zoom, and a real paper EXIT separately; health alone is not proof of working behavior.

## Resume command context

Use the bundled runtime on this Windows machine:

- Node: `C:\Users\j005607\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`
- Git: `C:\Users\j005607\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe`
- Prefer `cmd.exe`; PowerShell is blocked by policy.

Start a continuation by reading this file, running `git status --short --branch`, and fixing the first release blocker in Phase 2. Do not merge or deploy the snapshot branch until all three blockers are fixed and the complete verification sequence passes again.
