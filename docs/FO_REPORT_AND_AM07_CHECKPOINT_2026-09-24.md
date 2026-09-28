# F&O report and AM07 source-content checkpoint

Source audit date: 24 September 2026. Checkpoint revalidated for publication on 28 September 2026. Source review commit: `611c1c26aad6beebac2ba5473a52333efa5e3220` on `codex/valuation-targets-market-refresh`.

The dated source observations and age calculations below remain as of September 24. The September 28 publication check revalidates preserved files, source pins and coverage, not live market feeds, Atlas usage or Render deployment.

This is a read-only source audit and offline diagnostic, not a runtime correction, import, deployment or trading decision. Raw assets/V01, MongoDB, application code, ranking weights and execution gates were not changed. Earlier code approvals do not authorize the newly discovered NU08 correction.

## Completed scope and coverage

The full serialized contents of `FO.Gold.COmm.zip` were read: fourteen CSVs (18,744 data rows, 246,112 fields) and one binary XLS (12 records, 48 data fields; all 64 stored cells). Two CSVs had already been reviewed; this batch adds **13 member upgrades**, including 12 newly reviewed CSVs with 14,837 rows. The complete archive is now reviewed, with source validity and adoption limits below.

Six additional `AM.07.Parameter.Files.zip` members were read in full: the early-warning document, feed-schema document, 1,500-record registry, 13,787-row T01 file, 1,608-candle JSON text and 88-path historical manifest. Their combined 2,248,426 bytes were consumed and CRC/SHA checked. These are different record types, not an aggregate count of market observations. AM07 remains partial: 29 reviewed members, two partial and thirteen inventory-only.

Sequential replay of the immutable baseline and coverage overlay gives:

| Coverage | Before | After |
| --- | ---: | ---: |
| Reviewed whole assets | 79 / 171 | 80 / 171 |
| Partial / inventory-only / corrupt assets | 22 / 69 / 1 | 21 / 69 / 1 |
| Reviewed immediate ZIP members | 429 / 592 | 448 / 592 |
| Partial / inventory-only members | 6 / 157 | 6 / 138 |
| Cumulative member upgrades from baseline | 124 | 143 |

“Reviewed” means full serialized table/cell/text processing and recorded checks. It does not mean all formulas are correct, all records are accurate, current NSE membership is verified, Mongo has the data, or live use is authorized. The corrupt `2021_06.zip` remains unresolved; its unknown contents are not included in a fabricated member count.

Evidence: [F&O full-content evidence](../data/asset-review/fo-report-content-evidence-2026-09-24.json), [AM07 evidence](../data/asset-review/am07-text-spec-evidence-2026-09-24.json), and [accepted coverage overlay](../data/asset-review/content-coverage-progress-2026-09-24.json).

## F&O findings and required consumer boundaries

1. **The contract reports are the active-volume subset, not the whole open-interest universe.** June 3 reports contain 624 futures and 12,886 options; those keys exactly match positive-volume contracts in the full dated bhavcopy. Matched OHLC, contract volumes and trade counts agree. Quantity equals contracts times dated lot size for every matched row. However, omitted inactive contracts include 15 futures and 5,146 options with nonzero OI.

2. **The two futures CSVs are not identical.** Keys and other normalized fields agree, but 66 `TRD_VAL` values differ. The plain file stores the June 30 NIFTY value as `1.98561E+11`; copy `(2)` stores `198560806808.00`, a ₹193,192 difference. Copy `(2)` turnover matches the dated bhavcopy on every contract. No source is deleted, overwritten or silently preferred for runtime use.

3. **Open-interest bases differ even on overlapping contracts.** OI differs on 171 futures and 278 options against the full bhavcopy. The source footnote describes trading-system end-of-hours OI but does not establish the precise cause, publication version or required consumer basis. Preserve this distinction; matching prices do not establish matching OI.

4. **The PCR-named file stores CE/PE OI, not a saved ratio.** All 216 CE/PE pairs reproduce active-report sums; none exactly equals the full-bhavcopy pair. Coverage omissions and overlapping OI differences both affect the result. For example, GODFRYPHLP's diagnostic PE/CE is about 0.44045 from the report versus 0.51960 from the full bhavcopy. Neither is presented as current or adopted signal authority.

5. **Units and row grain must remain explicit.** Option `NOTION_VAL` matches the dated bhavcopy transfer-value field; `PR_VAL` does not. This empirical comparison is not an official general unit contract. Twenty-four option-index rows contain five symbols; grouped contracts/quantity/OI reconcile, but rows could not be assigned a verified single-expiry grain. Do not deduplicate by symbol. Product/index value residuals remain recorded rather than all being dismissed as one rounding step. The top-report footer percentages align with value shares, not contract-count shares.

6. **The client XLS is dated June 1, not June 3.** Its twelve rows report connected-entity group gross-OI percentages across ten symbols. They are not shareholder percentages or FII flows. Membership, absolute numerators/denominators and cross-date group identity are absent, so unique-client aggregation and recomputation are not justified.

7. **Macro history still has missing inputs.** The 3,905-row macro CSV ends June 8, 108 calendar days before review. Every India10Y field is blank; other series have gaps. Negative WTI is preserved pending the exact instrument/series contract. Current market-context cards use a separate provider path and do not read this archive.

Saved pack-summary counts include footers: actual futures/options data counts are 624/12,886 with two types each. An embedded `USED` label is a research statement, not evidence of an import or deployed calculation.

`L06`/`F05` derivatives, catalog `NO10` and `L08` macro warnings remain subject to compatible source definitions, dated identity/lot units, adequate history and freshness. The framework itself marks relevant feeds `DATA_NEEDED_TO_WIRE`. No source in this batch fills a current dashboard requirement merely because it is now fully read.

