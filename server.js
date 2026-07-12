import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
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
const SCAN_LEDGER_FILE = path.join(ROOT, "data", "scan_ledger.jsonl");
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
const ENGINE_VERSION = "ashstocks-selection-v0.1-proof";
const DEFAULT_STARTING_CAPITAL = 1_000_000;
const MAX_UNIVERSE_ROWS = 5_000;
const MAX_SCAN_LEDGER_RECORDS = 250;
const MAX_SCAN_LEDGER_ROWS = 75;
const PAPER_ENGINE_SLOTS_IST = Object.freeze(["09:20", "14:30", "15:35"]);
const PAPER_ENGINE_POLL_MS = 60_000;
const UPSTOX_NSE_INSTRUMENTS_URL = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz";
const UPSTOX_COMPLETE_INSTRUMENTS_URL = "https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz";

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
  { key: "data_sufficiency", group: "Data", label: "253 clean daily closes", threshold: ">= 253", weight: 0, gate: true },
  { key: "absolute_momentum", group: "Momentum", label: "6M and 12M return positive", threshold: "> 0%", weight: 0, gate: true },
  { key: "risk_adjusted_momentum", group: "Momentum", label: "6M/12M volatility-adjusted momentum", threshold: "formula score", weight: 65, gate: false },
  { key: "quality_score", group: "Quality", label: "Low-vol plus liquidity quality", threshold: "formula score", weight: 35, gate: false },
  { key: "adv20", group: "Liquidity", label: "20D average volume", threshold: ">= 200,000 shares", weight: 0, gate: true },
  { key: "rupee_turnover", group: "Liquidity", label: "5D rupee turnover", threshold: ">= 5 crore", weight: 0, gate: true },
  { key: "stale_candle", group: "Data", label: "Fresh last candle", threshold: "<= 7 calendar days", weight: 0, gate: true },
  { key: "stuck_candle", group: "Data", label: "No latest OHLC stuck candle", threshold: "open/high/low/close not all equal", weight: 0, gate: true },
  { key: "correlation", group: "Portfolio", label: "60D correlation to holdings", threshold: "<= 0.85", weight: 0, gate: true },
  { key: "target_potential", group: "Portfolio", label: "252D high potential label", threshold: ">= 15% PASS", weight: 0, gate: false },
  { key: "portfolio_caps", group: "Portfolio", label: "Max positions and sector caps", threshold: "paper-only sizing", weight: 0, gate: true },
  { key: "paper_only", group: "Safety", label: "Paper order only", threshold: "broker write disabled", weight: 0, gate: true }
]);

const CSV_TEMPLATE = [
  "symbol,name,sector,exchange,instrument_key,close,close_127,close_253,high_252,adv20,rupee_turnover_cr,vol63,vol126,vol252,last_candle_date,last_candle_age_days,stuck_candle,existing_holding"
].join("\n");

let storePromise;
let paperEngineScheduler;
const paperEngineState = {
  enabled: false,
  running: false,
  startedAt: null,
  lastCheckAt: null,
  lastRunAt: null,
  lastSlotKey: null,
  lastResult: null,
  runKeys: {}
};

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

function defaultScannerSettings() {
  return {
    minScoreSelect: 70,
    minScoreWatch: 55,
    targetPotentialPct: 15,
    maxPositionPct: 0.025,
    maxPositions: 50,
    maxSectorPositions: 12,
    maxSectorExposurePct: 25,
    maxStaleDays: 7,
    adv20Min: 200000,
    turnoverCrMin: 5,
    correlationThreshold: 0.85,
    startingCapital: DEFAULT_STARTING_CAPITAL,
    regimeMultiplier: 1,
    ifrMultiplier: 1,
    drawdownMultiplier: 1,
    paperOnly: true,
    brokerWriteEnabled: false
  };
}

function normalizeScannerSettings(input = {}) {
  return {
    ...defaultScannerSettings(),
    minScoreSelect: finiteOr(input.minScoreSelect ?? input.min_select_score, 70),
    minScoreWatch: finiteOr(input.minScoreWatch ?? input.min_watch_score, 55),
    targetPotentialPct: finiteOr(input.targetPotentialPct ?? input.target_potential_pct, 15),
    maxPositionPct: finiteOr(input.maxPositionPct ?? input.max_position_pct, 0.025),
    maxPositions: Math.max(0, Math.floor(finiteOr(input.maxPositions ?? input.max_positions, 50))),
    maxSectorPositions: Math.max(0, Math.floor(finiteOr(input.maxSectorPositions ?? input.max_sector_positions, 12))),
    maxSectorExposurePct: finiteOr(input.maxSectorExposurePct ?? input.max_sector_exposure_pct, 25),
    maxStaleDays: finiteOr(input.maxStaleDays ?? input.max_stale_days, 7),
    adv20Min: finiteOr(input.adv20Min ?? input.min_avg_volume_shares, 200000),
    turnoverCrMin: finiteOr(input.turnoverCrMin ?? input.min_rupee_volume_cr, 5),
    correlationThreshold: finiteOr(input.correlationThreshold ?? input.correlation_threshold, 0.85),
    startingCapital: finiteOr(input.startingCapital ?? input.starting_capital, DEFAULT_STARTING_CAPITAL),
    regimeMultiplier: finiteOr(input.regimeMultiplier ?? input.regime_multiplier, 1),
    ifrMultiplier: finiteOr(input.ifrMultiplier ?? input.ifr_multiplier, 1),
    drawdownMultiplier: finiteOr(input.drawdownMultiplier ?? input.drawdown_multiplier, 1),
    paperOnly: parseBoolean(input.paperOnly ?? input.paper_only ?? true),
    brokerWriteEnabled: parseBoolean(input.brokerWriteEnabled ?? input.broker_write_enabled ?? false)
  };
}

function defaultState() {
  return {
    theme: "light",
    selectedView: "scanner",
    universe: INDIA_UNIVERSE,
    scannerSettings: defaultScannerSettings()
  };
}

