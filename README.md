# AshStocks

AshStocks is a private, server-backed Indian stock selection engine. The browser is only the client; the scanner, parameter bank, Upstox historical-candle workflow, Q1 runner, auth, and storage live behind the Node backend. Production prefers MongoDB and falls back to Render file storage if Mongo credentials are not valid yet.

[Deploy this repo on Render](https://render.com/deploy?repo=https://github.com/damandamanaulakh-tech/AshStocks)

## Run Locally

```bash
npm install
npm start
```

Open:

```text
http://localhost:4173
```

Local development runs with server memory if `MONGODB_URI` is not set. Production is configured to require backend storage; MongoDB is preferred, and the Render filesystem fallback keeps the live app usable while Mongo credentials are corrected.

## Verify

```bash
npm run check
npm run smoke
```

`npm run smoke` starts a temporary local server, checks health/state/scanner/Q1 status, verifies scanner decisions, uploads sample Q1 input CSVs, verifies the Render-only Upstox run guard, and removes sample inputs afterward. It does not call Upstox.

## Deploy On Render With MongoDB Or File Fallback

1. Create a MongoDB Atlas cluster.
2. Copy its connection string.
3. Create a Render web service from this repository.
4. Render will read `render.yaml`.
5. Set the secret environment variables:

```text
APP_PASSWORD=...
MONGODB_URI=mongodb+srv://...
UPSTOX_API_KEY=...
UPSTOX_ACCESS_TOKEN=...
```

Production has:

```text
NODE_ENV=production
REQUIRE_DB=true
REQUIRE_AUTH=true
MONGODB_DB=ashstock
```

If `APP_PASSWORD` is missing in production, `/api/ready` returns an error. If Mongo credentials are missing or rejected, the app falls back to server-side Render file storage and `/api/ready` reports `storage: "file"` with a warning. Fix `MONGODB_URI` to move persistence back to MongoDB.

If an existing Render service is still using the old Python dashboard settings, change it to a Node web service or create a new Node web service with:

```text
Runtime: Node
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
```

The repository also keeps a minimal Python compatibility API (`app.py`, `main.py`, `ashstocks/api.py`, `runtime.txt`, `.python-version`, `requirements.txt`) so old Render services that still use `uvicorn app:app`, `uvicorn main:app`, or `uvicorn ashstocks.api:app` no longer try to compile pandas, numpy, or pydantic on Python 3.14. That compatibility path keeps the API guard alive; the product app is the Node scanner.

## Private Access

Production is private. Set `APP_PASSWORD` in Render, then open the Render URL and sign in. The session uses an HTTP-only cookie signed with `APP_SESSION_SECRET`; Render can generate that secret from `render.yaml`.

Local development stays open unless you set:

```text
REQUIRE_AUTH=true
APP_PASSWORD=...
```

## Main Scanner

The first screen is the Indian selection engine. It supports:

- Default NSE large-cap pool with Upstox instrument keys
- CSV stock-pool upload or paste
- Parameter bank with hard gates and weighted factors
- Server-side scanner run from supplied metrics
- Render-side Upstox historical daily candle scan from `UPSTOX_ACCESS_TOKEN`
- Ranked decisions: `SELECT`, `WATCH`, `REJECT`, `BLOCKED`, `DATA_NEEDED`
- Per-stock reasons, gate status, score, 6M/12M returns, liquidity, and export CSV

Scanner endpoints:

```text
GET  /api/scanner/parameters
GET  /api/scanner/template
POST /api/scanner/run
POST /api/scanner/run-upstox
GET  /api/upstox/status
```

Upstox scope:

```text
https://api.upstox.com/v2/historical-candle/{instrument_key}/day/{to_date}/{from_date}
```

No live orders are exposed.

## Q1 Render-side Upstox Runner

The archived G07/task merge added the Q1 FII 20D workflow under:

```text
http://localhost:4173/q1
```

It supports:

- Upload `fii_symbol_daily.csv`
- Upload `Q1_FII_20D_ranked_top_bottom_deciles_READY_FOR_PRICE_JOIN.csv`
- Save inputs under `data/q1_inputs/`
- Show `UPSTOX_ACCESS_TOKEN` visibility as yes/no only
- Show `UPSTOX_API_KEY` visibility as yes/no only
- Show required input/output files as yes/no only
- Run `POST /api/q1/run-upstox-fetch` only when Render env is detected
- Write outputs under `data/q1_outputs/`
- Download generated output CSVs from `/q1`

Output files:

- `daily_close_by_scrip.csv`
- `nifty_daily_close.csv`
- `Q1_FII_20D_forward_return_result.csv`
- `Q1_FII_20D_summary.csv`

Safety rules:

- Never print the token
- Never print the API key
- Never commit `.env`
- No live orders
- Historical daily candle fetch only
- Do not run Upstox from Codex/local verification

## What Is Built

- Private Render login gate
- MongoDB persistence adapter for production with Render file-storage fallback
- Indian scanner backend under `/api/scanner/*`
- Default NSE universe with Upstox instrument keys
- Parameter bank based on data sufficiency, momentum, risk, liquidity, stale candle, and stuck candle gates
- Server-side manual metric scan from uploaded/pasted CSV data
- Render-side Upstox historical-candle scan
- Scanner UI with filters, decision table, parameter view, CSV import, and CSV export
- Q1 Render-side upload/fetch/download job runner
- Light/dark theme and responsive desktop/mobile UI

## Files

- `server.js` - HTTP server, auth, scanner API, Upstox candle scan, Q1 runner, MongoDB store, and Render file-storage fallback
- `app.js` - browser scanner client and CSV workflow
- `index.html` - scanner app shell served by `server.js`
- `styles.css` - product UI styling
- `render.yaml` - Render deployment blueprint
- `.env.example` - required environment variable shape
- `scripts/smoke-test.mjs` - local non-Upstox verification
