# INSERT INTO ashstocks/api.py  (branch: ash08-adaptive-governor)

## 1. Near top imports add:

```python
from ashstocks.brain.ash08_governor_api import evaluate_governor_payload, reset_governor
```

## 2. Inside `async def app(...)`, before the final else not_found block, add:

```python
    elif path == "/api/risk/governor" and method == "POST":
        try:
            raw = await _read_body(receive)
            payload = json.loads(raw.decode("utf-8") or "{}")
            result = evaluate_governor_payload(payload if isinstance(payload, dict) else {})
            status, headers, body = _json_response(result)
        except Exception as exc:
            status, headers, body = _json_response({"ok": False, "error": str(exc)}, 400)
    elif path == "/api/risk/governor/reset" and method == "POST":
        status, headers, body = _json_response(reset_governor())
```

## 3. Optional — extend root health message to mention Ash08 governor.

## Test after deploy

```bash
curl -X POST https://ashstocks-api.onrender.com/api/risk/governor \
  -H "Content-Type: application/json" \
  -d '{"damage_cluster_5in10": true, "fii_cash_stress_q10": true, "fii_any_confirm": true}'
```

Expected: severity L3_HIGH_SEVERITY, target_exposure_pct 25.0
