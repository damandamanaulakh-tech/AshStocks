# Monthly FPI archive CSV review

Reviewed on 28 September 2026 against `510a8c6a01ea19d28518188ae6364c2052bf343f`, branch `codex/valuation-targets-market-refresh`.

All eleven CSV members in the monthly-FPI archive family have now been parsed in full: **2,073,998 data records, 40,562,923 fields and 551,921,302 uncompressed bytes**. Three Python evidence packages and an independent Node streaming parser cover every member. This checkpoint advances historical-source review and the consumer map. It does not import transactions, modify application code, change strategy policy, access Mongo, deploy or place trades.

## Scope and dates

All eleven ZIP hashes match the preserved release inventory. Every CSV member was read to EOF with size, SHA-256 and CRC checks. Records have the expected widths; no malformed-width, empty or multiline records were found. The seven 2009–2017 files have twenty fields, including an ordinal. The four later files have nineteen fields and no ordinal. All source files remain unchanged.

| Archive | Member | Data records | Observed trade-date range | Latest reporting date |
| --- | --- | ---: | --- | --- |
| `2009_1.zip` | `2009_1.csv` | 302,080 | 2009-01-01 to 2009-06-30 | 2009-11-20 |
| `2009_2.zip` | `2009_2.csv` | 360,071 | 2009-07-01 to 2009-12-31 | 2010-05-12 |
| `2014_4.zip` | `apr_2014.csv` | 75,039 | 2014-04-01 to 2014-04-30 | 2014-05-21 |
| `2014_5.zip` | `may_2014.csv` | 104,800 | 2014-05-02 to 2014-05-31 | 2014-06-23 |
| `2014_6.zip` | `jun_2014.csv` | 98,074 | 2014-06-02 to 2014-06-30 | 2014-07-18 |
| `2014_8.zip` | `aug_2014.csv` | 81,249 | 2014-08-01 to 2014-08-28 | 2014-09-11 |
| `2017_5.zip` | `may_2017.csv` | 135,648 | 2017-05-02 to 2017-05-31 | 2017-08-21 |
| `2021_03.zip` | `Mar_2021.csv` | 161,295 | 2021-03-01 to 2021-03-31 | 2021-04-07 |
| `Jun_2023.zip` | `June 2023.csv` | 231,625 | 2023-06-01 to 2023-06-30 | 2023-07-04 |
| `Sep_2023.zip` | `Sept 2023.csv` | 283,834 | 2023-09-01 to 2023-09-30 | 2023-10-05 |
| `Nov_2023.zip` | `Nov 2023.csv` | 240,283 | 2023-11-01 to 2023-11-30 | 2023-12-07 |

The 2009 suffixes mean half-years, not January and February. The 2009–2017 dates use month/day/year, March 2021 uses day/month/year, and the 2023 archive members use ISO dates. One family-wide ambiguous date parser would be unsafe. Date ranges do not prove complete session or instrument coverage.

Reporting can occur long after the trade. The 2009 maximum lags are 166 and 172 calendar days. Across the five 2014–2017 members, 40,949 records have reporting dates in a later month; the maximum lag is 101 days. The later four files are sorted by reporting date but are not trade-date ordered. A report date is not a proven public-availability timestamp. Backtests must not treat every report as known on its trade date.

## Identity, duplication and arithmetic limits

- The 2009 files have 22 and one repeated custodian/transaction keys. First-half CSV records 276431 and 276432 are equal after removing the ordinal. The five 2014–2017 files have five repeated custodian/transaction keys with different content; two remain nonunique after adding reporting date. The four later files have no collisions for their six tested candidate keys.
- These are candidate keys, not an approved transaction identity or correction policy. Cross-file intersections were checked within the two-file 2009 group and within the four-file 2021/2023 group. No all-eleven global identity-uniqueness claim is made. Raw/trim-only and semantic-normalization checks are distinguished in the evidence.
- The 2009 files have 347/618 format-invalid ISIN rows and 10/9 additional checksum failures among format-valid values. The five 2014–2017 files contain 88 `NO_ISIN` markers, three other format-invalid tokens and four checksum failures. March/June/September/November have 1/2/1/0 format-invalid rows and no checksum failures among format-valid values. Missing markers are not silently replaced; a valid checksum is not proof of current NSE eligibility or identity continuity.
- RATE, QUANTITY and VALUE are parsed as exact decimals. Zero amounts and fractional quantities are preserved. All 2009–2017 absolute `VALUE - RATE * QUANTITY` residuals are at most Rs 0.01; March 2021 reaches Rs 0.50, and the three 2023 files are at most Rs 0.005. These observed residuals and conditional printed-precision bounds are diagnostics, not an approved provider tolerance or proof that a trade is valid/invalid.
- The stored numeric sums do not apply transaction direction or amendment/cancellation precedence. They must not be labeled net institutional purchases. CSVs contain stored values, not executable workbook formulas; no native spreadsheet recalculation is claimed.

### November root copy versus archived member

The already-reviewed root `Nov.2023.csv` was compared positionally with `Nov_2023.zip` / `Nov 2023.csv` across all 240,283 data records using two independent readers. The root file remains SHA-256 `9b3ad7c1585cb08bdc238959d485f9c9de9577b21e8a4de0e6df60e7706a1c25`.

