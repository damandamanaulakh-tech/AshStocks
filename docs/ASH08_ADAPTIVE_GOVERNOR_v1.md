# Ash08 Adaptive Risk Governor (LOCKED v1.0)

**Branch:** `ash08-adaptive-governor`  
**App name:** Ash08  
**Status:** LOCKED for paper trading  
**Lock date:** 2026-07-19

## What was added

| Path | Purpose |
|------|---------|
| `ashstocks/brain/adaptive_risk_governor.py` | Pure L0–L4 exposure governor (IFR + FII cash stack) |
| `ashstocks/brain/ash08_governor_api.py` | JSON helper for pure ASGI |
| `docs/ASH08_ADAPTIVE_GOVERNOR_v1.md` | This file |
| `docs/API_INSERT_ASH08.md` | Exact insert points for `api.py` |

## Locked exposure table

| Level | Condition | Target exposure |
|-------|-----------|-----------------|
| L0 Normal | No DAMAGE_CLUSTER_5IN10 | 100% |
| L1 Damage Only | DAMAGE only | 70% |
| L2 Confirmed | DAMAGE + 1 FII confirm | 50% |
| L3 High Severity | DAMAGE + ≥2 FII confirms | 25% |
| L4 Extreme | DAMAGE + Q10 + Sell Cluster | 15% |

Repair: stepwise +25% max per day when `REPAIR_AFTER_DAMAGE_CANDIDATE` is true.

## Python usage

```python
from ashstocks.brain.adaptive_risk_governor import AdaptiveRiskGovernor, SignalFlags

gov = AdaptiveRiskGovernor()
flags = SignalFlags(
    damage_cluster_5in10=True,
    fii_cash_stress_q10=True,
    fii_sell_cluster_7in10=False,
    fii_any_confirm=True,
)
decision = gov.evaluate(flags)
print(decision.target_exposure_pct)  # 25.0
print(decision.severity)              # L3_HIGH_SEVERITY
```

## API usage (after wiring + deploy)

```bash
curl -X POST https://ashstocks-api.onrender.com/api/risk/governor \
  -H "Content-Type: application/json" \
  -d '{
    "damage_cluster_5in10": true,
    "fii_cash_stress_q10": true,
    "fii_sell_cluster_7in10": false,
    "fii_any_confirm": true,
    "repair_after_damage_candidate": false
  }'
```

## Safety

- Paper only by design
- No broker write
- Pure function — caller supplies flags
- Does not place orders

## Relation to existing brain

- Complements `ashstocks/brain/ifr.py` (internal fracture detection)
- Complements `ashstocks/brain/risk.py` (drawdown / liquidity / correlation gates)
- Adaptive governor is the **portfolio exposure scalar** layer between IFR/FII flags and position sizing
