# Phase 4: fresh NSE company universe — 14 September 2026

Repository: `damandamanaulakh-tech/AshStocks`.
Branch: `codex/valuation-targets-market-refresh`.
Parent phase commit: `3cde3cd8930f3207de6840e350b8025df6a85db6`.
This document accompanies the implementation commit; verify its GitHub branch ref before claiming publication. Publication is not deployment or a live database import.

## Approved objective and policy

The user asked to replace the entire old candidate list with fresh official NSE stocks, remove fund-like candidates, retain prior work, and publish bounded tested phases. The scanner now requires:

1. Membership in NSE's official company-equity CSV.
2. NSE trading series **EQ**; BE/BZ trade-for-trade members are counted separately and excluded from this normal scanner.
3. Exact symbol **and** ISIN agreement with the current Upstox `NSE_EQ` / `EQ` master, including its matching instrument key.
4. No matching symbol or key in the fresh official Upstox suspension feed.

NSE publishes ETFs and other security classes in separate files. Its EQ-series label by itself also covers ETFs, so series alone is not the company classification. The old company-name regex is no longer an eligibility authority. Real companies such as PNBGILTS, FIRSTCRY/Brainbees and SBIFUNDS must not be rejected merely for name substrings. Valid IN9 DVR shares remain supported; INF fund identities cannot become company members.

Sources: [NSE securities lists](https://www.nseindia.com/static/market-data/securities-available-for-trading), [NSE series legend](https://www.nseindia.com/static/market-data/legend-of-series), [Upstox instrument documentation](https://upstox.com/developer/api-documentation/instruments/).

## Frozen reference evidence, not production state

`data/official-nse-master-2026-09-13.json` was fetched on **13 September 2026 at 10:30:56 IST**. It must not be relabeled as fetched on 14 September or used as a live-import fallback.

| Source | Provider last-modified time (IST) | SHA-256 of downloaded body |
| --- | --- | --- |
| NSE `EQUITY_L.csv` | 11 September 2026, 03:05:02 | `cba7cbaa0b2320d1d3fda70f3339f05d457ae71276658ee9eae5e9a1f39dc851` |
| Upstox NSE instrument master | 13 September 2026, 05:21:56 | `598edaa5403775660a28ea1933218e043c5d283255a483f8105e6348bb67b2f1` |
| Upstox suspended instruments | 13 September 2026, 05:21:58 | `49ec195d6afb905c4ade798534386451301c31635f9af294967c3aacbce3ef5d` |

| Reconciliation | Count |
| --- | ---: |
| NSE company-file rows, all three observed series | 2,568 |
| NSE EQ-series company rows | 2,292 |
| NSE BE/BZ rows | 276 |
| Upstox NSE_EQ/EQ identities | 2,656 |
| Exact company identity matches before series/suspension checks | 2,305 |
| Provider entries outside the NSE company file | 351 |
| Matched non-EQ-series entries excluded | 14 |
| Matched EQ-series suspended entries excluded | 12 |
| Final eligible scanner identities | **2,279** |
| NSE company-file rows lacking an Upstox EQ identity | 263 |

The artifact records each exclusion group. Missing membership is not automatically a fund: PRANAV is a source-timing mismatch candidate, for example, and cannot be admitted without exact current NSE membership. There is no synthetic padding to 2,400; the shortfall is **121**.

Against the **historical 10 September reference** (not the live saved universe): 3 added symbols (**CRESTO, DOLLEX, PNBGILTS**), 66 removed, and 2,276 existing identities updated with official company names/series provenance. Those updates are not 2,276 newly listed companies. All 58 old INF rows are absent. All twelve user-named stocks are present. Historical snapshots and the old classification-review artifact remain unchanged.

This file contains reference identities, not prices, OHLCV, verified earnings, valuation inputs or a guarantee of portfolio eligibility. The exporter cannot access application storage. Its `application_database_updated` flag is explicitly false.

## Implementation and tests

- Every button import fetches all three allowlisted official sources anew, even on the same day. No cached universe fallback or user-supplied arbitrary URL.
- Download/decoded-size and timeout bounds remain; stale or future source dates, malformed membership, identity conflicts, failed fetches, zero eligible rows and storage overflow reject without replacing saved data. NSE membership without a source-modification date fails closed.
- CSV validation covers whitespace/BOM/CRLF/quoted commas and quotes, full column schema, consistent row widths, duplicate identities and unexpected series.
- Metadata-only writes preserve holdings, trades, paper ledger, settings and valuation assumptions/active targets. Imported company names and NSE series survive storage and repeated imports.
- v1 provenance remains readable but is never labeled membership-verified. UI provenance distinguishes source dates, exclusions, actual additions and shortfall.
- **14 September:** all **19 guard suites + 46 syntax checks passed (65 commands)**. Updated importer fixtures in both rotation and valuation integration guards use the third source.
- Full isolated legacy smoke test passed **57 named checks**, with provider traffic mocked and a local-only HTTP test listener. Temporary copy: `/var/folders/bd/c0szqpw97wd1kzlzbqhzwbh40000gn/T/ashstocks-nse-v2-smoke-KTuprX`. No working/live portfolio store was used.
- Bounded independent code/data review found no actionable issue. This does not constitute live production validation or CI confirmation.

## Online/release status and safe resume

The 13 September public checks returned HTTP 200 for `/api/health` and `/api/ready`. Readiness reported `storage: mongodb` and `persistent: true`; authentication is configured and required. These observations do not prove the production commit or broker session. The browser available to the agent showed `/login`; authenticated Upstox status and the current saved universe remain unverified.

1. Verify this phase's GitHub commit/ref and clean local branch. Keep `main` and local `V01-2026-09-07` at `226e1394d5af3f0c380593d58917b8d2ee5c13e8`.
2. Have the user sign in to the scoped AshStocks browser tab, without sending passwords in chat.
3. Discuss and authorize the production release target. Verify CI/staging and deployment commit; do not silently merge or switch Render to this feature branch.
4. Confirm authenticated persistence and `import_version: official-nse-master-v2`, then perform the authorized metadata replacement. Capture before/after import counts and holdings/ledger preservation, and verify Upstox candles separately. Existing paper automation may run during the button's subsequent scan; do not confuse import with an order or silently activate trading.
5. Stop on source, authentication, persistence or identity failures. Retain existing database state. Redeploying the prior code alone does not restore a prior universe; any data rollback needs the pre-import metadata record and must preserve the ledger.

V01 release-asset upload, production rollout, broker authentication, live OHLCV coverage and actual portfolio additions remain separate unfinished items. The user also requested a BRICS summit company-benefit review; preserve its evidence levels and exact listed identities separately from stock selection scores and EPS/PE assumptions.
