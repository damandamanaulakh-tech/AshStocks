import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { Readable } from "node:stream";
import { planUniverseBatch, completeUniverseBatch, sanitizeUniverseRotation } from "../lib/universe-rotation.mjs";
import { OFFICIAL_NSE_EQUITY_URL, OFFICIAL_NSE_MASTER_URL, OFFICIAL_NSE_SUSPENDED_URL } from "../lib/official-nse-master.mjs";

const now = "2026-09-08T05:00:00.000Z";
const makeRows = (count) => Array.from({ length: count }, (_, index) => ({
  symbol: `STOCK${String(index).padStart(4, "0")}`, name: `Test Company ${index}`,
  instrument_key: `NSE_EQ|INE${String(index).padStart(9, "0")}`, isin: `INE${String(index).padStart(9, "0")}`, exchange: "NSE"
}));
const scanResult = (plan, failures = []) => ({ ok: true, scanned: plan.rows.length, failures, summary: { WATCH: plan.rows.length - failures.length, DATA_NEEDED: failures.length } });

let rotation = {};
const covered = [];
let last;
for (let batch = 0; batch < 12; batch += 1) {
  const plan = planUniverseBatch({ universe: makeRows(2361), rotation, now });
  assert.equal(plan.start, batch * 200);
  covered.push(...plan.rows.map((row) => row.symbol));
  last = completeUniverseBatch(plan, scanResult(plan), now);
  rotation = sanitizeUniverseRotation({ intraday: last.progress });
}
assert.equal(covered.length, 2361);
assert.equal(new Set(covered).size, 2361, "No duplicate names before exhausting the universe");
assert.equal(last.view.batch_count, 161);
assert.equal(last.view.complete, true);
assert.equal(last.view.remaining, 0);
const nextCycle = planUniverseBatch({ universe: makeRows(2361), rotation, now });
assert.equal(nextCycle.start, 0);
assert.equal(nextCycle.progress.cycle, 2);

const first = planUniverseBatch({ universe: makeRows(2400), now, limit: 200 });
const progress = completeUniverseBatch(first, scanResult(first, [first.rows[0]]), now);
const persisted = JSON.parse(JSON.stringify({ intraday: progress.progress }));
assert.equal(planUniverseBatch({ universe: makeRows(2400).reverse(), rotation: persisted, now }).start, 200, "Source order must not reset coverage");
assert.equal(planUniverseBatch({ universe: makeRows(2401), rotation: persisted, now }).start, 0, "A changed universe resets coverage");
assert.equal(planUniverseBatch({ universe: makeRows(2400), rotation: persisted, now, revision: 1 }).start, 0, "Explicit master refresh resets coverage");
assert.equal(planUniverseBatch({ universe: makeRows(2400), rotation: persisted, now: "2026-09-08T19:00:00Z" }).start, 0, "IST next day resets coverage");
assert.equal(planUniverseBatch({ universe: makeRows(2400), rotation: persisted, now, horizon: "swing" }).start, 0, "Horizons have independent progress");
assert.equal(progress.view.failed_count, 1);
assert.equal(progress.view.attempted, 200);
assert.throws(() => completeUniverseBatch(first, { ok: false }), /failed scan/);
assert.throws(() => completeUniverseBatch(first, { ...scanResult(first), scanned: 199 }), /count_mismatch/);
assert.throws(() => completeUniverseBatch(first, scanResult(first, first.rows)), /all_batch_fetches_failed/);
assert.equal(planUniverseBatch({ universe: [...makeRows(2), ...makeRows(2), { symbol: "BAD", instrument_key: "BSE_EQ|OTHER" }], now }).total, 2);
assert.equal(planUniverseBatch({ universe: makeRows(2400), now, limit: 5000 }).rows.length, 200);
assert.equal(planUniverseBatch({ universe: makeRows(2400), now, limit: 60 }).rows.length, 60);
assert.equal(planUniverseBatch({ universe: [], now }).rows.length, 0);
assert.deepEqual(sanitizeUniverseRotation({ arbitrary: {} }), {});
console.log("Rotation unit checks passed: all 2,361 symbols covered in 12 disjoint batches.");

