# AshStocks Selection Engine v0.1

Status: DESIGNED.  
Purpose: machine-usable stock-selection brain for private paper trading and independent testing.

## Final per-stock output

```text
SELECT
WATCH
REJECT
BLOCKED
DATA_NEEDED
```

## Required input per symbol

```text
Daily OHLCV with at least:
date, open, high, low, close, volume

Minimum clean close candles for full score: 253 trading days
Minimum close candles for 6M absolute gate: 127 trading days
Minimum close candles for target-potential gate: 252 trading days
```

## Core formula

```text
6M_RETURN = Close_today / Close_127_trading_days_ago - 1

12M_RETURN = Close_today / Close_253_trading_days_ago - 1

6M_VOL = std(daily_return over last 126 candles) * sqrt(252)

12M_VOL = std(daily_return over last 252 candles) * sqrt(252)

RAW_MOMENTUM = ((6M_RETURN / 6M_VOL) + (12M_RETURN / 12M_VOL)) / 2

MOMENTUM_SCORE = clip(50 + RAW_MOMENTUM * 25, 0, 100)
```

If any required price or volatility input is missing/zero/invalid, output DATA_NEEDED.

## Quality formula

```text
63D_ANNUAL_VOL = std(daily_return over last 63 candles) * sqrt(252) * 100

LOW_VOL_SCORE = clip(100 - (63D_ANNUAL_VOL - 10) * 1.7, 0, 100)
```

## Liquidity quality bucket

```text
ADV20 = average(volume over last 20 candles)

if ADV20 > 1,000,000 shares:
    LIQUIDITY_QUALITY = 90
elif ADV20 > 300,000 shares:
    LIQUIDITY_QUALITY = 70
elif ADV20 > 100,000 shares:
    LIQUIDITY_QUALITY = 55
else:
    LIQUIDITY_QUALITY = 30
```

## Quality score

```text
QUALITY_SCORE = (LOW_VOL_SCORE + LIQUIDITY_QUALITY) / 2
```

## Final score

```text
FINAL_SCORE = 0.65 * MOMENTUM_SCORE + 0.35 * QUALITY_SCORE
```

## Selection buckets

```text
if Close history missing:
    DATA_NEEDED

elif clean close candles < 253:
    DATA_NEEDED

elif any hard gate fails:
    BLOCKED

elif FINAL_SCORE >= 70:
    SELECT

elif FINAL_SCORE >= 55:
    WATCH

else:
    REJECT
```

## Hard gates

```text
ABSOLUTE_MOMENTUM:
    Close_today > Close_127_trading_days_ago

STALE_DATA:
    Today - last_candle_date <= 7 calendar days

LIQUIDITY_SHARES:
    ADV20 >= 200,000 shares

LIQUIDITY_RUPEE:
    mean(Close * Volume over last 5 candles) / 1e7 >= 5 crore

NO_CIRCUIT_STUCK_CANDLE:
    latest Open, High, Low, Close must not all be equal

CORRELATION:
    60D daily-return correlation with each existing holding <= 0.85
```

## Target-potential label

This is a label, not a guarantee and not a hard fail in v0.1.

```text
252D_HIGH = max(close over last 252 candles)

POTENTIAL_LEFT = (252D_HIGH / Close_today - 1) * 100

if POTENTIAL_LEFT >= 15:
    TARGET_POTENTIAL = PASS
else:
    TARGET_POTENTIAL = WARN
```

## Portfolio bucket / size

```text
MAX_POSITIONS = 50
MAX_POSITION_PCT = 2.5% of starting capital
MAX_SECTOR_POSITIONS = 12
MAX_SECTOR_EXPOSURE = 25% of capital

BASE_POSITION_VALUE = STARTING_CAPITAL * 0.025

FINAL_POSITION_VALUE = BASE_POSITION_VALUE * REGIME_MULTIPLIER * IFR_MULTIPLIER * DRAWDOWN_MULTIPLIER

QTY = floor(FINAL_POSITION_VALUE / ENTRY_PRICE)
```

