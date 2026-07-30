# Backenddata Release Vetting

Audit date: 2026-07-30  
Release: `Backenddata`  
Repository: `damandamanaulakh-tech/AshStocks`

## Integrity

- Assets reviewed: 171 of 171.
- Release size: 1,578,878,073 bytes.
- SHA-256 mismatches: 0.
- ZIP containers: 116.
- Valid ZIP containers: 115.
- Invalid ZIP: `2021_06.zip` (valid `PK` prefix but corrupt/missing central directory).
- Exact duplicate assets: `fii_stats_08-Jun-2026.1.xls` and `fii_stats_08-Jun-2026.xls`.
- VIX-named assets: 0.
- Machine-readable detail: `config/release-data-manifest.Backenddata.json`.

## Vetted Data Layers

| Layer | Coverage | Decision |
|---|---|---|
| Stock OHLCV | 191 symbols; 532,977 rows; 2014-06-30 to 2026-07-17 | Ready for paper ranking; current-universe survivorship bias remains |
| FII/DII cash | 3,770 dates; 2007-01-06 to 2022-12-08 | Ready as historical market overlay; stale for current trading |
| Stock-level FII | 3,388 labels; 2009-01-01 to 2020-12-31 | Research-only; stale and identifier mapping required |
| Volume/delivery | 32,201 deduplicated EQ rows; 16 symbols; 2016-02-02 to 2026-06-08 | Confirmation only; not market-wide |
| Participant OI/volume | 2026-06-08 snapshot | Annotation only |
| FII derivatives | 2026-06-05 and 2026-06-08 | Annotation only |
| F&O bhavcopy/options | One-date/sample coverage | Parser/snapshot only |
| India VIX | No release asset | External runtime feed required |

## Chronological Selection Test

Method: rebalance every 20 sessions; features at `t`; return from `t+1` through `t+20`.

| Rule | Train excess | Validation excess | Holdout excess | Decision |
|---|---:|---:|---:|---|
| 20-day momentum Top-10 | -0.0606% | +0.1714% | +0.7425% | Primary paper rank |
| 60/25/15 momentum/trend/volume score | -0.2476% | -1.1694% | +0.2429% | Rejected |
| Score plus volume ≥1.5x requirement | -0.4942% | -2.4991% | -0.0556% | Rejected as entry requirement |

Trend, volume, delivery, stock-FII, and OI are tie-breakers or annotations. They do not add hidden points to the primary score.

## Market Overlays

- `FII 5D < DII 5D` produced 0.5369 percentage points lower average next-20-day market return.
- Negative rate was 35.62% when `FII < DII`, versus 30.03% otherwise.
- It is therefore a 0.75 paper position multiplier, not a stock-ranking input.
- `FII < 0` and `DII > 0` is routed as DII-cushioned foreign selling.
- VIX uses the approved external ladder, but the release cannot validate it because no VIX series is present.

## Executable Output

- Parameters: `config/stock-selection-parameters.v0.1.json`
- Engine: `lib/stock-selection-engine.mjs`
- Guard: `scripts/stock-selection-guard.mjs`
- API: `GET/POST /api/stock-selection`

The selector is paper-only and fails closed when VIX or FII/DII market inputs are missing.
