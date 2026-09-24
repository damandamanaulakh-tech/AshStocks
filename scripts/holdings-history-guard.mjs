import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { Readable } from "node:stream";
import { applyHoldingsHistoryPatches } from "../server-holdings-history-patch.mjs";

// Run the production hydrator against the real, unchanged correlation formula.
// Provider responses are fixtures only; no live credentials or data are used.
const base = await fs.readFile(new URL("../vendor/base-server-37a9e9ceacabd33bc5a2085ad621e368f8fc0cd8.mjs", import.meta.url), "utf8");
const extractFunction = (name) => {
  const start = base.indexOf("function " + name + "(");
  assert.ok(start >= 0, "Missing production function: " + name);
  const headerEnd = base.indexOf("\n", start);
  const bodyStart = base.lastIndexOf("{", headerEnd);
  let depth = 1;
  let end = bodyStart + 1;
  while (depth && end < base.length) {
    if (base[end] === "{") depth += 1;
    if (base[end] === "}") depth -= 1;
    end += 1;
  }
  return base.slice(start, end);
};
const mustReplace = (source, search, replacement, label) => {
  assert.ok(source.includes(search), "Patch anchor missing: " + label);
  return source.replace(search, replacement);
};
const fixtureSource = '\nfunction fixtureEvaluate(row, holdings, settings) {\n  const correlation = correlationGate(row, holdings, settings.correlationThreshold);\n  return correlation;\n}\nasync function runUpstoxScanner(body = {}, fallbackUniverse = null) {\n  const scan = runScanner(fetchedRows, { ...(body.settings || {}), source: "Upstox historical candles", holdings: body.holdings || body.existingHoldings || [], cacheScan: body.cacheScan !== false });\n}';
const generated = applyHoldingsHistoryPatches(fixtureSource, mustReplace);
const helpers = ["finiteOr", "normalizeSymbol", "normalizeScannerRows", "normalizeScannerRow", "numericValue", "normalizeVol", "parseBoolean", "normalizeCandles", "correlationGate", "correlateReturnSeries", "returnsByDate", "pearson", "average", "round"].map(extractFunction).join("\n");
const candleRows = (held = false) => Array.from({ length: 253 }, (_, index) => {
  const close = held ? 200 + index * 0.5 + Math.cos(index) * 10 : 100 + index + Math.sin(index) * 2;
  return { date: new Date(Date.UTC(2026, 0, index + 1)).toISOString(), open: close * 0.99, high: close * 1.01, low: close * 0.98, close, volume: 800000 };
});
let savedUniverse = [{ symbol: "ZZHELD", instrument_key: "NSE_EQ|INEHOLD00001" }];
let providerFails = false;
let inflight = 0;
let maxInflight = 0;
const calls = [];
const context = vm.createContext({
  Date, Map, Set, Math, Promise, Number, String, Array, Object, JSON, setTimeout,
  MAX_UNIVERSE_ROWS: 5000, ENV: { UPSTOX_SCAN_PACE_MS: "0" },
  getStore: async () => ({ getState: async () => ({ universe: savedUniverse }) }),
  fetchUpstoxCandles: async (key) => {
    calls.push(key);
    inflight += 1;
    maxInflight = Math.max(maxInflight, inflight);
    await new Promise((resolve) => setTimeout(resolve, 1));
    inflight -= 1;
    if (providerFails) throw new Error("isolated_history_unavailable");
    return candleRows(true);
  },
});
vm.runInContext(helpers + "\n" + generated, context);
const hydrate = async (holdings, fetched = []) => {
  context.inputHoldings = holdings;
  context.fetched = fetched;
  return vm.runInContext('hydrateScannerHoldings(inputHoldings, fetched, "2025-01-01", "2026-09-21")', context);
};
const originalHolding = { symbol: "ZZHELD", qty: 10, entry_price: 123, status: "OPEN" };
const originalSnapshot = structuredClone(originalHolding);
let result = await hydrate([originalHolding]);
assert.equal(result.metadata.requested, 1);
assert.equal(result.metadata.loaded, 1);
assert.equal(result.metadata.fetched, 1);
assert.equal(result.holdings[0].instrument_key, "NSE_EQ|INEHOLD00001");
assert.deepEqual(originalHolding, originalSnapshot, "Hydration must not mutate a persisted position");
context.candidate = { symbol: "CANDIDATE", candles: candleRows() };
context.holdings = result.holdings;
assert.equal(vm.runInContext("correlationGate(candidate, holdings, 0.85).status", context), "pass");

