import { createServer, normalizeMongoUri, runScanner } from "../server.js";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.SMOKE_PORT || 5199);
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const Q1_INPUTS = [
  path.join(ROOT, "data", "q1_inputs", "fii_symbol_daily.csv"),
  path.join(ROOT, "data", "q1_inputs", "Q1_FII_20D_ranked_top_bottom_deciles_READY_FOR_PRICE_JOIN.csv")
];
const STATE_FILE = path.join(ROOT, "data", "app_state.json");
const SCAN_LEDGER_FILE = path.join(ROOT, "data", "scan_ledger.jsonl");
const UPSTOX_AUTH_FILE = path.join(ROOT, "data", "upstox_auth.json");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(targetPath, options = {}) {
  const response = await fetch(`${BASE}${targetPath}`, { redirect: "manual", ...options });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  return { response, body };
}

function multipartBody(files) {
  const boundary = `----ashstocks-smoke-${Date.now()}`;
  let body = "";
  for (const file of files) {
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="${file.name}"; filename="${file.name}"\r\n`;
    body += "Content-Type: text/csv\r\n\r\n";
    body += file.content;
    body += "\r\n";
  }
  body += `--${boundary}--\r\n`;
  return { body, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

function proofCandles(offset = 0) {
  const today = new Date();
  const candles = [];
  for (let index = 0; index < 253; index += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - (252 - index));
    const close = 100 + index + offset;
    candles.push({
      date: date.toISOString().slice(0, 10),
      open: close * 0.99,
      high: close * 1.01,
      low: close * 0.98,
      close,
      volume: 500000
    });
  }
  return candles;
}

async function runProductionMongoHealthGuard() {
  const script = `
process.env.NODE_ENV = "production";
process.env.REQUIRE_AUTH = "true";
process.env.REQUIRE_DB = "true";
process.env.APP_PASSWORD = "smoke-password";
process.env.APP_SESSION_SECRET = "smoke-session";
process.env.MONGODB_URI = "mongodb://192.0.2.1:27017/ashstock";
process.env.MONGO_TIMEOUT_MS = "500";
const { createServer } = await import("./server.js");
const server = createServer();
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const port = server.address().port;
const started = Date.now();
let result;
try {
  const healthResponse = await fetch("http://127.0.0.1:" + port + "/api/health");
  const readyResponse = await fetch("http://127.0.0.1:" + port + "/api/ready");
  result = {
    healthStatus: healthResponse.status,
    healthBody: await healthResponse.json(),
    readyStatus: readyResponse.status,
    readyBody: await readyResponse.json(),
    elapsedMs: Date.now() - started
  };
} finally {
  await new Promise((resolve) => server.close(resolve));
}
if (result.healthStatus !== 200) throw new Error("production health should stay live");
if (result.healthBody.ok !== true) throw new Error("production health should report ok=true");
if (result.readyStatus !== 200) throw new Error("production fallback readiness should return 200");
if (result.readyBody.ok !== true) throw new Error("production fallback readiness should report ok=true");
if (result.readyBody.storage !== "file") throw new Error("production fallback readiness should use file storage");
if (result.elapsedMs > 6000) throw new Error("production Mongo fallback took too long");
console.log(JSON.stringify(result));
`;

  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", script], { cwd: ROOT, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ code: null, stdout, stderr, timedOut: true });
    }, 10_000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut: false });
    });
  });

  assert(!result.timedOut, "production Mongo fallback should not hang");
  assert(result.code === 0, result.stderr || result.stdout || "production Mongo fallback failed");
}

async function runRealQuotePaperFillGuard() {
  const script = `
const NativeDate = Date;
const fixedNow = NativeDate.parse("2026-07-27T04:30:00.000Z");
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [fixedNow])); }
  static now() { return fixedNow; }
};
globalThis.__ASH_STOCK_ENV = {
  ...process.env,
  NODE_ENV: "test",
  REQUIRE_AUTH: "false",
  REQUIRE_DB: "false",
  UPSTOX_API_KEY: "smoke-key",
  UPSTOX_API_SECRET: "smoke-secret",
  UPSTOX_ACCESS_TOKEN: "smoke-token",
  DISABLE_PAPER_ENGINE_AUTOBUY: "false",
  PAPER_ENGINE_MAX_BUYS_PER_RUN: "1"
};
const nativeFetch = globalThis.fetch;
const { createServer } = await import("./server.js");
const server = createServer();
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const base = "http://127.0.0.1:" + server.address().port;
const candles = [];
for (let index = 0; index < 253; index += 1) {
  const date = new NativeDate(fixedNow - (252 - index) * 86400000);
  const close = 100 + index;
  candles.push({ date: date.toISOString().slice(0, 10), open: close * 0.99, high: close * 1.01, low: close * 0.98, close, volume: 800000 });
}
try {
  const symbols = ["REALQUOTE", "SELECTTWO", "SELECTTHREE", "SELECTFOUR"];
  let response = await nativeFetch(base + "/api/scanner/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ universe: symbols.map((symbol, index) => ({
      symbol,
      name: "Real Quote Test " + (index + 1),
      sector: "Test",
      exchange: "NSE",
      instrument_key: "NSE_EQ|INETEST0000" + (index + 1),
      candles
    })) })
  });
  const scan = await response.json();
  if (scan.rows?.length !== symbols.length || !scan.rows.every((row) => row.decision === "SELECT")) throw new Error("all real-quote candidates should be SELECT");
  if (!scan.rows.every((row) => row.parameter_tunnel?.summary?.evaluated >= 80)) throw new Error("every real-quote candidate should execute the wired tunnel");

  const quoteData = Object.fromEntries(symbols.map((symbol, index) => [
    "NSE_EQ:INETEST0000" + (index + 1),
    {
      instrument_key: "NSE_EQ|INETEST0000" + (index + 1),
      trading_symbol: symbol,
      last_price: 352 + index,
      timestamp: new NativeDate(fixedNow).toISOString(),
      lower_circuit_limit: 250,
      upper_circuit_limit: 450,
      depth: {
        buy: [{ price: 351.95 + index, quantity: 50000, orders: 20 }],
        sell: [{ price: 352.05 + index, quantity: 50000, orders: 20 }]
      }
    }
  ]));
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (!target.startsWith("https://api.upstox.com/v2/market-quote/quotes")) throw new Error("unexpected network request " + target);
    return new Response(JSON.stringify({ status: "success", data: quoteData }), { status: 200, headers: { "content-type": "application/json" } });
  };

  response = await nativeFetch(base + "/api/paper-engine/run", { method: "POST" });
  const firstResult = await response.json();
  if (firstResult.auto_buy?.orders_filled !== 1 || firstResult.auto_buy?.pending_after_run !== 3) throw new Error("first capped cycle should leave three SELECT rows pending");
  globalThis.__ASH_STOCK_ENV.PAPER_ENGINE_MAX_BUYS_PER_RUN = "25";
  response = await nativeFetch(base + "/api/paper-engine/run", { method: "POST" });
  const result = await response.json();
  response = await nativeFetch(base + "/api/paper-trader/orders");
  const ledger = await response.json();
  const firstOrder = firstResult.auto_buy?.orders?.[0];
  const firstPosition = ledger.positions?.find((position) => position.symbol === "REALQUOTE");
  if (result.auto_buy?.selection_contract !== "SELECT_FINAL") throw new Error("SELECT must be the final paper-buy authorization");
  if (result.auto_buy?.fill_method !== "UPSTOX_WEIGHTED_ASK_OR_LTP") throw new Error("paper engine must declare its real-price fill method");
  if (result.auto_buy?.selected_in_scan !== 4 || result.auto_buy?.already_open_before !== 1) throw new Error("paper engine must reconcile existing positions against every SELECT");
  if (result.auto_buy?.orders_filled !== 3 || result.auto_buy?.pending_after_run !== 0) throw new Error("second cycle must drain every remaining SELECT");
  if (ledger.positions?.length !== 4) throw new Error("every SELECT must appear as an open paper position");
  if (firstOrder?.price !== 352.05 || firstOrder?.quote_timestamp !== "2026-07-27T04:30:00.000Z") throw new Error("paper market fill must use the real Upstox ask");
  if (firstPosition?.entry_price !== 352.05 || firstPosition?.instrument_key !== "NSE_EQ|INETEST00001") throw new Error("real-quote position must persist in the paper ledger");
  if (!ledger.positions.every((position) => position.parameter_evidence?.evaluated >= 80)) throw new Error("every paper position must retain parameter evidence");
  console.log(JSON.stringify({ ok: true, positions: ledger.positions.map((position) => position.symbol), pending: result.auto_buy.pending_after_run }));
} finally {
  globalThis.fetch = nativeFetch;
  await new Promise((resolve) => server.close(resolve));
  const fs = await import("node:fs/promises");
  for (const file of ["data/app_state.json", "data/scan_ledger.jsonl", "data/upstox_auth.json"]) await fs.unlink(file).catch(() => {});
}
`;
  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", script], { cwd: ROOT, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
  assert(result.code === 0, result.stderr || result.stdout || "real-quote paper fill guard failed");
}

async function main() {
  globalThis.__ASH_STOCK_ENV = {
    ...process.env,
    UPSTOX_API_KEY: "smoke-key",
    UPSTOX_API_SECRET: "smoke-secret",
    UPSTOX_ACCESS_TOKEN: "",
    NODE_ENV: "test",
    REQUIRE_AUTH: "false",
    REQUIRE_DB: "false"
  };

  assert(
    normalizeMongoUri("mongodb+srv://user:pass@example.mongodb.net:27017/ashstock?retryWrites=true") ===
      "mongodb+srv://user:pass@example.mongodb.net/ashstock?retryWrites=true",
    "mongodb+srv URIs must not keep port numbers"
  );
  assert(
    normalizeMongoUri(" mongodb+srv://user:p@ss@example.mongodb.net:27017/ashstock ") ===
      "mongodb+srv://user:p%40ss@example.mongodb.net/ashstock",
    "mongodb+srv URI cleanup should tolerate whitespace and @ in credentials"
  );
  assert(
    normalizeMongoUri("mongodb+srv://user:pass@host-a.example.net:27017,host-b.example.net:27017/ashstock") ===
      "mongodb://user:pass@host-a.example.net:27017,host-b.example.net:27017/ashstock",
    "multi-host seed lists must use the standard mongodb scheme"
  );
  await runProductionMongoHealthGuard();
  await runRealQuotePaperFillGuard();

  const directScan = runScanner([
    {
      symbol: "TESTINDIA",
      name: "Test India",
      sector: "Test",
      close: 150,
      close_127: 100,
      close_253: 80,
      adv20: 500000,
      rupee_turnover_cr: 25,
      quality_score: 82,
      vol63: 0.15,
      vol252: 0.2,
      last_candle_age_days: 1,
      stuck_candle: false
    }
  ]);
  assert(directScan.engine === "ashstocks-selection-v0.1-proof", "scanner should expose proof engine version");
  assert(directScan.rows[0].decision === "SELECT", "manual metric row should be selectable");
  assert(directScan.rows[0].paper_order.status === "READY", "selectable row should create a paper-only order intent");
  assert(directScan.rows[0].paper_order.broker_write_enabled === false, "scanner must not enable broker writes");
  assert(directScan.rows[0].proof.formula.includes("momentum_score"), "proof row should expose scoring formula");
  assert(directScan.parameter_tunnel_version === "ashstocks-parameter-tunnel-v1.0-175", "scanner should expose the reviewed 175-node tunnel version");
  assert(directScan.rows[0].parameter_tunnel.total === 175, "every scanner row should carry all 175 parameter nodes");
  assert(directScan.rows[0].parameter_tunnel.summary.evaluated === 0, "metric-only rows must not invent candle-derived parameter evidence");
  assert(directScan.rows[0].score === directScan.rows[0].base_score, "missing candle evidence must not dilute the existing scanner score");

  const correlationScan = runScanner(
    [{ symbol: "CORRCAND", name: "Correlation Candidate", sector: "Test", candles: proofCandles(0) }],
    { holdings: [{ symbol: "HOLDING", name: "Existing Holding", sector: "Test", candles: proofCandles(0) }] }
  );
  assert(correlationScan.rows[0].decision === "BLOCKED", "over-correlated candidate should be blocked");
  assert(correlationScan.rows[0].gates.correlation === false, "correlation gate should fail for identical return series");
  assert(correlationScan.rows[0].parameter_tunnel.summary.evaluated >= 80, "full candles should execute the wired tunnel parameters");

  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", resolve);
  });

  try {
    const health = await request("/api/health");
    assert(health.response.status === 200, "health should be 200 in local smoke");
    assert(health.body.provider === "AshStocks India Scanner", "health should expose scanner provider");
    assert(health.body.data_bank.requirements.daily_candles_required === 253, "health should expose data-bank candle requirement");

    const ready = await request("/api/ready");
    assert(ready.response.status === 200, "ready should be 200 in local smoke");
    assert(ready.body.ok === true, "ready body should be ok");
    assert(ready.body.data_bank.upstox.instruments_json_url.endsWith("NSE.json.gz"), "ready should expose Upstox NSE instruments JSON URL");

    const state = await request("/api/state");
    assert(state.response.status === 200, "state should be readable");
    assert(Array.isArray(state.body.state.universe), "state should include Indian universe");

    const dataBank = await request("/api/data-bank/status");
    assert(dataBank.response.status === 200, "data-bank status should be readable");
    assert(dataBank.body.data_bank.universe_count >= 30, "data-bank status should count current universe");
    assert(dataBank.body.data_bank.upstox.instruments_json_url.includes("assets.upstox.com"), "data-bank status should show official Upstox instruments source");

    const parameters = await request("/api/scanner/parameters");
    assert(parameters.response.status === 200, "scanner parameters should be readable");
    assert(parameters.body.parameters.length >= 8, "scanner should expose parameter bank");
    assert(parameters.body.universe.some((row) => row.symbol === "RELIANCE"), "default pool should include Indian stocks");
    assert(parameters.body.parameter_tunnel.total === 175, "parameter API should publish all 175 reviewed nodes");
    assert(new Set(parameters.body.parameter_tunnel.parameters.map((row) => row.id)).size === 175, "parameter IDs should be unique");

    const defaultScan = await request("/api/scanner/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
    assert(defaultScan.response.status === 200, "default scanner run should work");
    assert(defaultScan.body.summary.DATA_NEEDED > 0, "default pool should honestly require candles before selection");
    assert(defaultScan.body.ledger?.id, "default scanner run should create a scan ledger record");

    const initialLedger = await request("/api/scanner/ledger?limit=5");
    assert(initialLedger.response.status === 200, "scan ledger should be readable");
    assert(initialLedger.body.records.length >= 1, "scan ledger should include the default scan");
    assert(initialLedger.body.records[0].summary.DATA_NEEDED > 0, "scan ledger should preserve scan summary");

    const savedUniverse = [
      {
        symbol: "SAVEDINDIA",
        name: "Saved India",
        sector: "Test",
        exchange: "NSE",
        instrument_key: "NSE_EQ|INESAVED0001",
        close: 150,
        close_127: 100,
        close_253: 80,
        adv20: 500000,
        rupee_turnover_cr: 25,
        vol63: 0.15,
        vol252: 0.2,
        last_candle_age_days: 1,
        stuck_candle: false
      }
    ];
    const saveState = await request("/api/state", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: { ...state.body.state, universe: savedUniverse } })
    });
    assert(saveState.response.status === 200, "state should save data-bank universe");
    assert(saveState.body.state.universe[0].symbol === "SAVEDINDIA", "saved universe should be stored");

    const savedScan = await request("/api/scanner/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
    assert(savedScan.response.status === 200, "scanner should run from saved data bank");
    assert(savedScan.body.source === "saved-data-bank", "scanner should label saved data-bank source");
    assert(savedScan.body.rows[0].symbol === "SAVEDINDIA", "scanner should use saved universe when request has no universe");
    assert(savedScan.body.rows[0].decision === "SELECT", "saved data-bank row should be selectable");
    assert(savedScan.body.ledger?.source === "saved-data-bank", "saved scan should report ledger metadata");

    const savedLedger = await request("/api/scanner/ledger?limit=3");
    assert(savedLedger.body.records[0].source === "saved-data-bank", "latest ledger record should be the saved data-bank scan");
    assert(savedLedger.body.records[0].rows[0].symbol === "SAVEDINDIA", "scan ledger should store compact proof rows");

    const metricScan = await request("/api/scanner/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ universe: directScan.rows.map((row) => ({ ...row, close: 150, close_127: 100, close_253: 80, adv20: 500000, rupee_turnover_cr: 25, quality_score: 82, vol63: 0.15, vol252: 0.2, last_candle_age_days: 1 })) })
    });
    assert(metricScan.response.status === 200, "metric scanner run should work");
    assert(metricScan.body.rows[0].decision === "SELECT", "server scan should select passing Indian row");

    const upstoxGuard = await request("/api/scanner/run-upstox", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ universe: parameters.body.universe.slice(0, 1) })
    });
    assert(upstoxGuard.response.status === 409, "Upstox scanner should be guarded without token");
    assert(upstoxGuard.body.error === "upstox_token_missing", "Upstox guard should report missing token");

    const paperStatus = await request("/api/paper-engine/status");
    assert(paperStatus.response.status === 200, "paper-engine status should be readable");
    assert(paperStatus.body.status.safety.live_orders === false, "paper-engine must not expose live orders");
    assert(paperStatus.body.status.safety.paper_only === true, "paper-engine should be paper-only");
    assert(paperStatus.body.status.schedule_mode === "continuous_market_hours", "paper-engine should run continuously during NSE hours");
    assert(paperStatus.body.status.auto_interval_minutes === 2, "paper-engine should expose the two-minute server cycle");
    assert(paperStatus.body.status.auto_buy.maxBuysPerRun === 25, "paper-engine should process the full SELECT batch in one cycle");
    assert(paperStatus.body.status.market_hours_ist.open === "09:15" && paperStatus.body.status.market_hours_ist.close === "15:30", "paper-engine should expose NSE market hours");

    const paperRunGuard = await request("/api/paper-engine/run", { method: "POST" });
    assert(paperRunGuard.response.status === 409, "paper-engine manual run should be guarded without token");
    assert(paperRunGuard.body.error === "upstox_token_missing", "paper-engine guard should report missing token");

    const q1Status = await request("/api/q1/status");
    assert(q1Status.response.status === 200, "q1 status should be readable");
    assert(q1Status.body.status.safety.live_orders === false, "q1 must not expose live orders");

    const upload = multipartBody([
      { name: "fii_symbol_daily.csv", content: "symbol,instrument_key\nABC,NSE_EQ|INE000000001\n" },
      { name: "Q1_FII_20D_ranked_top_bottom_deciles_READY_FOR_PRICE_JOIN.csv", content: "symbol,signal_date,bucket\nABC,2024-01-02,top\n" }
    ]);
    const uploadResult = await request("/api/q1/upload", { method: "POST", headers: upload.headers, body: upload.body });
    assert(uploadResult.response.status === 200, "q1 upload should accept required csv files");
    assert(uploadResult.body.status.input_files_found === true, "q1 upload should mark inputs found");

    const q1RunGuard = await request("/api/q1/run-upstox-fetch", { method: "POST" });
    assert(q1RunGuard.response.status === 409, "q1 run should be blocked outside Render");
    assert(q1RunGuard.body.error === "render_only_endpoint", "q1 run guard should be render_only_endpoint");

    const upstoxStatusBefore = await request("/api/upstox/status");
    assert(upstoxStatusBefore.response.status === 200, "Upstox status should be readable");
    assert(upstoxStatusBefore.body.status.oauth_configured === true, "Upstox OAuth should see client key and secret");
    assert(upstoxStatusBefore.body.status.token_visible === false, "Upstox status should not invent a token");
    assert(upstoxStatusBefore.body.status.callback_url === `${BASE}/api/upstox/callback`, "Upstox callback URL should match app origin");

    const upstoxOAuthStart = await request("/api/upstox/oauth/start");
    assert(upstoxOAuthStart.response.status === 200, "Upstox OAuth start should return an authorize URL");
    assert(upstoxOAuthStart.body.authorize_url.startsWith("https://api.upstox.com/v2/login/authorization/dialog?"), "Upstox OAuth start should use the official dialog endpoint");
    assert(upstoxOAuthStart.body.authorize_url.includes(encodeURIComponent(`${BASE}/api/upstox/callback`)), "Upstox OAuth start should include the callback URL");

    const tokenSave = await request("/api/upstox/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ access_token: "smoke-upstox-token", expires_in: 3600 })
    });
    assert(tokenSave.response.status === 200, "Upstox token paste should save");
    assert(tokenSave.body.status.token_visible === true, "saved Upstox token should be visible as presence only");
    assert(tokenSave.body.status.token_source === "manual_paste", "saved Upstox token should record manual source");
    assert(!JSON.stringify(tokenSave.body).includes("smoke-upstox-token"), "Upstox token must never be printed");

    const upstoxStatusAfter = await request("/api/upstox/status");
    assert(upstoxStatusAfter.body.status.token_visible === true, "Upstox status should detect saved token");
    assert(upstoxStatusAfter.body.status.token_source === "manual_paste", "Upstox status should read token from store");

    console.log(JSON.stringify({ ok: true, checks: ["mongo-file-fallback", "data-bank-status", "scan-ledger", "saved-universe-scanner", "scanner-parameters", "scanner-proof-row", "scanner-correlation-gate", "parameter-tunnel-175", "paper-engine-real-quote-fill", "upstox-guard", "paper-engine-status", "paper-engine-guard", "q1-status", "q1-upload", "q1-render-guard", "upstox-oauth-start", "upstox-token-paste"] }));
  } finally {
    await Promise.all([...Q1_INPUTS, STATE_FILE, SCAN_LEDGER_FILE, UPSTOX_AUTH_FILE].map((file) => fs.unlink(file).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    })));
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exitCode = 1;
});
