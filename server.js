import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const runtimeProcess = globalThis.process;
function readEnv() {
  return globalThis.__ASH_STOCK_ENV || runtimeProcess?.env || {};
}
const ENV = new Proxy(
  {},
  {
    get(_target, prop) {
      return readEnv()[prop];
    },
    ownKeys() {
      return Reflect.ownKeys(readEnv());
    },
    getOwnPropertyDescriptor(_target, prop) {
      return {
        enumerable: true,
        configurable: true,
        value: readEnv()[prop]
      };
    }
  }
);
const PORT = Number(ENV.PORT || 4173);
const CACHE_MS = 15_000;
const YAHOO_BASE = "https://query1.finance.yahoo.com";
const SESSION_COOKIE = "ash_stock_session";
const fsp = fs.promises;
const DEFAULT_MONGO_TIMEOUT_MS = 8_000;

function requireDb() {
  return ENV.REQUIRE_DB === "true" || ENV.NODE_ENV === "production";
}

function requireAuth() {
  return ENV.REQUIRE_AUTH === "true" || ENV.NODE_ENV === "production";
}

function appPassword() {
  return ENV.APP_PASSWORD || "";
}

function sessionSecret() {
  return ENV.APP_SESSION_SECRET || appPassword() || "ash-stock-dev-session";
}