const nodes = new Map();
const browserContext = vm.createContext({
  console, Date, Intl, Set, Map, Promise,
  document: { addEventListener() {}, querySelectorAll: () => [], getElementById: (id) => {
    if (!nodes.has(id)) nodes.set(id, { disabled: false, textContent: "", className: "" });
    return nodes.get(id);
  } }, window: {},
});
vm.runInContext(await fs.readFile(new URL("../app.js", import.meta.url), "utf8"), browserContext);
await vm.runInContext(`
globalThis.calls = 0;
refreshScan = async () => {
  calls += 1;
  state.rotation = { key: "cycle-key", cycle: 1, attempted: Math.min(calls * 200, 2361), total: 2361, complete: calls === 12 };
  return { rotation: state.rotation };
};
scanFullUniverse();`, browserContext);
assert.equal(vm.runInContext("calls", browserContext), 12);
assert.equal(vm.runInContext("state.fullScanRunning", browserContext), false);
await vm.runInContext(`
calls = 0;
refreshScan = async () => {
  calls += 1;
  state.rotation = { key: "cycle-key", cycle: 1, attempted: calls * 200, total: 2361, complete: false };
  if (calls === 2) await scanFullUniverse();
  return { rotation: state.rotation };
};
scanFullUniverse();`, browserContext);
assert.equal(vm.runInContext("calls", browserContext), 2, "Pause must finish the current batch and stop");
assert.match(nodes.get("noticeLine").textContent, /paused after 400\/2361/);
assert.equal(nodes.get("scanAllBtn").disabled, false);
await vm.runInContext("refreshScan = async () => null; scanFullUniverse();", browserContext);
assert.equal(vm.runInContext("state.fullScanRunning", browserContext), false, "Failed scan releases UI controls");
console.log("Rotation UI checks passed: sequential full sweep, pause-after-batch and failure cleanup.");

