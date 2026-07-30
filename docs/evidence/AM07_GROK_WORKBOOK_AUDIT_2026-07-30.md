# AM07 GROK Workbook Audit — 2026-07-30

## Sources

- Local source: `AM07_FO_OI_Signals_Report.xlsx`
- Local source: `AM07_Backtest_with_India_VIX.xlsx`
- Workbook generation timestamps: 2026-07-19
- Audit date: 2026-07-30

The original workbooks were user-supplied local evidence. This repository document preserves their extracted parameters, verification results, and acceptance decision.

## Extracted parameters

| Parameter | Exact value | Source | Decision |
|---|---:|---|---|
| Return cleaning clip | ±12% | VIX backtest summary | Experimental; methodology absent |
| Momentum lookback | 20 trading days | VIX backtest summary | Experimental |
| Momentum selection count | Top 10 | VIX backtest summary | Experimental; conflicts with 2.5% position cap if equal-weighted |
| Transaction cost | 0.08% one-way | VIX backtest summary | Candidate cost assumption |
| Maximum position | 10% | VIX backtest summary | Rejected for canonical v2.1; canonical value remains 2.5% |
| Cash buffer | 5% | VIX backtest summary | Experimental |
| Drawdown governor trigger | -18% | VIX backtest summary | Not validated; realised maximum drawdown was approximately -52.47% |
| VIX very-low threshold | <12 | VIX backtest summary | Experimental |
| VIX very-low multiplier | 1.15x | VIX backtest summary | Experimental |
| VIX low regime | 12–16 | VIX backtest summary | Experimental |
| VIX low multiplier | 1.00x | VIX backtest summary | Experimental |
| VIX elevated regime | 16–20 | VIX backtest summary | Experimental |
| VIX elevated multiplier | 0.75x | VIX backtest summary | Experimental |
| VIX high regime | 20–25 | VIX backtest summary | Experimental |
| VIX high multiplier | 0.45x | VIX backtest summary | Experimental; new entries blocked |
| VIX extreme threshold | ≥25 | VIX backtest summary | Experimental |
| VIX extreme multiplier | 0.10x | VIX backtest summary | Experimental; new entries blocked |
| FPI Category I allocation | approximately 30% of MWPL | F&O workbook | Synthetic/mechanical; not an observed position |
| FPI Category II allocation | approximately 20% of MWPL | F&O workbook | Synthetic/mechanical; not an observed position |
| FPI Category II Others | approximately 10% of MWPL | F&O workbook | Synthetic/mechanical; not an observed position |

## Workbook integrity findings

### F&O/OI report

- Three sheets and zero formulas.
- All 211 FPI rows are hard-coded.
- For all 211 matched symbols, Category I is approximately 30% of MWPL, Category II is approximately 20%, and Category II Others is approximately 10%.
- Therefore, these category values are mechanically generated from MWPL and must not be treated as independent FPI evidence.
- OI labels such as `Heavy_Buildup`, `Strong_Long_Buildup`, and `Strong_Long_Unwinding` are supplied without formulas, price-change inputs, thresholds, or a reproducible classification specification.
- The file is a single-date snapshot, not a backtest dataset.

### India VIX backtest

Reported period: 2018-01-01 through 2024-06-28.

Reported outputs:

- Start capital: INR 10,000,000
- Final equity: INR 54,177,398
- Total return: 441.8%
- CAGR: 31.2%
- Maximum drawdown: 52.9%
- Sharpe ratio: 1.68
- Win rate: 41.1%
- Trades: 4,610

Independent checks from the supplied equity curve:

- 524 sampled equity rows.
- Last equity equals INR 54,177,398.
- Recalculated maximum drawdown is approximately 52.47%, consistent with the rounded 52.9% report.
- Calendar-period CAGR from INR 10,000,000 is approximately 29.75%; the reported 31.2% appears to use a trading-day convention.
- Long flat equity stretches exist, including 40 sampled points from day 495 through day 612.

The workbook contains no formulas, dates per equity observation, securities, trades, holdings, VIX observations, regime labels, blocked-entry log, benchmark, or identical strategy run without the VIX filter. Consequently, it cannot establish incremental VIX-filter edge, detect look-ahead bias, or reproduce the Sharpe/win-rate/trade-count claims.

## Acceptance decision

- `EDGE_CONFIRMED`: remains `false`.
- VIX thresholds and multipliers: `experimental`.
- 10% position cap: `rejected_conflict`; canonical cap remains 2.5%.
- 0.08% one-way cost: `candidate_assumption` for future costed testing.
- OI snapshot labels: `unverified_external_labels`.
- FPI category tables: `synthetic_rejected_as_signal_evidence`.

## Required evidence before promotion

1. Dated stock-level trade ledger with entry, exit, size, cost, and reason codes.
2. Daily India VIX source series and exact date alignment.
3. Side-by-side identical backtests with and without the VIX overlay.
4. Walk-forward or fixed holdout results by regime.
5. Survivorship-bias and corporate-action handling.
6. Reproducible formulas or code for OI classification.
7. Actual FPI category position source rather than MWPL-derived percentages.