function mongoTimeoutMs() {
  const value = Number(ENV.MONGO_TIMEOUT_MS || DEFAULT_MONGO_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MONGO_TIMEOUT_MS;
}

const RELEASE = "2026-07-11-mongo-srv-normalizer";

function normalizeMongoUri(uri) {
  let value = String(uri || "").trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1).trim();
  }
  const scheme = "mongodb+srv://";
  if (!value.toLowerCase().startsWith(scheme)) return value;

  const rest = value.slice(scheme.length);
  const hostStart = rest.lastIndexOf("@") + 1;
  const userInfo = rest.slice(0, hostStart);
  const hostAndSuffix = rest.slice(hostStart);
  const boundary = hostAndSuffix.search(/[/?#]/);
  const host = boundary === -1 ? hostAndSuffix : hostAndSuffix.slice(0, boundary);
  const suffix = boundary === -1 ? "" : hostAndSuffix.slice(boundary);
  if (host.includes(",")) return `mongodb://${userInfo}${host}${suffix}`;
  return `${scheme}${userInfo}${host.replace(/:\d+/g, "").replace(/%3A\d+/gi, "")}${suffix}`;
}

function mongoUri() {
  return normalizeMongoUri(ENV.MONGODB_URI || "");
}

function mongoUriShape(uri) {
  let value = String(uri || "").trim();
  const wrappedInQuotes = (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
  if (wrappedInQuotes) value = value.slice(1, -1).trim();
  const schemeEnd = value.indexOf("://");
  const scheme = schemeEnd >= 0 ? value.slice(0, schemeEnd).toLowerCase() : "";
  const rest = schemeEnd >= 0 ? value.slice(schemeEnd + 3) : value;
  const hostStart = rest.lastIndexOf("@") + 1;
  const hostAndSuffix = rest.slice(hostStart);
  const boundary = hostAndSuffix.search(/[/?#]/);
  const host = boundary === -1 ? hostAndSuffix : hostAndSuffix.slice(0, boundary);
  return {
    present: Boolean(value),
    length: value.length,
    wrappedInQuotes,
    scheme,
    hasUserInfo: hostStart > 0,
    hostCount: host ? host.split(",").length : 0,
    hostLength: host.length,
    hostPortMarkers: (host.match(/(?::|%3A)\d+/gi) || []).length,
    hasComma: host.includes(",")
  };
}

function mongoUriDiagnostics() {
  return {
    raw: mongoUriShape(ENV.MONGODB_URI || ""),
    normalized: mongoUriShape(mongoUri())
  };
}

async function withTimeout(promise, ms, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

const SYMBOL_ALIASES = {
  RELIANCE: "RELIANCE.NS",
  INFY: "INFY.NS",
  TCS: "TCS.NS",
  HDFCBANK: "HDFCBANK.NS",
  ICICIBANK: "ICICIBANK.NS",
  SBIN: "SBIN.NS"
};

const Q1_INPUT_DIR = path.join(ROOT, "data", "q1_inputs");
const Q1_OUTPUT_DIR = path.join(ROOT, "data", "q1_outputs");
const Q1_REQUIRED_INPUTS = [
  "fii_symbol_daily.csv",
  "Q1_FII_20D_ranked_top_bottom_deciles_READY_FOR_PRICE_JOIN.csv"
];
const Q1_OUTPUT_FILES = [
  "daily_close_by_scrip.csv",
  "nifty_daily_close.csv",
  "Q1_FII_20D_forward_return_result.csv",
  "Q1_FII_20D_summary.csv"
];
const Q1_EXTRA_DOWNLOADS = ["Q1_FII_20D_fetch_errors.csv"];
const Q1_ALLOWED_UPLOADS = new Set(Q1_REQUIRED_INPUTS);
const Q1_ALLOWED_DOWNLOADS = new Set([...Q1_OUTPUT_FILES, ...Q1_EXTRA_DOWNLOADS]);

const cache = new Map();
let storePromise;

function defaultState() {
  return {
    theme: "light",
    selected: "NVDA",
    watchlist: [
      { symbol: "NVDA", target: 175 },
      { symbol: "MSFT", target: 540 },
      { symbol: "AAPL", target: 230 },
      { symbol: "TSLA", target: 360 },
      { symbol: "RELIANCE", target: 1560 }
    ],
    positions: [
      { symbol: "NVDA", shares: 18, cost: 126.4, note: "AI compute leader" },
      { symbol: "MSFT", shares: 9, cost: 438.5, note: "Cloud compounder" },
      { symbol: "AAPL", shares: 14, cost: 188.2, note: "Hardware cycle" },
      { symbol: "JPM", shares: 10, cost: 236.5, note: "Rate exposure" }
    ],
    alerts: [
      { id: "seed-tsla-alert", symbol: "TSLA", operator: "above", price: 350 },
      { id: "seed-aapl-alert", symbol: "AAPL", operator: "below", price: 200 }
    ],
    journal: [
      {
        id: "seed-nvda-journal",
        date: new Date().toISOString(),
        symbol: "NVDA",
        side: "Buy",
        conviction: "High",
        thesis: "Holding above the 20 day trend with improving relative strength."
      }
    ]
  };
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*"
  });
  res.end(payload);
}

function html(res, status, body) {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

function parseCookies(header = "") {
  return Object.fromEntries(
    String(header)
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index >= 0 ? [part.slice(0, index), decodeURIComponent(part.slice(index + 1))] : [part, ""];
      })
  );
}

function signSession(value) {
  return crypto.createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function makeSessionCookie() {
  const issuedAt = String(Date.now());
  const value = `${issuedAt}.${signSession(issuedAt)}`;
  const secure = ENV.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`;
}

function isAuthenticated(req) {
  if (!requireAuth()) return true;
  if (!appPassword()) return false;
  const cookie = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
  if (!cookie) return false;
  const [issuedAt, signature] = cookie.split(".");
  if (!issuedAt || !signature) return false;
  const age = Date.now() - Number(issuedAt);
  if (!Number.isFinite(age) || age < 0 || age > 7 * 24 * 60 * 60 * 1000) return false;
  const expected = signSession(issuedAt);
  if (Buffer.byteLength(signature) !== Buffer.byteLength(expected)) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function authStatus() {
  return {
    required: requireAuth(),
    configured: !requireAuth() || Boolean(appPassword())
  };
}

function loginPage(error = "") {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ash Stock Login</title>
    <link rel="icon" href="data:," />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main class="server-required-screen">
      <form class="server-required-panel login-panel" method="post" action="/login">
        <div class="brand-mark">AS</div>
        <span class="eyebrow">Private App</span>
        <h1>Ash Stock</h1>
        <p>Enter the app password configured in Render.</p>
        ${error ? `<p class="negative">${escapeHtml(error)}</p>` : ""}
        <label class="login-field">
          <span>Password</span>
          <input name="password" type="password" autocomplete="current-password" required />
        </label>
        <button class="primary-button" type="submit">Sign In</button>
      </form>
    </main>
  </body>
</html>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return map[char];
  });
}

async function readFormBody(req) {
  const raw = await readRawBody(req, 64 * 1024);
  return new URLSearchParams(raw.toString("utf8"));
}

function normalizeSymbol(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9.^=-]/g, "");
}

function providerSymbol(symbol) {
  const normalized = normalizeSymbol(symbol);
  return SYMBOL_ALIASES[normalized] || normalized;
}

function sanitizeState(input = {}) {
  const defaults = defaultState();
  const state = { ...defaults, ...input };
  return {
    theme: state.theme === "dark" ? "dark" : "light",
    selected: normalizeSymbol(state.selected || defaults.selected),
    watchlist: arrayOf(state.watchlist).map((item) => ({
      symbol: normalizeSymbol(item.symbol),
      target: Number(item.target || 0)
    })).filter((item) => item.symbol),
    positions: arrayOf(state.positions).map((item) => ({
      symbol: normalizeSymbol(item.symbol),
      shares: Number(item.shares || 0),
      cost: Number(item.cost || 0),
      note: String(item.note || "").slice(0, 120)
    })).filter((item) => item.symbol && item.shares > 0),
    alerts: arrayOf(state.alerts).map((item) => ({
      id: String(item.id || cryptoId()),
      symbol: normalizeSymbol(item.symbol),
      operator: item.operator === "below" ? "below" : "above",
      price: Number(item.price || 0)
    })).filter((item) => item.symbol && item.price > 0),
    journal: arrayOf(state.journal).map((item) => ({
      id: String(item.id || cryptoId()),
      date: item.date || new Date().toISOString(),
      symbol: normalizeSymbol(item.symbol),
      side: ["Buy", "Sell", "Watch"].includes(item.side) ? item.side : "Watch",
      conviction: ["High", "Medium", "Low"].includes(item.conviction) ? item.conviction : "Medium",
      thesis: String(item.thesis || "").slice(0, 240)
    })).filter((item) => item.symbol && item.thesis)
  };
}

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function cryptoId() {
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function getStore() {
  if (!storePromise) {
    storePromise = createStore().catch((error) => {
      storePromise = null;
      throw error;
    });
  }
  return storePromise;
}

async function createStore() {
  if (mongoUri()) return createMongoStore();
  if (requireDb()) {
    throw new Error("MONGODB_URI is required in production. Set it in Render or your hosting environment.");
  }
  let state = sanitizeState(defaultState());
  return {
    mode: "memory",
    persistent: false,
    async getState() {
      return state;
    },
    async saveState(nextState) {
      state = sanitizeState(nextState);
      return state;
    }
  };
}

async function createMongoStore() {
  const { MongoClient } = await import("mongodb");
  const timeoutMs = mongoTimeoutMs();
  const client = new MongoClient(mongoUri(), {
    appName: "ash-stock",
    serverSelectionTimeoutMS: timeoutMs,
    connectTimeoutMS: timeoutMs,
    socketTimeoutMS: Math.max(timeoutMs, 15_000)
  });
  try {
    await withTimeout(client.connect(), timeoutMs + 2_000, `MongoDB connection timed out after ${timeoutMs}ms`);
    const database = client.db(ENV.MONGODB_DB || "ashstock");
    const collection = database.collection("app_state");
    await withTimeout(collection.createIndex({ updatedAt: -1 }), timeoutMs + 2_000, `MongoDB setup timed out after ${timeoutMs}ms`);

    return {
      mode: "mongodb",
      persistent: true,
      async getState() {
        const doc = await collection.findOne({ _id: "default" });
        if (doc?.state) return sanitizeState(doc.state);
        const seeded = sanitizeState(defaultState());
        await this.saveState(seeded);
        return seeded;
      },
      async saveState(nextState) {
        const state = sanitizeState(nextState);
        await collection.updateOne(
          { _id: "default" },
          { $set: { state, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
          { upsert: true }
        );
        return state;
      }
    };
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function readRawBody(req, maxBytes = 30 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function ensureQ1Dirs() {
  await fsp.mkdir(Q1_INPUT_DIR, { recursive: true });
  await fsp.mkdir(Q1_OUTPUT_DIR, { recursive: true });
}

async function existsFile(filePath) {
  try {
    const stat = await fsp.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function isRenderRuntime() {
  return Boolean(ENV.RENDER || ENV.RENDER_SERVICE_ID || ENV.RENDER_EXTERNAL_URL || ENV.RENDER_INSTANCE_ID);
}

async function q1Status() {
  await ensureQ1Dirs();
  const inputs = {};
  const outputs = {};
  for (const file of Q1_REQUIRED_INPUTS) inputs[file] = await existsFile(path.join(Q1_INPUT_DIR, file));
  for (const file of Q1_OUTPUT_FILES) outputs[file] = await existsFile(path.join(Q1_OUTPUT_DIR, file));
  return {
    key_visible: Boolean(ENV.UPSTOX_API_KEY || ENV.UPSTOX_CLIENT_ID),
    token_visible: Boolean(ENV.UPSTOX_ACCESS_TOKEN),
    render_runtime: isRenderRuntime(),
    input_dir: "data/q1_inputs",
    output_dir: "data/q1_outputs",
    inputs,
    outputs,
    input_files_found: Object.values(inputs).every(Boolean),
    output_files_found: Object.values(outputs).every(Boolean),
    safety: {
      key_printed: false,
      token_printed: false,
      live_orders: false,
      historical_candles_only: true
    }
  };
}

function parseMultipartCsvUploads(contentType, body) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!match) throw new Error("Missing multipart boundary");
  const boundary = match[1] || match[2];
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = body.indexOf(delimiter);
  while (start >= 0) {
    start += delimiter.length;
    if (body[start] === 45 && body[start + 1] === 45) break;
    if (body[start] === 13 && body[start + 1] === 10) start += 2;
    const next = body.indexOf(delimiter, start);
    if (next < 0) break;
    let part = body.subarray(start, next);
    if (part.length >= 2 && part[part.length - 2] === 13 && part[part.length - 1] === 10) {
      part = part.subarray(0, part.length - 2);
    }
    parts.push(part);
    start = next;
  }

  const uploads = [];
  for (const part of parts) {
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd < 0) continue;
    const headers = part.subarray(0, headerEnd).toString("utf8");
    const content = part.subarray(headerEnd + 4);
    const filename = /filename="([^"]+)"/i.exec(headers)?.[1];
    if (!filename) continue;
    const basename = path.basename(filename);
    if (!Q1_ALLOWED_UPLOADS.has(basename)) {
      throw new Error(`Unexpected upload file: ${basename}`);
    }
    uploads.push({ filename: basename, content });
  }
  return uploads;
}

async function handleQ1Upload(req, res) {
  await ensureQ1Dirs();
  const body = await readRawBody(req);
  const uploads = parseMultipartCsvUploads(req.headers["content-type"], body);
  if (!uploads.length) {
    json(res, 400, { ok: false, error: "No accepted CSV files uploaded" });
    return;
  }
  for (const upload of uploads) {
    await fsp.writeFile(path.join(Q1_INPUT_DIR, upload.filename), upload.content);
  }
  json(res, 200, { ok: true, uploaded: uploads.map((item) => item.filename), status: await q1Status() });
}

async function runQ1Fetch() {
  if (!isRenderRuntime()) return { ok: false, error: "render_only_endpoint" };
  if (!ENV.UPSTOX_ACCESS_TOKEN) return { ok: false, error: "upstox_token_missing" };
  const status = await q1Status();
  if (!status.input_files_found) return { ok: false, error: "required_inputs_missing", status };

  await ensureQ1Dirs();
  const scriptPath = path.join(ROOT, "scripts", "q1_upstox_price_join.mjs");
  const command = runtimeProcess?.execPath || "node";
  const childEnv = {
    ...readEnv(),
    UPSTOX_ACCESS_TOKEN: ENV.UPSTOX_ACCESS_TOKEN
  };

  return new Promise((resolve) => {
    const child = spawn(command, [
      scriptPath,
      "--input-dir",
      Q1_INPUT_DIR,
      "--output-dir",
      Q1_OUTPUT_DIR
    ], {
      cwd: ROOT,
      env: childEnv,
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      stdout = stdout.slice(-4000);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      stderr = stderr.slice(-4000);
    });
    child.on("close", async (code) => {
      const cleanStdout = stdout.replaceAll(ENV.UPSTOX_ACCESS_TOKEN, "[redacted]");
      const cleanStderr = stderr.replaceAll(ENV.UPSTOX_ACCESS_TOKEN, "[redacted]");
      resolve({
        ok: code === 0,
        exit_code: code,
        stdout: cleanStdout.trim(),
        stderr: cleanStderr.trim(),
        status: await q1Status()
      });
    });
  });
}

async function serveQ1Download(res, file) {
  const basename = path.basename(String(file || ""));
  if (!Q1_ALLOWED_DOWNLOADS.has(basename)) {
    json(res, 404, { ok: false, error: "Unknown Q1 output file" });
    return;
  }
  const target = path.join(Q1_OUTPUT_DIR, basename);
  if (!(await existsFile(target))) {
    json(res, 404, { ok: false, error: "Q1 output file not found" });
    return;
  }
  const content = await fsp.readFile(target);
  res.writeHead(200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="${basename}"`,
    "cache-control": "no-store"
  });
  res.end(content);
}

async function fetchJson(url) {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.createdAt < CACHE_MS) return cached.value;

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "Mozilla/5.0 AshStock/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Provider returned ${response.status}`);
  }

  const value = await response.json();
  cache.set(url, { value, createdAt: Date.now() });
  return value;
}

