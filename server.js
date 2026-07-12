import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const runtimeProcess = globalThis.process;
const fsp = fs.promises;

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
      return { enumerable: true, configurable: true, value: readEnv()[prop] };
    }
  }
);

const PORT = Number(ENV.PORT || 4173);
const RELEASE = "2026-07-12-india-scanner";
const SESSION_COOKIE = "ash_stock_session";
const DEFAULT_MONGO_TIMEOUT_MS = 8_000;
const MONGO_URI_KEYS = ["MONGODB_URI", "MONGO_URI", "DATABASE_URL"];
const STATE_FILE = path.join(ROOT, "data", "app_state.json");
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

const INDIA_UNIVERSE = Object.freeze([
  { symbol: "RELIANCE", name: "Reliance Industries", sector: "Energy", exchange: "NSE", instrument_key: "NSE_EQ|INE002A01018" },
  { symbol: "HDFCBANK", name: "HDFC Bank", sector: "Private Bank", exchange: "NSE", instrument_key: "NSE_EQ|INE040A01034" },
  { symbol: "ICICIBANK", name: "ICICI Bank", sector: "Private Bank", exchange: "NSE", instrument_key: "NSE_EQ|INE090A01021" },
  { symbol: "INFY", name: "Infosys", sector: "IT Services", exchange: "NSE", instrument_key: "NSE_EQ|INE009A01021" },
  { symbol: "TCS", name: "Tata Consultancy Services", sector: "IT Services", exchange: "NSE", instrument_key: "NSE_EQ|INE467B01029" },
  { symbol: "SBIN", name: "State Bank of India", sector: "Public Bank", exchange: "NSE", instrument_key: "NSE_EQ|INE062A01020" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel", sector: "Telecom", exchange: "NSE", instrument_key: "NSE_EQ|INE397D01024" },
  { symbol: "LT", name: "Larsen and Toubro", sector: "Capital Goods", exchange: "NSE", instrument_key: "NSE_EQ|INE018A01030" },
  { symbol: "AXISBANK", name: "Axis Bank", sector: "Private Bank", exchange: "NSE", instrument_key: "NSE_EQ|INE238A01034" },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank", sector: "Private Bank", exchange: "NSE", instrument_key: "NSE_EQ|INE237A01028" },
  { symbol: "ITC", name: "ITC", sector: "FMCG", exchange: "NSE", instrument_key: "NSE_EQ|INE154A01025" },
  { symbol: "HINDUNILVR", name: "Hindustan Unilever", sector: "FMCG", exchange: "NSE", instrument_key: "NSE_EQ|INE030A01027" },
  { symbol: "BAJFINANCE", name: "Bajaj Finance", sector: "NBFC", exchange: "NSE", instrument_key: "NSE_EQ|INE296A01024" },
  { symbol: "MARUTI", name: "Maruti Suzuki India", sector: "Auto", exchange: "NSE", instrument_key: "NSE_EQ|INE585B01010" },
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical", sector: "Pharma", exchange: "NSE", instrument_key: "NSE_EQ|INE044A01036" },
  { symbol: "M&M", name: "Mahindra and Mahindra", sector: "Auto", exchange: "NSE", instrument_key: "NSE_EQ|INE101A01026" },
  { symbol: "NTPC", name: "NTPC", sector: "Power", exchange: "NSE", instrument_key: "NSE_EQ|INE733E01010" },
  { symbol: "POWERGRID", name: "Power Grid Corporation", sector: "Power", exchange: "NSE", instrument_key: "NSE_EQ|INE752E01010" },
  { symbol: "TATAMOTORS", name: "Tata Motors", sector: "Auto", exchange: "NSE", instrument_key: "NSE_EQ|INE155A01022" },
  { symbol: "ADANIENT", name: "Adani Enterprises", sector: "Diversified", exchange: "NSE", instrument_key: "NSE_EQ|INE423A01024" },
  { symbol: "ADANIPORTS", name: "Adani Ports and SEZ", sector: "Logistics", exchange: "NSE", instrument_key: "NSE_EQ|INE742F01042" },
  { symbol: "ONGC", name: "Oil and Natural Gas Corporation", sector: "Energy", exchange: "NSE", instrument_key: "NSE_EQ|INE213A01029" },
  { symbol: "COALINDIA", name: "Coal India", sector: "Mining", exchange: "NSE", instrument_key: "NSE_EQ|INE522F01014" },
  { symbol: "ASIANPAINT", name: "Asian Paints", sector: "Consumer", exchange: "NSE", instrument_key: "NSE_EQ|INE021A01026" },
  { symbol: "HCLTECH", name: "HCL Technologies", sector: "IT Services", exchange: "NSE", instrument_key: "NSE_EQ|INE860A01027" },
  { symbol: "WIPRO", name: "Wipro", sector: "IT Services", exchange: "NSE", instrument_key: "NSE_EQ|INE075A01022" },
  { symbol: "ULTRACEMCO", name: "UltraTech Cement", sector: "Cement", exchange: "NSE", instrument_key: "NSE_EQ|INE481G01011" },
  { symbol: "TITAN", name: "Titan Company", sector: "Consumer", exchange: "NSE", instrument_key: "NSE_EQ|INE280A01028" },
  { symbol: "BAJAJFINSV", name: "Bajaj Finserv", sector: "Financial Services", exchange: "NSE", instrument_key: "NSE_EQ|INE918I01026" },
  { symbol: "TECHM", name: "Tech Mahindra", sector: "IT Services", exchange: "NSE", instrument_key: "NSE_EQ|INE669C01036" }
]);

const SCANNER_PARAMETERS = Object.freeze([
  { key: "data_sufficiency", group: "Data", label: "253 daily candles", threshold: ">= 253", weight: 0, gate: true },
  { key: "absolute_momentum", group: "Momentum", label: "6M and 12M return positive", threshold: "> 0%", weight: 0, gate: true },
  { key: "risk_adjusted_momentum", group: "Momentum", label: "Risk adjusted momentum", threshold: "ranked score", weight: 65, gate: false },
  { key: "low_volatility", group: "Risk", label: "63D volatility quality", threshold: "lower is better", weight: 21, gate: false },
  { key: "quality_blend", group: "Quality", label: "Optional quality score", threshold: "0-100", weight: 14, gate: false },
  { key: "adv20", group: "Liquidity", label: "20D average volume", threshold: ">= 200,000 shares", weight: 0, gate: true },
  { key: "rupee_turnover", group: "Liquidity", label: "5D rupee turnover", threshold: ">= 5 crore", weight: 0, gate: true },
  { key: "stale_candle", group: "Data", label: "Fresh last candle", threshold: "<= 5 days old", weight: 0, gate: true },
  { key: "stuck_candle", group: "Data", label: "No stuck candle", threshold: "last 5 closes not flat", weight: 0, gate: true }
]);

const CSV_TEMPLATE = [
  "symbol,name,sector,exchange,instrument_key,close,close_127,close_253,adv20,rupee_turnover_cr,quality_score,last_candle_date,stuck_candle"
].join("\n");

let storePromise;

function requireDb() {
  return ENV.REQUIRE_DB === "true" || ENV.NODE_ENV === "production";
}

function requireAuth() {
  return ENV.REQUIRE_AUTH === "true" || ENV.NODE_ENV === "production";
}

function allowFileStoreFallback() {
  return ENV.DISABLE_FILE_STORE_FALLBACK !== "true" && ENV.FILE_STORE_FALLBACK !== "false";
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

function normalizeMongoUri(uri) {
  let value = String(uri || "").trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1).trim();
  }
  const scheme = "mongodb+srv://";
  if (!value.toLowerCase().startsWith(scheme)) return value;

  const rest = value.slice(scheme.length);
  const hostStart = rest.lastIndexOf("@") + 1;
  const userInfo = encodeMongoUserInfo(rest.slice(0, hostStart));
  const hostAndSuffix = rest.slice(hostStart);
  const boundary = hostAndSuffix.search(/[/?#]/);
  const host = boundary === -1 ? hostAndSuffix : hostAndSuffix.slice(0, boundary);
  const suffix = boundary === -1 ? "" : hostAndSuffix.slice(boundary);
  if (host.includes(",")) return `mongodb://${userInfo}${host}${suffix}`;
  return stripSrvPortWithUrlParser(`${scheme}${userInfo}${host.replace(/:\d+/g, "").replace(/%3A\d+/gi, "")}${suffix}`);
}

function encodeMongoUserInfo(userInfo) {
  if (!userInfo.endsWith("@")) return userInfo;
  const raw = userInfo.slice(0, -1);
  const separator = raw.indexOf(":");
  if (separator < 0) return `${encodeMongoCredentialPart(raw)}@`;
  const username = raw.slice(0, separator);
  const password = raw.slice(separator + 1);
  return `${encodeMongoCredentialPart(username)}:${encodeMongoCredentialPart(password)}@`;
}

function encodeMongoCredentialPart(value) {
  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    return encodeURIComponent(value);
  }
}

function stripSrvPortWithUrlParser(uri) {
  try {
    const parsed = new URL(uri.replace(/^mongodb\+srv:\/\//i, "http://"));
    if (!parsed.port) return uri;
    parsed.port = "";
    return `mongodb+srv://${parsed.href.slice("http://".length)}`;
  } catch {
    return uri;
  }
}

function mongoUriCandidates() {
  return MONGO_URI_KEYS
    .map((key) => ({ key, raw: ENV[key] || "" }))
    .filter(({ raw }) => /^mongodb(?:\+srv)?:\/\//i.test(String(raw || "").trim().replace(/^['"]|['"]$/g, "")))
    .map(({ key, raw }) => ({ key, uri: normalizeMongoUri(raw), raw }));
}

function mongoUri() {
  return mongoUriCandidates()[0]?.uri || "";
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
    selected: mongoUriCandidates()[0]?.key || null,
    candidates: MONGO_URI_KEYS
      .filter((key) => ENV[key])
      .map((key) => ({ key, raw: mongoUriShape(ENV[key] || ""), normalized: mongoUriShape(normalizeMongoUri(ENV[key] || "")) }))
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

function defaultState() {
  return {
    theme: "light",
    selectedView: "scanner",
    universe: INDIA_UNIVERSE,
    scannerSettings: {
      minScoreSelect: 70,
      minScoreWatch: 55,
      adv20Min: 200000,
      turnoverCrMin: 5
    }
  };
}

function sanitizeState(input = {}) {
  const state = { ...defaultState(), ...input };
  return {
    theme: state.theme === "dark" ? "dark" : "light",
    selectedView: String(state.selectedView || "scanner").slice(0, 40),
    universe: normalizeScannerUniverse(state.universe).slice(0, 500),
    scannerSettings: {
      minScoreSelect: finiteOr(state.scannerSettings?.minScoreSelect, 70),
      minScoreWatch: finiteOr(state.scannerSettings?.minScoreWatch, 55),
      adv20Min: finiteOr(state.scannerSettings?.adv20Min, 200000),
      turnoverCrMin: finiteOr(state.scannerSettings?.turnoverCrMin, 5)
    }
  };
}

function finiteOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*"
  });
  res.end(JSON.stringify(body));
}

function html(res, status, body) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(body);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return map[char];
  });
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
  return { required: requireAuth(), configured: !requireAuth() || Boolean(appPassword()) };
}

