# AM07 structured-content checkpoint

Audit date: 28 September 2026. Reviewed source commit: `910c72f1ab6fdf014c081746626f38e2fe029759` on `codex/valuation-targets-market-refresh`.

This is a historical-source audit and consumer-map update, not an import, runtime correction, deployment or trading decision. The raw AM07 archive and V01 are unchanged. No Mongo operation or fresh market-data retrieval was performed. Online instrument documentation and a temporary pinned XLS-reader installation are recorded separately from provider-data access.

## Completed scope

Fourteen additional members of `AM.07.Parameter.Files.zip` were read in full:

| Member group | Complete serialized-content coverage | Evidence |
| --- | --- | --- |
| Three gzip JSON masters | 114,687 records; 2,168,850 field values | [Instrument identities](../data/asset-review/am07-instrument-master-evidence-2026-09-28.json) |
| Four core CSVs | 3,897 data rows; 64,466 data fields; 800 blanks preserved | [Core CSVs](../data/asset-review/am07-core-csv-evidence-2026-09-28.json) |
| Six research CSVs | 72 data rows; 591 data fields, 647 cells including headers | [Research CSVs](../data/asset-review/am07-research-csv-evidence-2026-09-28.json) |
| One binary XLS | 535 stored cells: 133 nonempty values and 402 formatted blanks; all 738 BIFF records traversed | [Legacy FPI report](../data/asset-review/am07-legacy-xls-evidence-2026-09-28.json) |

These are different record grains, not a combined count of market observations. All member CRCs and SHA-256 pins were verified against the preserved archive (`652be4dd…2e2e5`). CSV cells were read through the bundled spreadsheet reader and independently matched with strict Python CSV parsing. All gzip JSON records and fields were independently reconciled between Node and Python. The legacy XLS required the pinned `xlrd==2.0.2` fallback; native Excel recalculation/rendering and ancillary OLE property decoding were not performed. There are no executable FORMULA records in that workbook.

Sequential replay of the immutable baseline and accepted overlay gives:

| Coverage | Before | After |
| --- | ---: | ---: |
| Reviewed whole assets | 80 / 171 | 80 / 171 |
| Partial / inventory-only / corrupt assets | 21 / 69 / 1 | 21 / 69 / 1 |
| Reviewed immediate ZIP members | 448 / 592 | 462 / 592 |
| Partial / inventory-only members | 6 / 138 | 4 / 126 |
| Cumulative member upgrades | 143 | 157 |
| AM07 members reviewed | 29 / 44 | 43 / 44 |

The two master files move from partial to reviewed; twelve other members move from inventory-only to reviewed. AM07 remains partial because `Zerodha_Stock_Trading_App_Action_Plan_META_RGL.docx` is still inventory-only. PDFs, other archive siblings and the corrupt `2021_06.zip` receive no promotion. “Reviewed” describes serialized-content coverage, not source authority, formula validity, currentness or runtime readiness.

## Instrument identities: useful historical reference, not a fresh universe

- `NSE.json.gz` has 86,140 records across five segments. Its 9,395 `NSE_EQ` entries include debt and other series; just 2,376 are `NSE_EQ/EQ`. Those include **328 `INF`-prefixed fund identities**. The remaining 2,048 are not automatically eligible company stocks: exact official NSE membership and suspension checks are still missing for this archived snapshot.
- `BSE.json.gz` has 27,089 records, including 12,584 `BSE_EQ` entries. BSE group codes such as `A` and `B` are not NSE series codes and must not be filtered as though they were.
- `BSE_MIS.json.gz` contains 1,458 entries. Every key and shared field matches the BSE master. All margin × leverage products equal 100; the stored pairs are 20/5 for 1,391 rows, 50/2 for 24 and 100/1 for 43. This is a historical broker intraday-product subset, not the complete BSE universe or an overnight-sizing policy.
- Each master has unique instrument keys and unique segment/token pairs within this snapshot. Five NSE cash symbols are reused across different security-series identities. Do not join the whole cash segment by symbol alone. Diagnostic ISIN check-digit failures occur in one non-EQ government-security row in each main master; originals are retained, not silently repaired.
- All twelve requested companies have archived NSE EQ matches. Transrail resolves from its stored company name to **`TRANSRAILL`**, ISIN `INE454P01035`. This proves historical identity presence only, not current portfolio eligibility or the saved Mongo universe.

