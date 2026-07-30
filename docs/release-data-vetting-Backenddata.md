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
- VIX-named assets: 0. Content-level scan found the VIX history inside `AM.07.Parameter.Files.zip`.
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
| India VIX | 3,676 source rows; 3,659 usable; 2011-06-08 to 2026-06-05 | Ready for historical calibration; fresh runtime feed still required |

## Chronological Selection Test

Method: rebalance every 20 sessions; features at `t`; return from `t+1` through `t+20`.

| Rule | Train excess | Validation excess | Holdout excess | Decision |
|---|---:|---:|---:|---|
| 20-day momentum Top-10 | -0.0606% | +0.1714% | +0.7425% | Primary paper rank |
| 60/25/15 momentum/trend/volume score | -0.2476% | -1.1694% | +0.2429% | Rejected |
| Score plus volume ≥1.5x requirement | -0.4942% | -2.4991% | -0.0556% | Rejected as entry requirement |

Trend, volume, delivery, stock-FII, and OI are tie-breakers or annotations. They do not add hidden points to the primary score.

## Market Overlays

- The supplied backtest workbook's symmetric ±12% return cleaning and −18% drawdown governor are explicit active parameters.
- `portfolioDrawdownPct` is now required at runtime; a missing/invalid value fails closed, and a drawdown at or below −18% blocks new entries.
- `FII 5D < DII 5D` produced 0.5369 percentage points lower average next-20-day market return.
- Negative rate was 35.62% when `FII < DII`, versus 30.03% otherwise.
- It is therefore a 0.75 paper position multiplier, not a stock-ranking input.
- `FII < 0` and `DII > 0` is routed as DII-cushioned foreign selling.
- India VIX was discovered at `AM.07.Parameter.Files.zip::AM 07 Parameter Files/Index_daily_15Y.csv`.
- High and extreme VIX did not justify entry blocking: full-sample mean next-20-session Nifty returns were +1.6659% and +3.9390%, respectively.
- Forward annualized realized volatility increased from 12.1745% in LOW to 15.2766% / 18.7161% / 24.1982% in ELEVATED / HIGH / EXTREME.
- The calibrated paper sizing ladder is therefore 1.15 / 1.00 / 0.80 / 0.65 / 0.50, with no VIX-only entry block.
- The 2022–2026 extreme-VIX holdout has only 23 observations, so the 0.50 multiplier remains paper-only and conservative.

## Supplied Workbook Cross-Check

- `AM07_FO_OI_Signals_Report.xlsx`: 25 top-contract observations for 2026-06-08 plus 211 FPI and 211 MWPL rows.
- OI labels are retained as zero-weight confirmation/annotation fields. `Heavy_Buildup` is participation-only and `Strong_Long_Unwinding` is bearish annotation.
- FPI categories follow an almost exact 3:2:1 split and their total is 59.9875%–60.0000% of MWPL across all 211 rows. That deterministic relationship is not eligible for ranking.
- `AM07_Backtest_with_India_VIX.xlsx`: records the approved ±12% cleaning, 10% maximum position, 5% cash buffer, 0.08% one-way cost, and −18% drawdown governor.
- Its reported 52.9% maximum drawdown exceeded the stated governor, so its 1.68 Sharpe and 441.8% total return are not treated as independent edge confirmation.

## Fractional Kelly Paper Governor

- Parameter: `RISK_KELLY_QUARTER_PAPER`.
- Source: persisted completed paper `SELL` trades only. Request bodies cannot inject replacement trade statistics.
- Net return reconstruction: gross realized P&L minus the approved 0.08% cost on both reconstructed entry notional and exit value, clipped to ±12%.
- Enforcement requires at least 100 valid closes, 20 distinct symbols, 20 wins, and 20 losses.
- Win probability uses a 50-trade Beta prior centered at 50%; confidence scales linearly to 100% at 300 valid closes.
- Applied fraction: `max(0, p - (1-p)/b) × 0.25 × confidence`.
- During `CALIBRATING`, Kelly is reported but does not stop base-sized paper trades from creating the sample.
- Once active, Kelly can only reduce the existing position cap. A non-positive post-cost Kelly estimate blocks new paper entries.
- The paper-order lifecycle independently rejects manual, GTT, and automatic BUY entries above the effective Kelly/base cap.
- Kelly remains paper-only and does not set `EDGE_CONFIRMED` or `liveReady` to true.

## Executable Output

- Parameters: `config/stock-selection-parameters.v0.1.json`
- Engine: `lib/stock-selection-engine.mjs`
- Guard: `scripts/stock-selection-guard.mjs`
- API: `GET/POST /api/stock-selection`

The selector is paper-only and fails closed when VIX or FII/DII market inputs are missing.