// Isolate all runtime/generated files and mock every upstream; never use live credentials or data.
const originalCwd = process.cwd();
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "ashstocks-rotation-guard-"));
process.chdir(temp);
globalThis.__ASH_STOCK_ENV = {
  NODE_ENV: "test", REQUIRE_AUTH: "false", REQUIRE_DB: "false",
  DISABLE_DATA_BANK_AUTO_BOOTSTRAP: "true", DISABLE_PAPER_ENGINE_SCHEDULER: "true",
  DISABLE_PAPER_ENGINE_AUTOBUY: "true", UPSTOX_ACCESS_TOKEN: "rotation-test-token",
  UPSTOX_SCAN_LIMIT: "2", UPSTOX_SCAN_PACE_MS: "0"
};
const nativeFetch = globalThis.fetch;
let failAll = false;
let failOne = false;
let holdNext = false;
let signalHeld;
let releaseHeld;
let masterRows = makeRows(5);
let membershipRows = makeRows(5);
const upstreamSymbols = [];
const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const equityResponse = () => new Response("SYMBOL, NAME OF COMPANY, SERIES, DATE OF LISTING, PAID UP VALUE, MARKET LOT, ISIN NUMBER, FACE VALUE\r\n" + membershipRows.map((row) => [row.symbol, row.name, "EQ", "01-JAN-2020", 10, 1, row.isin, 10].join(",")).join("\r\n") + "\r\n", { headers: { "content-type": "text/csv", "last-modified": new Date().toUTCString() } });
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.includes("/historical-candle/")) {
    const instrumentKey = decodeURIComponent(url.split("/historical-candle/")[1].split("/")[0]);
    upstreamSymbols.push(instrumentKey);
    if (holdNext) {
      holdNext = false;
      signalHeld();
      await new Promise((resolve) => { releaseHeld = resolve; });
    }
    // This suite isolates candidate-feed failures. Holding-feed failures have
    // their own mixed-success, fail-closed cases in holdings-history-guard.
    if ((failAll || failOne) && instrumentKey !== "NSE_EQ|INE999999999") { failOne = false; return jsonResponse({ error: "guard_feed_unavailable" }, 503); }
    const today = Date.now();
    const candles = Array.from({ length: 253 }, (_, index) => {
      const close = 100 + index;
      return [new Date(today - (252 - index) * 86400000).toISOString(), close * 0.99, close * 1.01, close * 0.98, close, 800000];
    });
    return jsonResponse({ status: "success", data: { candles } });
  }
  if (url === OFFICIAL_NSE_EQUITY_URL) return equityResponse();
  if (url === OFFICIAL_NSE_SUSPENDED_URL) return jsonResponse([]);
  if (url === OFFICIAL_NSE_MASTER_URL) return jsonResponse(masterRows.map((row) => ({ ...row, trading_symbol: row.symbol, segment: "NSE_EQ", instrument_type: "EQ" })));
  if (url.startsWith("https://api.upstox.com/")) return jsonResponse({ status: "success", data: [] });
  throw new Error(`Unexpected upstream during isolated test: ${url}`);
};
let server;
try {
  const { createServer } = await import("../server.js");
  // Exercise the actual generated store methods, without requiring a live MongoDB.
  const runtimeDir = path.join(temp, ".ashstocks-runtime-server");
  const runtimeFiles = await fs.readdir(runtimeDir);
  assert.equal(runtimeFiles.length, 1);
  const runtimeSource = await fs.readFile(path.join(runtimeDir, runtimeFiles[0]), "utf8");
  const metadataMethods = [...runtimeSource.matchAll(/async saveUniverseMetadata\(nextState\) \{([\s\S]*?)\n\s+\},\n\s+async appendScanRecord/g)];
  assert.equal(metadataMethods.length, 3, "Every storage backend needs a metadata-only update");
  const storedLedger = { positions: [{ symbol: "HELD", qty: 10, last_price: null }], trades: [], orders: [] };
  const rawStored = { universe: makeRows(3), paperTrader: storedLedger, scannerSettings: { minScoreSelect: 70 }, universeRevision: 1 };
  const requested = { universe: makeRows(5), scannerRotation: {}, universeRevision: 2, universeImport: null, paperTrader: {}, scannerSettings: {} };
  const metadataFields = ({ universe, scannerRotation, universeRevision, universeImport }) => ({ universe, scannerRotation, universeRevision, universeImport });
  const memoryContext = vm.createContext({ state: structuredClone(rawStored), universeMetadataFields: metadataFields, requested });
  const memorySaved = await vm.runInContext(`(async function(nextState) { ${metadataMethods[0][1]} })(requested)`, memoryContext);
  assert.deepEqual(memorySaved.paperTrader, storedLedger);
  assert.deepEqual(memorySaved.scannerSettings, rawStored.scannerSettings);
  let fileWritten;
  const fileContext = vm.createContext({ state: {}, requested, universeMetadataFields: metadataFields, STATE_FILE: "isolated-state.json",
    fsp: { readFile: async () => JSON.stringify({ state: rawStored }) }, writeState: async (value) => { fileWritten = value; } });
  await vm.runInContext(`(async function(nextState) { ${metadataMethods[1][1]} })(requested)`, fileContext);
  assert.deepEqual(JSON.parse(JSON.stringify(fileWritten.paperTrader)), storedLedger, "File writes must retain raw null values, not re-sanitize the ledger");
  assert.deepEqual(JSON.parse(JSON.stringify(fileWritten.scannerSettings)), rawStored.scannerSettings);
  let mongoUpdate;
  const mongoContext = vm.createContext({ requested, universeMetadataFields: metadataFields,
    collection: { updateOne: async (filter, update) => { mongoUpdate = { filter, update }; return { matchedCount: 1 }; } } });
  await vm.runInContext(`(async function(nextState) { ${metadataMethods[2][1]} })(requested)`, mongoContext);
  assert.deepEqual(Object.keys(mongoUpdate.update.$set).sort(), ["state.scannerRotation", "state.universe", "state.universeRevision", "state.universeImport", "updatedAt"].sort(), "Mongo must update only metadata paths, never replace the whole state or paper ledger");
  assert.deepEqual(Object.keys(mongoUpdate.update), ["$set"]);
  assert.equal(mongoUpdate.filter._id, "default");
  console.log("Rotation storage checks passed: memory/file preserve the ledger; Mongo updates metadata paths only.");
  server = createServer();
  // Exercise the actual HTTP route listener with streams, without opening a
  // socket. All upstream calls remain mocked, including concurrent batch tests.
  const call = (url, method = "GET", body) => new Promise((resolve, reject) => {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { url, method, headers: { host: "localhost", "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" } });
    const res = { statusCode: 200, headers: {}, headersSent: false,
      writeHead(status, headers) { this.statusCode = status; this.headers = headers; this.headersSent = true; },
      setHeader(name, value) { this.headers[name] = value; },
      end(value) { try { resolve({ status: this.statusCode, body: JSON.parse(String(value || "{}")) }); } catch (error) { reject(error); } }
    };
    Promise.resolve(server.listeners("request")[0](req, res)).catch(reject);
  });
  assert.equal((await call("/api/scanner/next-batch")).status, 405);
  assert.equal((await call("/api/data-bank/load-upstox-nse", "POST", {})).body.saved_universe, 5);
  const seedState = (await call("/api/state")).body.state;
  seedState.paperTrader.positions = [{ symbol: "HELDSTOCK", name: "Existing holding", qty: 10, entry_price: 100, last_price: 100, status: "OPEN", instrument_key: "NSE_EQ|INE999999999", opened_at: "2026-08-01T05:00:00Z" }];
  assert.equal((await call("/api/state", "PUT", seedState)).status, 200);
  const before = (await call("/api/state")).body.state;
  assert.equal(before.paperTrader.positions[0].qty, 10, "Seed a nonempty ledger to verify preservation");
  const batch1 = await call("/api/scanner/next-batch", "POST", { horizon: "intraday", universe: makeRows(1), settings: { minScoreSelect: 0, brokerWriteEnabled: true } });
  assert.equal(batch1.status, 200, JSON.stringify(batch1.body));
  assert.equal(batch1.body.rotation.attempted, 2);
  assert.equal(batch1.body.rotation.total, 5, "Client universe override must be ignored");
  assert.equal(batch1.body.broker_write_enabled, false);
  assert.equal(batch1.body.settings.minScoreSelect, before.scannerSettings.minScoreSelect);
  const batch2 = await call("/api/scanner/next-batch", "POST", { horizon: "intraday" });
  assert.equal(batch2.body.rotation.attempted, 4);
  assert.equal(new Set([...batch1.body.rows, ...batch2.body.rows].map((row) => row.symbol)).size, 4);
  const batch3 = await call("/api/scanner/next-batch", "POST", { horizon: "intraday" });
  assert.equal(batch3.body.rotation.attempted, 5);
  assert.equal(batch3.body.rotation.complete, true);
  assert.equal(batch3.body.rotation.batch_count, 1);
  const candidateKeys = makeRows(5).map((row) => row.instrument_key);
  assert.equal(new Set(upstreamSymbols.filter((key) => candidateKeys.includes(key))).size, 5, "Every loaded candidate reaches the existing candle scanner");
  assert.ok(upstreamSymbols.includes("NSE_EQ|INE999999999"), "The existing out-of-batch holding also needs history for correlation");
  const after = (await call("/api/state")).body.state;
  assert.deepEqual(after.scannerSettings, before.scannerSettings, "Formula settings must not change");
  assert.deepEqual(after.paperTrader, before.paperTrader, "Rotation endpoint must not place orders or mutate paper holdings");
  assert.equal(after.scannerRotation.intraday.offset, 5, "Progress must survive state serialization");

  failAll = true;
  const failed = await call("/api/scanner/next-batch", "POST", { horizon: "intraday" });
  assert.equal(failed.status, 409);
  assert.equal(failed.body.error, "all_batch_fetches_failed");
  assert.equal((await call("/api/state")).body.state.scannerRotation.intraday.offset, 5);
  failAll = false;
  failOne = true;
  const partial = await call("/api/scanner/next-batch", "POST", {});
  assert.equal(partial.status, 200);
  assert.equal(partial.body.rotation.cycle, 2);
  assert.equal(partial.body.rotation.failed_count, 1);
  assert.equal(partial.body.rotation.attempted, 2);

  holdNext = true;
  const held = new Promise((resolve) => { signalHeld = resolve; });
  const running = call("/api/scanner/next-batch", "POST", {});
  await held;
  try {
    const overlap = await call("/api/scanner/next-batch", "POST", {});
    assert.equal(overlap.status, 409);
    assert.equal(overlap.body.error, "universe_batch_busy");
  } finally { releaseHeld(); }
  assert.equal((await running).body.rotation.attempted, 4);

  const oldRevision = (await call("/api/state")).body.state.universeRevision;
  masterRows = makeRows(7);
  membershipRows = makeRows(7);
  await call("/api/data-bank/load-upstox-nse", "POST", {});
  const refreshed = (await call("/api/state")).body.state;
  assert.equal(refreshed.universe.length, 7);
  assert.equal(refreshed.universeRevision, oldRevision + 1);
  assert.deepEqual(refreshed.scannerRotation, {});
  assert.deepEqual(refreshed.paperTrader, before.paperTrader);
  assert.deepEqual(refreshed.scannerSettings, before.scannerSettings);
  const freshBatch = await call("/api/scanner/next-batch", "POST", {});
  assert.equal(freshBatch.body.rotation.total, 7);
  assert.equal(freshBatch.body.rotation.attempted, 2);

  holdNext = true;
  const masterHeld = new Promise((resolve) => { signalHeld = resolve; });
  const staleMasterBatch = call("/api/scanner/next-batch", "POST", {});
  await masterHeld;
  try {
    masterRows = makeRows(8);
    membershipRows = makeRows(8);
    assert.equal((await call("/api/data-bank/load-upstox-nse", "POST", {})).body.saved_universe, 8);
  } finally { releaseHeld(); }
  assert.equal((await staleMasterBatch).body.error, "universe_or_settings_changed_during_scan");
  const afterConcurrentRefresh = (await call("/api/state")).body.state;
  assert.deepEqual(afterConcurrentRefresh.scannerRotation, {}, "A stale scan cannot overwrite a refreshed master's progress");
  assert.deepEqual(afterConcurrentRefresh.paperTrader, before.paperTrader);
  assert.equal((await call("/api/scanner/next-batch", "POST", {})).body.rotation.total, 8);

  holdNext = true;
  const settingsHeld = new Promise((resolve) => { signalHeld = resolve; });
  const staleSettingsBatch = call("/api/scanner/next-batch", "POST", {});
  await settingsHeld;
  try {
    const formulas = (await call("/api/settings/formulas")).body;
    const update = await call("/api/settings/formulas", "POST", {
      expected_revision: formulas.revision, settings: { minScoreSelect: 75 }, reason: "Isolated rotation concurrency regression test"
    });
    assert.equal(update.status, 200, JSON.stringify(update.body));
  } finally { releaseHeld(); }
  assert.equal((await staleSettingsBatch).body.error, "universe_or_settings_changed_during_scan");
  assert.equal((await call("/api/state")).body.state.scannerRotation.intraday.offset, 2);
  const governedBatch = await call("/api/scanner/next-batch", "POST", {});
  assert.equal(governedBatch.body.rotation.batch_start, 0, "A settings revision starts fresh coverage");
  assert.equal(governedBatch.body.settings.minScoreSelect, 75);

  const beforeFailedMaster = (await call("/api/state")).body.state;
  masterRows = [];
  const failedMaster = await call("/api/data-bank/load-upstox-nse", "POST", {});
  assert.notEqual(failedMaster.status, 200);
  assert.deepEqual((await call("/api/state")).body.state, beforeFailedMaster, "An empty master must not erase the saved universe or progress");
  globalThis.__ASH_STOCK_ENV.UPSTOX_ACCESS_TOKEN = "";
  assert.equal((await call("/api/scanner/next-batch", "POST", {})).body.error, "upstox_token_missing");
  assert.equal((await call("/api/state")).body.state.scannerRotation.intraday.offset, beforeFailedMaster.scannerRotation.intraday.offset);
  console.log("Rotation API checks passed: persisted coverage, failure retries, overlap/master/settings race guards, unchanged formulas/ledger, atomic master refresh.");
} finally {
  globalThis.fetch = nativeFetch;
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  delete globalThis.__ASH_STOCK_ENV;
  process.chdir(originalCwd);
}
