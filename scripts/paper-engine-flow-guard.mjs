import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { Readable } from "node:stream";
import { OFFICIAL_NSE_EQUITY_URL, OFFICIAL_NSE_MASTER_URL, OFFICIAL_NSE_SUSPENDED_URL } from "../lib/official-nse-master.mjs";

// No provider, production store or listening socket is used by this guard.
const originalCwd = process.cwd();
const nativeFetch = globalThis.fetch;
const NativeDate = Date;
let clock = Date.parse("2026-09-21T04:30:00Z");
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
};
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "ashstocks-paper-flow-"));
process.chdir(temp);
globalThis.__ASH_STOCK_ENV = {
  NODE_ENV: "test", REQUIRE_AUTH: "false", REQUIRE_DB: "false",
  MONGODB_URI: "", MONGO_URI: "", MONGO_URL: "", DATABASE_URL: "",
  DISABLE_DATA_BANK_AUTO_BOOTSTRAP: "true", DISABLE_PAPER_ENGINE_SCHEDULER: "true",
  DISABLE_PAPER_ENGINE_AUTOBUY: "true", UPSTOX_ACCESS_TOKEN: "isolated-flow-token",
  UPSTOX_SCAN_LIMIT: "2"
};
const rows = (count) => Array.from({ length: count }, (_, index) => ({
  symbol: `FLOW${index}`, name: `Flow Test ${index}`, isin: `INE${String(index).padStart(9, "0")}`,
  instrument_key: `NSE_EQ|INE${String(index).padStart(9, "0")}`, exchange: "NSE"
}));
let master = rows(5);
let historicalCalls = 0;
let failAll = false;
let holdNext = false;
let signalHeld;
let releaseHeld;
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const candles = () => Array.from({ length: 253 }, (_, index) => {
  const close = 100 + index;
  return [new Date(clock - (252 - index) * 86400000).toISOString(), close * 0.99, close * 1.01, close * 0.98, close, 800000];
});
globalThis.fetch = async (input) => {
  const url = String(input);
  if (url === OFFICIAL_NSE_EQUITY_URL) return new Response("SYMBOL,NAME OF COMPANY,SERIES,DATE OF LISTING,PAID UP VALUE,MARKET LOT,ISIN NUMBER,FACE VALUE\r\n" + master.map((row) => [row.symbol, row.name, "EQ", "01-JAN-2020", 10, 1, row.isin, 10].join(",")).join("\r\n") + "\r\n", { headers: { "last-modified": new Date().toUTCString() } });
  if (url === OFFICIAL_NSE_MASTER_URL) return json(master.map((row) => ({ ...row, trading_symbol: row.symbol, segment: "NSE_EQ", instrument_type: "EQ" })));
  if (url === OFFICIAL_NSE_SUSPENDED_URL) return json([]);
  if (url.includes("/historical-candle/")) {
    historicalCalls += 1;
    if (holdNext) { holdNext = false; signalHeld(); await new Promise((resolve) => { releaseHeld = resolve; }); }
    return failAll ? json({ error: "isolated-history-failure" }, 503) : json({ status: "success", data: { candles: candles() } });
  }
  if (url.startsWith("https://api.upstox.com/")) return json({ status: "success", data: [] });
  throw new Error(`Unmocked upstream prohibited: ${url}`);
};
try {
  const { createServer } = await import("../server.js");
  const server = createServer();
  const call = (url, method = "GET", body) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Route timed out (possible nested lock): ${url}`)), 5000);
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { url, method, headers: { host: "localhost", "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" } });
    const res = { statusCode: 200, headersSent: false,
      writeHead(status) { this.statusCode = status; this.headersSent = true; }, setHeader() {},
      end(value) { clearTimeout(timeout); try { resolve({ status: this.statusCode, body: JSON.parse(String(value || "{}")) }); } catch (error) { reject(error); } }
    };
    Promise.resolve(server.listeners("request")[0](req, res)).catch((error) => { clearTimeout(timeout); reject(error); });
  });
  const post = (url, body = {}) => call(url, "POST", body);
  const state = async () => (await call("/api/state")).body.state;
  const engine = async () => {
    const result = await post("/api/paper-engine/run");
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.scan.ok, true);
    assert.equal(result.body.safety.broker_write_enabled, false);
    return result.body;
  };
  assert.equal((await post("/api/data-bank/load-upstox-nse")).body.saved_universe, 5);
  const before = await state();
  const seen = [];
  for (const attempted of [2, 4, 5]) {
    const result = await engine();
    assert.equal(result.scan.rotation.attempted, attempted);
    assert.equal((await state()).scannerRotation.intraday.offset, attempted, "Final paper save must retain committed cursor");
    assert.equal(result.scan_cache_used, false);
    seen.push(...result.scan.rows.map((row) => row.symbol));
  }
  assert.equal(new Set(seen).size, 5, "Unattended engine covers every saved identity without repeating first batch");
  assert.deepEqual((await state()).scannerSettings, before.scannerSettings);
  assert.deepEqual((await state()).paperTrader.positions, before.paperTrader.positions);

  const ui = await post("/api/scanner/next-batch");
  const callsBeforeReuse = historicalCalls;
  const reused = await engine();
  assert.equal(reused.scan_cache_used, true);
  assert.deepEqual(reused.scan.rows, ui.body.rows);
  assert.equal(historicalCalls, callsBeforeReuse, "A committed dashboard batch may be consumed without duplicate fetches");
  const next = await engine();
  assert.equal(next.scan_cache_used, false);
  assert.equal(next.scan.rotation.attempted, 4, "Already consumed batch must not stall rotation");

  await post("/api/scanner/run", { universe: [{ symbol: "ADHOC", instrument_key: "NSE_EQ|INE999999999", candles: candles() }] });
  const afterAdhoc = await engine();
  assert.equal(afterAdhoc.scan.rows.some((row) => row.symbol === "ADHOC"), false, "An arbitrary manual scan cannot authorize automatic tickets");

  await post("/api/scanner/next-batch");
  const formulas = (await call("/api/settings/formulas")).body;
  assert.equal((await post("/api/settings/formulas", { expected_revision: formulas.revision, settings: { minScoreSelect: 75 }, reason: "Isolated paper flow regression" })).status, 200);
  const newSettings = await engine();
  assert.equal(newSettings.scan_cache_used, false);
  assert.equal(newSettings.scan.settings.minScoreSelect, 75);
  assert.equal(newSettings.scan.settingsRevision, formulas.revision + 1);
  assert.equal(newSettings.scan.rotation.batch_start, 0);

  await post("/api/scanner/next-batch");
  clock += 301000;
  assert.equal((await engine()).scan_cache_used, false, "Expired scans cannot be executed");
  await post("/api/scanner/next-batch");
  clock -= 60000;
  assert.equal((await engine()).scan_cache_used, false, "Future-dated scans cannot be executed");

  await post("/api/scanner/next-batch");
  master = rows(6);
  await post("/api/data-bank/load-upstox-nse");
  const refreshed = await engine();
  assert.equal(refreshed.scan_cache_used, false);
  assert.equal(refreshed.scan.rotation.total, 6);
  assert.equal(refreshed.scan.rotation.batch_start, 0);

  await post("/api/scanner/next-batch");
  const changedHoldings = await state();
  changedHoldings.paperTrader.positions = [{ symbol: "HELD", instrument_key: "NSE_EQ|INE999999999", qty: 10, entry_price: 100, current_price: 100, status: "OPEN" }];
  assert.equal((await call("/api/state", "PUT", changedHoldings)).status, 200);
  const rescannedHoldings = await engine();
  assert.equal(rescannedHoldings.scan_cache_used, false, "Changed holdings invalidate the prior correlation context");
  assert.equal(rescannedHoldings.scan.holding_history.loaded, 1);

  await post("/api/scanner/next-batch");
  const changedIdentity = await state();
  changedIdentity.universe = rows(7);
  // Non-production fixture deliberately keeps the same revision to exercise
  // the identity fingerprint independently of the normal importer revision.
  assert.equal((await call("/api/state", "PUT", changedIdentity)).status, 200);
  const rescannedIdentity = await engine();
  assert.equal(rescannedIdentity.scan_cache_used, false);
  assert.equal(rescannedIdentity.scan.rotation.total, 7);
  assert.equal(rescannedIdentity.scan.rotation.batch_start, 0);
  const clearTestHolding = await state();
  clearTestHolding.paperTrader.positions = [];
  assert.equal((await call("/api/state", "PUT", clearTestHolding)).status, 200);

  holdNext = true;
  const held = new Promise((resolve) => { signalHeld = resolve; });
  const uiInFlight = post("/api/scanner/next-batch");
  await held;
  try {
    const busy = await post("/api/paper-engine/run");
    assert.equal(busy.status, 409, "Engine must not wait on a batch that needs its state lock");
    assert.equal(busy.body.error, "universe_batch_busy");
  } finally { releaseHeld(); }
  assert.equal((await uiInFlight).status, 200);
  await engine(); // Consume the successfully committed UI batch.
  const failedOffset = (await state()).scannerRotation.intraday.offset;
  failAll = true;
  const failed = await post("/api/paper-engine/run");
  assert.equal(failed.status, 409);
  assert.equal(failed.body.error, "all_batch_fetches_failed");
  assert.equal((await state()).scannerRotation.intraday.offset, failedOffset);
  failAll = false;

  // Candidate diagnostics reflect existing policy; they do not authorize fills.
  const runtimeFiles = await fs.readdir(path.join(temp, ".ashstocks-runtime-server"));
  const source = await fs.readFile(path.join(temp, ".ashstocks-runtime-server", runtimeFiles[0]), "utf8");
  const fn = source.match(/function paperEngineCandidateBlockers\([\s\S]*?\n\}/)?.[0];
  assert.ok(fn);
  const ctx = vm.createContext({
    paperEngineOpenSymbols: (s) => new Set((s.paperTrader.positions || []).map((row) => row.symbol)),
    sanitizePaperTraderState: (s) => ({ positions: [], gtt: [], ...s }),
    paperLifecycleFunds: (s) => ({ buying_power: s.buying_power ?? 50000000 }),
    unique: (a) => [...new Set(a)], normalizeSymbol: (s) => s, finiteOr: (n, d) => Number.isFinite(n) ? n : d,
    PAPER_CAPITAL_POLICY: { maximumOpenPositions: 500, minimumEntryValue: 100000 }, paperTransactionCost: (n) => n * 0.0008
  });
  vm.runInContext(fn, ctx);
  const blockers = (trader, settings, rows, kelly = {}) => ctx.paperEngineCandidateBlockers({ paperTrader: trader }, { enabled: true, requireScannerDecision: "SELECT", ...settings }, { rows }, [], kelly).map((b) => b.code);
  const selected = [{ symbol: "A", decision: "SELECT" }];
  assert.ok(blockers({}, {}, []).includes("no_selected_candidates"));
  assert.ok(blockers({}, { enabled: false }, selected).includes("autobuy_disabled"));
  assert.ok(blockers({}, {}, selected, { blockNewEntries: true, status: "BLOCKED" }).includes("kelly_blocked"));
  assert.ok(blockers({ buying_power: 100000 }, {}, selected).includes("insufficient_buying_power"), "Minimum entry alone is not enough without transaction cost");
  assert.ok(blockers({ positions: [{ symbol: "A" }] }, {}, selected).includes("already_open"));
  assert.ok(blockers({ gtt: Array.from({ length: 500 }, () => ({ side: "BUY", status: "ACTIVE" })) }, {}, selected).includes("position_capacity"));
  console.log("Paper engine flow guard passed: complete rotation, trusted one-use cache, revision/time invalidation, no ad-hoc execution, concurrency, cursor preservation, failed-feed retry and explicit capacity reasons.");
} finally {
  globalThis.fetch = nativeFetch;
  globalThis.Date = NativeDate;
  delete globalThis.__ASH_STOCK_ENV;
  process.chdir(originalCwd);
}