async function quoteFor(symbol) {
  const requested = normalizeSymbol(symbol);
  const yahooSymbol = providerSymbol(requested);
  if (!yahooSymbol) throw new Error("Missing symbol");

  const url = `${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=6mo&interval=1d&includePrePost=false&events=div%2Csplits`;
  const payload = await fetchJson(url);
  const result = payload.chart && payload.chart.result && payload.chart.result[0];
  if (!result) {
    const message = payload.chart?.error?.description || "No chart data";
    throw new Error(message);
  }

  const meta = result.meta || {};
  const quote = result.indicators?.quote?.[0] || {};
  const timestamps = result.timestamp || [];
  const closes = quote.close || [];
  const history = closes
    .map((close, index) => ({
      time: timestamps[index] ? timestamps[index] * 1000 : null,
      close
    }))
    .filter((point) => Number.isFinite(point.close));

  const last = Number(meta.regularMarketPrice || history.at(-1)?.close || 0);
  const previous = Number(meta.chartPreviousClose || meta.previousClose || history.at(-2)?.close || last);

  return {
    symbol: requested,
    providerSymbol: yahooSymbol,
    name: meta.longName || meta.shortName || requested,
    exchange: meta.fullExchangeName || meta.exchangeName || "Market",
    currency: meta.currency || "USD",
    instrumentType: meta.instrumentType || "EQUITY",
    price: round(last, 4),
    previousClose: round(previous, 4),
    regularMarketTime: meta.regularMarketTime ? meta.regularMarketTime * 1000 : Date.now(),
    history: history.map((point) => round(point.close, 4)),
    historyTimes: history.map((point) => point.time),
    source: "Yahoo Finance"
  };
}

