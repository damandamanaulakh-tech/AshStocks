# AshStocks — AM07 Adoption Map v0.1

Purpose: adopt useful AM07 organs without copying AM07's weak proof or old identity.

## Final identity

- Final app name: **AshStocks**
- AM07 role: running reference engine only
- G07 role: transparency/control-lab concept only
- Lovable role: not required for core build

## Adopted from AM07 branch `claude/control-panel-ui-1`

| AM07 file | Adopt into AshStocks? | Reason | AshStocks landing |
|---|---:|---|---|
| `trading/engine.py` | PARTIAL | good scan/refresh/why-journal operating pattern | `ashstocks/brain/*` later orchestration |
| `trading/strategies/nifty200_momentum.py` | YES, IMPROVED | clean 6m+12m vol-adjusted momentum base | `ashstocks/brain/selection.py` |
| `trading/quality.py` | YES, IMPROVED | avoids pure high-beta momentum book | `ashstocks/brain/selection.py` |
| `trading/risk_v2.py` | YES, IMPROVED | drawdown/liquidity/correlation/cash reserve gates | `ashstocks/brain/risk.py` |
| `trading/ifr.py` | YES, IMPROVED | internal market damage throttle | `ashstocks/brain/ifr.py` |
| `trading/proof.py` | YES, EXPAND | honest proof/gap ledger | `data_bank/PROOF_LEDGER.csv` |
| `trading/brokers/upstox.py` | PARTIAL | OAuth/quote/paper lock useful, candle fetch missing | `ashstocks/data/upstox_candles.py` |
| yfinance data path | NO | not proof-grade for final AshStocks | replace with Upstox/NSE/Drive ingestion |
| AM07 evidence claims | NO | repo itself says edge not proven | AshStocks must prove separately |

## Non-negotiable AshStocks changes

1. One app, one brand: AshStocks.
2. No fake success. No `rows_upserted: 0` OK.
3. Every scan stores config, data source, gates, decision, reason.
4. Every parameter gets status: ACTIVE / REVIEW / BLOCKED / DATA_NEEDED / RETIRED / MERGED.
5. Private mode can include aggressive/risky labels, but must label risk and proof status.
6. Upstox/NSE/FII/PWOI data must become first-class ingestion, not optional decoration.

## Current first brain created

- `ashstocks/brain/selection.py`
- `ashstocks/brain/risk.py`
- `ashstocks/brain/ifr.py`
- `ashstocks/data/upstox_candles.py`
- `ashstocks/data/nse_fo_bhavcopy.py`
- `data_bank/*.csv`

## Next adoption target

Build the orchestrator:

```text
load universe
fetch real candles
score symbols
apply gates
apply IFR throttle
paper trade only
store scan result
store proof/failure rows
render dashboard
```
