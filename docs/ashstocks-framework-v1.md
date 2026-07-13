# AshStocks Sourceborn Framework v1

Status date: 2026-07-13

## What This Is

AshStocks is not a USA stock page, not a calculator, and not a generic indicator screen. The target product is an India/NSE stock-selection proof engine with a large pool, strict gates, paper-only Upstox historical data, and a Sourceborn/URR proof loop.

Live trading remains disabled. Upstox is used only for historical candles.

## Drive Handoff Read

Core handoff material used:

- `PROJECT_FILE_MANIFEST_ALL_AVAILABLE.csv`: 165-file ledger across both handoff parts.
- `PROJECT_FILE_LIST_THIS_PART.txt`: part-level file lists.
- `NEW_CHAT_CONTINUATION_PROMPT.txt`: accepted Sourceborn/URR operating rules.
- `06_EARLY_WARNING.md`: 30 India-specific regime early-warning hypotheses.
- `07_DATA_FORMATS.md`: required feed schemas for validation.
- `Chityy_Sourceborn_FINAL_MICRO_SPLIT_ENGINE_v0_6.xlsx`: current control workbook summary.
- `Chityy_Sourceborn_IFR_FII_Cash_Stack_Test_v0_6.xlsx`: IFR + FII cash validation output.

Important truth from the handoff:

- IFR is Internal Fracture and Repair.
- IFR + FII/DII cash is a paper exposure throttle, not a standalone buy/sell signal.
- Live trade = no.
- Edge confirmed = no.
- Missing data must be marked DATA_NEEDED/HOLD, not invented.

## Product Layers

1. File Ledger and Source Map: active.
2. NSE Equity Master: active through Upstox complete instruments JSON.
3. OHLCV Momentum and Liquidity: active through Upstox historical candles.
4. Portfolio Caps and Correlation: active.
5. IFR Damage and Repair State Machine: paper-ready idea, feed wiring required.
6. FII/DII Cash Pressure: paper-ready idea, feed wiring required.
7. PWOI and Derivatives Positioning: data needed.
8. Volume Delivery Breadth: data needed.
9. India Regime Early Warning: parameter bank ready, validation data needed.
10. Event Lead-Time and Robustness: partial paper proof from handoff.
11. Sourceborn + URR Control Loop: active control rule.
12. Paper Engine and Safety: active, no live orders.

## Active Scanner Gates Now

These are active in code today:

- 253 clean daily candles.
- 6M return >= 8%.
- 12M return >= 12%.
- 252D volatility <= 55%.
- ADV20 >= 200,000 shares.
- 5D rupee turnover >= 5 crore.
- Fresh last candle <= 7 calendar days.
- Latest OHLC not stuck.
- Target potential hard gate.
- 60D correlation <= 0.85.
- Portfolio position and sector caps.
- Paper only, broker write disabled.

## Framework Parameters Added

The broader parameter bank now exists as a first-class API layer at `/api/framework` and is also stored in `data/ashstocks-framework-v1.json`.

Paper-ready but not allowed to control SELECT yet:

- IFR damage cluster exposure throttle.
- Adaptive IFR + FII cash stack.
- Strict IFR + FII confirmation.
- FII/DII divergence pressure.
- Repair state machine.

Data-needed layers:

- NSE bhavcopy EQ with delivery and value fields.
- FII/DII cash history to present.
- PWOI participant-wise OI and volume to present.
- NSE F&O bhavcopy event windows.
- Index/VIX/breadth daily.
- FX/gold/10Y/crude daily.
- GST/SIP/demat/SME/insider monthly datasets.

## Decision Policy

SELECT can only come from layers that have real data and active code.

WATCH means useful but incomplete.

BLOCKED means data exists but a risk or portfolio gate failed.

DATA_NEEDED means the engine knows the missing feed or column.

ARCHIVE means a parameter is duplicate, late, story-only, or fails false-positive limits. It is not deleted.

## Next Build Loop

1. Create durable feed ledger for uploaded CSV/XLSX sources.
2. Wire FII/DII cash and IFR state columns as paper exposure multipliers.
3. Wire market-wide delivery/volume breadth before letting IFR/FII affect SELECT.
4. Add event lead-time report for KEEP/WATCH/ARCHIVE parameter decisions.
5. Keep live orders disabled.
