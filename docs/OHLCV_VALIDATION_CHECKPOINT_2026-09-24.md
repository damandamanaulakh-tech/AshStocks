# Phase 1B: reproducible, read-only historical OHLCV validation

Date: 24 September 2026. Starting checkpoint: `7996da63daf23f1d850a8dfa01074803d41f6602`.
Branch: `codex/valuation-targets-market-refresh`.

## Delivered scope

- `scripts/validate_ohlcv_assets.py`: standard-library, Python 3.9-compatible deterministic CLI and importable validation function. Input is a single local ZIP and a pinned release inventory; output is diagnostics on stdout. There is no HTTP, extraction, database, import or output-file-writing path.
- `tests/test_asset_ohlcv_validation.py`: 20 offline unittest methods covering normal/invalid data, provenance, safety bounds, no-write/no-network behavior and deterministic output.
- `.github/workflows/verify.yml`: explicit offline validator test step in the existing Python-enabled workflow. The existing workflow still triggers on main pushes and pull requests, not ordinary feature pushes. Wiring a test into CI is not a claim that CI has run.
- `data/asset-review/back-test-claude-ohlcv-dry-run-2026-09-24.json`: actual complete source-family diagnostics, with per-member coverage/counts/hashes and rejected-row references. No raw price series or credentials are copied into this report.

## Verified actual-source result

Input: preserved `Back.Test.Claude.zip`, 8,781,114 bytes, SHA-256 `885b7fa195ecc4153729915759d04b6b63375ac1e497e6e231c2a4069d8b58b5`, pinned by the Phase 1A inventory.

| Measure | Result |
| --- | ---: |
| Candidate symbols | 191 |
| Parsed rows | 532,977 |
| Structurally valid rows | 532,976 |
| Rejected rows | 1 |
| Zero-volume observations | 13 |
| Weekend observations | 1,703 |
| Out-of-order observations | 0 |
| Structurally valid coverage | 2014-06-30 to 2026-07-17 |

Rejected record: `Back Test Claude/IDEA.NS.csv`, logical CSV record 2513 (header is record 1), date `2024-08-30`, reason `invalid_volume`. The underlying supplied volume is negative. The validator reports the rejection; it does not repair or delete the raw record. `row_number` is not a universal physical-line offset for quoted multiline CSV.

Zero volume and weekend observations are counted, not assumed erroneous or tradable. An authoritative session calendar and liquidity policy remain separate requirements. The archive's sole metadata file is `MANIFEST.txt`; its embedded claim `source=Mongo ohlcv (Upstox bulk download)` is not independent proof of source authenticity, present Mongo contents or corporate-action treatment.

## Safety and data contract

1. Validate bounded UTF-8 JSON inventory schema, unique matching asset entry, exact bytes and SHA-256 before parsing ZIP content.
2. Read regular, non-symlink local input files through bounded descriptors; detect size/mtime changes while reading. Never follow archive links or extract members.
3. Bound ZIP central-directory entry count before allocating member objects. Refuse split, ZIP64, self-extracting or inconsistent containers in this intentionally narrow format.
4. Enforce safe/canonical member paths, no duplicate path/candidate symbol, regular files/directories only, no encryption, and stored/deflate compression only.
5. Bound archive bytes, individual/total decoded bytes, members, records per member/total, field lengths and diagnostic samples. Fully read member contents and exercise CRC before a completed report.
6. Require exact OHLCV headers and strict UTF-8/CSV row shape. Accept UTF-8 BOM. Validate explicit ISO dates against the supplied as-of boundary, finite positive OHLC and consistent bounds, and exact nonnegative integral volume using Decimal checks.
7. Reject every version of repeated symbol/date records, not just later duplicates. Reject `STOCK_n` placeholders. Report source-order anomalies without silently sorting or overwriting input.
8. Retain filename symbol as an unverified candidate only. No ISIN/instrument mapping, adjustment basis, exchange-session approval or fresh-market eligibility is implied.
9. Successful process exit means diagnostics completed, not data adoption: `dry_run=true`, `database_import_performed=false`, `production_import_ready=false`. Malformed archives/schema/resource failures exit 2 with a structured error and no partial-success report.

Default limits are 32 MiB compressed archive, 512 members, 2 MiB per member, 64 MiB total decoded content, 20,000 records per member, 1,000,000 total records, 128 characters per field and 200 sampled rejected rows. Counts remain complete when rejection samples are truncated. The report records sample truncation explicitly.

## Reproduction and verification

From the repository root, supplying the path to the preserved source:

```sh
python3 -B -m unittest discover -s tests -p test_asset_ohlcv_validation.py
python3 -B scripts/validate_ohlcv_assets.py \
  --archive '/path/to/raw-assets/Back.Test.Claude.zip' \
  --inventory data/asset-review/backenddata-release-inventory-2026-09-24.json \
  --as-of 2026-09-24
```

All 20 test methods pass on the available Python 3.9.6. They create only disposable local fixture archives, run without production credentials, and need no dependencies/network. Both the main agent and independent reviewer ran the actual source-family validation. The final saved report is compared with a repeat CLI run. No broad application smoke rerun is claimed: application/runtime code and selection rules did not change in this batch. The intended CI runtime is Python 3.11; remote CI remains a separate release gate.

Code review specifically checked resource bounds, exact numeric validation, provenance pinning, incomplete/failure handling and the distinction between structurally valid and production-approved data. Independent review found no blocking issue. Tests were tightened so the symlink case reaches the file-safety guard rather than merely failing an unrelated manifest lookup.

## Unfinished work and next batch

- Phase 1 remains open: other archive families, workbook/PDF/HTML contents, identity/history/corporate-action reconciliation and complete source-to-consumer coverage are not finished by this one parser.
- Next 1C: inspect remaining high-value schemas and the historical/current identity relationship; design the bounded canonical-history contract and capacity estimate. Do not infer historical identity continuity from current symbol matching alone.
- Mongo Atlas opened at a login page in the available browser session on this turn. No actual alarm/collection sizes were retrieved, and no cleanup occurred. An authenticated scoped project tab or non-secret alarm evidence is required for live diagnosis. Upstox keys were not requested or changed.
- Before importing history, inspect existing Mongo history collections as well as the application collections. The user's existing Mongo data and the embedded source assertion make duplicate ingestion a concrete risk; a missing Node adapter does not prove the data is absent from Mongo.
- Mongo deletion still requires the exact target/backup/impact proposal and user confirmation. Render release target, deployed SHA proof, fresh universe refresh and end-to-end execution remain separate gates.
- V01/raw assets, `main`, live Mongo data, holdings, ledger, auth and deployed configuration remain unchanged. The nine-phase goal stays active.
