# AshStocks

AshStocks is a private, server-backed Indian/NSE stock selection engine. The browser is only the client; scanning, parameters, Upstox historical candles, NSE data-bank loading, Q1 upload/fetch/download, auth, storage, proof rows, and paper-only order intent live behind the Node backend.

[Deploy this repo on Render](https://render.com/deploy?repo=https://github.com/damandamanaulakh-tech/AshStocks)

## Current Product Shape

- Private Render app with login gate
- Indian/NSE scanner, not a USA stock dashboard
- Curated NSE pool plus backend Upstox NSE instruments JSON loader
- Server-side scanner endpoint with AshStocks v0.1 proof rows
- Saved backend data bank used by scanner runs
- Durable scan ledger for scanner proof records
- Upstox historical daily candle fetch only
- Q1 FII 20D Render-side runner
- Production paper-engine schedule at 09:20, 14:30, and 15:35 IST
- MongoDB adapter with Render file-storage fallback
- No live orders and no broker write endpoint

## Scanner Brain

The current engine is `ashstocks-selection-v0.1-proof`. Each scan row can return:

- `SELECT`, `WATCH`, `REJECT`, `BLOCKED`, or `DATA_NEEDED`
- 6M and 12M returns
- 6M/12M volatility-adjusted momentum score
- low-volatility plus liquidity quality score
- final score using `0.65 * momentum_score + 0.35 * quality_score`
- data, momentum, liquidity, stale-candle, stuck-candle, correlation, portfolio-cap, and paper-only gates
- target-potential label from 252D high: `PASS`, `WARN`, or `DATA_NEEDED`
- portfolio sizing and paper-only order intent when a row is selectable

Hard gates include data sufficiency, absolute momentum, ADV20, rupee turnover, stale candle, stuck candle, and 60D correlation to existing holdings when holdings are supplied.

## Data Bank

The `NSE Master` button calls the backend loader:

```text
POST /api/data-bank/load-upstox-nse
```

That endpoint downloads the official Upstox NSE instruments JSON file, filters `NSE_EQ` equity rows, stores up to 5,000 rows in backend app state, and then scanner runs can use that saved universe.

Status is available at:

```text
GET /api/data-bank/status
```

Upstox NSE instruments source:

```text
https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz
```

## Run Locally

```bash
npm install
npm start
```

Open:

```text
http://localhost:4173
```

Local development runs with memory storage if `MONGODB_URI` is not set. Production prefers MongoDB and falls back to Render file storage if Mongo credentials are missing or rejected.

## Verify

```bash
npm run check
npm run smoke
npm run verify:live
```

`npm run smoke` checks Mongo/file fallback, data-bank status, saved-universe scanner behavior, scanner parameters, proof-row shape, paper-only order intent, correlation blocking, Upstox missing-token guard, Q1 status/upload, and the Render-only Q1 run guard. It does not call Upstox.

## Render Environment

Set these secrets in Render:

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

If `APP_PASSWORD` is missing in production, `/api/ready` fails. If Mongo is missing or rejected, `/api/ready` reports `storage: "file"` with a warning. Fix `MONGODB_URI` to move persistence back to MongoDB.

## Scanner Endpoints

```text
GET  /api/scanner/parameters
GET  /api/scanner/template
GET  /api/scanner/ledger
POST /api/scanner/run
POST /api/scanner/run-upstox
GET  /api/upstox/status
```

Every successful scanner run appends a compact proof record to the scan ledger. Mongo deployments use the `scan_ledger` collection. Render file fallback uses `data/scan_ledger.jsonl`.

Upstox historical candle URI:

```text
https://api.upstox.com/v2/historical-candle/{instrument_key}/day/{to_date}/{from_date}
```

No live orders are exposed.

## Paper Engine

Production starts a paper-only scheduler with these IST slots:

```text
09:20
14:30
15:35
```

The scheduler reuses the saved data bank and Upstox historical candles, appends a scan-ledger proof record, and produces paper-order intent only. It never writes broker orders.

```text
GET  /api/paper-engine/status
POST /api/paper-engine/run
```

Use `DISABLE_PAPER_ENGINE_SCHEDULER=true` to disable the production timer, or `ENABLE_PAPER_ENGINE_SCHEDULER=true` to force-enable it outside production.

## Q1 Render-side Upstox Runner

The Q1 path is available at:

```text
/q1
```

It supports uploading:

- `fii_symbol_daily.csv`
- `Q1_FII_20D_ranked_top_bottom_deciles_READY_FOR_PRICE_JOIN.csv`

It writes outputs under `data/q1_outputs/` and exposes downloads for:

- `daily_close_by_scrip.csv`
- `nifty_daily_close.csv`
- `Q1_FII_20D_forward_return_result.csv`
- `Q1_FII_20D_summary.csv`
- `Q1_FII_20D_fetch_errors.csv`

Safety rules:

- Never print the token
- Never print the API key
- Never commit `.env`
- No live orders
- Historical daily candle fetch only

## Important Remaining Gaps

This is now a real NSE scanner/proof engine, but it is not the full final research platform yet. Still open:

- 15-year point-in-time OHLCV ingestion and yearly walk-forward proof
- NSE equity bhavcopy, FII/DII, and PWOI parsers
- IFR damage overlay from live cross-sectional data
- Mongo is still allowed to fall back to Render file storage until credentials are proven live

## Files

- `server.js` - backend, auth, scanner proof engine, Upstox data-bank loader/fetch, Q1 runner, Mongo/file storage
- `app.js` - browser scanner client, backend NSE Master action, CSV workflow, proof-field rendering
- `index.html` - scanner app shell
- `styles.css` - product UI styling
- `render.yaml` - Render deployment blueprint
- `scripts/smoke-test.mjs` - local non-Upstox verification
- `scripts/check-live-render.mjs` - public Render health/readiness verifier