The official instrument documentation distinguishes unique instrument keys from reusable exchange tokens, describes MIS availability and says the BOD files refresh daily. None of that makes a preserved copy current. The archive supplies no paired fetch timestamp or HTTP Last-Modified evidence; numeric expiries are not retrieval dates. [Upstox instrument documentation](https://upstox.com/developer/api-documentation/instruments/)

The current `lib/official-nse-master.mjs` requires the official company-membership input. A pure offline negative probe against these archived records returns `official_nse_membership_required` when that input is omitted; it performs no provider/store calls. `server-official-nse-master-patch.mjs` fetches fresh sources, persists universe metadata with a revision increment and invalidates the scan cache. It does not consume this preserved archive. No current universe was replaced here.

The masters do not provide OHLCV, current quotes, EPS, P/E, institutional flows or portfolio state. Tick values, historic identities and contract metadata remain source values; units and corporate-action-aware joins must be resolved before pricing/history use.

## Parameter dictionary and derived market tables

The 1,200-row dictionary declares every row `DATA_NEEDED`. One thousand rows are generic block/template combinations, and it supplies no observation values or executable formula/threshold contract. All source IDs `P0001`–`P1200` differ from the separate 175-entry runtime catalog.

**Eighteen of the 24 block meanings differ between the archive and the application's static framework (B04–B21).** For example, archived B04 is “Collapse Drivers”; code calls B04 “Valuation and Re-rating.” Archived B15 is “Supply Chain”; code calls it “Delivery and Volume.” The four B02 dashboard momentum definitions also cannot be recovered by matching source ordinals. This is a mapping/authority decision, not permission to overwrite either catalog or change a strategy. A source-to-runtime crosswalk and governing-specification decision are pending.

The 2,477-row market-internals file and nine-row industry summary are exact byte duplicates of accepted delivery-context evidence, with the same limitations: 13 daily constituents despite a 16-stock label, a 128-day observation gap, missing-delivery aggregates stored as zero, and unresolved point-in-time calibration. Full-sample thresholds reproduce saved research flags but do not prove those thresholds were available at each historical date. Duplicated files do not add independent observations.

The 211-row MWPL file matches every cell in the accepted June 2026 bhavcopy copy; CRLF versus LF accounts for all 212 differing bytes. These are monthly limits, not actual positions, FPI ownership, net buying or current regulatory validity. No source was deleted or chosen as runtime authority.

## Research summaries and the legacy FPI report

The participant-volume table is a June 8 snapshot, not a current institutional window. Its totals reconcile. The Q1 summary spans six discontinuous years, 855 rankable dates and 11,498 observations; the weighting behind `avg_rankable_symbols` remains unresolved. The correlation matrix is numerically consistent but includes highly overlapping signals. Forward-return summaries inherit incomplete-window limitations from their matched research context.

All 35 single/combination trigger-summary rows reconstruct integer true positives and the same 755-positive / 7,162-observation denominator. The leading combination has six true positives from 21 fires; the highest-lift single condition has 86 from 358. These are in-sample research summaries, not future prediction guarantees or verified live conditions. Five peers are semantically related but not byte-identical; date formatting and numeric rounding differences remain recorded.

Static source inspection confirms a previously recorded consumer hazard: six historical trigger lifts are hardcoded in `server-data-intelligence-patch.mjs`; `regimeRiskScore` averages them into a constant component of about 21.94 before its other terms and clamp, without checking whether the source conditions currently fire. This is local source behavior, not a newly observed Render result. No score, ranking weight or condition was changed. Any correction requires discussion and separate approval.

`Latest_22082022.xls` is an aggregate FPI report dated **22 August 2022**, not a current “latest” file. Its notes distinguish reporting/submission date from preceding trading activity. Thirteen purchase-minus-sale checks, sixteen subtotals and four grand-total checks reconcile. One USD subtotal differs by 0.01 from direct conversion because it sums rounded components. The merged “Hybrid” label includes the grand-total row; blindly filling it down would misclassify that total. It contains no stock identifiers, OHLCV, EPS or P/E.

## Mongo and publication boundaries

Mongo cleanup remains separately gated. The September 24 snapshot identified `ashstock.scan_ledger` at 306,852,328 BSON bytes. July–August history was a conditional archive-first candidate of 1,363 documents / 200,968,789 bytes, leaving 696 September records. Atlas was signed out on the September 28 follow-up, so these are **dated, not refreshed measurements**. Verified consistent backup/isolated restore and exact deletion confirmation remain absent. `app_state`, `paper_ledger`, `upstox_auth` and protected audit/history data must not be deleted; `sample_mflix` ownership is still unresolved.

This seven-file checkpoint changes only four evidence files, the coverage overlay, this document and the phase plan. It does not modify application code, Mongo data, raw assets, V01, `main`, Render configuration, credentials, schedulers or trades. JSON/pin/CRC/coverage/static-consumer checks are not application regression or production acceptance tests. Publish only to the existing feature branch and verify the remote blob/tree/ref before reporting it pushed.

Next safe source work is the remaining AM07 DOCX, then separately bounded monthly-FPI and other unread families. Live priority remains signed-in Atlas access, a consistent verified backup route and an exact cleanup proposal; do not bulk-import historical assets into the full cluster.
