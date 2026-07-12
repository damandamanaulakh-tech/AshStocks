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

async function main() {
  globalThis.__ASH_STOCK_ENV = {
    ...process.env,
    UPSTOX_API_KEY: "",
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

  const correlationScan = runScanner(
    [{ symbol: "CORRCAND", name: "Correlation Candidate", sector: "Test", candles: proofCandles(0) }],
    { holdings: [{ symbol: "HOLDING", name: "Existing Holding", sector: "Test", candles: proofCandles(0) }] }
  );
  assert(correlationScan.rows[0].decision === "BLOCKED", "over-correlated candidate should be blocked");
  assert(correlationScan.rows[0].gates.correlation === false, "correlation gate should fail for identical return series");

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
    assert(paperStatus.body.status.slots_ist.includes("09:20"), "paper-engine should expose IST schedule");

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

    console.log(JSON.stringify({ ok: true, checks: ["mongo-file-fallback", "data-bank-status", "scan-ledger", "saved-universe-scanner", "scanner-parameters", "scanner-proof-row", "scanner-correlation-gate", "upstox-guard", "paper-engine-status", "paper-engine-guard", "q1-status", "q1-upload", "q1-render-guard"] }));
  } finally {
    await Promise.all([...Q1_INPUTS, STATE_FILE, SCAN_LEDGER_FILE].map((file) => fs.unlink(file).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    })));
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exitCode = 1;
});
