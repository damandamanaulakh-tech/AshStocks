# Phase 1D: root CSV content and institutional-data boundaries

Date: 24 September 2026. Parent checkpoint: `00b055113f0d6974dacbb8dbb5b4285906e5562d`.
Scope: read-only review of the ten root CSV release assets not covered by the earlier single-price CSV audit. No runtime change, Mongo query/import/deletion, source correction or current-provider claim belongs to this batch.

## Coverage and evidence

All ten files were fully parsed: **982,154 data rows**. Each file's size and SHA-256 match the pinned Backenddata inventory. There were no malformed table-width rows, exact duplicate full rows, or invalid nonmissing numeric values. Missing markers and zero values remain distinct. These checks do not prove complete coverage, source authority, instrument identity, date convention or suitability for a strategy.

- `data/asset-review/root-csv-content-audit-2026-09-24.json`: per-file schemas, counts, dates, key diagnostics, arithmetic, cross-file comparisons and supplemental checks. SHA-256: `722c0f5852fca0a77b7bba9eb136f4147f909bdb24fde7434fc54f34cfa988a5`.
- `data/asset-review/ash-workbook-epoch-checks-2026-09-24.json`: independent first-column date decoding for the ten previously reviewed NSE XLSX files. SHA-256: `a0ae84b79fb8ad11a67dc1a4fd2ee8936421eff5073ff3c684635ef3b41ffd2a`.
- These are audit evidence, not runtime inputs or approved ingestion schemas. Raw investor, broker and transaction identifier samples are deliberately excluded.

The full root CSV set is now covered across two batches: the earlier `NSE.1991.-.2010.csv` single-price audit and these ten files. This does not complete all 171 release assets or nested archive content. Three binary XLS files remain unread; no supported reader was available. No dependency was installed and no original file was altered.

## Findings and consumer decisions

| Source | Actual content / result | Connection boundary |
| --- | --- | --- |
| `fii_symbol_daily.csv` | 89,931 rows, 905 dates, 3,388 distinct scrip-name strings. Every date has exactly `min(100, aggregate n_unique_scrips)` rows and descending absolute-net sorting; 898 dates have 100 rows. | Observed top-100-style subset, not all-stock coverage. Missing companies are unknown, not zero flow. Name strings are not verified NSE instrument keys. |
| `fii_daily_aggregate.csv` | 905 dates across 2009–2020, with gaps including 1,552 and 978 calendar days. On 2014-04-01, the supplied 3d sum includes rows back to 2009-12-30. | Do not use supplied rolling fields as consecutive-session indicators. Verify provenance and continuous session coverage, then recompute gap-aware windows before strategy use. |
| `fii_entity_daily.csv` | 647,249 rows; 101,926 masked FII-code strings. Date/code keys are unique within this file. Entity sums differ from aggregate beyond conservative displayed-precision rounding bounds on 22 dates; maximum difference is 358.397 crore on 2014-08-13. | Cause and scope difference unestablished. Preserve both series and conflicts; do not overwrite or force balancing. Entity identity is not company ownership. |
| `Fii.Dii.Trading.activity.csv` | 3,770 rows. Day-first parsing produces 395 weekend dates, 392 of them day/month ambiguous. Units are not stated in headers. One DII arithmetic residual is 27.80 at source date `28-05-2007`, logical CSV record 3380. | Date bounds are an interpretation pending original-source verification. Do not silently swap dates or assume currency scale. Retain the arithmetic discrepancy without correction. |
| `Nov.2023.csv` | 240,283 FPI transaction-report rows; November trade dates and November–December reporting dates; 1,673 ISIN strings. Missing FII/sub-account/broker markers, 405 zero-value rows and multiple transaction-type codes are present. | Transaction events, not OHLCV or ownership. Preserve reporting vs trade dates and interpret transaction types before aggregation. Within-file key uniqueness is not cross-file deduplication proof. |
| Three June cash snapshots | Combined, NSE and normalized combined tables each have two category rows, all dated 2026-06-08. The normalized table matches combined values. Combined and NSE numbers differ by scope. | Historical one-date inputs only. Include exchange/coverage scope in keys; never sum overlapping combined and NSE totals or relabel them as current because filenames say latest. |
| `fao_participant_oi_08062026.csv` | June 8 participant-category contract counts; six one-contract row/column total inconsistencies. | Flag exact discrepancies. These are contracts, not cash flow, stock holdings or company-level observations. |
| `fao_participant_vol_08062026.csv` | June 8 participant-category contract counts; row/column totals reconcile. | One-date derivatives reference, not current or stock-specific data. |

Both derivative files have malformed quoting in the title/preamble line. Their actual tables start at row 2 and parse correctly when row 1 is explicitly treated as metadata. The zero malformed-table-row count excludes this known preamble issue; it is not a claim that each complete file parses as strict rectangular CSV without handling metadata.

The aggregate quantity residual of at most 0.1 lakh fits combined rounding tolerance for one-decimal inputs. The exploratory scanner's generic arithmetic diagnostic is not a rejection rule. This is distinct from the larger historical DII cash inconsistency above.

## Workbook-date follow-up

All ten NSE XLSX files omit the `date1904` attribute. Independent openpyxl decoding used the 1899-12-30 epoch and matched every previously reported nonblank date count and first/last date. Several files contain a blank row 2; it is not a missing data-record count. The `NSE.2019.xlsx` coverage extending through 2020-08-27 is confirmed rather than inferred from its name.

## Method and limits

An exploratory read-only Python CSV pass processed every field and retained only summaries, hashes and candidate-key diagnostics. Additional focused reads checked gap-spanning rolling fields, participant totals, subset structure, date ambiguity and displayed-precision reconciliation. The JSON combines those passes; it is not presented as the reproducible output of a production-ready ingestion validator. The temporary helper has hard-coded audit paths and does not reproduce every supplemental check by itself, so it is not installed as a runtime importer.

No external source convention, masked investor identity, corporate action, currency scale or transaction-type meaning was independently validated online in this batch. Weekend counts are review flags, not automatic invalid-session judgments. No comparison with existing Mongo history has yet been made.

Verification: a separate recount and rehash of all ten raw files matched the report and inventory; a fresh base-helper rerun matched all directly generated report sections. The published JSON byte hashes match the reviewed evidence. The existing 43 offline OHLCV/identity regression tests also passed; those tests cover the existing validators, not every exploratory CSV calculation.

## Sequence and remaining work

1. Inspect existing Mongo history and the actual alarm before planning capacity or imports. These assets may already be represented in that database.
2. Verify source meaning, date conventions, units, identity periods and scope; retain unresolved records outside eligible signal inputs.
3. Reconcile against existing storage using compound keys and provenance. Exact repeats become no-ops; conflicts remain explicit. Do not delete either raw source or database records based on this audit.
4. Build bounded historical adapters only for validated products. Keep market cash flow, company transactions, participant contracts, ownership, single-price history and OHLCV separate.
5. Obtain fresh supported online inputs for current dashboard/entry requirements, with endpoint-specific freshness and error states. Historical coverage cannot turn a failed current feed into LIVE or PASS.

Phase 1 remains open for remaining archive families, PDF/HTML semantics, the three binary XLS files and historical identity/corporate-action checks. Mongo deletion still requires a backed-up exact-target proposal and separate confirmation. Render release choice, current provider proof, the dashboard screenshot items and actual end-to-end paper-flow verification remain separate gates.
