# Dated valuation targets and official market refresh

Implementation date: 10 September 2026 (IST). Assumption reference date: **9 September 2026**, deliberately not moved forward by a refresh.

Branch: `codex/valuation-targets-market-refresh`, based on `8afc67b97b605622afde95133165aa2216dd8e7a`. This feature does not change `main`, deploy Render, refresh the live portfolio database, activate a user's targets or submit broker orders.

## What is wired

The **Sell Targets** dashboard section and `/api/valuation-targets` expose dated, per-instrument annual EPS and P/E scenarios. Twelve initial analyst-assumption records correspond to BBL, LATENTVIEW, JWL, RAILTEL, KEC, TRANSRAILL, GODFRYPHLP, BSOFT, ZENSARTECH, RHIM, SURYAROSNI and THERMAX. The user's prices are reference anchors, not newly verified market quotes. Source links provide research context; they do not turn these assumed EPS/multiples into reported earnings or validated forecasts.

Every seed starts with corporate-action review **false**, no active sell target and a review-validity deadline of 7 January 2027. Other instruments return `DATA_NEEDED`; EPS and P/E are not generated from symbol names, candles or the instrument master. Invalid/non-positive earnings or multiples do not produce substitute targets.

## Formula contract

Let `P0` be the frozen reference price, `E` the assumed normalised annual EPS, and `PE_L`/`PE_H` the explicitly assumed low/high base P/E.

| Output | Formula |
| --- | --- |
| Midpoint base P/E | `PE_L + (PE_H - PE_L) / 2` |
| 12-month low / midpoint / high | `E × corresponding base P/E` |
| 3-month marker | `P0 + (12-month scenario price - P0) × 3/12` |
| 9-month marker | `P0 + (12-month scenario price - P0) × 9/12` |
| Reference-price upside | `(scenario price / P0 - 1) × 100` |
| 12-month bear sensitivity | `bear EPS × bear P/E` |
| Optional 12-month bull sensitivity | `bull EPS × bull P/E`, only if both were supplied |
| Horizon date | Reference date plus 3, 9 or 12 calendar months, clamped to month end |
| Fixed paper trigger | Selected low/mid/high price rounded upward to an internal ₹0.01 grid |

The ₹0.01 increment is an internal exit threshold, **not an exchange limit-order tick**. Paper market fills use executable Upstox bid depth and the existing cost model, not the scenario price. Values exclude dividends, tax and costs. The 3/9-month markers are linear interpolation, not independently calibrated predictions, probabilities or forced sale dates. Bear sensitivity is not a guaranteed floor.

## Separate assumption saving from execution authority

1. Review the correct symbol/ISIN, sources, normalised annual EPS, share-adjustment basis, dates and rationale. Save a revision with a reason. This updates valuation metadata only.
2. Select an existing open paper holding, horizon and low/mid/high policy. Explicitly confirm activation and supply a reason.
3. The server recalculates with its current clock, requires the market to be open and a matching provider-timestamped quote no older than 60 seconds (maximum 5 seconds future tolerance). A target at/below current price, entry or stop is rejected. A local fetch receipt timestamp cannot prove price freshness.
4. Activation persists a frozen assumption/model/price snapshot with holding identity, opening basis, authorised quantity, revision, quote evidence and audit entry. No order is placed by activation.
5. Manual and automatic paper monitors use the same frozen target and fresh provider timestamp plus executable bid depth. Partial fills keep the reviewed remainder; new BUY scale-ins, including same-price manual/GTT scale-ins, change the holding generation and require reactivation.
6. Expired/horizon-due assumptions, changed share basis, changed holding identity/generation or missing current master identity block valuation exits. Existing stop controls remain effective. A blocked valuation does not silently fall back to the old technical target. Explicit deactivation restores the technical target and does not itself place an order.

Assumption edits do not move active snapshots. Optimistic revision checks reject stale forms and quote-fetch races. Generic state updates cannot overwrite valuation authority. The memory/file/Mongo metadata methods preserve the trading ledger and scanner settings; Mongo uses dotted-field updates only. New valuation exit orders/trades retain full snapshots. Legacy transactions do not gain empty valuation fields, preserving their archive identity.

The old non-activated technical advisory behavior is unchanged. No selection gate, risk sizing or broker-write permission was relaxed. Activating targets requires persistent storage in production. Session authentication uses the existing application boundary.

## Official source refresh and dated data

The **NSE / Upstox** button downloads both exact official public instrument URLs on every import request. It does not read the saved snapshot or recycle the existing universe as a fresh source. It then continues the existing paced full-universe scan workflow (200-row batches). The existing paper engine can act on qualified selections when enabled; the master import itself only replaces scanner metadata and does not add portfolio holdings.

