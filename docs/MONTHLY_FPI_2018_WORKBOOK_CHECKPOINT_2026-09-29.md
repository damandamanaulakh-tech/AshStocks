# 2018 monthly FPI workbook checkpoint

Reviewed and reconciled: 29 September 2026. The full reads began on 28 September; evidence filenames retain that start date. Baseline commit: `4ca7b694e051734ce64e37871c27887d13df8637`. Branch: `codex/valuation-targets-market-refresh`.

## Outcome and scope

All eleven **present** 2018 monthly-FPI archives are now fully serialized-content reviewed: **1,278,008 transaction records, 24,282,152 business fields, 24,503,789 stored cells including headers/ordinals, and 176 OOXML package parts**. Two independent implementations read the original archive/workbook bytes. Root reconciliation passes **584 grouped comparisons** with no source mismatches.

This completes the available 2018 workbook batch, not complete 2018 market coverage, a full release review, an import or a live institutional feed. June 2018 is absent from the preserved release, and July's observed trade dates stop at July 30. No workbook, runtime formula, Mongo data, deployment, scheduler, credentials or trade was changed. Original V01/raw assets remain untouched.

## Sources and full-read evidence

The eleven ZIPs retain their pinned Backenddata release sizes and SHA-256 hashes. Every immediate workbook member and internal package part was read through EOF with size, CRC and SHA-256 checks. All XML parts, shared strings, worksheet cells, types, styles, formula/error locations and structural feature declarations were inspected. Eleven printer-settings binaries were fully byte-read and hashed but remain uninterpreted device metadata. No native Excel rendering or recalculation is claimed.

| Archive | Workbook member | Transaction records | Observed trade-date range | ISIN syntax failures or missing markers |
| --- | --- | ---: | --- | ---: |
| `2018_1.zip` | `Jan 2018.xlsx` | 132,138 | 2018-01-01 to 2018-01-31 | 1 |
| `2018_2.zip` | `Feb 2018.xlsx` | 114,499 | 2018-02-01 to 2018-02-28 | 627 |
| `2018_3.zip` | `Mar 2018.xlsx` | 108,224 | 2018-03-01 to 2018-03-31 | 1 |
| `2018_4.zip` | `Apr 2018.xlsx` | 111,945 | 2018-04-02 to 2018-04-30 | 4 |
| `2018_5.zip` | `May 2018.xlsx` | 130,863 | 2018-05-02 to 2018-05-31 | 0 |
| `2018_7.zip` | `Jul 2018.xlsx` | 106,929 | 2018-07-02 to 2018-07-30 | 4 |
| `2018_8.zip` | `Aug 2018.xlsx` | 108,292 | 2018-08-01 to 2018-08-31 | 0 |
| `2018_9.zip` | `Sep 2018.xlsx` | 120,878 | 2018-09-03 to 2018-09-29 | 5 |
| `2018_10.zip` | `Oct 2018.xlsx` | 123,562 | 2018-10-01 to 2018-10-31 | 6 |
| `2018_11.zip` | `Nov 2018.xlsx` | 114,544 | 2018-11-01 to 2018-11-30 | 5 |
| `2018_12.zip` | `Dec 2018.xlsx` | 106,134 | 2018-12-01 to 2018-12-31 | 2 |
| **Total** | **11 workbooks** | **1,278,008** | **Observed dates, not verified sessions** | **655** |

Accepted evidence:

- `data/asset-review/monthly-fpi-2018-jan-apr-workbook-evidence-2026-09-28.json`
- `data/asset-review/monthly-fpi-2018-may-jul-aug-workbook-evidence-2026-09-28.json`
- `data/asset-review/monthly-fpi-2018-sep-dec-workbook-evidence-2026-09-28.json`
- `data/asset-review/monthly-fpi-2018-workbook-independent-replay-2026-09-28.json`

The primary readers use Python standard-library ElementTree streaming XML and exact Decimal arithmetic. Root uses an independent lxml streaming reader and exact serialized decimals. Comparison labels explicitly distinguish grouped dictionaries, exact numeric controls and duplicate-definition limits. The January-April and September-December primary readers define residual as product minus value; root and the May/July/August reader use value minus product. Root inverts those signs explicitly. Missing/error representations were aligned without changing source values. Publication review removed four unnecessary custodian-code frequency tables from the January-April audit output; aggregate/type/duplicate checks remain, and the original workbooks were not changed.

## Findings that affect future wiring