## IFR damage overlay

```text
DOWN_TAIL_HIT:
    daily_return < -3%

UP_TAIL_HIT:
    daily_return > +3%

TAIL_WINDOW = 5 trading days
CLUSTER_WINDOW = 10 trading days
CLUSTER_MIN_FIRES = 5
DOWN_TAIL_THRESHOLD = 90th percentile of cross-sectional down-tail ratio
TAIL_DAMAGE_RATIO_THRESHOLD = 85th percentile
ACTIVE_DAYS_AFTER_FIRE = 22 calendar days
THROTTLE_MULTIPLIER = 0.50

DAMAGE_CLUSTER fires if:
    rolling_10d_count(down_tail_ratio > DOWN_TAIL_THRESHOLD) >= 5

TAIL_DAMAGE_RATIO fires if:
    down_tail_ratio / (down_tail_ratio + up_tail_ratio + 0.001) > 85th percentile

if either active:
    IFR_MULTIPLIER = 0.50
else:
    IFR_MULTIPLIER = 1.00
```

## Drawdown multiplier

```text
normal:
    DRAWDOWN_MULTIPLIER = 1.00

portfolio_drawdown <= -5%:
    DRAWDOWN_MULTIPLIER = 0.75

portfolio_drawdown <= -8%:
    DRAWDOWN_MULTIPLIER = 0.00
    halt_new_entries = true

portfolio_drawdown <= -10%:
    DRAWDOWN_MULTIPLIER = 0.00
    halt_new_entries = true
    forced_cut = 50%

portfolio_drawdown <= -15%:
    DRAWDOWN_MULTIPLIER = 0.00
    halt_new_entries = true
    forced_cut = 80%

portfolio_drawdown <= -20%:
    DRAWDOWN_MULTIPLIER = 0.00
    halt_new_entries = true
    forced_cut = 100%
```

## Engine loop

```text
FOR EACH SYMBOL:
    load OHLCV
    validate minimum candles
    calculate MOMENTUM_SCORE
    calculate QUALITY_SCORE
    calculate FINAL_SCORE
    run absolute momentum gate
    run target-potential label
    run stale-data gate
    run liquidity gates
    run no-circuit gate
    run correlation gate
    assign SELECT / WATCH / REJECT / BLOCKED / DATA_NEEDED

AFTER ALL SYMBOLS:
    sort SELECT by FINAL_SCORE descending
    apply max positions
    apply sector caps
    apply regime multiplier
    apply IFR multiplier
    apply drawdown multiplier
    create paper order only
    store scan packet, gates, reason, config snapshot, qty, price, timestamp
```

## Default parameters

```csv
parameter,value,unit
min_select_score,70,score
min_watch_score,55,score
target_potential_pct,15,percent
max_position_pct,0.025,fraction
max_positions,50,count
max_sector_positions,12,count
max_sector_exposure_pct,25,percent
max_stale_days,7,calendar_days
min_avg_volume_shares,200000,shares
min_rupee_volume_cr,5,crore_rupees
correlation_threshold,0.85,correlation
quality_blend_pct,0.35,fraction
momentum_weight,0.65,fraction
paper_only,true,boolean
broker_write_enabled,false,boolean
ifr_tail_drop_pct,-0.03,daily_return_fraction
ifr_tail_up_pct,0.03,daily_return_fraction
ifr_tail_window,5,trading_days
ifr_cluster_window,10,trading_days
ifr_cluster_min_fires,5,count
ifr_tail_percentile,0.90,quantile
ifr_ratio_percentile,0.85,quantile
ifr_active_days_after_fire,22,calendar_days
ifr_throttle_multiplier,0.50,multiplier
```

## Validation status

```text
Full AshStocks blended-score system: NOT_TESTED
IFR DAMAGE_CLUSTER concept: VALIDATED in prior internal research, adopted as throttle
IFR TAIL_DAMAGE_RATIO concept: VALIDATED in prior internal research, adopted as throttle
FII per-stock 20D factor: NOT ADOPTED for live score until price-forward-return validation is complete
```
