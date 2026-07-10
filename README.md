# Ash Stock

Ash Stock is a server-backed trading workflow app. The browser is only the client; watchlists, positions, alerts, and journal entries are owned by the backend and can be persisted to MongoDB for deployment.

## Run Locally

```bash
npm install
npm start
```

Open:

```text
http://localhost:4173
```

Local development runs with server memory if `MONGODB_URI` is not set. Production is configured to require MongoDB.

## Verify

```bash
npm run check
npm run smoke
```

`npm run smoke` starts a temporary local server, checks health/state/Q1 status, uploads sample Q1 input CSVs, verifies the Render-only Upstox run guard, and removes the sample inputs afterward. It does not call Upstox.

## Deploy On Render With MongoDB

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

If `APP_PASSWORD` or `MONGODB_URI` is missing in production, `/api/health` returns an error instead of silently becoming a public/offline app.

## Private Access

Production is private. Set `APP_PASSWORD` in Render, then open the Render URL and sign in. The session uses an HTTP-only cookie signed with `APP_SESSION_SECRET`; Render can generate that secret from `render.yaml`.

Local development stays open unless you set:

```text
REQUIRE_AUTH=true
APP_PASSWORD=...
```

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

- Server-owned watchlist, positions, alerts, and journal state
- Private production login gate
- MongoDB persistence adapter for production
- Render blueprint in `render.yaml`
- Q1 Render-side upload/fetch/download job runner
- Yahoo Finance quote/search/news proxy with short caching
- US and NSE symbol support, including aliases like `RELIANCE`
- Dashboard with equity, day P/L, alerts, watchlist breadth, performance, allocation, focus quote, signals, and news
- Portfolio positions with market value, weight, P/L, and CSV export
- Watchlist with targets, live search suggestions, momentum signals, and sparklines
- Price alerts for above/below triggers
- Trade journal with side, conviction, thesis, and timestamps
- Light/dark theme and responsive desktop/mobile UI

## Files

- `server.js` - HTTP server, market-data proxy, state API, MongoDB store
- `app.js` - browser client and workflow UI
- `index.html` - app shell served by `server.js`
- `styles.css` - product UI styling
- `render.yaml` - Render deployment blueprint
- `.env.example` - required environment variable shape
- `scripts/smoke-test.mjs` - local non-Upstox verification
