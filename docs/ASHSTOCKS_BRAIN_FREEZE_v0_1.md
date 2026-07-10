# AshStocks Brain Freeze v0.1

## Name

AshStocks.

AM07 and G07 are not separate products anymore.

- AM07 = existing running auto paper engine/reference brain.
- G07 = transparent control lab/dashboard idea.
- AshStocks = merged final private tool.

## Owner intention

Build a large private AI-powered stock brain that can:

1. ingest real market data,
2. scan with many parameters,
3. auto-run paper trades,
4. explain every decision,
5. learn from failure,
6. track all files and raw material,
7. later support broader features like buy/sell actions, users, promotion, and public product if owner decides.

The app must think bigger than AM07. AM07 is a reference and running seed, not the final ceiling.

## Core engine identity

AshStocks Brain =

Market Data Layer
+ Parameter Bank
+ Regime Brain
+ Stock Selection Brain
+ Risk Brain
+ Paper Execution Brain
+ Proof Brain
+ Dashboard/Control Brain
+ Data Bank Memory.

## First engine architecture

1. Data Ingestion Brain
   - Upstox historical candles
   - Upstox quote/profile if token exists
   - NSE equity bhavcopy
   - NSE FO bhavcopy
   - FII/DII cash flow
   - PWOI participant-wise OI
   - benchmark index candles
   - uploaded Excel/CSV/ZIP files

2. Universe Brain
   - Nifty 200
   - 30k stock/slot master
   - segment/category/industry maps
   - validity checks
   - last-candle checks
   - symbol-change/dead-symbol audit

3. Parameter Brain
   - 2,000+ filter/parameter target allowed
   - every parameter has source, formula, current value, threshold, group, hit/miss, points, reason, status
   - no parameter is deleted; status can be ACTIVE, REVIEW, BLOCKED, DUPLICATE_MERGED, DATA_NEEDED, UNSAFE_LABELLED, FUTURE_STAGE

4. Selection Brain
   - Nifty 200 momentum base adopted from AM07 reference
   - 6m and 12m risk-adjusted momentum
   - quality blend: low-volatility + liquidity + optional fundamentals
   - absolute momentum gate
   - sector/industry context
   - institutional flow context
   - derivative/OI context
   - regime context

5. Risk Brain
   - drawdown ladder
   - stale data block
   - liquidity block
   - correlation block
   - sector exposure block
   - portfolio heat block
   - event blackout label
   - consecutive-loss halt
   - IFR internal-damage throttle
   - emergency crash brake

6. Paper Execution Brain
   - private auto paper trade engine
   - scheduled scan/refresh/EOD report
   - no fake live order claims
   - every buy/sell/hold gets decision journal row
   - future live/buy/sell app path can exist, but must be clearly locked until owner explicitly enables

7. Proof Brain
   - yearly walk-forward
   - Nifty comparison
   - drawdown
   - win/loss
   - regime split
   - parameter hit/block/fail counts
   - alpha status
   - edge status
   - failure reason ledger

8. Dashboard Brain
   - private dashboard built in repo; Lovable optional only
   - login
   - scanner
   - parameter lab
   - risk dashboard
   - data ingestion
   - paper trades
   - proof ledger
   - reports
   - admin/settings

## Difference vs AM07

AM07 is currently a working paper engine with some good modules, but it has weaknesses:

- no full real Upstox historical candle ingestion yet,
- data proof is incomplete,
- edge not proven,
- yfinance dependency still exists,
- 15-year equity OHLCV proof not complete,
- dashboard/control layer is not enough for owner vision,
- parameter/data-bank memory is not complete.

AshStocks must absorb AM07's useful engine pieces, then go beyond it.

## Difference vs G07

G07 was the transparency/control-lab concept. It should become AshStocks dashboard/control layer, not a separate product.

## Final naming rule

Use AshStocks in user-facing app.

AM07/G07 may remain internally in migration notes only.

## No-placeholder rule

A function cannot return OK unless it actually performed the real action.

Bad:
rows_upserted: 0 with OK when nothing was ingested.

Good:
SOURCE_FOUND / ACCESS_REQUIRED / INGESTION_PENDING / DATA_NEEDED / ERROR / INGESTED with real counts.

## Immediate build order

1. Create source of truth in GitHub.
2. Create Data Bank and work ledgers.
3. Inspect all current repo/source files.
4. Import/adopt AM07 reference modules with reason.
5. Add real data ingestion modules.
6. Build dashboard after brain contracts are frozen.
7. Run proof tests.
8. Only then polish UI.
