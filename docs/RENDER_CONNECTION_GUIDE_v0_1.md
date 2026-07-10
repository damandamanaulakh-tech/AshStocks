# Render Connection Guide v0.1

Repo: `damandamanaulakh-tech/AshStocks`

## Current deploy target

```text
Service type: Web Service
Runtime: Python
Build command: pip install -r requirements.txt
Start command: uvicorn ashstocks.api:app --host 0.0.0.0 --port $PORT
Health URL: /health
```

## Files added for Render

```text
requirements.txt
render.yaml
ashstocks/api.py
```

## Render setup steps

1. Open Render.
2. Choose New → Web Service.
3. Connect GitHub repo: `damandamanaulakh-tech/AshStocks`.
4. Select branch: `main`.
5. Runtime: Python.
6. Build command:

```bash
pip install -r requirements.txt
```

7. Start command:

```bash
uvicorn ashstocks.api:app --host 0.0.0.0 --port $PORT
```

8. Add environment variables:

```text
PAPER_ONLY=true
BROKER_WRITE_ENABLED=false
```

9. Do not add Upstox token until historical candle ingestion is being tested.
10. Do not paste secrets into chat or commit `.env`.

## Later env vars

```text
UPSTOX_API_KEY
UPSTOX_API_SECRET
UPSTOX_REDIRECT_URI
UPSTOX_ACCESS_TOKEN
MONGO_URI or MONGODB_URI
SENTRY_DSN
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Use Render Environment settings, AWS Secrets Manager, or GitHub Actions Secrets. Never store secrets in Drive docs or repo files.

## Smoke test after deploy

Open:

```text
https://YOUR-RENDER-APP.onrender.com/health
```

Expected:

```json
{
  "ok": true,
  "app": "AshStocks",
  "paper_only": true,
  "broker_write_enabled": false
}
```

Then open:

```text
/api/config
/api/spec
```

## What this deploy is

This is a working API shell for AshStocks engine verification. It does not yet run live data scans, place broker orders, import all Drive files, or show final dashboard.

## What comes next

```text
1. Deploy API shell.
2. Confirm /health works.
3. Add Mongo/Supabase storage.
4. Add Upstox historical candle ingestion endpoint.
5. Add Drive/NSE/FII/PWOI ingestion jobs.
6. Add dashboard.
7. Add paper scan scheduler.
```