- 233,643 canonicalized rows agree completely. Another 6,615 differ only in stored VALUE and 25 only in the transaction-ID string. RATE and QUANTITY agree numerically throughout, dates agree under explicit formats, and all other fields agree under documented trimming/code-padding normalization.
- The 25 archive identifiers are twelve-character digit strings; the root identifiers are eight-character strings and agree only after removing leading zeros. They remain distinct source strings. Identifiers were not converted to numbers in the evidence.
- Root-minus-archive VALUE differences total **Rs 38.19**, with a maximum absolute row difference of **Rs 0.50**. All 6,615 differences fit within half of the root value's last printed decimal unit. Only 6,238 match Python Decimal's half-even quantization exactly. No universal rounding rule or export-software cause is inferred.
- The files are not byte-identical or exact semantic duplicates. Do not append both or discard one automatically. Choosing a canonical version and preserving the alternate source requires a documented reconciliation rule. The root CSV gains no additional coverage credit in this batch.

## Official source contract checked online

CDSL's trade-data page corroborates the two 2009 half-year labels, nineteen business fields, masked party fields and INR values. It distinguishes secondary-market purchase/sale codes 01/04 from other transaction categories and listed equity from other instruments. Its exchange legend identifies 23 as NSE and 1 as BSE but does not list 99. Reporting type A appears twice. [CDSL trade-wise FII/FPI data](https://www.cdslindia.com/Publications/EquityDataFII.html), inspected 28 September 2026.

This reference narrows the source-contract gap but does not establish its historical effective version, masked-code stability or amendment precedence. The current official downloads were not byte-compared with the preserved GitHub assets. No code meaning was applied to raw sums or runtime signals by this audit.

## Connection map to current code

Selected source paths were inspected at the starting commit; their SHA-256 hashes and line scopes are recorded in the independent replay evidence. This is not a full repository reread.

| Intended use / current consumer | What these files establish | What is still needed |
| --- | --- | --- |
| Historical FPI transaction research | Dated transaction records, stored values and source-specific identities/codes | Matching-period code contract, instrument/exchange filters, revisions, point-in-time availability, canonical-copy and duplicate policy |
| `NO03`, `NO04`, `NO05`; dashboard FII Holding | No quarterly ownership balances or DII holdings percentages | Verified security identity, adjacent-quarter ownership figures and eligible current report; the reviewed normalizer compares these categories explicitly |
| `NO08`; dashboard FII cash flow (5D) | Historical reports, not a current five-session market aggregate | Current supported NSE cash feed and all five verified completed sessions; the reviewed backend rejects incomplete/stale context |
| OHLCV, volume/trend indicators | Not exchange-wide candle bars | Validated dated price/volume bars with compatible identity and lookback |
| EPS, base P/E and 3/9/12-month targets | No earnings or valuation inputs | Dated company financials, valuation basis and reviewed assumptions |

`server-stock-selection-patch.mjs` embeds release-manifest audit metadata; the inspected path does not load these transaction records. A scoped literal search for three RFDE/transaction-field strings in visible, non-ignored `.js`, `.mjs` and `.py` files (excluding `node_modules`, `data` and `vendor`) found no matches. That search does not rule out generic/dynamic consumers. No historical loader was implemented or connected here.

The existing legacy `institutionalFlowScore` still reads the fixed June 8 FII/DII snapshot without a freshness guard. That is separate from the corrected current-institutional path and remains a discussion/approval item. Historical files must not be used to mark that consumer or a live dashboard card fresh.

## Evidence, coverage and next step

Evidence packages: [2009](../data/asset-review/monthly-fpi-2009-csv-evidence-2026-09-28.json), [2014–2017](../data/asset-review/monthly-fpi-2014-2017-csv-evidence-2026-09-28.json), [2021–2023](../data/asset-review/monthly-fpi-2021-2023-csv-evidence-2026-09-28.json), and [independent replay, November reconciliation and consumer map](../data/asset-review/monthly-fpi-csv-independent-replay-2026-09-28.json). Source locators use one-based CSV logical record numbers including the header. Public evidence retains aggregate diagnostics and bounded exception locators, not investor/broker/transaction identity values.

The immutable baseline plus sequential coverage overlay now accounts for **171 assets: 92 reviewed, 16 partial, 62 inventory-only and one corrupt**; and **592 immediate ZIP members: 474 reviewed, zero partial and 118 inventory-only**. Only these eleven archive/member pairs advance in this batch. This is full serialized-content review, not full economic validity or permission to ingest/trade. The monthly-FPI family now has thirteen reviewed archives: these eleven CSVs plus `Jan_2022.zip` and `Oct_2023.zip`, which were accepted previously through context-confirmed duplicate evidence and are not promoted again. Its remaining sixty OOXML members comprise 56 `.xlsx` and four disguised `.xls`; `2021_06.zip` remains corrupt. Other asset families and partial PDF interpretation remain open.

Independent acceptance passed 586 comparisons (341 for the six 2009/2021/2023 members and 245 for the five 2014/2017 members), with zero mismatches. All eleven raw ZIPs were freshly rehashed. Shared comparisons cover member bytes/hashes, records/fields/headers, dates/lags, code counts, exact numeric sums and common residual/identity diagnostics. The six-member daily histogram comparison reused completed local audit counters read-only; the five-member comparison regenerated dates/lags from the CSV streams. Additional profile, precision-envelope, ordering, cross-file and candidate-key variants are supported by their respective primary audit, not independently repeated by every reader.

Validation also covers JSON/accounting, source-code hashes, November comparison, evidence links and sequential coverage replay. Application regression suites were not rerun because the batch changes only audit evidence and documentation. No current provider response, Mongo import, Render release or live trading result is claimed.

Next bounded source work: the remaining monthly-FPI workbooks, beginning with the 2018 set, followed by other unresolved families. Live priorities remain the read-only Mongo collection refresh, verified consistent backup/isolated restore and exact cleanup discussion, then an agreed Render release. Do not bulk-import this historical transaction volume into the application database without a measured storage and retention design. Keep V01, raw assets, main, production data and strategy thresholds unchanged.