calls.length = 0;
result = await hydrate([{ ...originalHolding, instrument_key: "NSE_EQ|INEHOLD00001" }], [{ symbol: "RENAMED", instrument_key: "NSE_EQ|INEHOLD00001", candles: candleRows(true) }]);
assert.equal(result.metadata.reused, 1);
assert.equal(calls.length, 0, "Exact instrument identity can reuse an already fetched batch history");
result = await hydrate([{ ...originalHolding, instrument_key: "NSE_EQ|INEHOLD00001" }], [{ symbol: "ZZHELD", instrument_key: "NSE_EQ|INEDIFFERENT", candles: candleRows() }]);
assert.equal(result.metadata.fetched, 1, "Same symbol with a different instrument must not reuse history");
result = await hydrate([{ ...originalHolding, instrument_key: "NSE_EQ|INEHOLD00001" }], [{ symbol: "ZZHELD", instrument_key: "NSE_EQ|INEHOLD00001", candles: candleRows(true).slice(0, 30) }]);
assert.equal(result.metadata.loaded, 0);
assert.equal(result.metadata.failures[0].reason, "holding_history_insufficient", "Incomplete return windows are not successful holding hydration");

result = await hydrate([{ symbol: "UNKNOWN", candles: candleRows(true) }]);
assert.equal(result.holdings.length, 1, "A bad holding must never disappear from correlation input");
assert.equal(result.metadata.loaded, 0);
assert.equal(result.metadata.failures[0].reason, "holding_instrument_key_missing");
context.holdings = result.holdings;
assert.equal(vm.runInContext("correlationGate(candidate, holdings, 0.85).data_needed", context), true);
providerFails = true;
result = await hydrate([originalHolding]);
assert.equal(result.metadata.loaded, 0);
assert.match(result.metadata.failures[0].reason, /holding_history_fetch_failed: isolated_history_unavailable/);
context.holdings = result.holdings;
assert.equal(vm.runInContext("correlationGate(candidate, holdings, 0.85).data_needed", context), true);
providerFails = false;

result = await hydrate([{ symbol: "ZZHELD", instrument_key: "BSE_EQ|INEHOLD00001" }]);
assert.equal(result.metadata.failures[0].reason, "holding_instrument_identity_invalid");
savedUniverse.push({ symbol: "ZZHELD", instrument_key: "NSE_EQ|INEOTHER0001" });
result = await hydrate([originalHolding]);
assert.equal(result.metadata.failures[0].reason, "holding_instrument_key_ambiguous");
savedUniverse.pop();
calls.length = 0;
result = await hydrate(Array.from({ length: 7 }, (_, index) => ({ symbol: "HELD" + index, instrument_key: "NSE_EQ|INEHELD" + index })));
assert.equal(result.metadata.loaded, 7);
assert.equal(maxInflight, 2, "Extra holding history requests must have bounded concurrency");
calls.length = 0;
result = await hydrate([{ ...originalHolding, instrument_key: "NSE_EQ|INEHOLD00001" }, { ...originalHolding, instrument_key: "NSE_EQ|INEHOLD00001" }]);
assert.equal(result.metadata.loaded, 2);
assert.equal(calls.length, 1, "Duplicate identities must share their provider request");

// Price count alone does not prove a usable pair: overlap, unique dates and
// nonzero return variance remain governed by the original production helper.
const candidate = { symbol: "CANDIDATE", instrument_key: "NSE_EQ|INECAND00001", candles: candleRows() };
const goodHolding = { symbol: "GOOD", instrument_key: "NSE_EQ|INEGOOD0001", candles: candleRows(true) };
const unavailableHistories = {
  nonoverlap: candleRows(true).slice(0, 60).map((row) => ({ ...row, date: row.date.replace("2026", "2025") })),
  constant: candleRows(true).map((row) => ({ ...row, close: 100 })),
  duplicate_dates: candleRows(true).slice(0, 60).map((row, index) => ({ ...row, date: candleRows(true)[index % 20].date })),
  short_overlap: [...candleRows(true).slice(0, 25), ...candleRows(true).slice(25, 60).map((row) => ({ ...row, date: row.date.replace("2026", "2025") }))]
};
for (const [name, candles] of Object.entries(unavailableHistories)) {
  context.candidate = candidate;
  context.holdings = [goodHolding, { symbol: "MISSING", instrument_key: "NSE_EQ|INEMISSING1", candles: normalizeForTest(candles) }];
  assert.equal(vm.runInContext("correlationGate(candidate, holdings, 0.85).status", context), "pass", name + ": reproduces the formerly skipped comparison");
  const gated = vm.runInContext("fixtureEvaluate(candidate, holdings, { correlationThreshold: 0.85 })", context);
  assert.equal(gated.status, "data_needed", name);
  assert.equal(gated.ok, false);
  assert.equal(gated.missing_holdings.length, 1);
  assert.equal(gated.missing_holdings[0].symbol, "MISSING");
  assert.equal(gated.missing_holdings[0].instrument_key, "NSE_EQ|INEMISSING1");
  assert.equal(gated.missing_holdings[0].reason, "holding_return_series_not_comparable");
}
function normalizeForTest(candles) {
  context.normalizeInput = candles;
  return vm.runInContext("normalizeCandles(normalizeInput)", context);
}
for (const holdings of [[], [candidate], [goodHolding], [goodHolding, { symbol: "CORRELATED", candles: candleRows() }]]) {
  context.candidate = candidate;
  context.holdings = holdings;
  assert.deepEqual(vm.runInContext("completeHoldingCorrelationGate(candidate, holdings, 0.85)", context),
    vm.runInContext("correlationGate(candidate, holdings, 0.85)", context), "Comparable inputs and no-holding/self-only behavior retain the exact governed result");
}
console.log("Holding history unit checks passed: identity, bounded hydration, fail-closed comparability and unchanged complete-input correlation results.");

