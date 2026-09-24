# Research, archived reports and remaining-content checkpoint

Date: 24 September 2026. Baseline: `efb8ca934464551f6db3e32ce31cb94f0ea98cd6` on `codex/valuation-targets-market-refresh`.

This is another bounded Phase 1 evidence batch. The already approved institutional correction remains a separate, previously published code batch. This batch changes documentation and audit JSON only: no application runtime, thresholds, strategy activation, Mongo data, raw/V01 assets, provider settings, main branch or Render deployment.

## Results that matter for the connected-data goal

1. **Historical India10Y data exists.** AM07 contains 2,551 dated yield-like observations from 2016-01-01 through 2026-06-08. They overlap 2,532 of the macro feed's 3,905 empty historical IN10Y dates. This is a source candidate, not an approved fill: units/benchmark/publisher are unresolved; 22 rows have Price below Low, 456 have flat OHLC, and 12 fall on weekends. Preserve anomalies and do not forward-fill or present it as current data. See [India10Y audit](INDIA10Y_ASSET_AUDIT_2026-09-24.md).

2. **The historical backtests reproduce mathematically but are not point-in-time validation.** All 11 IFR cash performance rows and 16 block metric sets reproduce under the stated assumptions. However, the inner join omits 611 available upstream return dates, thresholds use later history, and forward-return tails are incomplete. The supplied baseline's 15.464779% annualization becomes 12.620670% when the same incomplete wealth path is annualized over calendar time; neither number repairs missing returns or establishes investable performance. See [IFR cash audit](IFR_CASH_RESEARCH_AUDIT_2026-09-24.md).

3. **Five feature-code trigger IDs disagree with their preserved source rules.** The archive and JSON catalog agree, but evaluator IDs 0079/0080/0081/0084/0085 dispatch other rules. Additional warmup/component drift and overstated executable metadata are recorded. The generic scanner blends tunnel scores; the Upstox path restores the primary base score and keeps this evidence advisory. These are feature-code findings, not observed Render behaviour or a demonstrated cause of absent purchases. No correction to these formulas has been made. See [formula/implementation audit](RESEARCH_FORMULA_LINEAGE_AUDIT_2026-09-24.md).

4. **Source formulas are preserved with provenance, without promoting placeholders.** Seven newly reviewed research archives contain static source definitions/results, not executable producer code. The saved [140 explicit formula-definition rows](../data/asset-review/research-formula-source-rows-2026-09-24.json) retain every original source field and member/record provenance. The micro/pyramid packs contain 22,891 parameter occurrences, not that many verified algorithms; all 30,000 stock slots are placeholders, not NSE candidates. Raw assets remain the complete preservation authority.

5. **Archived report scope matters.** Root binary XLS tables cover only two June 2026 FII derivative dates. The saved HTML covers sector-level May 2026 AUC/flows. All 105 PDF pages were OCR-processed, but numeric transcription remains unvalidated and representative layouts have clipped columns. None supplies current stock-specific ownership, fresh quotes or automatic readiness.

## Exact content-review accounting

The [baseline ledger](../data/asset-review/remaining-content-baseline-2026-09-24.json) preserves the status at `efb8ca9`; the [accepted progress overlay](../data/asset-review/content-coverage-progress-2026-09-24.json) records each later upgrade and hashes its evidence. Do not add the two ledgers' counts together.

| Unit | Whole-content read, with explicit semantic limits | Partial | Inventory only | Corrupt | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Top-level release assets | 54 | 22 | 94 | 1 | 171 |
| Immediate files in readable ZIPs | 369 | 6 | 217 | 0 | 592 |

The release contains 1,578,878,073 bytes. There are 116 ZIP assets: 115 readable directories with 2,001,430,478 uncompressed member bytes, plus corrupt `2021_06.zip`, whose member count remains unknown. The other 55 assets are standalone files. ZIP members and top-level assets are different levels, not separate additive inventories. A reviewed archive contains its already-counted reviewed members.

“Whole-content read” means every relevant serialized row, cell or text field was consumed with documented checks. It does not certify every formula, native Excel calculation/pivot/chart, external provenance, historical identity, corporate-action adjustment, currentness, database coverage or fitness for trading. PDF OCR is explicitly partial review. This checkpoint upgrades 64 member statuses; it does not claim all release material is fully read.

