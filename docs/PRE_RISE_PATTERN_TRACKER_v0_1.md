# ASH Stock Pre-Rise Pattern Tracker v0.1

## Finding

No identical signal appears before every historical rise in the supplied data.
The strongest repeated structure is:

1. Price compresses through inside bars.
2. The latest close is positive.
3. Volume expands to at least 1.5 times its 20-session average.

The runtime names this **compression-to-positive-volume ignition**.

## Historical Test

The primary outcome is a maximum closing-price gain of at least 8% during the
next 10 trading sessions. Future prices are used only to create historical
labels. Every tracker feature uses the current or earlier sessions.

Source panel:

- 32,201 NSE security-day rows
- 16 stocks
- 2016-02-02 through 2026-06-08
- price, volume, and delivery data
- uneven coverage: BAJAJFINSV, M&M, and TCS end on 2021-02-01

### Watch threshold

At least two inside bars in the latest 10 comparisons, followed by a positive
close on volume of at least 1.5 times the 20-session average.

- Full sample: 841 fires, 13.79% precision versus 10.42% base rate, 1.324x lift.
- 2016-2020: 458 fires, 16.16% precision, 1.245x lift.
- 2021-2026: 383 fires, 10.97% precision, 1.371x lift.
- Median lead: 7 trading sessions full-sample; 6.5 in the 2021-2026 temporal test.
- Lift was above 1.0 in all four time blocks tested.
- Lift was above 1.0 for 10 of 16 individually eligible stocks.

### Strong threshold

At least three inside bars in the latest 10 comparisons, followed by a positive
close on volume of at least 1.5 times the 20-session average.

- Full sample: 221 fires, 16.29% precision versus 10.42% base rate, 1.563x lift.
- 2016-2020: 112 fires, 16.96% precision, 1.307x lift.
- 2021-2026: 109 fires, 15.60% precision, 1.949x lift.
- Median lead: 7 trading sessions full-sample; 8 in the 2021-2026 temporal test.
- Lift was above 1.0 in all four time blocks tested.
- Lift was above 1.0 for 8 of 11 stocks with at least 10 fires.

## Interpretation

This is a useful early-warning structure, not a universal law and not a trade
permission. It has positive lift but low recall: most rises occur without this
exact pattern. A `STRONG` hit means the tested structure is present; it does not
mean an 8% rise is probable, guaranteed, or live-ready.

FII, stock-level FII, FII/DII, delivery percentage, and India VIX were also
tested. Their results were regime-dependent or near neutral as standalone
pre-rise signals. They remain context only.

## Runtime Behavior

The scanner publishes:

- `pre_rise_status`
- `pre_rise_score`
- `pre_rise_pattern_id`
- `pre_rise_pattern_name`
- `pre_rise_inside_bars_10d`
- `pre_rise_volume_multiple_20d`
- `pre_rise_positive_close`
- `pre_rise_evidence`
- `pre_rise_edge_confirmed`
- `pre_rise_model`

The tracker is display-only. It does not change scanner ranking, position
sizing, Kelly sizing, paper-order permission, or live-order permission.

## Reproducing the Audit

Install the analysis-only packages from `requirements-analysis.txt`, then run:

```text
python scripts/analyze-pre-rise-evidence.py \
  --ohlcv-delivery <nse_volume_delivery_16stocks_eq_merged.csv> \
  --vix <India_VIX_historical.csv> \
  --fii-aggregate <fii_daily_aggregate.csv> \
  --fii-derivatives <pwoi_fii_derivatives_features_2012_2023.csv> \
  --fii-dii <fii_dii_cash_flow_2012_2023.csv> \
  --fii-symbol <fii_symbol_daily.csv> \
  --output <output-directory>
```