1. **Header coordinates vary.** Nine workbooks use the nineteen fields in `A:S`; February and July use `B:T`, with an unlabeled ordinal in `A`. Their 221,428 ordinal values match the data-row sequence. An importer must map the named headers and keep ordinals separate from transaction IDs.
2. **Source types and missingness matter.** Custodian and transaction IDs mix numeric and text cells. Their raw lexemes and types must remain distinct; original leading zeros or previously lost digits cannot be reconstructed. All nineteen fields are physically present and nonblank, but that does not make placeholder ISINs valid. Across these files 655 ISIN fields fail syntax or are markers; valid-format ISINs have no checksum failures. A checksum is not issuer identity or NSE eligibility.
3. **Trade date is not availability date.** Dates are numeric serials in the 1900 Excel system, using style index 1 with date number-format ID 14. Report dates extend into following months, through January 3, 2019 for December. Stored report-minus-trade lags are 0-7 calendar days. No exchange-calendar completeness or exact publication timestamp is established; backtests must not treat a trade as known before its report becomes available.
4. **Transaction ID alone is not a safe key.** May has 19 repeated transaction-ID groups; September has six. No full nineteen-field record duplicates or custodian-plus-transaction repeats were found within each workbook under the tested definitions. This does not establish uniqueness across months or a cancellation/amendment policy. No rows were removed or merged.
5. **Arithmetic controls preserve original precision.** All RATE, QUANTITY and VALUE fields are finite and nonnegative. RATE and VALUE each contain 23,584 zeroes; QUANTITY contains 748 fractional values. All absolute `VALUE - RATE * QUANTITY` residuals are below INR 0.01; the largest is INR `0.0050001715085`. Stored decimal tails, zeroes and fractions remain intact. These diagnostics do not establish an instrument-specific pricing convention, invalid transactions, or signed institutional net flows.
6. **Code meanings and revision precedence remain incomplete.** All records carry `DL_RPT_TYPE_N`, yet January and November each contain one `DL_AMDMNT_DEL_15`. The current official reference does not list observed transaction code `23`, exchange code `99`, or instrument codes `REG_DL_INSTR_ID`/`REG_DL_INSTR_ME`. Preserve these unresolved codes. Do not infer replacement, cancellation, net-flow sign or stable masked-party identity.

The [official CDSL trade-wise FII/FPI page](https://www.cdslindia.com/Publications/EquityDataFII.html) was inspected on September 29. It describes the nineteen business fields, masked party fields, INR values and several code tables, and lists a June 2018 download. That page is documentation, not proof of its historical effective version. Current download bytes were not compared with the preserved release. The earlier June-link web-tool cache miss does not establish an origin 404 or that the source is unavailable. No missing month was fabricated or added to the 171-asset baseline.

## Consumer connection map

Five previously reviewed source-file hashes were freshly matched and their selected line ranges reread at the baseline commit. This is a selected consumer review, not another whole-repository audit.

| Consumer | Required input | What these workbooks can supply |
| --- | --- | --- |
| NO03 / NO04 / NO05 current signals | Identity-matched latest eligible adjacent-quarter ownership percentages and changes | No holdings balance or ownership denominator. Historical transaction quantities are not quarterly ownership. |
| FII Holding dashboard display | Freshly fetched, identity-matched reported percentage; an older quarter may display with a historical label | No reported ownership percentages. Historical display and current factor eligibility remain separate. |
| NO08 / FII cash flow (5D) | Current market-wide NSE cash amounts across five verified completed sessions | Historical trade-report research only; no current five-session coverage or DII cash series. |
| OHLCV / EPS / P/E / targets | Complete market bars and dated company financial inputs | Not supplied by trade RATE, QUANTITY and VALUE fields. |
| Historical FPI research | Versioned code/identity/revision/availability contract and approved normalization | Candidate source after those contracts are resolved. No importer or stored runtime dataset is established. |

The stock-selection patch embeds release-manifest metadata rather than these transaction rows. The separate legacy institutional score still consumes a fixed June 8 snapshot without a freshness guard. Its correction remains separately subject to discussion and approval; no ranking weights or gates were changed in this audit.

## Coverage and validation

Sequential replay of the immutable remaining-content baseline plus every accepted update gives:

- **171 assets:** 103 reviewed, 16 partial, 51 inventory-only, one corrupt.
- **592 immediate ZIP members:** 485 reviewed, zero partial, 107 inventory-only.
- **Monthly-FPI family:** 24 reviewed archives, 49 inventory-only workbook archives, one corrupt archive (`2021_06.zip`).
- **This batch:** eleven asset/member upgrades only. June 2018 is absent, not a twelfth completed asset. Other families and partial PDFs do not gain coverage credit.

Fresh source/member/package integrity, independent shared controls, evidence hash links, totals and sequential coverage replay are the checks for this data/documentation batch. Root acceptance passes 156 checks, including a fresh hash of each of the eleven raw ZIPs and an exact seven-file scope check. No application regression suite was rerun, and no live provider, Mongo persistence, Render release or trading acceptance test was performed. GitHub publication must still be verified against the exact final seven-file diff and remote commit before reporting this batch as published.

## Next action

Continue with a bounded set of the remaining monthly-FPI workbooks, beginning with the preserved 2019 files. Keep June 2018 acquisition and corrupt-archive replacement as separate source-recovery work. The live priority remains operation-level Mongo timeout diagnosis, consistent backup and isolated restore, then separately approved cleanup/growth prevention and an agreed Render release. This source checkpoint does not satisfy or bypass those gates.