function loginPage(error = "") {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AshStocks Login</title>
    <link rel="icon" href="data:," />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main class="server-required-screen">
      <form class="server-required-panel login-panel" method="post" action="/login">
        <div class="brand-mark">AS</div>
        <span class="eyebrow">Private India Scanner</span>
        <h1>AshStocks</h1>
        <p>Sign in to the Render app.</p>
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

async function readJsonBody(req) {
  const raw = await readRawBody(req, 5 * 1024 * 1024);
  if (!raw.length) return {};
  return JSON.parse(raw.toString("utf8"));
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
    .replace(/[^A-Z0-9.&_-]/g, "");
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
  if (mongoUriCandidates().length) {
    try {
      return await createMongoStore();
    } catch (error) {
      if (!allowFileStoreFallback()) throw error;
      return createFileStore(error);
    }
  }
  if (requireDb() && !allowFileStoreFallback()) {
    throw new Error("A MongoDB URI is required in production. Set MONGODB_URI or MONGO_URI in Render.");
  }
  if (requireDb()) return createFileStore(new Error("MongoDB URI is not configured; using Render file storage fallback."));
  return createMemoryStore();
}

function createMemoryStore() {
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

async function createFileStore(warning) {
  await fsp.mkdir(path.dirname(STATE_FILE), { recursive: true });

  async function readState() {
    try {
      const payload = JSON.parse(await fsp.readFile(STATE_FILE, "utf8"));
      return sanitizeState(payload.state || payload);
    } catch (error) {
      if (error.code !== "ENOENT") console.warn(`File store read failed: ${error.message}`);
      return sanitizeState(defaultState());
    }
  }

  async function writeState(state) {
    const payload = JSON.stringify({ state, updatedAt: new Date().toISOString() }, null, 2);
    const temp = `${STATE_FILE}.${runtimeProcess?.pid || Date.now()}.tmp`;
    await fsp.mkdir(path.dirname(STATE_FILE), { recursive: true });
    await fsp.writeFile(temp, payload);
    await fsp.rename(temp, STATE_FILE);
  }

  let state = await readState();
  await writeState(state);
  return {
    mode: "file",
    source: "render-filesystem",
    persistent: true,
    warning: warning?.message || null,
    async getState() {
      state = await readState();
      return state;
    },
    async saveState(nextState) {
      state = sanitizeState(nextState);
      await writeState(state);
      return state;
    }
  };
}

async function createMongoStore() {
  const { MongoClient } = await import("mongodb");
  const timeoutMs = mongoTimeoutMs();
  const candidates = mongoUriCandidates();
  let lastError;

  for (const candidate of candidates) {
    const client = new MongoClient(candidate.uri, {
      appName: "ashstocks-india-scanner",
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
        source: candidate.key,
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
      lastError = new Error(`${candidate.key}: ${error.message}`);
    }
  }
  throw lastError || new Error("No valid MongoDB URI candidates are configured.");
}

function normalizeScannerUniverse(input) {
  const source = Array.isArray(input) && input.length ? input : INDIA_UNIVERSE;
  return source
    .map((row) => normalizeScannerRow(row))
    .filter((row) => row.symbol)
    .slice(0, 1000);
}

function normalizeScannerRow(row = {}) {
  return {
    symbol: normalizeSymbol(row.symbol || row.tradingsymbol || row.ticker),
    name: String(row.name || row.company || row.company_name || row.symbol || "").trim().slice(0, 120),
    sector: String(row.sector || row.industry || "Unmapped").trim().slice(0, 80),
    exchange: String(row.exchange || "NSE").trim().toUpperCase().slice(0, 12),
    instrument_key: String(row.instrument_key || row.instrumentKey || row.upstox_key || "").trim(),
    close: numericValue(row.close ?? row.current_close ?? row.currentClose ?? row.last_price),
    close_127: numericValue(row.close_127 ?? row.close127 ?? row.close_6m),
    close_253: numericValue(row.close_253 ?? row.close253 ?? row.close_12m),
    adv20: numericValue(row.adv20 ?? row.avg_volume_20d ?? row.average_volume_20d),
    rupee_turnover_cr: numericValue(row.rupee_turnover_cr ?? row.turnover_cr ?? row.avg_turnover_5d_cr),
    quality_score: numericValue(row.quality_score ?? row.qualityScore),
    vol63: normalizeVol(row.vol63 ?? row.vol_63d),
    vol126: normalizeVol(row.vol126 ?? row.vol_126d),
    vol252: normalizeVol(row.vol252 ?? row.vol_252d),
    last_candle_date: String(row.last_candle_date || row.lastCandleDate || row.date || "").trim(),
    last_candle_age_days: numericValue(row.last_candle_age_days ?? row.lastCandleAgeDays),
    stuck_candle: parseBoolean(row.stuck_candle ?? row.stuckCandle),
    data_source: String(row.data_source || row.source || "manual/input").slice(0, 80),
    fetch_error: row.fetch_error ? String(row.fetch_error).slice(0, 240) : "",
    candles: normalizeCandles(row.candles || row.history || [])
  };
}

function numericValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, "").replace(/%$/, ""));
  return Number.isFinite(n) ? n : null;
}

