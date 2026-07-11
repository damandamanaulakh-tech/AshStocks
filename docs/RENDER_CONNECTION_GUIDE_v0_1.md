# Render Connection Guide v0.1

Repo: `damandamanaulakh-tech/AshStocks`

## Current deploy target

```text
Service type: Web Service
Runtime: Node
Build command: npm install
Start command: npm start
Health URL: /api/health
Readiness URL: /api/ready
```

The live product is the Node dashboard. The Python files remain only as a lightweight compatibility API for older Render services.

## Required environment variables

```text
APP_PASSWORD
APP_SESSION_SECRET
UPSTOX_API_KEY
UPSTOX_ACCESS_TOKEN
```

MongoDB is preferred:

```text
MONGODB_URI
MONGODB_DB=ashstock
```

If Mongo is missing or rejected, the Node app falls back to server-side Render file storage so the app remains usable. `/api/ready` reports `storage: "file"` and includes a warning until Mongo credentials are fixed.

## Mongo notes

- Use the exact MongoDB Atlas driver URI.
- Do not include a port in `mongodb+srv://` hostnames.
- URL-encode special characters in the username or password.
- If Atlas authentication fails, create a new database user and paste a fresh URI into Render.

## Upstox scope

The app uses Upstox for historical candle fetches only. It does not place live orders.

```text
https://api.upstox.com/v2/historical-candle/{instrument_key}/day/{to_date}/{from_date}
```

## Smoke checks after deploy

Open:

```text
https://ashstocks-api.onrender.com/api/health
https://ashstocks-api.onrender.com/api/ready
https://ashstocks-api.onrender.com/login
```

Expected:

- `/api/health` returns `200`.
- `/api/ready` returns `200` with either `storage: "mongodb"` or `storage: "file"`.
- `/login` shows the private app login.

Never paste secrets into chat or commit `.env`.