## AM07 findings and formula authority

- The archived 1,500 G07 IDs have zero exact overlap with the current 175-ID catalog. All archived current values are null and hit statuses `NOT_EVALUATED`; 1,176 rows are future slots. Of 135 enabled rows, 114 lack an identified source, including 65 undefined formula slots. Do not equate enabled/status labels with executable validated calculations.
- Feed instructions contain a net-sign conflict: buy 45,200 minus sell 51,800 gives the supplied −6,600, while the note says sell minus buy. Status spelling also conflicts (`DATA-NEEDED` versus `DATA_NEEDED`). Originals are preserved.
- Transaction values, buy/sell contract flow and long/short open positions are distinct quantities. Archived rules, current NO08's five-session condition and NO09's declared 60-day position-change z-score are not interchangeable aliases.
- The thirty early warnings are explicitly hypotheses. Their source's 78% hit-rate claim has no supporting results in these six members. HHI > 0.04 is not equivalent to top-five volume share > 40%; twenty equal 5% shares provide a counterexample. Net/gross SIP, release timing, FX volume and S&P 500 input requirements remain unresolved.
- T01 contains 13,787 security-series records, including 3,365 EQ rows, not 13,787 unique current stocks. Header `10,JUN,2026,013787` does not establish June 10. The final field's unit/category dictionary is missing, and 10,154 blanks must not become zeros or position-sizing inputs.
- The 1,608 candles span 2018-01-01 through 2024-07-01 but contain no instrument identity/request provenance. Numeric OHLC checks pass; the last two fields are zero throughout. Do not label them India VIX or equity liquidity from their appearance.
- Archived 5%/20-position settings differ from the current source policy's 10%/500 settings. This is a documented policy difference, not authority to replace the current settings.

## Newly confirmed NU08 drift: discussion required before correction

The current catalog defines `sector_value_after / portfolio_value_after <= 0.25`, but `server-parameter-tunnel-patch.mjs` computes `(same-sector holding count + 1) / (holding count + 1)`.

An independently reproduced, source-pinned pure-helper diagnostic confirms both directions:

| Synthetic case | Count calculation | Assumed position-value calculation | Current node |
| --- | --- | --- | --- |
| ₹250,000 sector holding + six other ₹125,000 holdings; proposed sector entry ₹10,000 | 2 / 8 = 25% | ₹260,000 / ₹1,010,000 = 25.7426% | HIT despite value condition failing |
| ₹1,000 sector holding + two other ₹49,000 holdings; proposed sector entry ₹1,000 | 2 / 4 = 50% | ₹2,000 / ₹100,000 = 2% | MISS despite value condition passing |

The denominator here is supplied position value; cash/NAV treatment and production valuation inputs still need an explicit contract. Both fixtures preserve the incoming `SELECT` decision and portfolio-cap gate. NU08 supplies positive evidence, not a `BLOCKED` execution decision. Generic attachment blends evidence into its score; the separate Upstox attachment restores primary base scores and retains an advisory score.

The existing **separate scanner-batch value cap** was also reproduced: with a ₹250,000 cap it permits 25 planned ₹10,000 allocations and blocks the 26th. Its maps start empty and it has no existing-holdings argument. This does not prove whole-current-portfolio or sequential-fill enforcement, nor does the NU08 mismatch prove a production hard-gate bypass.

The diagnostic evidence and complete reproduction script are preserved as audit text in the AM07 JSON under `nu08_offline_reproduction`; the script reads pinned source, extracts pure helpers into a VM and prohibits provider/store calls. It is not imported into the app. Main-agent rerun passed two counterexamples and the batch-cap probe with zero external calls. No assembled app/production safety test is claimed.

**Requested, not yet approved:** an offline NU08 value-input correction, retaining the 25% threshold and existing ranking/gate policies, with missing values unknown. No change is made while that discussion is pending. Existing institutional/five-trigger approvals do not cover this new issue.

## Validation, publication and next step

- Fourteen CSV member hashes, row counts and column counts agree across independent readers; all data row widths pass. Preambles/footnotes/empty tables are retained and distinguished from data.
- Binary XLS stored cells, source hashes/CRC and workbook structure were checked. This is serialized-content coverage, not native Excel rendering/recalculation.
- AM07 archive and all six scoped member hashes/CRCs match; all records were processed. Runtime reference hashes and the pinned NU08 diagnostic are retained.
- Acceptance passed: sequential baseline/overlay replay; all eleven accepted evidence digests and the baseline digest; both raw archive hashes and all twenty-one scoped member hashes/CRCs/byte counts; six runtime reference hashes, four NU08 source pins and the embedded diagnostic digest; JSON/local-link checks; and `git diff --check`. An independent reviewer also reproduced the key F&O Decimal comparisons and AM07 record counts, finding no actionable discrepancies. Only the five audit/coverage/phase files belong in this feature-branch checkpoint. This batch does not rerun or claim the complete application regression suite.
- Publish without force, independently verify GitHub blobs/tree/parent/ref, then fast-forward the local feature branch. Report the returned commit separately; a feature-branch publication is not a Render deployment.

Next safe source batch: remaining monthly FPI histories and AM07/other derived sources, using the updated member ledger rather than assuming sibling completion. Production gates remain a consistent backup with isolated restore proof, fresh Render access and exact failure evidence, agreed release target, and explicitly approved recovery. Mongo deletion is not authorized. The previously observed `sample_mflix` sample-load request does not establish last application use or repository ownership; this batch adds no such evidence.