## New archived-report evidence

Machine-readable evidence: [archived reports](../data/asset-review/archived-reports-evidence-2026-09-24.json).

### Legacy FII XLS

All three genuine BIFF8 root files were read with checksum-pinned, temporary `xlrd 2.0.2`, outside the repository dependency tree. All 693 stored cell positions / 351 nonempty cells were consumed. There are two distinct byte contents: June 5 and June 8, 2026; the second June 8 file is identical. Documented BIFF record counts show zero executable FORMULA records. Narrative formulas remain preserved as text.

There are 28 unique instrument/date rows. Both nested XLS copies in `FII.DII.Nifty.zip` equal the root hashes. All 168 source field values in each normalized v0.2/v0.3 derivatives CSV match these XLS inputs; buy-minus-sell differences reconcile apart from insignificant binary decimal representation.

The tables report buy/sell contract counts, values in crore and end-of-day open interest. Index futures/options aggregates already include five child indices; summing all fourteen rows would double-count them. Child contract sums match aggregates exactly. Amount differences are at most 0.01 crore in these checks. Text notes distinguish option strike-price notional, traded futures value, underlying-close option OI value and settlement-close futures OI value. They are not market cash flows or company ownership percentages.

### Saved sector HTML

All five tables / 2,688 stored cells were read. The main table has 24 sector rows plus a grand total, with 2,400 finite numeric values: May 15/31 AUC and May 1-15/16-31 net investment, separately in INR crore and USD million. Twenty-two named sectors plus Sovereign/Others are not stock-level holdings.

All 200 row/group totals equal their component sums. Grand-total-minus-sector sums differ by up to four reported units, and the two top-debt-company totals differ by one INR crore from displayed constituents; preserve these rounded-report residuals. The report documents conversion rates 95.9255 and 95.3845, and different activation dates for VRR/FAR/mutual-fund/AIF categories. AUC levels, net flows, asset classes, currencies and category changes must stay separate. The top ten debt issuers are not an equity-universe source.

The saved source URL is CDSL, the document title says NSDL, and the form action points to localhost. No HTML script, form or external link was executed. This is historical local report evidence, not an authenticated current provider response.

### Root PDFs

All fifteen preserved PDFs match the pinned hashes; all 105 pages have zero native text and were rendered/OCR-processed locally. Seven representative pages from seven files were visually reviewed. OCR evidence is hashed per page; numbers were not imported or certified.

- Eleven files named `Investment.FY.*` actually show calendar-year monthly FPI/FII net investment reports for 2009, 2014 and 2018-2026, not derivatives or fiscal-year tables. The 2026 report is partial June history.
- `Investment.June25.pdf` actually contains reporting dates June 1-8, 2026: cash/investment routes and derivative tables, not a June 2025 dataset.
- `Trades.FY.pdf` is a financial-year FPI/FII investment report, including partial FY2026-2027 with an 08-Jun-2026 marker, not derivative transactions.
- The October/November 2009 derivative reports explicitly distinguish the heading/reporting date from prior trading dates. For example, the November 30 heading states trading positions for November 27. This forbids an automatic heading-date join.

Representative table right edges and footnotes are clipped in the preserved PDFs. OCR cannot recover missing pixels; many later pages contain only site navigation. Prefer intact machine-readable source before numerical ingestion. Complete all-page OCR is not complete numeric-table validation.

## Small metadata exceptions closed

[Metadata evidence](../data/asset-review/metadata-closure-evidence-2026-09-24.json) records a full JSON read and the complete 54-byte Back Test manifest.

- Kaggle metadata identifies version 1, a September 2022 publication/modification date, seven fields matching the root cash CSV and a CC BY-SA 4.0 license claim. Its stated period is April 2007-August 2022. A day-first interpretation of the installed CSV has 15 rows before and 22 after those bounds. Neither a unit declaration nor an exact date-format contract resolves the inherited date issue. Matching schema/provenance metadata does not authenticate downloaded dataset bytes; no dates were rewritten.
- The Back Test manifest's `tickers=191` matches 191 CSV members. Its Mongo/Upstox origin line is a source claim, not a current Mongo read or authenticated provider-download proof. Earlier whole-row data validation still has its documented identity/adjustment limits and the preserved invalid IDEA row.

