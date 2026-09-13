# AshStocks phased delivery checkpoint — 12 September 2026

Repository: `damandamanaulakh-tech/AshStocks`

Working/release-review branch: `codex/valuation-targets-market-refresh`.

The user requested small phases that are verified and pushed before proceeding, to avoid losing progress at account usage limits. A phase is not described as published until its GitHub branch ref is verified. Publishing does not mean deployment, database refresh or trade activation.

| Phase | Deliverable | Checkpoint |
| --- | --- | --- |
| 1 | Dated annual EPS × P/E engine, twelve initial assumption sets, deterministic unit tests | Published commit `1d63abdcd89a2c3d57719834e4765160f70bd05d` |
| 2 | Fresh official NSE/suspension imports, dated reference data, provenance, validation and import/rotation tests | Published commit `b44db8c67ec55053d495964b69d66da252aafe29` |
| 3 | Sell Targets UI, storage and audit, explicit paper-target activation, manual/automatic exits, regression tests | Published commit `3cde3cd8930f3207de6840e350b8025df6a85db6` |
| 4 | Fresh NSE company-list membership, exact Upstox identity matching, stock-only EQ replacement | Published and verified commit `2b998afef33c95e2c202b709a41fe57a2cbd9b16`; implementation, BRICS evidence and live release gap described in `NSE_REPLACEMENT_CHECKPOINT_2026-09-14.md` |
| 5 | V01 release-asset publication and production rollout | Separate outstanding items; not completed by these feature commits |

## Verified implementation state

- On 12 September: 18 package guard suites, 46 syntax checks and the separate rotation guard passed on the final implementation tree before this checkpoint document was added.
- The prior isolated full legacy smoke run passed all 57 named checks. Provider traffic was mocked; localhost listening required approval. This did not touch the working/live portfolio database.
- Activation cannot place an immediate order. It requires explicit confirmation, reviewed dated inputs, a matching holding and fresh provider price above entry/current/stop. Assumption updates cannot move a frozen active target.
- Same-price BUY scale-ins change the holding generation; stale activations remain blocked even if the quantity later falls. Manual and automatic monitor paths retain provider timestamps separately from local response receipt time.
- Real market evidence is the snapshot fetched on 10 September at 01:32 IST from provider files modified on 9 September. It contains 2,342 official NSE_EQ/EQ candidates under the existing filters, **not 2,400 newly listed companies**, and not 2,342 verified individual-company stocks. All twelve requested symbols/ISINs are present. Its 58 fund-like candidates are separately catalogued.
- Formula inputs remain dated 9 September. No reference date, EPS assumption or valuation horizon is moved forward just because the current date changes.

## Explicitly not done

- No merge into `main`; the baseline remains `226e1394d5af3f0c380593d58917b8d2ee5c13e8`.
- No Render deployment or production MongoDB import/validation in this batch.
- No activation of user holdings and no live broker order.
- No declaration that the old V01 GitHub release upload is complete. The preserved local V01 baseline and the unfinished release publication are separate facts; re-inspect the draft release/assets before resuming that step.
- No fabricated EPS/P/E for the remaining market candidates, no claimed calibrated price predictions and no synthetic stocks added to reach a round count.

## Resume protocol

1. Read this checkpoint and `VALUATION_TARGETS_MARKET_REFRESH_2026-09-10.md`.
2. Check `git status`, the exact feature-branch ref and commit tree on GitHub. Never infer a completed push from staged files or a configured remote.
3. Verify current account usage before selecting the next bounded phase. The account limits are shared and change; do not treat an earlier percentage as current.
4. Phase 4 replacement is approved; read its 14 September checkpoint. Treat deployment/V01 credentials and approval as their own release boundary.
5. Keep each approved phase on the feature branch, test it, push without force, verify its ref/tree, then update the checkpoint. Do not leave a large new batch only in local edits.