The official instrument master contains identities, not per-company EPS, forecast multiples or historical candles. The provider documents the instrument and suspension files, daily refresh behavior and stable `instrument_key` usage at [Upstox instruments](https://upstox.com/developer/api-documentation/instruments/). A fresh download may contain the same companies; the response separately reports added, updated, removed and unchanged identities.

Downloads are bounded by time and compressed/decompressed size. Alternative URLs, redirects, invalid/conflicting identities, empty eligibility, excessive storage size, stale source dates and unavailable suspension status fail safely without overwriting the last good master. Missing Last-Modified is explicitly unverified, not silently labelled current. Snapshot hashes preserve the exact downloaded and decoded master identity. Known official `DUMMY...`/`DUMMYY...` suspension placeholders are accepted only as matching pairs and symbol-only exclusions; they are never importable stock identities. Other malformed records remain fail-closed.

Live-source validation and export completed at **10 September 2026, 01:32:22 IST**, using provider files last modified **9 September 2026, 05:30:06/08 IST**:

| Check | Result |
| --- | ---: |
| Raw NSE master records | 77,068 |
| Unique NSE_EQ / EQ identities | 2,648 |
| Excluded by existing fund-name filter | 293 |
| Excluded as suspended | 13 |
| Retained official candidates under existing filter | **2,342** |
| Shortfall versus requested 2,400 | 58 |
| Duplicate symbols / keys in retained snapshot | 0 / 0 |
| Requested 12 stock identities present | 12 / 12 |

The dated artifact is `data/official-nse-master-2026-09-10.json`. It is a **reference snapshot, not proof the live application database was refreshed**. Its added-count comparison is against an empty reference artifact, not the live saved universe. Run `npm run snapshot:nse` for a new dated export; exclusive creation prevents overwriting an earlier same-day artifact. The UI always uses fresh upstream downloads instead of this artifact.

Master SHA-256 (downloaded): `c55175864cecc5ceee7401f6b084fde1ef395bdc6b8ccd59b13fa2597bbc27f3`.

Suspension SHA-256 (downloaded): `ff1f9591bef4123833cc0fb2bc52723768319d36671a0df28ea77cd163b033ea`.

### Classification limitation requiring a separate choice

The existing name filter misses **58 INF-prefix fund-like candidates** (examples: ABSLPSE, AONELIQUID, BBETF0432, HYBRIDETF and MON100). They are listed, with original provider identities, in `data/instrument-classification-review-2026-09-10.json`. Therefore 2,342 must not be described as 2,342 verified individual-company shares. All share `instrument_type: EQ` and `security_type: NORMAL`, so these fields do not resolve the distinction. A blanket INE-only filter would also discard JISLDVREQS, a differently identified DVR candidate. No broad symbol-substring exclusion was added because it would reject company names such as FIRSTCRY/BRAINBEES or JETFREIGHT.

The 58 are a classification-review set, not company EPS × P/E recommendations. A stock-only exclusion/quarantine or separate non-stock watchlist is pending user direction and official classification verification. No synthetic records were added to meet the requested count.

## Verification and release boundary

- Pure tests: all twelve seed mappings/formulas, calendar/leap/IST dates, missing/invalid/overflow inputs, annual-vs-quarterly EPS, corporate review, expiry, frozen anchors, tamper-resistant target choice and upward internal rounding.
- UI VM tests: formula catalog/escaping, empty new-stock inputs, review/save/activation/deactivation, stale-response protection, confirmations, effective-null target handling, provenance, CSV and preserved legacy bindings.
- Actual request-handler integration: no immediate order on save/activation, fresh-price checks, unchanged/frozen target after edits, partial/manual/automatic valuation exits, same-price scale-ins, stop preservation after review withdrawal, snapshot retention and revision controls.
- Official-feed tests: every-click fresh source calls, source bounds, strict identities, fund/suspension exclusions, placeholder handling, diff counts, no synthetic padding, no failed-refresh data loss, and all storage backends.
- Full-universe rotation tests: disjoint coverage, pause/resume, concurrency and ledger/settings preservation.
- Legacy smoke suite: all **57 named checks passed** in an isolated copy with provider traffic mocked and approved loopback access. The actual working database was not changed by tests.

These results do not establish predictive accuracy, investment suitability, production deployment, production Mongo connectivity or production Upstox-token validity. No live broker order was placed. `main` and the existing local V01 baseline remain unchanged. Publishing this feature branch does not complete the separate unfinished V01 release-asset upload, merge or deploy the feature.