## Finite remaining review queue

| Next bounded family | Remaining scope / acceptance requirement |
| --- | --- |
| Monthly FPI transaction archives | Largest open family: 74 assets, including 73 readable single-file archives and one corrupt archive; 1,321,960,953 compressed bytes. The readable files are 11 CSV, 58 XLSX and four OOXML workbooks disguised as `.xls`. Stream by schema/month/year; retain reporting/trading dates, units and protected identifiers. Two exact workbook duplicates can reuse already-reviewed content after context confirmation. |
| Small participant snapshots | 21 ZIPs / 42 CSV, only 40,848 uncompressed bytes. Full row/date/unit/arithmetic review is the next efficient bounded batch. |
| AM07 residual | India10Y is now read; remaining metadata, documents, provider JSON and derived outputs still need their own content and semantic checks. Do not classify the whole pack by one successful source. |
| Derivatives/bhavcopy and cash/delivery residuals | 20 pending members in two derivative/macro packs, plus 20 CSV in three derived packs. Preserve their actual schemas; reconcile exact duplicate candidates and calculations before using them as fresh inputs. |
| Mixed aqu archive | 46 members: only two MNIST CSVs are known nonmarket content. The remaining 44 include market/research data and reports. Twenty-one `.xls` files are actually OOXML and three are genuine OLE. Do not exclude or delete the whole archive. |
| PDF/format/identity limits | Root PDFs remain partial numeric review; eight aqu PDFs are still pending. Five exact duplicate candidates retain baseline status until context-checked reuse. NSE/BSE gzip JSON remains partial. Corrupt `2021_06.zip` requires a valid-source/recovery decision, not deletion or a fabricated empty table. |

Twenty-five misleading `.xls` files were confirmed as OOXML packages (four monthly plus twenty-one aqu). That is format identification, not cell review. No blanket cleanup is authorized by inventory or duplicate findings.

## Proposed formula correction boundary — discuss before edits

The smallest next code proposal is source-to-ID parity tests and corrections only for the agreed trigger definitions, sufficient-window/null rules, and honest availability metadata. Separately decide how to label historical lift constants so they are not misrepresented as current trigger evidence. Do not invent thresholds for ambiguous prose, silently activate forty-eight absent triggers, change primary ranking, promote backtest recommendations or remove preserved duplicate parameter occurrences. The full proposed sequence is in the formula audit.

These decisions remain distinct from Mongo recovery and Render release approval. Source review alone neither shows what is already stored in Mongo nor authorizes an import. Before integration: reconcile existing history and capacity, agree schemas/units/date/identity policies, run a bounded dry-run with rejects/provenance, obtain the required approval, persist idempotently, read back, then prove each intended consumer. Current data must still pass freshness and unchanged paper risk gates.

## Validation and handoff

This documentation/data batch uses strict CSV/Decimal checks, independent IFR arithmetic reproduction, a separate India10Y pandas recount, full selected workbook XML/cell reads, pinned hashes/CRC checks, full-table HTML parsing, all-page local OCR with representative visual checks, and source/catalog/call-path comparisons. Published JSON must parse, coverage counts/identities/links/digests must reconcile, and staged Git whitespace/diff checks must pass.

Pre-publication reconciliation passed: eight JSON files parse; 171 asset and 592 member identities are unique; baseline plus accepted updates reproduce the displayed totals; all six baseline/evidence digest links match; all eight relative documentation links resolve. A separate reviewer verified the IFR claims, byte-identical evidence and all 64 genuine member status upgrades, finding no required correction. The 140 definition-row preservation count is checked separately from source validity.

No application regression suite was rerun for these evidence-only files. The 82-command institutional correction test run belongs to the previous code checkpoint, not this batch. No current provider success, production readiness, Mongo cleanup/import or deployment is claimed. Continue the nine-phase goal; Phase 1 and the live acceptance gates remain open.