function sanitizeState(input = {}) {
  const state = { ...defaultState(), ...input };
  return {
    theme: state.theme === "dark" ? "dark" : "light",
    selectedView: String(state.selectedView || "scanner").slice(0, 40),
    universe: normalizeScannerUniverse(state.universe).slice(0, MAX_UNIVERSE_ROWS),
    scannerSettings: normalizeScannerSettings(state.scannerSettings || {})
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
  let scanLedger = [];
  return {
    mode: "memory",
    persistent: false,
    async getState() {
      return state;
    },
    async saveState(nextState) {
      state = sanitizeState(nextState);
      return state;
    },
    async appendScanRecord(record) {
      const saved = sanitizeScanRecord(record);
      scanLedger.unshift(saved);
      scanLedger = scanLedger.slice(0, MAX_SCAN_LEDGER_RECORDS);
      return saved;
    },
    async listScanRecords(limit) {
      return scanLedger.slice(0, normalizeLedgerLimit(limit));
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

  async function appendLedger(record) {
    const saved = sanitizeScanRecord(record);
    await fsp.mkdir(path.dirname(SCAN_LEDGER_FILE), { recursive: true });
    await fsp.appendFile(SCAN_LEDGER_FILE, `${JSON.stringify(saved)}\n`);
    return saved;
  }

  async function readLedger(limit) {
    try {
      const text = await fsp.readFile(SCAN_LEDGER_FILE, "utf8");
      const records = text
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          try {
            return sanitizeScanRecord(JSON.parse(line));
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .reverse();
      return records.slice(0, normalizeLedgerLimit(limit));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
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
    },
    async appendScanRecord(record) {
      return appendLedger(record);
    },
    async listScanRecords(limit) {
      return readLedger(limit);
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
      const scanLedger = database.collection("scan_ledger");
      await withTimeout(collection.createIndex({ updatedAt: -1 }), timeoutMs + 2_000, `MongoDB setup timed out after ${timeoutMs}ms`);
      await withTimeout(scanLedger.createIndex({ createdAt: -1 }), timeoutMs + 2_000, `MongoDB scan ledger setup timed out after ${timeoutMs}ms`);
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
        },
        async appendScanRecord(record) {
          const saved = sanitizeScanRecord(record);
          await scanLedger.insertOne({ ...saved, createdAtDate: new Date(saved.createdAt) });
          return saved;
        },
        async listScanRecords(limit) {
          const docs = await scanLedger
            .find({})
            .sort({ createdAt: -1 })
            .limit(normalizeLedgerLimit(limit))
            .toArray();
          return docs.map((doc) => {
            const { _id, createdAtDate, ...record } = doc;
            return sanitizeScanRecord(record);
          });
        }
      };
    } catch (error) {
      await client.close().catch(() => {});
      lastError = new Error(`${candidate.key}: ${error.message}`);
    }
  }
  throw lastError || new Error("No valid MongoDB URI candidates are configured.");
}

function normalizeScannerRows(input) {
  return (Array.isArray(input) ? input : [])
    .map((row) => normalizeScannerRow(row))
    .filter((row) => row.symbol)
    .slice(0, MAX_UNIVERSE_ROWS);
}

function normalizeScannerUniverse(input) {
  const source = Array.isArray(input) && input.length ? input : INDIA_UNIVERSE;
  return normalizeScannerRows(source);
}

function normalizeScannerRow(row = {}) {
  return {
    symbol: normalizeSymbol(row.symbol || row.tradingsymbol || row.trading_symbol || row.tradingSymbol || row.ticker),
    name: String(row.name || row.company || row.company_name || row.short_name || row.shortName || row.symbol || "").trim().slice(0, 120),
    sector: String(row.sector || row.industry || "Unmapped").trim().slice(0, 80),
    exchange: String(row.exchange || "NSE").trim().toUpperCase().slice(0, 12),
    instrument_key: String(row.instrument_key || row.instrumentKey || row.upstox_key || "").trim(),
    isin: String(row.isin || "").trim(),
    instrument_type: String(row.instrument_type || row.instrumentType || "").trim().toUpperCase(),
    security_type: String(row.security_type || row.securityType || "").trim(),
    close: numericValue(row.close ?? row.current_close ?? row.currentClose ?? row.last_price),
    close_127: numericValue(row.close_127 ?? row.close127 ?? row.close_6m),
    close_253: numericValue(row.close_253 ?? row.close253 ?? row.close_12m),
    high_252: numericValue(row.high_252 ?? row.high252 ?? row.high_1y ?? row.year_high),
    adv20: numericValue(row.adv20 ?? row.avg_volume_20d ?? row.average_volume_20d),
    rupee_turnover_cr: numericValue(row.rupee_turnover_cr ?? row.turnover_cr ?? row.avg_turnover_5d_cr),
    quality_score: numericValue(row.quality_score ?? row.qualityScore),
    vol63: normalizeVol(row.vol63 ?? row.vol_63d),
    vol126: normalizeVol(row.vol126 ?? row.vol_126d),
    vol252: normalizeVol(row.vol252 ?? row.vol_252d),
    last_candle_date: String(row.last_candle_date || row.lastCandleDate || row.date || "").trim(),
    last_candle_age_days: numericValue(row.last_candle_age_days ?? row.lastCandleAgeDays),
    stuck_candle: parseBoolean(row.stuck_candle ?? row.stuckCandle),
    existing_holding: parseBoolean(row.existing_holding ?? row.existingHolding ?? row.holding),
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
  const text = String(value ?? "").trim().toLowerCase();
  if (["true", "yes", "1", "y"].includes(text)) return true;
  if (["false", "no", "0", "n", ""].includes(text)) return false;
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
  const settings = normalizeScannerSettings(options);
  const holdings = [
    ...normalizeScannerRows(options.existingHoldings || options.holdings || []),
    ...rows.filter((row) => row.existing_holding)
  ];
  const asOf = options.asOf || new Date().toISOString();
  const evaluated = rows.map((row) => evaluateStock(row, { settings, holdings }));
  const proofRows = applyPortfolio(evaluated, settings).sort(
    (a, b) => decisionRank(a.decision) - decisionRank(b.decision) || b.score - a.score || a.symbol.localeCompare(b.symbol)
  );
  const summary = proofRows.reduce(
    (acc, row) => {
      acc.total += 1;
      acc[row.decision] = (acc[row.decision] || 0) + 1;
      return acc;
    },
    { total: 0, SELECT: 0, WATCH: 0, REJECT: 0, BLOCKED: 0, DATA_NEEDED: 0 }
  );

  return {
    ok: true,
    engine: ENGINE_VERSION,
    asOf,
    source: options.source || "server-scanner",
    universe: rows.length,
    summary,
    parameters: SCANNER_PARAMETERS,
    settings,
    rows: proofRows
  };
}

function decisionRank(decision) {
  return { SELECT: 0, WATCH: 1, REJECT: 2, BLOCKED: 3, DATA_NEEDED: 4 }[decision] ?? 9;
}

function evaluateStock(row, context) {
  const { settings, holdings } = context;
  const reasons = [];
  const missing = [];
  const metrics = deriveMetrics(row);

  if (row.fetch_error) reasons.push(`Upstox fetch failed: ${row.fetch_error}`);
  if (!metrics.hasFullData) missing.push(metrics.missingReason || "253 clean daily candles or equivalent metrics");
  if (metrics.close === null) missing.push("latest close");
  if (metrics.close127 === null) missing.push("6M close");
  if (metrics.close253 === null) missing.push("12M close");
  if (metrics.vol63 === null) missing.push("63D volatility");
  if (metrics.vol126 === null || metrics.vol252 === null) missing.push("126D/252D volatility");
  if (metrics.adv20 === null) missing.push("20D average volume");
  if (metrics.turnoverCr === null) missing.push("5D rupee turnover");
  if (metrics.lastCandleAgeDays === null) missing.push("last candle freshness");

  const momentumOk = metrics.return6m !== null && metrics.return12m !== null && metrics.return6m > 0 && metrics.return12m > 0;
  const liquiditySharesOk = metrics.adv20 !== null && metrics.adv20 >= settings.adv20Min;
  const liquidityRupeeOk = metrics.turnoverCr !== null && metrics.turnoverCr >= settings.turnoverCrMin;
  const staleOk = metrics.lastCandleAgeDays !== null && metrics.lastCandleAgeDays <= settings.maxStaleDays;
  const stuckOk = metrics.stuckCandle === false;
  const correlation = correlationGate(row, holdings, settings.correlationThreshold);
  if (correlation.data_needed) missing.push("60D holding correlation");

  const momentum = scoreMomentum(metrics.return6m, metrics.return12m, metrics.vol126, metrics.vol252);
  const lowVolScore = scoreLowVol(metrics.vol63);
  const liquidityQuality = scoreLiquidityQuality(metrics.adv20);
  const qualityScore = lowVolScore === null || liquidityQuality === null ? null : (lowVolScore + liquidityQuality) / 2;
  const score = missing.length || momentum === null || qualityScore === null ? 0 : round(0.65 * momentum + 0.35 * qualityScore, 2);
  const targetPotential = targetPotentialLabel(metrics, settings.targetPotentialPct);

  let decision = "REJECT";
  if (missing.length || row.fetch_error) {
    decision = "DATA_NEEDED";
    reasons.push(`Need ${unique(missing).join(", ")}`);
  } else if (!momentumOk || !liquiditySharesOk || !liquidityRupeeOk || !staleOk || !stuckOk || !correlation.ok) {
    decision = "BLOCKED";
    if (!momentumOk) reasons.push("absolute momentum gate failed");
    if (!liquiditySharesOk) reasons.push("ADV20 liquidity gate failed");
    if (!liquidityRupeeOk) reasons.push("rupee turnover gate failed");
    if (!staleOk) reasons.push("last candle is stale");
    if (!stuckOk) reasons.push("latest OHLC stuck candle check failed");
    if (!correlation.ok) reasons.push(`correlation gate failed${correlation.blocking_symbol ? ` vs ${correlation.blocking_symbol}` : ""}`);
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

  if (targetPotential.label === "WARN") reasons.push("target-potential label is WARN");

  return {
    symbol: row.symbol,
    name: row.name || row.symbol,
    sector: row.sector,
    exchange: row.exchange,
    instrument_key: row.instrument_key,
    decision,
    score,
    momentum_score: momentum === null ? null : round(momentum, 2),
    quality_score: qualityScore === null ? null : round(qualityScore, 2),
    low_vol_score: lowVolScore === null ? null : round(lowVolScore, 2),
    liquidity_quality: liquidityQuality,
    return_6m_pct: metrics.return6m === null ? null : round(metrics.return6m * 100, 2),
    return_12m_pct: metrics.return12m === null ? null : round(metrics.return12m * 100, 2),
    vol_63d_pct: metrics.vol63 === null ? null : round(metrics.vol63 * 100, 2),
    vol_126d_pct: metrics.vol126 === null ? null : round(metrics.vol126 * 100, 2),
    vol_252d_pct: metrics.vol252 === null ? null : round(metrics.vol252 * 100, 2),
    adv20: metrics.adv20,
    rupee_turnover_cr: metrics.turnoverCr,
    close: metrics.close,
    last_candle_date: metrics.lastCandleDate,
    last_candle_age_days: metrics.lastCandleAgeDays,
    target_potential: targetPotential,
    correlation,
    gates: {
      data_sufficiency: !missing.length,
      absolute_momentum: momentumOk,
      liquidity_shares: liquiditySharesOk,
      liquidity_rupee: liquidityRupeeOk,
      fresh_candle: staleOk,
      stuck_candle: stuckOk,
      correlation: correlation.ok,
      paper_only: true,
      broker_write_enabled: false
    },
    reason: unique(reasons).join("; ") || "scored",
    data_source: row.candles.length ? "Upstox/manual candles" : row.data_source,
    proof: {
      engine: ENGINE_VERSION,
      formula: "0.65 * momentum_score + 0.35 * quality_score",
      hard_gates: ["data_sufficiency", "absolute_momentum", "liquidity_shares", "liquidity_rupee", "fresh_candle", "stuck_candle", "correlation"],
      missing: unique(missing)
    },
    portfolio: { status: "NOT_EVALUATED" },
    paper_order: { status: "NOT_CREATED", paper_only: true, broker_write_enabled: false }
  };
}

function deriveMetrics(row) {
  if (row.candles.length) return deriveCandleMetrics(row);
  return deriveManualMetrics(row);
}

function deriveManualMetrics(row) {
  const close = row.close;
  const close127 = row.close_127;
  const close253 = row.close_253;
  const hasPrice = close !== null && close127 !== null && close253 !== null;
  const vol126 = row.vol126 ?? row.vol252;
  const vol252 = row.vol252 ?? row.vol126;
  return {
    hasFullData: hasPrice && row.vol63 !== null && vol126 !== null && vol252 !== null,
    missingReason: "manual close/close_127/close_253/vol63/vol126/vol252 fields",
    close,
    close127,
    close253,
    high252: row.high_252,
    return6m: hasPrice && close127 > 0 ? close / close127 - 1 : null,
    return12m: hasPrice && close253 > 0 ? close / close253 - 1 : null,
    vol63: row.vol63,
    vol126,
    vol252,
    adv20: row.adv20,
    turnoverCr: row.rupee_turnover_cr,
    lastCandleDate: row.last_candle_date || null,
    lastCandleAgeDays: row.last_candle_age_days,
    stuckCandle: row.stuck_candle
  };
}

function deriveCandleMetrics(row) {
  const candles = row.candles;
  const close = candles.at(-1)?.close ?? null;
  const close127 = candles.length >= 127 ? candles.at(-127)?.close ?? null : null;
  const close253 = candles.length >= 253 ? candles.at(-253)?.close ?? null : null;
  const return6m = close !== null && close127 ? close / close127 - 1 : null;
  const return12m = close !== null && close253 ? close / close253 - 1 : null;
  const returns = dailyReturns(candles);
  const vol63 = annualizedVol(returns.slice(-63));
  const vol126 = annualizedVol(returns.slice(-126));
  const vol252 = annualizedVol(returns.slice(-252));
  const last20 = candles.slice(-20);
  const last5 = candles.slice(-5);
  const adv20 = last20.length >= 20 ? average(last20.map((candle) => candle.volume || 0)) : null;
  const turnoverCr = last5.length >= 5 ? average(last5.map((candle) => ((candle.close || 0) * (candle.volume || 0)) / 10000000)) : null;
  const lastCandle = candles.at(-1) || {};
  const lastCandleDate = lastCandle.date || null;
  const lastCandleAgeDays = lastCandleDate ? Math.floor((Date.now() - Date.parse(lastCandleDate)) / 86400000) : null;
  const ohlc = [lastCandle.open, lastCandle.high, lastCandle.low, lastCandle.close].filter(Number.isFinite);
  const stuckCandle = ohlc.length === 4 && Math.max(...ohlc) - Math.min(...ohlc) <= Math.max(0.01, close * 0.0001);
  const high252 = candles.length >= 252 ? Math.max(...candles.slice(-252).map((candle) => candle.close).filter(Number.isFinite)) : null;
  return {
    hasFullData: candles.length >= 253 && returns.length >= 252,
    missingReason: `${candles.length}/253 daily candles`,
    close,
    close127,
    close253,
    high252,
    return6m,
    return12m,
    vol63,
    vol126,
    vol252,
    adv20,
    turnoverCr,
    lastCandleDate,
    lastCandleAgeDays,
    stuckCandle: row.stuck_candle || stuckCandle
  };
}

function dailyReturns(candles) {
  const values = [];
  for (let index = 1; index < candles.length; index += 1) {
    const previous = candles[index - 1].close;
    const current = candles[index].close;
    if (previous > 0 && current > 0) values.push(current / previous - 1);
  }
  return values;
}

function annualizedVol(values) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return null;
  const mean = average(clean);
  const variance = average(clean.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance) * Math.sqrt(252);
}

function average(values) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function scoreMomentum(return6m, return12m, vol126, vol252) {
  if (![return6m, return12m, vol126, vol252].every(Number.isFinite) || vol126 <= 0 || vol252 <= 0) return null;
  const raw = (return6m / vol126 + return12m / vol252) / 2;
  return clamp(50 + raw * 25, 0, 100);
}

function scoreLowVol(vol63) {
  if (!Number.isFinite(vol63) || vol63 <= 0) return null;
  return clamp(100 - (vol63 * 100 - 10) * 1.7, 0, 100);
}

function scoreLiquidityQuality(adv20) {
  if (!Number.isFinite(adv20)) return null;
  if (adv20 > 1_000_000) return 90;
  if (adv20 > 300_000) return 70;
  if (adv20 > 100_000) return 55;
  return 30;
}

function targetPotentialLabel(metrics, threshold) {
  if (!Number.isFinite(metrics.high252) || !Number.isFinite(metrics.close) || metrics.close <= 0) {
    return { label: "DATA_NEEDED", potential_left_pct: null, threshold_pct: threshold };
  }
  const potentialLeft = (metrics.high252 / metrics.close - 1) * 100;
  return { label: potentialLeft >= threshold ? "PASS" : "WARN", potential_left_pct: round(potentialLeft, 2), threshold_pct: threshold };
}

function correlationGate(row, holdings, threshold) {
  if (!holdings.length) return { ok: true, status: "not_applicable", max_correlation: null, blocking_symbol: null, threshold };
  if (!row.candles.length) return { ok: false, status: "data_needed", data_needed: true, max_correlation: null, blocking_symbol: null, threshold };

  let maxCorrelation = null;
  let blockingSymbol = null;
  for (const holding of holdings) {
    if (!holding.candles.length || holding.symbol === row.symbol) continue;
    const corr = correlateReturnSeries(row.candles, holding.candles, 60);
    if (corr === null) continue;
    if (maxCorrelation === null || corr > maxCorrelation) {
      maxCorrelation = corr;
      blockingSymbol = holding.symbol;
    }
  }
  if (maxCorrelation === null) return { ok: false, status: "data_needed", data_needed: true, max_correlation: null, blocking_symbol: null, threshold };
  return {
    ok: maxCorrelation <= threshold,
    status: maxCorrelation <= threshold ? "pass" : "blocked",
    max_correlation: round(maxCorrelation, 4),
    blocking_symbol: maxCorrelation <= threshold ? null : blockingSymbol,
    threshold
  };
}

function correlateReturnSeries(candidateCandles, holdingCandles, windowSize) {
  const candidate = returnsByDate(candidateCandles);
  const holding = returnsByDate(holdingCandles);
  const pairs = [];
  for (const [date, value] of candidate) {
    if (holding.has(date)) pairs.push([value, holding.get(date)]);
  }
  const window = pairs.slice(-windowSize);
  if (window.length < Math.min(30, windowSize)) return null;
  return pearson(window.map((pair) => pair[0]), window.map((pair) => pair[1]));
}

function returnsByDate(candles) {
  const values = new Map();
  for (let index = 1; index < candles.length; index += 1) {
    const previous = candles[index - 1].close;
    const current = candles[index].close;
    if (previous > 0 && current > 0) values.set(String(candles[index].date).slice(0, 10), current / previous - 1);
  }
  return values;
}

function pearson(xs, ys) {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const meanX = average(xs);
  const meanY = average(ys);
  let numerator = 0;
  let denomX = 0;
  let denomY = 0;
  for (let index = 0; index < xs.length; index += 1) {
    const dx = xs[index] - meanX;
    const dy = ys[index] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  const denominator = Math.sqrt(denomX * denomY);
  return denominator ? numerator / denominator : null;
}

function applyPortfolio(rows, settings) {
  const output = rows.map((row) => ({ ...row }));
  const baseValue = settings.startingCapital * settings.maxPositionPct;
  const finalValue = baseValue * settings.regimeMultiplier * settings.ifrMultiplier * settings.drawdownMultiplier;
  const sectorMaxValue = settings.startingCapital * (settings.maxSectorExposurePct / 100);
  const sectorCounts = new Map();
  const sectorValues = new Map();
  let positionCount = 0;

  for (const row of output.sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol))) {
    row.portfolio = {
      status: row.decision === "SELECT" ? "CANDIDATE" : "NOT_CANDIDATE",
      max_positions: settings.maxPositions,
      max_sector_positions: settings.maxSectorPositions,
      max_sector_exposure_pct: settings.maxSectorExposurePct,
      base_position_value: round(baseValue, 2),
      final_position_value: row.decision === "SELECT" ? round(finalValue, 2) : 0,
      regime_multiplier: settings.regimeMultiplier,
      ifr_multiplier: settings.ifrMultiplier,
      drawdown_multiplier: settings.drawdownMultiplier
    };
    row.paper_order = { status: "NOT_CREATED", paper_only: true, broker_write_enabled: false };
    row.gates.portfolio_caps = true;

    if (row.decision !== "SELECT") continue;
    const sector = row.sector || "Unmapped";
    const sectorCount = sectorCounts.get(sector) || 0;
    const sectorValue = sectorValues.get(sector) || 0;
    const blocked = [];
    if (positionCount >= settings.maxPositions) blocked.push("max positions reached");
    if (sectorCount >= settings.maxSectorPositions) blocked.push("max sector positions reached");
    if (sectorValue + finalValue > sectorMaxValue) blocked.push("max sector exposure reached");
    if (finalValue <= 0) blocked.push("risk multiplier blocks new entries");
    if (!Number.isFinite(row.close) || row.close <= 0) blocked.push("entry price missing");

    const qty = Number.isFinite(row.close) && row.close > 0 ? Math.floor(finalValue / row.close) : 0;
    if (qty < 1 && !blocked.length) blocked.push("position value too small for one share");

    if (blocked.length) {
      row.decision = "BLOCKED";
      row.gates.portfolio_caps = false;
      row.reason = unique([row.reason, ...blocked]).join("; ");
      row.portfolio.status = "BLOCKED";
      row.portfolio.blockers = blocked;
      row.paper_order = { status: "SKIPPED", reason: blocked.join("; "), paper_only: true, broker_write_enabled: false };
      continue;
    }

    positionCount += 1;
    sectorCounts.set(sector, sectorCount + 1);
    sectorValues.set(sector, sectorValue + finalValue);
    row.portfolio = {
      ...row.portfolio,
      status: "SIZED",
      rank: positionCount,
      qty,
      entry_price: row.close,
      position_value: round(qty * row.close, 2),
      weight_pct: round((qty * row.close / settings.startingCapital) * 100, 2),
      sector_position_count: sectorCount + 1,
      sector_exposure_value: round(sectorValue + finalValue, 2)
    };
    row.paper_order = {
      status: "READY",
      type: "paper",
      side: "BUY",
      symbol: row.symbol,
      qty,
      limit_price: row.close,
      estimated_value: round(qty * row.close, 2),
      paper_only: true,
      broker_write_enabled: false
    };
  }
  return output;
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

function normalizeLedgerLimit(limit) {
  const value = Math.floor(finiteOr(limit, 25));
  return Math.min(MAX_SCAN_LEDGER_RECORDS, Math.max(1, value));
}

function compactScanRow(row = {}) {
  return {
    symbol: row.symbol,
    name: row.name,
    sector: row.sector,
    exchange: row.exchange,
    decision: row.decision,
    score: row.score,
    momentum_score: row.momentum_score,
    quality_score: row.quality_score,
    return_6m_pct: row.return_6m_pct,
    return_12m_pct: row.return_12m_pct,
    adv20: row.adv20,
    rupee_turnover_cr: row.rupee_turnover_cr,
    close: row.close,
    target_potential: row.target_potential,
    paper_order: row.paper_order,
    gates: row.gates,
    reason: row.reason,
    data_source: row.data_source
  };
}

function sanitizeScanRecord(record = {}) {
  const summary = record.summary && typeof record.summary === "object" ? record.summary : {};
  const rows = Array.isArray(record.rows) ? record.rows.map(compactScanRow).slice(0, MAX_SCAN_LEDGER_ROWS) : [];
  return {
    id: String(record.id || crypto.randomUUID()),
    createdAt: Number.isFinite(Date.parse(record.createdAt)) ? new Date(record.createdAt).toISOString() : new Date().toISOString(),
    engine: String(record.engine || ENGINE_VERSION),
    mode: String(record.mode || "scanner").slice(0, 40),
    source: String(record.source || "server-scanner").slice(0, 120),
    universe: Math.max(0, Math.floor(finiteOr(record.universe, rows.length))),
    summary: {
      total: Math.max(0, Math.floor(finiteOr(summary.total, rows.length))),
      SELECT: Math.max(0, Math.floor(finiteOr(summary.SELECT, 0))),
      WATCH: Math.max(0, Math.floor(finiteOr(summary.WATCH, 0))),
      REJECT: Math.max(0, Math.floor(finiteOr(summary.REJECT, 0))),
      BLOCKED: Math.max(0, Math.floor(finiteOr(summary.BLOCKED, 0))),
      DATA_NEEDED: Math.max(0, Math.floor(finiteOr(summary.DATA_NEEDED, 0)))
    },
    settings: normalizeScannerSettings(record.settings || {}),
    rows
  };
}

function buildScanRecord(scan, context = {}) {
  return sanitizeScanRecord({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    engine: scan.engine || ENGINE_VERSION,
    mode: context.mode || "scanner",
    source: context.source || scan.source,
    universe: scan.universe,
    summary: scan.summary,
    settings: scan.settings,
    rows: scan.rows
  });
}

async function appendScanLedger(scan, context = {}) {
  const store = context.store || (await getStore());
  if (!store.appendScanRecord) return null;
  return store.appendScanRecord(buildScanRecord(scan, context));
}

function scanLedgerMeta(record) {
  return record ? { id: record.id, createdAt: record.createdAt, mode: record.mode, source: record.source } : null;
}

function upstoxStatus() {
  return {
    key_visible: Boolean(ENV.UPSTOX_API_KEY || ENV.UPSTOX_CLIENT_ID),
    token_visible: Boolean(ENV.UPSTOX_ACCESS_TOKEN),
    historical_candles_only: true,
    live_orders: false,
    endpoint: "https://api.upstox.com/v2/historical-candle/{instrument_key}/day/{to_date}/{from_date}",
    instruments_json_url: UPSTOX_NSE_INSTRUMENTS_URL,
    complete_instruments_json_url: UPSTOX_COMPLETE_INSTRUMENTS_URL
  };
}

function dataBankSummary(state = defaultState()) {
  const universe = normalizeScannerUniverse(state.universe);
  const withInstrumentKeys = universe.filter((row) => row.instrument_key).length;
  const dataSources = unique(universe.map((row) => row.data_source || "manual/input"));
  return {
    provider: "AshStocks India Scanner",
    engine: ENGINE_VERSION,
    universe_count: universe.length,
    rows_with_instrument_key: withInstrumentKeys,
    built_in_universe_count: INDIA_UNIVERSE.length,
    max_universe_rows: MAX_UNIVERSE_ROWS,
    data_sources: dataSources,
    upstox: upstoxStatus(),
    requirements: {
      exchange: "NSE",
      segment: "NSE_EQ",
      instrument_type: "EQ",
      daily_candles_required: 253,
      historical_window_days_requested: 470,
      min_adv20_shares: defaultScannerSettings().adv20Min,
      min_rupee_turnover_cr: defaultScannerSettings().turnoverCrMin,
      max_stale_days: defaultScannerSettings().maxStaleDays,
      max_correlation: defaultScannerSettings().correlationThreshold,
      live_orders: false,
      paper_only: true
    },
    remaining_gaps: [
      "15Y point-in-time OHLCV bank is not complete",
      "FII/DII/PWOI/IFR overlays are not complete",
      "Scheduled daily paper loop is not complete",
      "Mongo credentials are not proven live when storage reports file fallback",
      "Live Render proof must pass verify:live after deploy"
    ]
  };
}

async function dataBankStatus() {
  const store = await getStore();
  const state = await store.getState();
  return {
    ok: true,
    storage: store.mode,
    source: store.source || null,
    persistent: store.persistent,
    warning: store.warning || null,
    data_bank: dataBankSummary(state)
  };
}

async function resolveRequestUniverse(body = {}) {
  if (Array.isArray(body.universe) && body.universe.length) {
    return { universe: body.universe, source: body.source || "request-universe" };
  }
  const store = await getStore();
  const state = await store.getState();
  return { universe: state.universe, source: body.source || "saved-data-bank" };
}

async function gunzipMaybe(buffer) {
  const data = Buffer.from(buffer);
  if (data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b) {
    return new Promise((resolve, reject) => {
      zlib.gunzip(data, (error, unzipped) => {
        if (error) reject(error);
        else resolve(unzipped);
      });
    });
  }
  return data;
}

async function fetchUpstoxInstrumentRecords(url = UPSTOX_NSE_INSTRUMENTS_URL) {
  const response = await fetch(url, { headers: { accept: "application/json, application/gzip" } });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Upstox instruments ${response.status}: ${text.slice(0, 180) || response.statusText}`);
  }
  const unzipped = await gunzipMaybe(await response.arrayBuffer());
  const payload = JSON.parse(unzipped.toString("utf8"));
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  throw new Error("Upstox instruments response did not contain an array");
}

function upstoxInstrumentToScannerRow(record = {}) {
  const exchange = String(record.exchange || "").trim().toUpperCase();
  const segment = String(record.segment || "").trim().toUpperCase();
  const instrumentType = String(record.instrument_type || "").trim().toUpperCase();
  const symbol = normalizeSymbol(record.trading_symbol || record.tradingsymbol || record.short_name || record.name);
  const instrumentKey = String(record.instrument_key || "").trim();
  if (!symbol || !instrumentKey) return null;
  if (exchange !== "NSE" || segment !== "NSE_EQ" || instrumentType !== "EQ") return null;
  return {
    symbol,
    name: String(record.short_name || record.name || symbol).trim(),
    sector: "Unmapped",
    exchange: "NSE",
    instrument_key: instrumentKey,
    isin: String(record.isin || "").trim(),
    instrument_type: instrumentType,
    security_type: String(record.security_type || "").trim(),
    data_source: "Upstox NSE instruments JSON"
  };
}

function normalizeUpstoxEquityUniverse(records, limit = MAX_UNIVERSE_ROWS) {
  const bySymbol = new Map();
  for (const record of records) {
    const row = upstoxInstrumentToScannerRow(record);
    if (!row) continue;
    if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, row);
  }
  return normalizeScannerRows([...bySymbol.values()]).slice(0, limit);
}

async function loadUpstoxNseDataBank(options = {}) {
  const limit = Math.min(MAX_UNIVERSE_ROWS, Math.max(1, Math.floor(finiteOr(options.limit ?? options.max, MAX_UNIVERSE_ROWS))));
  const url = String(options.url || UPSTOX_NSE_INSTRUMENTS_URL);
  const records = await fetchUpstoxInstrumentRecords(url);
  const universe = normalizeUpstoxEquityUniverse(records, limit);
  if (!universe.length) throw new Error("No NSE EQ rows found in Upstox instruments file");
  const store = await getStore();
  const previous = await store.getState();
  const state = await store.saveState({ ...previous, universe });
  return {
    ok: true,
    source: "Upstox NSE instruments JSON",
    url,
    total_records_read: records.length,
    saved_universe: state.universe.length,
    rows_with_instrument_key: state.universe.filter((row) => row.instrument_key).length,
    sample: state.universe.slice(0, 5),
    data_bank: dataBankSummary(state)
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
  return normalizeCandles(payload?.data?.candles || []);
}

async function runUpstoxScanner(body = {}, fallbackUniverse = null) {
  if (!ENV.UPSTOX_ACCESS_TOKEN) return { ok: false, error: "upstox_token_missing", status: upstoxStatus() };
  const window = defaultDateWindow();
  const from = String(body.from || window.from).slice(0, 10);
  const to = String(body.to || window.to).slice(0, 10);
  const maxLimit = Math.min(200, Math.max(1, Math.floor(finiteOr(ENV.UPSTOX_SCAN_LIMIT, 60))));
  const universeInput = Array.isArray(body.universe) && body.universe.length ? body.universe : fallbackUniverse;
  const baseRows = normalizeScannerUniverse(universeInput).filter((row) => row.instrument_key).slice(0, maxLimit);
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

  const scan = runScanner(fetchedRows, { ...(body.settings || {}), source: "Upstox historical candles", holdings: body.holdings || body.existingHoldings || [] });
  return {
    ...scan,
    ok: true,
    from,
    to,
    scanned: fetchedRows.length,
    scan_limit: maxLimit,
    status: upstoxStatus(),
    failures: scan.rows.filter((row) => row.decision === "DATA_NEEDED" && row.reason.includes("Upstox fetch failed"))
  };
}

function paperEngineSchedulerEnabled() {
  if (ENV.DISABLE_PAPER_ENGINE_SCHEDULER === "true") return false;
  if (ENV.ENABLE_PAPER_ENGINE_SCHEDULER === "true") return true;
  return ENV.NODE_ENV === "production";
}

function paperEngineStatus() {
  return {
    enabled: paperEngineSchedulerEnabled(),
    running: paperEngineState.running,
    startedAt: paperEngineState.startedAt,
    lastCheckAt: paperEngineState.lastCheckAt,
    lastRunAt: paperEngineState.lastRunAt,
    lastSlotKey: paperEngineState.lastSlotKey,
    slots_ist: PAPER_ENGINE_SLOTS_IST,
    poll_ms: PAPER_ENGINE_POLL_MS,
    safety: { paper_only: true, live_orders: false, broker_write_enabled: false, historical_candles_only: true },
    lastResult: paperEngineState.lastResult
  };
}

function istClockParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`
  };
}

function duePaperEngineSlot(date = new Date()) {
  const ist = istClockParts(date);
  if (!PAPER_ENGINE_SLOTS_IST.includes(ist.time)) return null;
  const key = `${ist.date}T${ist.time}+05:30`;
  if (paperEngineState.runKeys[key]) return null;
  return { key, date: ist.date, time: ist.time };
}

async function runPaperEngineOnce(trigger = "manual", slot = null) {
  const store = await getStore();
  const state = await store.getState();
  if (!ENV.UPSTOX_ACCESS_TOKEN) {
    const result = { ok: false, error: "upstox_token_missing", trigger, slot, status: upstoxStatus() };
    paperEngineState.lastResult = result;
    return result;
  }

  const scan = await runUpstoxScanner({ universe: state.universe, settings: state.scannerSettings }, state.universe);
  if (!scan.ok) {
    const result = { ...scan, trigger, slot };
    paperEngineState.lastResult = result;
    return result;
  }

  const ledger = await appendScanLedger(scan, {
    store,
    mode: slot?.time ? `paper-engine-${slot.time}` : "paper-engine-manual",
    source: "paper-engine-upstox-historical"
  });
  const result = {
    ok: true,
    trigger,
    slot,
    ledger: scanLedgerMeta(ledger),
    summary: scan.summary,
    scanned: scan.scanned,
    safety: { paper_only: true, live_orders: false, broker_write_enabled: false, historical_candles_only: true }
  };
  paperEngineState.lastRunAt = new Date().toISOString();
  paperEngineState.lastSlotKey = slot?.key || null;
  paperEngineState.lastResult = result;
  return result;
}

async function paperEngineTick() {
  if (!paperEngineSchedulerEnabled() || paperEngineState.running) return;
  paperEngineState.lastCheckAt = new Date().toISOString();
  const slot = duePaperEngineSlot();
  if (!slot) return;
  paperEngineState.runKeys[slot.key] = true;
  paperEngineState.running = true;
  try {
    await runPaperEngineOnce("schedule", slot);
  } catch (error) {
    paperEngineState.lastResult = { ok: false, trigger: "schedule", slot, error: error.message };
  } finally {
    paperEngineState.running = false;
  }
}

function startPaperEngineScheduler() {
  if (paperEngineScheduler || !paperEngineSchedulerEnabled()) return;
  paperEngineState.enabled = true;
  paperEngineState.startedAt = new Date().toISOString();
  paperEngineScheduler = setInterval(() => {
    paperEngineTick().catch((error) => {
      paperEngineState.lastResult = { ok: false, trigger: "schedule", error: error.message };
    });
  }, PAPER_ENGINE_POLL_MS);
  paperEngineScheduler.unref?.();
  paperEngineTick().catch(() => {});
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

async function searchSymbols(query, universe = INDIA_UNIVERSE) {
  const q = normalizeSymbol(query);
  return normalizeScannerUniverse(universe)
    .filter((row) => !q || row.symbol.includes(q) || row.name.toUpperCase().includes(q))
    .slice(0, 20);
}

async function newsFor() {
  return [];
}

export function createServer() {
  startPaperEngineScheduler();
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
          engine: ENGINE_VERSION,
          storage: hasMongoUri ? "mongodb" : fallbackReady ? "file" : "unconfigured",
          persistent: hasMongoUri || fallbackReady,
          data_bank: dataBankSummary(),
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
          const state = await store.getState();
          json(res, 200, {
            ok: true,
            provider: "AshStocks India Scanner",
            engine: ENGINE_VERSION,
            storage: store.mode,
            source: store.source || null,
            persistent: store.persistent,
            warning: store.warning || null,
            data_bank: dataBankSummary(state),
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

      if (url.pathname === "/api/data-bank/status") {
        json(res, 200, await dataBankStatus());
        return;
      }

      if (url.pathname === "/api/data-bank/load-upstox-nse") {
        if (req.method !== "POST") {
          json(res, 405, { ok: false, error: "Method not allowed" });
          return;
        }
        json(res, 200, await loadUpstoxNseDataBank(await readJsonBody(req)));
        return;
      }

      if (url.pathname === "/api/scanner/parameters") {
        const store = await getStore();
        const state = await store.getState();
        json(res, 200, {
          ok: true,
          parameters: SCANNER_PARAMETERS,
          universe: state.universe,
          settings: state.scannerSettings || defaultScannerSettings(),
          data_bank: dataBankSummary(state),
          upstox: upstoxStatus()
        });
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

      if (url.pathname === "/api/scanner/ledger") {
        const store = await getStore();
        const records = store.listScanRecords ? await store.listScanRecords(url.searchParams.get("limit")) : [];
        json(res, 200, {
          ok: true,
          storage: store.mode,
          source: store.source || null,
          persistent: store.persistent,
          records
        });
        return;
      }

      if (url.pathname === "/api/scanner/run") {
        const body = req.method === "POST" ? await readJsonBody(req) : {};
        const store = await getStore();
        const resolved = await resolveRequestUniverse(body);
        const scan = runScanner(resolved.universe, { ...(body.settings || {}), source: resolved.source, holdings: body.holdings, existingHoldings: body.existingHoldings });
        const ledger = await appendScanLedger(scan, { store, mode: "scanner", source: resolved.source });
        json(res, 200, { ...scan, ledger: scanLedgerMeta(ledger) });
        return;
      }

      if (url.pathname === "/api/scanner/run-upstox") {
        if (req.method !== "POST") {
          json(res, 405, { ok: false, error: "Method not allowed" });
          return;
        }
        const body = await readJsonBody(req);
        const store = await getStore();
        const resolved = await resolveRequestUniverse(body);
        const result = await runUpstoxScanner(body, resolved.universe);
        if (result.ok) {
          const ledger = await appendScanLedger(result, { store, mode: "upstox-historical", source: result.source || "Upstox historical candles" });
          result.ledger = scanLedgerMeta(ledger);
        }
        json(res, result.ok ? 200 : 409, result);
        return;
      }

      if (url.pathname === "/api/upstox/status") {
        json(res, 200, { ok: true, status: upstoxStatus() });
        return;
      }

      if (url.pathname === "/api/paper-engine/status") {
        json(res, 200, { ok: true, status: paperEngineStatus() });
        return;
      }

      if (url.pathname === "/api/paper-engine/run") {
        if (req.method !== "POST") {
          json(res, 405, { ok: false, error: "Method not allowed" });
          return;
        }
        const result = await runPaperEngineOnce("manual", null);
        json(res, result.ok ? 200 : 409, result);
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
        const store = await getStore();
        const state = await store.getState();
        json(res, 200, { ok: true, results: await searchSymbols(url.searchParams.get("q"), state.universe) });
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

export { quoteFor, searchSymbols, newsFor, sanitizeState, normalizeMongoUri, runScanner, normalizeSymbol, dataBankSummary, loadUpstoxNseDataBank };