// Exercise the fully patched runtime through request handlers, without sockets.
const originalCwd = process.cwd();
const nativeFetch = globalThis.fetch;
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "ashstocks-holding-history-"));
process.chdir(temp);
globalThis.__ASH_STOCK_ENV = { NODE_ENV: "test", REQUIRE_AUTH: "false", REQUIRE_DB: "false",
  DISABLE_DATA_BANK_AUTO_BOOTSTRAP: "true", DISABLE_PAPER_ENGINE_SCHEDULER: "true",
  DISABLE_PAPER_ENGINE_AUTOBUY: "true", UPSTOX_ACCESS_TOKEN: "isolated-test-only",
  UPSTOX_SCAN_LIMIT: "2", UPSTOX_SCAN_PACE_MS: "0" };
const historicalKeys = [];
let failHolding = false;
let nonoverlappingHolding = false;
globalThis.fetch = async (input) => {
  const url = String(input);
  if (url.includes("/historical-candle/")) {
    const key = decodeURIComponent(url.split("/historical-candle/")[1].split("/")[0]);
    historicalKeys.push(key);
    if (failHolding && key === "NSE_EQ|INEFAIL00001") return new Response("isolated_holding_outage", { status: 503 });
    const history = nonoverlappingHolding && key === "NSE_EQ|INEFAIL00001"
      ? unavailableHistories.nonoverlap : candleRows(key === "NSE_EQ|INEHOLD00001");
    const candles = history.map((row) => [row.date, row.open, row.high, row.low, row.close, row.volume]);
    return new Response(JSON.stringify({ status: "success", data: { candles } }), { headers: { "content-type": "application/json" } });
  }
  if (url.includes("suspended-instrument.json")) return new Response("[]", { headers: { "content-type": "application/json" } });
  if (url.startsWith("https://api.upstox.com/")) return new Response(JSON.stringify({ status: "success", data: [] }), { headers: { "content-type": "application/json" } });
  throw new Error("Unexpected upstream in holding history guard: " + url);
};
let server;
try {
  const { createServer } = await import("../server.js");
  server = createServer();
  const call = (url, method = "GET", body) => new Promise((resolve, reject) => {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { url, method, headers: { host: "localhost", "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" } });
    const timer = setTimeout(() => reject(new Error("Route timed out: " + url)), 10000);
    let status = 200;
    const headers = {};
    const res = { setHeader(name, value) { headers[name] = value; }, getHeader(name) { return headers[name]; },
      writeHead(code, extra) { status = code; Object.assign(headers, extra); },
      end(value) { clearTimeout(timer); try { resolve({ status, body: JSON.parse(String(value)) }); } catch (error) { reject(error); } } };
    Promise.resolve(server.listeners("request")[0](req, res)).catch((error) => { clearTimeout(timer); reject(error); });
  });
  const state = (await call("/api/state")).body.state;
  state.universe = ["AACANDIDATE", "BBCANDIDATE", "CCCANDIDATE"].map((symbol, index) => ({ symbol, name: symbol, instrument_key: "NSE_EQ|INECAND" + index, exchange: "NSE" }));
  state.universe.push({ symbol: "ZZHELD", name: "Held Company", instrument_key: "NSE_EQ|INEHOLD00001", exchange: "NSE" });
  state.paperTrader.positions = [{ ...originalHolding, instrument_key: "NSE_EQ|INEHOLD00001", current_price: 123 }];
  assert.equal((await call("/api/state", "PUT", state)).status, 200);
  const ledgerBefore = (await call("/api/state")).body.state.paperTrader;
  const batch = await call("/api/scanner/next-batch", "POST", {});
  assert.equal(batch.status, 200, JSON.stringify(batch.body));
  assert.equal(batch.body.scanned, 2);
  assert.equal(batch.body.holding_history.requested, 1);
  assert.equal(batch.body.holding_history.loaded, 1);
  assert.equal(batch.body.holding_history.fetched, 1);
  assert.ok(historicalKeys.includes("NSE_EQ|INEHOLD00001"), "Held stock outside the candidate batch must receive a historical lookup");
  assert.ok(batch.body.rows.every((row) => row.correlation.status === "pass"), JSON.stringify(batch.body.rows.map((row) => row.correlation)));
  assert.deepEqual((await call("/api/state")).body.state.paperTrader, ledgerBefore, "History hydration must not rewrite holdings or the paper ledger");
  const mixedState = (await call("/api/state")).body.state;
  mixedState.paperTrader.positions.push({ symbol: "ZZFAIL", qty: 10, entry_price: 123, current_price: 123, status: "OPEN", instrument_key: "NSE_EQ|INEFAIL00001" });
  assert.equal((await call("/api/state", "PUT", mixedState)).status, 200);
  // Baseline an already-persisted, normalized ledger. The legacy successful
  // engine save normalizes absent numeric fields again; that is not hydration.
  assert.equal((await call("/api/state", "PUT", (await call("/api/state")).body.state)).status, 200);
  const beforeFailure = (await call("/api/state")).body.state;
  failHolding = true;
  const incomplete = await call("/api/scanner/next-batch", "POST", {});
  assert.equal(incomplete.status, 409);
  assert.equal(incomplete.body.error, "holding_history_incomplete");
  assert.equal(incomplete.body.holding_history.loaded, 1);
  assert.equal(incomplete.body.holding_history.failures.length, 1);
  assert.deepEqual(incomplete.body.rows, [], "Partial portfolio history cannot authorize SELECT rows");
  globalThis.__ASH_STOCK_ENV.DISABLE_PAPER_ENGINE_AUTOBUY = "false";
  const noBuy = await call("/api/paper-engine/run", "POST", {});
  assert.equal(noBuy.status, 409);
  assert.equal(noBuy.body.error, "holding_history_incomplete");
  const afterFailure = (await call("/api/state")).body.state;
  assert.deepEqual(afterFailure.scannerRotation, beforeFailure.scannerRotation, "Incomplete history cannot consume a batch");
  assert.deepEqual(afterFailure.paperTrader, beforeFailure.paperTrader, "Incomplete history cannot create paper orders or rewrite holdings");
  failHolding = false;
  nonoverlappingHolding = true;
  const incompletePairs = await call("/api/scanner/next-batch", "POST", {});
  assert.equal(incompletePairs.status, 200, JSON.stringify(incompletePairs.body));
  assert.equal(incompletePairs.body.holding_history.loaded, 2);
  assert.ok(incompletePairs.body.rows.every((row) => row.decision === "DATA_NEEDED" && row.correlation.data_needed), "Unusable holding pairs cannot become SELECT despite all provider reads succeeding");
  assert.ok(incompletePairs.body.rows.every((row) => row.correlation.missing_holdings.some((holding) => holding.instrument_key === "NSE_EQ|INEFAIL00001")), "Runtime evidence identifies the incomparable held instrument");
  assert.ok(incompletePairs.body.rotation.attempted > beforeFailure.scannerRotation.intraday.offset, "Pair-specific DATA_NEEDED rows do not stall full-universe rotation");
  const noComparableBuy = await call("/api/paper-engine/run", "POST", {});
  assert.equal(noComparableBuy.status, 200, JSON.stringify(noComparableBuy.body));
  assert.equal(noComparableBuy.body.auto_buy.enabled, true);
  assert.equal(noComparableBuy.body.auto_buy.selected_in_scan, 0);
  assert.equal(noComparableBuy.body.auto_buy.candidates_ready, 0);
  assert.equal(noComparableBuy.body.auto_buy.orders_filled, 0);
  const afterPairs = (await call("/api/state")).body.state;
  assert.deepEqual(afterPairs.paperTrader.positions, beforeFailure.paperTrader.positions);
  assert.deepEqual(afterPairs.paperTrader.orders, beforeFailure.paperTrader.orders);
  console.log("Holding history runtime checks passed: missing feeds preserve cursor/ledger; incomparable holding pairs produce DATA_NEEDED, permit rotation and prevent automatic tickets.");
} finally {
  server?.close();
  globalThis.fetch = nativeFetch;
  delete globalThis.__ASH_STOCK_ENV;
  process.chdir(originalCwd);
}