function normalizeVol(value) {
  const n = numericValue(value);
  if (n === null) return null;
  return n > 3 ? n / 100 : n;
}

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  const text = String(value || "").trim().toLowerCase();
  if (["true", "yes", "1", "y"].includes(text)) return true;
  if (["false", "no", "0", "n"].includes(text)) return false;
  return false;
}

function normalizeCandles(candles) {
  if (!Array.isArray(candles)) return [];
  return candles
    .map((candle) => {
      if (Array.isArray(candle)) {
        return {
          date: String(candle[0] || ""),
          open: numericValue(candle[1]),
          high: numericValue(candle[2]),
          low: numericValue(candle[3]),
          close: numericValue(candle[4]),
          volume: numericValue(candle[5])
        };
      }
      return {
        date: String(candle.date || candle.time || candle.timestamp || ""),
        open: numericValue(candle.open),
        high: numericValue(candle.high),
        low: numericValue(candle.low),
        close: numericValue(candle.close),
        volume: numericValue(candle.volume)
      };
    })
    .filter((candle) => Number.isFinite(candle.close) && Number.isFinite(Date.parse(candle.date)))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

function runScanner(universe, options = {}) {
  const rows = normalizeScannerUniverse(universe);
  const asOf = options.asOf || new Date().toISOString();
  const evaluated = rows.map((row) => evaluateStock(row, options));
  const summary = evaluated.reduce(
    (acc, row) => {
      acc.total += 1;
      acc[row.decision] = (acc[row.decision] || 0) + 1;
      return acc;
    },
    { total: 0, SELECT: 0, WATCH: 0, REJECT: 0, BLOCKED: 0, DATA_NEEDED: 0 }
  );
  return {
    ok: true,
    engine: "ashstocks-india-selection-v0.1",
    asOf,
    source: options.source || "server-scanner",
    universe: rows.length,
    summary,
    parameters: SCANNER_PARAMETERS,
    rows: evaluated.sort((a, b) => b.score - a.score || decisionRank(a.decision) - decisionRank(b.decision) || a.symbol.localeCompare(b.symbol))
  };
}

function decisionRank(decision) {
  return { SELECT: 0, WATCH: 1, REJECT: 2, BLOCKED: 3, DATA_NEEDED: 4 }[decision] ?? 9;
}

function evaluateStock(row, options = {}) {
  const settings = {
    minScoreSelect: finiteOr(options.minScoreSelect, 70),
    minScoreWatch: finiteOr(options.minScoreWatch, 55),
    adv20Min: finiteOr(options.adv20Min, 200000),
    turnoverCrMin: finiteOr(options.turnoverCrMin, 5)
  };
  const reasons = [];
  const missing = [];
  const metrics = deriveMetrics(row);

  if (row.fetch_error) reasons.push(`Upstox fetch failed: ${row.fetch_error}`);
  if (!metrics.hasFullData) missing.push(metrics.missingReason || "253 daily candles or equivalent metrics");
  if (metrics.close === null) missing.push("latest close");
  if (metrics.close127 === null) missing.push("6M close");
  if (metrics.close253 === null) missing.push("12M close");
  if (metrics.adv20 === null) missing.push("20D average volume");
  if (metrics.turnoverCr === null) missing.push("5D rupee turnover");

  const momentumOk = metrics.return6m !== null && metrics.return12m !== null && metrics.return6m > 0 && metrics.return12m > 0;
  const liquidityOk = metrics.adv20 !== null && metrics.adv20 >= settings.adv20Min && metrics.turnoverCr !== null && metrics.turnoverCr >= settings.turnoverCrMin;
  const staleOk = metrics.lastCandleAgeDays === null || metrics.lastCandleAgeDays <= 5;
  const stuckOk = !metrics.stuckCandle;
  const qualityScore = metrics.qualityScore ?? 50;
  const lowVolScore = metrics.lowVolScore ?? 50;
  const momentumScore = metrics.momentumScore ?? 0;
  const blendedQuality = clamp(0.6 * lowVolScore + 0.4 * qualityScore, 0, 100);
  const score = missing.length ? 0 : round(0.65 * momentumScore + 0.35 * blendedQuality, 2);

  let decision = "REJECT";
  if (missing.length || row.fetch_error) {
    decision = "DATA_NEEDED";
    reasons.push(`Need ${unique(missing).join(", ")}`);
  } else if (!staleOk || !stuckOk || !momentumOk || !liquidityOk) {
    decision = "BLOCKED";
    if (!momentumOk) reasons.push("absolute momentum gate failed");
    if (!liquidityOk) reasons.push("liquidity gate failed");
    if (!staleOk) reasons.push("last candle is stale");
    if (!stuckOk) reasons.push("stuck candle check failed");
  } else if (score >= settings.minScoreSelect) {
    decision = "SELECT";
    reasons.push("score and all hard gates passed");
  } else if (score >= settings.minScoreWatch) {
    decision = "WATCH";
    reasons.push("hard gates passed, score below select line");
  } else {
    decision = "REJECT";
    reasons.push("hard gates passed, score below watch line");
  }

  return {
    symbol: row.symbol,
    name: row.name || row.symbol,
    sector: row.sector,
    exchange: row.exchange,
    instrument_key: row.instrument_key,
    decision,
    score,
    momentum_score: round(momentumScore, 2),
    quality_score: round(blendedQuality, 2),
    return_6m_pct: metrics.return6m === null ? null : round(metrics.return6m * 100, 2),
    return_12m_pct: metrics.return12m === null ? null : round(metrics.return12m * 100, 2),
    vol_63d_pct: metrics.vol63 === null ? null : round(metrics.vol63 * 100, 2),
    adv20: metrics.adv20,
    rupee_turnover_cr: metrics.turnoverCr,
    last_candle_date: metrics.lastCandleDate,
    gates: {
      data_sufficiency: !missing.length,
      absolute_momentum: momentumOk,
      liquidity: liquidityOk,
      fresh_candle: staleOk,
      stuck_candle: stuckOk
    },
    reason: unique(reasons).join("; ") || "scored",
    data_source: row.candles.length ? "Upstox/manual candles" : row.data_source
  };
}

function deriveMetrics(row) {
  if (row.candles.length) return deriveCandleMetrics(row);
  const hasManual = row.close !== null && row.close_127 !== null && row.close_253 !== null;
  const return6m = hasManual ? row.close / row.close_127 - 1 : null;
  const return12m = hasManual ? row.close / row.close_253 - 1 : null;
  const vol63 = row.vol63;
  const vol252 = row.vol252 ?? row.vol126 ?? row.vol63 ?? 0.28;
  return {
    hasFullData: hasManual,
    missingReason: "manual close/close_127/close_253 fields",
    close: row.close,
    close127: row.close_127,
    close253: row.close_253,
    return6m,
    return12m,
    vol63,
    vol252,
    adv20: row.adv20,
    turnoverCr: row.rupee_turnover_cr,
    lastCandleDate: row.last_candle_date || null,
    lastCandleAgeDays: row.last_candle_age_days,
    stuckCandle: row.stuck_candle,
    qualityScore: row.quality_score,
    lowVolScore: vol63 === null ? null : clamp(100 - vol63 * 140, 0, 100),
    momentumScore: return6m === null || return12m === null ? null : momentumScore(return6m, return12m, vol252)
  };
}

function deriveCandleMetrics(row) {
  const candles = row.candles;
  const close = candles.at(-1)?.close ?? null;
  const close127 = candles.length >= 128 ? candles.at(-128)?.close ?? null : null;
  const close253 = candles.length >= 254 ? candles.at(-254)?.close ?? null : null;
  const return6m = close !== null && close127 ? close / close127 - 1 : null;
  const return12m = close !== null && close253 ? close / close253 - 1 : null;
  const returns = dailyReturns(candles);
  const vol63 = annualizedVol(returns.slice(-63));
  const vol126 = annualizedVol(returns.slice(-126));
  const vol252 = annualizedVol(returns.slice(-252));
  const last20 = candles.slice(-20);
  const last5 = candles.slice(-5);
  const adv20 = last20.length ? average(last20.map((candle) => candle.volume || 0)) : null;
  const turnoverCr = last5.length ? average(last5.map((candle) => ((candle.close || 0) * (candle.volume || 0)) / 10000000)) : null;
  const lastCandleDate = candles.at(-1)?.date || null;
  const lastCandleAgeDays = lastCandleDate ? Math.floor((Date.now() - Date.parse(lastCandleDate)) / 86400000) : null;
  const closeValues = last5.map((candle) => candle.close).filter(Number.isFinite);
  const stuckCandle = closeValues.length >= 5 && Math.max(...closeValues) - Math.min(...closeValues) <= Math.max(0.01, closeValues.at(-1) * 0.0001);
  return {
    hasFullData: candles.length >= 254,
    missingReason: `${candles.length}/254 daily candles`,
    close,
    close127,
    close253,
    return6m,
    return12m,
    vol63,
    vol126,
    vol252,
    adv20,
    turnoverCr,
    lastCandleDate,
    lastCandleAgeDays,
    stuckCandle: row.stuck_candle || stuckCandle,
    qualityScore: row.quality_score,
    lowVolScore: vol63 === null ? null : clamp(100 - vol63 * 140, 0, 100),
    momentumScore: return6m === null || return12m === null ? null : momentumScore(return6m, return12m, vol252 ?? 0.28)
  };
}

function dailyReturns(candles) {
  const values = [];
  for (let index = 1; index < candles.length; index += 1) {
    const previous = candles[index - 1].close;
    const current = candles[index].close;
    if (previous > 0 && current > 0) values.push(Math.log(current / previous));
  }
  return values;
}

function annualizedVol(values) {
  if (!values.length) return null;
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance) * Math.sqrt(252);
}

