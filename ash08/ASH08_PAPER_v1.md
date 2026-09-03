# ASH08 Paper Engine — Phase 4

Branch: `ash08-adaptive-governor` only. **Never main.**

## Delivers

| Piece | Role |
|-------|------|
| `ash08/paper_engine.py` | Paper ticket, positions, exits, governor sizing |
| `paper_state.json` | Persisted book |

## Rules (locked)

- Paper only — no live broker
- Ticket: qty, MARKET/LIMIT, stop, target
- Size = min(requested, MAX_NAME_PCT × book × governor_exposure)
- MAX_NAME_PCT = 2.5%
- Governor L0–L4: 100 / 70 / 50 / 25 / 15
- Exits: STOP_HIT, TARGET_HIT, GOVERNOR_CUT, ROTATION

## Run

```bash
python ash08/paper_engine.py --demo --data-dir ash08_data
python ash08/paper_engine.py --status --data-dir ash08_data
```

## Next

Optional Phase 5: wire scan_latest SELECT rows → ticket UI / API and live metrics feed.