async function searchSymbols(query) {
  const q = String(query || "").trim();
  if (!q) return [];
  const url = `${YAHOO_BASE}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`;
  const payload = await fetchJson(url);
  return (payload.quotes || [])
    .filter((item) => item.symbol && ["EQUITY", "ETF", "INDEX", "MUTUALFUND"].includes(item.quoteType || "EQUITY"))
    .slice(0, 8)
    .map((item) => ({
      symbol: item.symbol,
      name: item.longname || item.shortname || item.symbol,
      exchange: item.exchDisp || item.exchange || "Market",
      type: item.typeDisp || item.quoteType || "Security"
    }));
}

async function newsFor(query) {
  const q = String(query || "").trim();
  if (!q) return [];
  const url = `${YAHOO_BASE}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=0&newsCount=6`;
  const payload = await fetchJson(url);
  return (payload.news || []).slice(0, 6).map((item) => ({
    title: item.title,
    publisher: item.publisher,
    link: item.link,
    providerPublishTime: item.providerPublishTime ? item.providerPublishTime * 1000 : null
  }));
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(Number(value || 0) * factor) / factor;
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const decoded = decodeURIComponent(safePath);
  const target = path.resolve(ROOT, "." + decoded);

  if (!target.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(target, (error, content) => {
    if (error) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {
      "content-type": MIME_TYPES[ext] || "application/octet-stream",
      "cache-control": ext === ".html" ? "no-store" : "public, max-age=60"
    });
    res.end(content);
  });
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

      if (url.pathname === "/api/health") {
        const auth = authStatus();
        const hasMongoUri = Boolean(mongoUri());
        json(res, 200, {
          ok: true,
          release: RELEASE,
          commit: ENV.RENDER_GIT_COMMIT || ENV.RENDER_COMMIT || null,
          provider: "Yahoo Finance",
          cacheMs: CACHE_MS,
          storage: hasMongoUri ? "mongodb" : "unconfigured",
          persistent: hasMongoUri,
          auth,
          ready: auth.configured && (!requireDb() || hasMongoUri),
          time: Date.now()
        });
        return;
      }

      if (url.pathname === "/api/ready") {
        try {
          const auth = authStatus();
          if (!auth.configured) {
            json(res, 503, { ok: false, error: "APP_PASSWORD is required in production", auth, storage: "unconfigured", persistent: false });
            return;
          }
          const timeoutMs = mongoTimeoutMs();
          const store = await withTimeout(getStore(), timeoutMs + 2_000, `MongoDB health check timed out after ${timeoutMs}ms`);
          json(res, 200, {
            ok: true,
            provider: "Yahoo Finance",
            cacheMs: CACHE_MS,
            storage: store.mode,
            persistent: store.persistent,
            auth,
            time: Date.now()
          });
        } catch (error) {
          json(res, 503, {
            ok: false,
            error: error.message,
            auth: authStatus(),
            storage: "unconfigured",
            persistent: false,
            mongo: mongoUriDiagnostics()
          });
        }
        return;
      }

      if (url.pathname === "/login" && req.method === "GET") {
        html(res, 200, loginPage());
        return;
      }

      if (url.pathname === "/login" && req.method === "POST") {
        const form = await readFormBody(req);
        const password = form.get("password") || "";
        const expectedPassword = appPassword();
        if (expectedPassword && password === expectedPassword) {
          res.writeHead(303, {
            "set-cookie": makeSessionCookie(),
            location: "/",
            "cache-control": "no-store"
          });
          res.end();
          return;
        }
        html(res, 401, loginPage("Invalid password."));
        return;
      }

      if (url.pathname === "/api/login" && req.method === "POST") {
        const body = await readJsonBody(req);
        const expectedPassword = appPassword();
        if (expectedPassword && body.password === expectedPassword) {
          res.writeHead(200, {
            "content-type": "application/json; charset=utf-8",
            "set-cookie": makeSessionCookie(),
            "cache-control": "no-store"
          });
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        json(res, 401, { ok: false, error: "invalid_password" });
        return;
      }

      if (url.pathname === "/api/logout" && req.method === "POST") {
        res.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "set-cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
          "cache-control": "no-store"
        });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (url.pathname === "/styles.css") {
        serveStatic(req, res, url.pathname);
        return;
      }

      if (!isAuthenticated(req)) {
        if (url.pathname.startsWith("/api/")) {
          json(res, 401, { ok: false, error: "auth_required" });
        } else {
          res.writeHead(303, { location: "/login", "cache-control": "no-store" });
          res.end();
        }
        return;
      }

      if (url.pathname === "/api/state") {
        const store = await getStore();
        if (req.method === "GET") {
          json(res, 200, { ok: true, storage: store.mode, persistent: store.persistent, state: await store.getState() });
          return;
        }
        if (req.method === "PUT" || req.method === "PATCH") {
          const body = await readJsonBody(req);
          const state = await store.saveState(body.state || body);
          json(res, 200, { ok: true, storage: store.mode, persistent: store.persistent, state });
          return;
        }
        json(res, 405, { ok: false, error: "Method not allowed" });
        return;
      }

      if (url.pathname === "/api/q1/status") {
        json(res, 200, { ok: true, status: await q1Status() });
        return;
      }

      if (url.pathname === "/api/q1/upload") {
        if (req.method !== "POST") {
          json(res, 405, { ok: false, error: "Method not allowed" });
          return;
        }
        await handleQ1Upload(req, res);
        return;
      }

      if (url.pathname === "/api/q1/run-upstox-fetch") {
        if (req.method !== "POST") {
          json(res, 405, { ok: false, error: "Method not allowed" });
          return;
        }
        const result = await runQ1Fetch();
        json(res, result.ok ? 200 : 409, result);
        return;
      }

      if (url.pathname === "/api/q1/download") {
        await serveQ1Download(res, url.searchParams.get("file"));
        return;
      }

      if (url.pathname === "/api/quotes") {
        const symbols = (url.searchParams.get("symbols") || "")
          .split(",")
          .map(normalizeSymbol)
          .filter(Boolean)
          .slice(0, 30);
        const settled = await Promise.allSettled(symbols.map(quoteFor));
        json(res, 200, {
          ok: true,
          provider: "Yahoo Finance",
          fetchedAt: Date.now(),
          quotes: settled.filter((item) => item.status === "fulfilled").map((item) => item.value),
          failures: settled
            .map((item, index) => ({ item, symbol: symbols[index] }))
            .filter(({ item }) => item.status === "rejected")
            .map(({ item, symbol }) => ({ symbol, error: item.reason.message }))
        });
        return;
      }

      if (url.pathname === "/api/search") {
        json(res, 200, { ok: true, results: await searchSymbols(url.searchParams.get("q")) });
        return;
      }

      if (url.pathname === "/api/news") {
        json(res, 200, { ok: true, results: await newsFor(url.searchParams.get("q")) });
        return;
      }

      serveStatic(req, res, url.pathname === "/q1" ? "/q1.html" : url.pathname);
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
  });
}

if (runtimeProcess?.argv?.[1] && import.meta.url === pathToFileURL(runtimeProcess.argv[1]).href) {
  createServer().listen(PORT, () => {
    console.log(`Ash Stock running at http://localhost:${PORT}`);
  });
}

export { quoteFor, searchSymbols, newsFor, sanitizeState, normalizeMongoUri };
