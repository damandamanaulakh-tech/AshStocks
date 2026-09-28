# AM07 archive content review completed

Reviewed on 28 September 2026 against `ef3e3d81f4c382b15a3d45c7910c32db10368957`, branch `codex/valuation-targets-market-refresh`.

All 44 immediate members of `AM.07.Parameter.Files.zip` now have complete serialized-content review evidence. This checkpoint closes the last member, `Zerodha_Stock_Trading_App_Action_Plan_META_RGL.docx`, without editing the source, adopting its strategy or changing the application. Completing this archive does not complete the whole Backenddata release, current data wiring, Mongo recovery or deployment.

## Source and inspection

The DOCX is 53,570 bytes, SHA-256 `eb2a0e4631ccaf89e6ca83f3dd027eeac54cf181994b9a6aa0c0186e47de4469`, CRC32 `fddd7f62`. Its preserved parent archive still matches SHA-256 `652be4ddb2b40915543ad848b2bfa10d011c6c2c5723a6e6a3480a85ddb2e2e5`.

- All 19 DOCX package parts passed CRC/hash checks. All 18 XML/relationship parts parse; all 15 internal relationship targets exist. There are no external relationships, active hyperlinks, embedded objects, tracked changes, comments, field instructions or native Word equations.
- Every stored text paragraph was read: 637 body paragraphs, one header and one footer. The body has 135 non-table paragraphs and 25 tables containing 166 rows, 495 physical cells and 502 paragraphs. Independent XML and python-docx readers agree.
- The bundled document renderer produced ten A4 pages. All ten page images were inspected, including every table and the source formulas. Dense tables and the network sketch continue across pages; no source layout edits were made. The render emitted Fontconfig warnings but completed successfully. Page count was independently verified with bundled `pdfinfo`.
- Body text says prepared **18 May 2026**. Core metadata dates of 2013 and cached properties claiming one page/zero words are not credible content-date or page-count evidence. The archive's July timestamp lacks a timezone and is not a market-data timestamp.

Evidence: [Package and text structure](../data/asset-review/am07-docx-structure-evidence-2026-09-28.json), [content, formulas and visual review](../data/asset-review/am07-docx-content-evidence-2026-09-28.json), [current-source consumer comparison](../data/asset-review/am07-docx-consumer-map-2026-09-28.json).

## What the document does and does not establish

This is a historical Zerodha/Kite, FastAPI, PostgreSQL and Redis implementation proposal. It describes NIFTY 200 expanding to NIFTY 500, an RSV top-five strategy, a staged paper-to-live progression and a 12-week schedule. Embedded build prompts are quoted source content, not instructions followed by this audit. Its architecture and sequence do not supersede the user's current Upstox/Mongo work or nine-phase approval plan.

The archived score totals 100: trend 30, relative strength 25, volume 20, volatility 15 and risk/reward 10; selection requires 70 or more and at most five stocks. The document explicitly permits fewer selections and forbids forcing trades. Its 20% monthly slab is an aggressive aspiration, expressly not a guarantee or authority to override risk limits.

The source's six checked calculations pass: overall score 100, trend components 30, ATR stop branch `500 - 1.5 * 12 = 482`, example target `500 + 2 * (500 - 480) = 540`, risk budget `100000 * 0.01 = 1000`, and quantity `1000 / 20 = 50`. The ATR example has no swing-low input, so it does not test the complete `max(swing low, ATR stop)` rule.

Several contracts remain incomplete: ATR score intervals meet at 3% and 5% without endpoint precedence, ATR below 1.5% lacks a score, intermediate risk/reward values lack a bucket/interpolation rule, and indicator lookbacks, buffer, rounding and nonpositive stop-distance handling are unspecified. Near-high, strong delivery, breakout-volume, loss-lock state and trailing-stop rules also need explicit definitions. These are limitations of the archived proposal, not approved repairs to current code.

The document contains **no market observations, stock financials, live instrument master or Mongo backup**. It cannot fill missing OHLCV, quotes, institutional flows, EPS or P/E. Seven prose references name outside sources but do not include active URLs or attached publications. No current broker-rule or regulatory-compliance conclusion is drawn from them.

## Current consumer differences

The consumer audit pins 23 current source files and distinguishes three paths: archived RSV scoring, the generic `/api/stock-selection/evaluate` momentum evaluator, and the actual SELECT-based automatic paper path. The generic endpoint is not proof that all of its formulas run in automatic trading.

| Topic | Archived proposal | Inspected current source |
| --- | --- | --- |
| Broker and stack | Zerodha, FastAPI, PostgreSQL, Redis | Node/Upstox/Mongo declarations; legacy Procfile remains distinct. Source is not proof of current Render command. |
| Selection | RSV five-block score, top five | Generic momentum top-ten evaluator and separate SELECT-based automatic selection |
| Sizing and stops | Risk budget divided by stop distance; swing/ATR stop | Allocation sizing and percentage-stop ticket calculations, followed by current sizing constraints |
| Technical targets | At least 2R | Target-room/percentage calculations; separately reviewed EPS x P/E 3/9/12-month scenarios require explicit activation |
| Quote checks | Configured spread filter | In the inspected automatic quote gate, spread, depth imbalance and impact are diagnostic after SELECT; freshness, full executable ask coverage, allocation coverage and circuit clearance determine `all_clear` |
| Live safety | Protective broker stops, reconciliation and staged live approval | Paper-only flags and simulated depth-backed fills; not a live broker execution implementation |

These differences are recorded for discussion, not treated as authority to replace the current broker, weights, universe, thresholds or execution policy. Definitions of standalone risk helpers do not prove end-to-end enforcement. The archived 30–60 fault-free paper-market-day requirement, daily/monthly slab locks, trailing/intraday exit policy, broker reconciliation and live-compliance gates are not proven by source labels or prior test names. No new application regression run or production safety proof is claimed.

## Accepted coverage and unchanged boundaries

Replaying the immutable coverage baseline and all accepted updates changes exactly one member from inventory-only to reviewed and AM07 from partial to reviewed:

| Scope | Before | After |
| --- | ---: | ---: |
| Whole assets reviewed | 80 / 171 | 81 / 171 |
| Partial / inventory-only / corrupt assets | 21 / 69 / 1 | 20 / 69 / 1 |
| Immediate ZIP members reviewed | 462 / 592 | 463 / 592 |
| Partial / inventory-only members | 4 / 126 | 4 / 125 |
| AM07 members reviewed | 43 / 44 | 44 / 44 |
| Cumulative member upgrades | 157 | 158 |

No other sibling, PDF or corrupt archive is promoted. Full-content review does not mean every source is correct, licensed, current, imported or approved for signals.

This six-file batch adds three evidence files and this checkpoint, and updates the coverage overlay and phase plan. Application code, raw/V01 sources, Mongo data, `main`, Render, credentials, schedulers and trades are unchanged. Atlas was authenticated on September 28; its overview and Clusters page showed 331.66 MB / 512 MB (65%), six of 500 connections, Free tier and inactive backups. These overview figures are not reconciled to collection statistics: Data Explorer failed with a generic error and cluster-specific Browse Collections remained blank after a reload. September 24 collection figures and cleanup candidates therefore remain historical; the cause of the overview decrease is unknown. Read-only collection access, a consistent verified backup/restore and exact cleanup confirmation are still required. No backup or deletion occurred. No pending code-correction request is implicitly approved by closing AM07.

Next source work is a bounded monthly-FPI content batch selected from the remaining coverage ledger. Live work resumes only when its access/backup/release-authority gates are met.
