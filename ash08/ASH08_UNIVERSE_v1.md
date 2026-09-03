# ASH08 Universe — Phase 2 (LOCKED policy)

Branch: `ash08-adaptive-governor` only. **Never main.**

## What Phase 2 delivers

| Piece | Role |
|-------|------|
| `ash08/universe.py` | Load NSE instruments, build **Core** + **Discovery**, save snapshots |
| JSON snapshots | Offline-safe persistence (`universe_core.json`, `universe_discovery.json`) |
| Mongo | Optional later; same snapshot shape |

## Policy (do not change)

| Bucket | Size | Refresh | Use |
|--------|------|---------|-----|
| **Core** | 150–250 | **Weekly** | Paper desk / scanner default |
| **Discovery** | up to 5000 | On demand | Research only |

Membership filters when metrics exist:

- ADV20 ≥ 200,000 shares  
- 5D ₹ turnover ≥ 5 Cr  

Prices are **not** this module — every scan refreshes OHLCV (Phase 3+).

## Upstox source shape

- `https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz`
- `https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz`

Phase 2 code normalizes common field names (`trading_symbol`, `instrument_key`, `segment`, …).

Live download requires network on the host that runs the job. Sandbox without internet uses `--from-json` / `--from-symbols` / `--demo`.

## Run

```bash
# Demo offline rebuild
python ash08/universe.py --demo --data-dir ash08_data

# From local instruments JSON
python ash08/universe.py --from-json instruments.json --data-dir ash08_data

# Prefer N200-style list for Core ranking
python ash08/universe.py --from-json instruments.json --prefer n200_symbols.txt

# Status
python ash08/universe.py --status --data-dir ash08_data
```

## Outputs

- `ash08_data/universe_core.json`
- `ash08_data/universe_discovery.json`

Each snapshot includes: `asof`, `bucket`, `count`, `symbols`, `rows`, `notes`.

## Next

Phase 3: Scanner applies locked parameter gates on **Core** membership.