function average(values) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function momentumScore(return6m, return12m, vol252) {
  const raw = 0.55 * return6m + 0.45 * return12m - 0.35 * (vol252 || 0);
  return clamp(((raw + 0.25) / 0.75) * 100, 0, 100);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(Number(value || 0) * factor) / factor;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function upstoxStatus() {
  return {
    key_visible: Boolean(ENV.UPSTOX_API_KEY || ENV.UPSTOX_CLIENT_ID),
    token_visible: Boolean(ENV.UPSTOX_ACCESS_TOKEN),
    historical_candles_only: true,
    live_orders: false,
    endpoint: "https://api.upstox.com/v2/historical-candle/{instrument_key}/day/{to_date}/{from_date}"
  };
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function defaultDateWindow() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 470);
  return { from: isoDate(from), to: isoDate(to) };
}

async function fetchUpstoxCandles(instrumentKey, from, to) {
  if (!ENV.UPSTOX_ACCESS_TOKEN) throw new Error("upstox_token_missing");
  const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instrumentKey)}/day/${to}/${from}`;
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${ENV.UPSTOX_ACCESS_TOKEN}`
    }
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Upstox ${response.status}: ${text.slice(0, 180) || response.statusText}`);
  }
  const payload = await response.json();
  const candles = payload?.data?.candles || [];
  return normalizeCandles(candles);
}

async function runUpstoxScanner(body = {}) {
  if (!ENV.UPSTOX_ACCESS_TOKEN) return { ok: false, error: "upstox_token_missing", status: upstoxStatus() };
  const window = defaultDateWindow();
  const from = String(body.from || window.from).slice(0, 10);
  const to = String(body.to || window.to).slice(0, 10);
  const baseRows = normalizeScannerUniverse(body.universe).filter((row) => row.instrument_key).slice(0, 60);
  if (!baseRows.length) return { ok: false, error: "instrument_key_missing", status: upstoxStatus() };

  const fetchedRows = await Promise.all(
    baseRows.map(async (row) => {
      try {
        const candles = await fetchUpstoxCandles(row.instrument_key, from, to);
        return { ...row, candles, data_source: "Upstox historical candles" };
      } catch (error) {
        return { ...row, candles: [], fetch_error: error.message, data_source: "Upstox historical candles" };
      }
    })
  );

  const scan = runScanner(fetchedRows, { source: "Upstox historical candles" });
  return {
    ...scan,
    ok: true,
    from,
    to,
    status: upstoxStatus(),
    failures: scan.rows.filter((row) => row.decision === "DATA_NEEDED" && row.reason.includes("Upstox fetch failed"))
  };
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
    safety: { key_printed: false, token_printed: false, live_orders: false, historical_candles_only: true }
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
    if (part.length >= 2 && part[part.length - 2] === 13 && part[part.length - 1] === 10) part = part.subarray(0, part.length - 2);
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
    if (!Q1_ALLOWED_UPLOADS.has(basename)) throw new Error(`Unexpected upload file: ${basename}`);
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
  for (const upload of uploads) await fsp.writeFile(path.join(Q1_INPUT_DIR, upload.filename), upload.content);
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
  const childEnv = { ...readEnv(), UPSTOX_ACCESS_TOKEN: ENV.UPSTOX_ACCESS_TOKEN };

  return new Promise((resolve) => {
    const child = spawn(command, [scriptPath, "--input-dir", Q1_INPUT_DIR, "--output-dir", Q1_OUTPUT_DIR], {
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
      const token = ENV.UPSTOX_ACCESS_TOKEN || "";
      resolve({
        ok: code === 0,
        exit_code: code,
        stdout: token ? stdout.replaceAll(token, "[redacted]").trim() : stdout.trim(),
        stderr: token ? stderr.replaceAll(token, "[redacted]").trim() : stderr.trim(),
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

async function quoteFor(symbol) {
  return {
    symbol: normalizeSymbol(symbol),
    name: normalizeSymbol(symbol),
    exchange: "NSE",
    currency: "INR",
    source: "AshStocks scanner"
  };
}

async function searchSymbols(query) {
  const q = normalizeSymbol(query);
  return INDIA_UNIVERSE.filter((row) => !q || row.symbol.includes(q) || row.name.toUpperCase().includes(q)).slice(0, 10);
}

async function newsFor() {
  return [];
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

      if (url.pathname === "/api/health") {
        const auth = authStatus();
        const hasMongoUri = Boolean(mongoUri());
        const fallbackReady = allowFileStoreFallback();
        json(res, 200, {
          ok: true,
          release: RELEASE,
          commit: ENV.RENDER_GIT_COMMIT || ENV.RENDER_COMMIT || null,
          provider: "AshStocks India Scanner",
          storage: hasMongoUri ? "mongodb" : fallbackReady ? "file" : "unconfigured",
          persistent: hasMongoUri || fallbackReady,
          upstox: upstoxStatus(),
          auth,
          ready: auth.configured && (!requireDb() || hasMongoUri || fallbackReady),
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
            provider: "AshStocks India Scanner",
            storage: store.mode,
            source: store.source || null,
            persistent: store.persistent,
            warning: store.warning || null,
            upstox: upstoxStatus(),
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
            mongo: mongoUriDiagnostics(),
            upstox: upstoxStatus()
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
          res.writeHead(303, { "set-cookie": makeSessionCookie(), location: "/", "cache-control": "no-store" });
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
        if (url.pathname.startsWith("/api/")) json(res, 401, { ok: false, error: "auth_required" });
        else {
          res.writeHead(303, { location: "/login", "cache-control": "no-store" });
          res.end();
        }
        return;
      }

      if (url.pathname === "/api/state") {
        const store = await getStore();
        if (req.method === "GET") {
          json(res, 200, {
            ok: true,
            storage: store.mode,
            source: store.source || null,
            persistent: store.persistent,
            warning: store.warning || null,
            state: await store.getState()
          });
          return;
        }
        if (req.method === "PUT" || req.method === "PATCH") {
          const body = await readJsonBody(req);
          const state = await store.saveState(body.state || body);
          json(res, 200, { ok: true, storage: store.mode, source: store.source || null, persistent: store.persistent, state });
          return;
        }
        json(res, 405, { ok: false, error: "Method not allowed" });
        return;
      }

      if (url.pathname === "/api/scanner/parameters") {
        json(res, 200, { ok: true, parameters: SCANNER_PARAMETERS, universe: INDIA_UNIVERSE, upstox: upstoxStatus() });
        return;
      }

      if (url.pathname === "/api/scanner/template") {
        res.writeHead(200, {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": "attachment; filename=ashstocks_scanner_template.csv",
          "cache-control": "no-store"
        });
        res.end(CSV_TEMPLATE);
        return;
      }

      if (url.pathname === "/api/scanner/run") {
        const body = req.method === "POST" ? await readJsonBody(req) : {};
        json(res, 200, runScanner(body.universe, body.settings || {}));
        return;
      }

      if (url.pathname === "/api/scanner/run-upstox") {
        if (req.method !== "POST") {
          json(res, 405, { ok: false, error: "Method not allowed" });
          return;
        }
        const result = await runUpstoxScanner(await readJsonBody(req));
        json(res, result.ok ? 200 : 409, result);
        return;
      }

      if (url.pathname === "/api/upstox/status") {
        json(res, 200, { ok: true, status: upstoxStatus() });
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
        const symbols = (url.searchParams.get("symbols") || "").split(",").map(normalizeSymbol).filter(Boolean).slice(0, 30);
        json(res, 200, { ok: true, provider: "AshStocks scanner", fetchedAt: Date.now(), quotes: await Promise.all(symbols.map(quoteFor)), failures: [] });
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
    console.log(`AshStocks running at http://localhost:${PORT}`);
  });
}

export { quoteFor, searchSymbols, newsFor, sanitizeState, normalizeMongoUri, runScanner, normalizeSymbol };
