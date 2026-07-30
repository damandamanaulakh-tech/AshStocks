# ASH08 Scanner — Phase 3 (LOCKED parameters)

Branch: `ash08-adaptive-governor` only. **Never main.**

## What Phase 3 delivers

| Piece | Role |
|-------|------|
| `ash08/scanner.py` | Evaluate each Core name → SELECT / WATCH / REJECT |
| `scan_latest.json` | Latest ranked desk list + parameter hits |

## Locked gates

| ID | Rule | Type |
|----|------|------|
| P-ADV20 | ADV20 ≥ 200,000 | HARD |
| P-TURNOVER | 5D ₹ turnover ≥ 5 Cr | HARD |
| P-STALE | candle age ≤ 7 days | HARD |
| P-MOM | 6M return > 0 | HARD |
| P-SCORE | 0.65×mom_score + 0.35×quality | RANK |
| P-CORR | corr vs book ≤ 0.85 | HARD |
| P-SELECT | score ≥ 70 + all hard pass | DECISION |
| P-WATCH | score ∈ [55, 70) + hard pass | DECISION |

## Run

```bash
python ash08/scanner.py --demo --data-dir ash08_data
python ash08/scanner.py --metrics metrics.json --universe-core ash08_data/universe_core.json
python ash08/scanner.py --status --data-dir ash08_data
```

## Output shape

Each row: `symbol`, `decision`, `score`, `reason`, `hits[]` (`param_id`, `passed`, `detail`).

## Next

Phase 4: Paper ticket + positions + Adaptive Risk Governor wire into desk flow.
