import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";

// Compile the real patch stack in an empty, isolated test directory. Never
// createServer().listen(), use Mongo, read deployment credentials or fetch.
const previousCwd = process.cwd();
const previousEnv = globalThis.__ASH_STOCK_ENV;
const previousFetch = globalThis.fetch;
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "ashstocks-runtime-storage-guard-"));
let runtimeSource;
let sanitizeState;
try {
  process.chdir(temp);
  globalThis.__ASH_STOCK_ENV = {
    NODE_ENV: "test", REQUIRE_DB: "false", REQUIRE_AUTH: "false",
    DISABLE_DATA_BANK_AUTO_BOOTSTRAP: "true", DISABLE_PAPER_ENGINE_SCHEDULER: "true"
  };
  globalThis.fetch = async () => { throw new Error("Network is forbidden in the runtime storage guard"); };
  ({ sanitizeState } = await import("../server.js"));
  const runtimeDir = path.join(temp, ".ashstocks-runtime-server");
  const files = await fs.readdir(runtimeDir);
  assert.equal(files.length, 1, "Exactly one generated runtime is tested");
  runtimeSource = await fs.readFile(path.join(runtimeDir, files[0]), "utf8");
} finally {
  process.chdir(previousCwd);
  if (previousEnv === undefined) delete globalThis.__ASH_STOCK_ENV;
  else globalThis.__ASH_STOCK_ENV = previousEnv;
  globalThis.fetch = previousFetch;
}

const { RUNTIME_STORAGE_FUNCTIONS } = await import("../server-runtime-resilience-patch.mjs");
assert.ok(runtimeSource.includes(RUNTIME_STORAGE_FUNCTIONS), "Test helpers must be wired into the generated runtime");

function runtimeFunction(name) {
  const match = new RegExp(`^(?:export )?((?:async )?function ${name}\\()`, "m").exec(runtimeSource);
  assert.ok(match, `Missing generated function ${name}`);
  const start = match.index + match[0].indexOf(match[1]);
  for (let end = runtimeSource.indexOf("}", start); end >= 0; end = runtimeSource.indexOf("}", end + 1)) {
    const source = runtimeSource.slice(start, end + 1);
    try { new vm.Script(`(${source})`); return source; } catch (_) { /* inside the function */ }
  }
  throw new Error(`Cannot extract ${name}`);
}

const checks = [];
const diagnosticLogs = [];
const testConsole = { ...console, warn: (...items) => diagnosticLogs.push(items.join(" ")) };
async function check(name, work) {
  await work();
  checks.push(name);
}
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const tick = async () => { for (let index = 0; index < 12; index += 1) await Promise.resolve(); };
const clone = (value) => value === undefined ? undefined : structuredClone(value);
const at = "2026-09-29T05:00:00.000Z";
function fixture(orderCount = 201, tradeCount = 301) {
  return {
    universe: [{ symbol: "TEST", name: "Test fixture", instrument_key: "NSE_EQ|INE000000001" }],
    paperTrader: {
      orders: Array.from({ length: orderCount }, (_, index) => ({ id: `order-${index}`, symbol: "TEST", qty: 1, price: 100, status: "PAPER_FILLED", created_at: at })),
      trades: Array.from({ length: tradeCount }, (_, index) => ({ id: `trade-${index}`, order_id: `order-${index}`, symbol: "TEST", side: "BUY", qty: 1, price: 100, traded_at: at })),
      positions: [{ symbol: "TEST", qty: 2, entry_price: 100, current_price: 105 }]
    }
  };
}

const archiveStart = runtimeSource.indexOf('const PAPER_LEDGER_SCHEMA_VERSION = "ashstocks-paper-ledger-v1";');
const archiveEnd = runtimeSource.indexOf("\nasync function getStore()", archiveStart);
assert.ok(archiveStart >= 0 && archiveEnd > archiveStart);
const archiveHelpers = runtimeSource.slice(archiveStart, archiveEnd);
const sanitizerHelpers = ["finiteOr", "round", "normalizeSymbol", "sanitizeParameterEvidence", "sanitizeExecutionEvidence",
  "sanitizePaperOrder", "sanitizePaperTrade"].map(runtimeFunction).join("\n");
const driverImport = '  const { MongoClient } = await import("mongodb");';
let mongoSource = runtimeFunction("createMongoStore");
assert.ok(mongoSource.includes(driverImport));
mongoSource = mongoSource.replace(driverImport, "  const { MongoClient } = fakeMongo;");

async function mongoHarness(initial = fixture()) {
  let saved = clone(initial);
  const metrics = { connects: 0, closes: 0, indexes: [], reads: [], writes: 0, archiveCalls: 0, archived: new Map(), actions: [] };
  const controls = { failIndex: false, failArchive: false, readAction: null };
  function collection(name) {
    return {
      writeConcern: { w: "majority" },
      async createIndex(spec, options) {
        assert.ok(options.timeoutMS > 0, "Lazy index setup also has an actual driver deadline");
        metrics.indexes.push({ name, spec: clone(spec), options: clone(options) });
        metrics.actions.push("index");
        if (controls.failIndex) throw new Error("fixture index denied");
      },
      async findOne(filter, options) {
        assert.equal(name, "app_state");
        assert.equal(filter._id, "default");
        metrics.reads.push(clone(options));
        if (controls.readAction) return controls.readAction();
        return saved == null ? null : { state: clone(saved) };
      },
      async updateOne(filter, update) {
        assert.equal(name, "app_state");
        metrics.actions.push("state-write");
        metrics.writes += 1;
        saved = clone(update.$set.state);
        return { acknowledged: true, matchedCount: 1 };
      },
      async bulkWrite(operations) {
        assert.equal(name, "paper_ledger");
        metrics.actions.push("archive");
        metrics.archiveCalls += 1;
        if (controls.failArchive) throw new Error("fixture archive unavailable");
        let upserted = 0;
        for (const operation of operations) {
          const record = operation.updateOne.update.$setOnInsert;
          if (!metrics.archived.has(record.event_id)) { metrics.archived.set(record.event_id, clone(record)); upserted += 1; }
        }
        return { acknowledged: true, matchedCount: operations.length - upserted, upsertedCount: upserted };
      }
    };
  }
  const context = vm.createContext({
    console: testConsole, crypto, Buffer, Date, setTimeout, clearTimeout, sanitizeState, structuredClone,
    ENV: { NODE_ENV: "test" }, mongoTimeoutMs: () => 100,
    mongoUriCandidates: () => [{ key: "MOCK_URI", uri: "mongodb://mock.invalid" }],
    withTimeout: (promise) => promise,
    defaultState: () => fixture(0, 0),
    fakeMongo: { MongoClient: class {
      constructor(_uri, options) { metrics.clientOptions = options; }
      async connect() { metrics.connects += 1; }
      async close() { metrics.closes += 1; }
      db() { return { collection }; }
    } }
  });
  vm.runInContext(`const PAPER_VISIBLE_DEPTH_LEVELS = 5;\n${sanitizerHelpers}\n${archiveHelpers}\n${mongoSource}`, context);
  const store = await vm.runInContext("createMongoStore()", context);
  return { context, store, metrics, controls, saved: () => clone(saved) };
}

await check("Mongo connection and pure state reads do not create indexes or archive history", async () => {
  const h = await mongoHarness();
  h.controls.failIndex = h.controls.failArchive = true;
  const before = h.saved();
  const state = await h.store.readState();
  assert.equal(state.paperTrader.positions[0].qty, 2);
  assert.equal(h.metrics.connects, 1);
  assert.equal(h.metrics.indexes.length, 0);
  assert.equal(h.metrics.archiveCalls, 0);
  assert.equal(h.metrics.writes, 0);
  assert.deepEqual(h.saved(), before, "The raw, longer ledger stays untouched");
  assert.ok(h.metrics.reads[0].timeoutMS > 0);
  assert.ok(h.metrics.clientOptions.waitQueueTimeoutMS > 0);
});

await check("Missing state is not seeded by a dashboard read", async () => {
  const h = await mongoHarness(null);
  await assert.rejects(h.store.readState(), (error) => error.code === "state_uninitialized");
  assert.equal(h.saved(), null);
  assert.equal(h.metrics.writes, 0);
  assert.equal(h.metrics.archiveCalls, 0);
  assert.equal(h.metrics.indexes.length, 0);
});

await check("Existing mutation getState still archives all raw history before truncating its returned view", async () => {
  const h = await mongoHarness();
  const original = h.saved();
  const state = await h.store.getState();
  assert.equal(h.metrics.archived.size, 502);
  assert.equal(state.paperTrader.orders.length, 200);
  assert.equal(state.paperTrader.trades.length, 300);
  assert.equal(h.metrics.writes, 0);
  assert.deepEqual(h.saved(), original);
  const indexCalls = h.metrics.indexes.length;
  assert.ok(indexCalls > 0);
  await h.store.saveState(state);
  assert.equal(h.metrics.indexes.length, indexCalls, "Successful index setup is retained in this client");
  assert.equal(h.metrics.writes, 1);
  assert.equal(h.metrics.archived.size, 502, "Older raw records survive the hot-state cap");
  assert.ok(h.metrics.actions.indexOf("archive") < h.metrics.actions.indexOf("state-write"));
});

await check("Archive failure blocks state overwrite and is retryable without data loss", async () => {
  const h = await mongoHarness();
  const original = h.saved();
  h.controls.failArchive = true;
  await assert.rejects(h.store.saveState(original), (error) => error.stage === "archive_write" && error.code === "storage_unavailable");
  assert.equal(h.metrics.writes, 0);
  assert.deepEqual(h.saved(), original);
  h.controls.failArchive = false;
  await h.store.saveState(original);
  assert.equal(h.metrics.archived.size, 502);
  assert.equal(h.metrics.writes, 1);
});

await check("Index failure blocks mutation, leaves reads available and retries setup on the same client", async () => {
  const h = await mongoHarness();
  h.controls.failIndex = true;
  await assert.rejects(h.store.getState(), (error) => error.stage === "index_setup");
  assert.equal(h.metrics.archiveCalls, 0);
  assert.equal(h.metrics.writes, 0);
  const failedCalls = h.metrics.indexes.length;
  await h.store.readState();
  assert.equal(h.metrics.indexes.length, failedCalls);
  h.controls.failIndex = false;
  await Promise.all([h.store.getState(), h.store.getState()]);
  const retriedCalls = h.metrics.indexes.length;
  assert.equal(retriedCalls - failedCalls, 5, "Concurrent callers share exactly one complete setup retry");
  await h.store.getState();
  assert.equal(h.metrics.indexes.length, retriedCalls);
  assert.equal(h.metrics.connects, 1);
  assert.equal(h.metrics.closes, 0);
});

function dashboardHarness(store, options = {}) {
  const timers = new Map();
  let timerId = 0;
  let storeCalls = 0;
  const context = vm.createContext({
    console: testConsole, Date, ENV: { NODE_ENV: "test" },
    mongoTimeoutMs: () => 100, requireDb: () => true,
    getStore: async () => { storeCalls += 1; return options.connect ? options.connect() : store; },
    setTimeout(callback, ms) { const id = ++timerId; timers.set(id, { callback, ms }); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  vm.runInContext(RUNTIME_STORAGE_FUNCTIONS, context);
  return {
    context, read: () => context.readDashboardState(),
    payload: (error) => context.runtimeStoragePayload(error),
    expire() { const active = [...timers.values()]; timers.clear(); active.forEach(({ callback }) => callback()); },
    timers, storeCalls: () => storeCalls
  };
}

await check("Concurrent dashboard reads share one operation and successful results are never cached", async () => {
  const pending = deferred();
  let reads = 0;
  let version = 1;
  const store = { mode: "mongodb", persistent: true, async readState() { reads += 1; await pending.promise; return { version }; } };
  const h = dashboardHarness(store);
  const calls = Array.from({ length: 20 }, () => h.read());
  await tick();
  assert.equal(reads, 1);
  assert.equal(h.storeCalls(), 1);
  pending.resolve();
  const results = await Promise.all(calls);
  assert.ok(results.every((result) => result.state.version === 1));
  version = 2;
  const fresh = await h.read();
  assert.equal(fresh.state.version, 2);
  assert.equal(reads, 2);
});

await check("A state read deadline returns a safe error; late work cannot return success or trigger duplicate reads", async () => {
  const pending = deferred();
  let reads = 0;
  const h = dashboardHarness({ mode: "mongodb", persistent: true, readState() { reads += 1; return pending.promise; } });
  const first = h.read().then(() => { throw new Error("Timed out read became a success"); }, (error) => error);
  await tick();
  h.expire();
  const failure = await first;
  const payload = h.payload(failure);
  assert.equal(payload.dependency, "storage");
  assert.equal(payload.retryable, true);
  assert.ok(payload.code.includes("timeout"));
  const retry = h.read().catch((error) => error);
  await tick();
  assert.equal(reads, 1, "Unsettled work retains its slot even after the response deadline");
  h.expire();
  await retry;
  pending.resolve({ version: "late" });
  await tick();
  assert.equal(reads, 1);
  assert.equal(h.timers.size, 0);
});

await check("One deadline includes connection time and state reading", async () => {
  const connect = deferred();
  let reads = 0;
  const h = dashboardHarness(null, { connect: () => connect.promise });
  const response = h.read().catch((error) => error);
  await tick();
  h.expire();
  const failure = await response;
  assert.equal(h.payload(failure).dependency, "storage");
  connect.resolve({ mode: "mongodb", persistent: true, async readState() { reads += 1; return { late: true }; } });
  await tick();
  assert.equal(reads, 1, "A completed late pure read is allowed but is never delivered as ready");
});

await check("Raw Mongo details cannot escape the safe dependency payload", async () => {
  const raw = new Error("fixture mongodb://user:dummy-password@private-host.invalid:27017/secret-db timed out");
  const h = dashboardHarness({ mode: "mongodb", persistent: true, readState: async () => { throw raw; } });
  const failure = await h.read().catch((error) => error);
  const payload = h.payload(failure);
  assert.equal(payload.dependency, "storage");
  assert.equal(payload.retryable, true);
  assert.equal(typeof payload.stage, "string");
  const serialized = JSON.stringify(payload);
  for (const secret of ["dummy-password", "private-host", "secret-db", "mongodb://"]) assert.equal(serialized.includes(secret), false);
});

await check("State-uninitialized responses are not mislabeled as a transient outage", async () => {
  const h = await mongoHarness(null);
  const dashboard = dashboardHarness(h.store);
  const failure = await dashboard.read().catch((error) => error);
  const payload = dashboard.payload(failure);
  assert.equal(payload.code, "state_uninitialized");
  assert.equal(payload.retryable, false);
  assert.equal(h.metrics.writes, 0);
});

function httpHarness(store, overrides = {}) {
  let handler;
  const forbidden = () => { throw new Error("Mutation or provider fetch is forbidden in a dashboard GET"); };
  const context = vm.createContext({
    console: testConsole, Date, URL, Buffer, ENV: { NODE_ENV: "production", RENDER_GIT_COMMIT: "1234567890abcdef1234567890abcdef12345678" },
    setTimeout, clearTimeout, mongoTimeoutMs: () => 100,
    getStore: async () => store,
    startPaperEngineScheduler() {}, startDataBankBootstrap() {},
    http: { createServer(callback) { handler = callback; return {}; } },
    authStatus: () => ({ configured: true, required: true }),
    isAuthenticated: () => true, requireDb: () => true,
    upstoxStatus: () => ({ configured: true }),
    ENGINE_VERSION: "fixture-engine", RELEASE: "fixture-release",
    dataBankSummary: (state) => ({ universe_count: state?.universe?.length || 0 }),
    paperSelectionSettingsView: () => ({ ok: true, settings: {} }),
    marketContextPayload: async () => ({ ok: false, available: false }),
    PAPER_ORDER_LIFECYCLE_VERSION: "fixture", PAPER_CAPITAL_POLICY: "fixture",
    paperPositionValuation: (position) => position,
    paperClosedTradeSummary: () => null,
    paperLifecycleFunds: () => ({}),
    sanitizePaperTraderState: (value) => sanitizeState({ paperTrader: value }).paperTrader,
    readJsonBody: async () => ({}),
    withStateMutation: forbidden, refreshPaperTraderMarks: forbidden,
    fetch: forbidden,
    json(response, status, payload) { response.status = status; response.payload = payload; },
    ...overrides
  });
  vm.runInContext(`${RUNTIME_STORAGE_FUNCTIONS}\n${runtimeFunction("dataBankStatus")}\n${runtimeFunction("createServer")}`, context);
  context.createServer();
  return async (pathname, method = "GET") => {
    const response = {};
    await handler({ url: pathname, method, headers: { host: "fixture.invalid" } }, response);
    assert.equal(typeof response.status, "number", `${method} ${pathname} must respond without opening a socket`);
    return response;
  };
}

const dashboardPaths = ["/api/ready", "/api/state", "/api/settings/formulas", "/api/settings/selection",
  "/api/data-bank/status", "/api/scanner/parameters", "/api/paper-trader/status", "/api/paper-trader/orders", "/api/paper-trader/history", "/api/market-context"];
await check("All dashboard state routes consistently return safe 503 storage errors instead of leaking driver failures", async () => {
  let legacyReads = 0;
  let writes = 0;
  const store = {
    mode: "mongodb", persistent: true,
    async readState() { throw new Error("fixture mongodb://user:dummy-password@private-host.invalid:27017/secret-db timed out"); },
    async getState() { legacyReads += 1; throw new Error("Legacy mutation read called"); },
    async saveState() { writes += 1; throw new Error("Unexpected state mutation"); }
  };
  const request = httpHarness(store);
  for (const pathname of dashboardPaths) {
    const response = await request(pathname);
    assert.equal(response.status, 503, pathname);
    assert.equal(response.payload.dependency, "storage", pathname);
    assert.equal(response.payload.retryable, true, pathname);
    const serialized = JSON.stringify(response.payload);
    for (const sensitive of ["mongodb://", "dummy-password", "private-host", "secret-db"]) assert.equal(serialized.includes(sensitive), false, pathname);
  }
  assert.equal(legacyReads, 0);
  assert.equal(writes, 0);
});

await check("Readiness verifies stored state without claiming writes are available", async () => {
  const h = await mongoHarness();
  h.controls.failIndex = h.controls.failArchive = true;
  const request = httpHarness(h.store);
  const response = await request("/api/ready");
  assert.equal(response.status, 200);
  assert.equal(response.payload.ok, true);
  assert.equal(response.payload.read_ready, true);
  assert.equal(response.payload.write_ready, null);
  assert.equal(response.payload.trading_ready, null);
  assert.equal(response.payload.readiness_scope, "stored-state-read");
  assert.equal(response.payload.commit, "1234567890abcdef1234567890abcdef12345678");
  assert.equal(h.metrics.indexes.length, 0);
  assert.equal(h.metrics.archiveCalls, 0);
  assert.equal(h.metrics.writes, 0);
});

await check("Dashboard GET state and orders do not refresh prices or mutate persisted history", async () => {
  const h = await mongoHarness();
  h.controls.failIndex = h.controls.failArchive = true;
  const request = httpHarness(h.store);
  const state = await request("/api/state");
  assert.equal(state.status, 200);
  const orders = await request("/api/paper-trader/orders");
  assert.equal(orders.status, 200);
  assert.equal(orders.payload.positions[0].current_price, 105);
  assert.equal(h.metrics.writes, 0);
  assert.equal(h.metrics.archiveCalls, 0);
  assert.equal(h.metrics.indexes.length, 0);
});

await check("Read-only runtime repair does not reopen production generic state mutations", async () => {
  let writes = 0;
  const request = httpHarness({ mode: "mongodb", persistent: true, saveState: async () => { writes += 1; } });
  for (const method of ["PUT", "PATCH"]) {
    const response = await request("/api/state", method);
    assert.equal(response.status, 405);
    assert.equal(response.payload.error, "state_mutation_disabled_in_production");
  }
  assert.equal(writes, 0);
});

await check("Settings GET connection time is inside the same bounded dashboard read", async () => {
  for (const pathname of ["/api/settings/formulas", "/api/settings/selection"]) {
    const connecting = deferred();
    const timers = new Map();
    let timerId = 0;
    let connections = 0;
    const request = httpHarness(null, {
      getStore() { connections += 1; return connecting.promise; },
      setTimeout(callback, ms) { const id = ++timerId; timers.set(id, { callback, ms }); return id; },
      clearTimeout(id) { timers.delete(id); }
    });
    const pending = request(pathname);
    await tick();
    assert.equal(timers.size, 1, `${pathname} must install its deadline before awaiting a connection`);
    assert.equal(connections, 1);
    [...timers.values()].forEach(({ callback }) => callback());
    const response = await pending;
    assert.equal(response.status, 503);
    assert.equal(response.payload.code, "storage_timeout");
    connecting.resolve({ mode: "mongodb", persistent: true, readState: async () => sanitizeState(fixture()) });
    await tick();
    assert.equal(connections, 1, "No redundant second store connection after the first wait");
  }
});

await check("File fallback reads have no initialization, archive or filesystem writes", async () => {
  let missing = false;
  let malformed = false;
  let reads = 0;
  let writes = 0;
  const forbiddenWrite = async () => { writes += 1; throw new Error("Filesystem writes forbidden in pure reads"); };
  const context = vm.createContext({
    console: testConsole, path, Date, Buffer, sanitizeState, ENV: { NODE_ENV: "test" },
    STATE_FILE: "/fixture/state.json", PAPER_LEDGER_FILE: "/fixture/paper.jsonl", SCAN_LEDGER_FILE: "/fixture/scan.jsonl",
    fsp: {
      async readFile(filename) {
        assert.equal(filename, "/fixture/state.json", "A pure state read never touches the archive");
        reads += 1;
        if (missing) throw Object.assign(new Error("fixture not found"), { code: "ENOENT" });
        if (malformed) return "not JSON";
        return JSON.stringify({ state: fixture() });
      },
      mkdir: forbiddenWrite, writeFile: forbiddenWrite, appendFile: forbiddenWrite, rename: forbiddenWrite, open: forbiddenWrite
    }
  });
  vm.runInContext(`${RUNTIME_STORAGE_FUNCTIONS}\n${runtimeFunction("createFileStore")}`, context);
  const store = await context.createFileStore();
  assert.equal(reads, 0, "Creating a file store does not materialize state");
  const state = await store.readState();
  assert.equal(state.paperTrader.positions[0].qty, 2);
  malformed = true;
  await assert.rejects(store.readState(), (error) => error.code === "storage_unavailable");
  missing = true;
  await assert.rejects(store.readState(), (error) => error.code === "state_uninitialized");
  assert.equal(writes, 0);
});

async function fileHarness(initial = fixture()) {
  const stateFile = "/fixture/state.json";
  const archiveFile = "/fixture/paper.jsonl";
  const files = new Map(initial == null ? [] : [[stateFile, JSON.stringify({ state: initial })]]);
  const controls = { failArchiveRead: false, failArchiveOpen: false, failArchiveWrite: false };
  const metrics = { stateWrites: 0, writes: 0, mkdir: 0, archiveOpens: 0, reads: [] };
  const warning = new Error("fixture mongodb://user:dummy-password@private-host.invalid:27017/secret-db unavailable");
  const context = vm.createContext({
    console: testConsole, path, Date, Buffer, crypto, sanitizeState,
    ENV: { NODE_ENV: "test" }, runtimeProcess: { pid: 1 },
    STATE_FILE: stateFile, PAPER_LEDGER_FILE: archiveFile, SCAN_LEDGER_FILE: "/fixture/scan.jsonl",
    defaultState: () => fixture(0, 0),
    fsp: {
      async readFile(filename) {
        metrics.reads.push(filename);
        if (filename === archiveFile && controls.failArchiveRead) throw Object.assign(new Error(warning.message), { code: "EACCES" });
        if (!files.has(filename)) throw Object.assign(new Error("fixture not found"), { code: "ENOENT" });
        return files.get(filename);
      },
      async mkdir() { metrics.mkdir += 1; },
      async writeFile(filename, content) { metrics.writes += 1; files.set(filename, String(content)); },
      async rename(from, to) { if (to === stateFile) metrics.stateWrites += 1; files.set(to, files.get(from)); files.delete(from); },
      async open(filename, mode) {
        assert.equal(filename, archiveFile);
        assert.equal(mode, "a");
        metrics.archiveOpens += 1;
        if (controls.failArchiveOpen) throw Object.assign(new Error("fixture archive parent missing"), { code: "ENOENT" });
        return {
          async writeFile(content) {
            if (controls.failArchiveWrite) throw Object.assign(new Error("fixture archive target missing"), { code: "ENOENT" });
            metrics.writes += 1;
            files.set(filename, (files.get(filename) || "") + String(content));
          },
          async sync() {}, async close() {}
        };
      }
    }
  });
  vm.runInContext(`const PAPER_VISIBLE_DEPTH_LEVELS = 5;\n${sanitizerHelpers}\n${archiveHelpers}\n${runtimeFunction("createFileStore")}`, context);
  const store = await context.createFileStore(warning);
  return { store, context, controls, metrics, files, stateFile, archiveFile, rawState: () => files.get(stateFile) };
}

await check("File fallback warning cannot expose its original connection failure in a successful API response", async () => {
  const h = await fileHarness();
  const response = await httpHarness(h.store, { requireDb: () => false })("/api/state");
  assert.equal(response.status, 200);
  assert.equal(response.payload.warning, "MongoDB unavailable; file fallback is in use.");
  const serialized = JSON.stringify(response.payload);
  for (const sensitive of ["mongodb://", "dummy-password", "private-host", "secret-db"]) assert.equal(serialized.includes(sensitive), false);
  assert.equal(h.metrics.stateWrites, 0);
  assert.equal(h.metrics.writes, 0);
  assert.equal(h.metrics.mkdir, 0);
});

await check("File history permission failures become safe tagged 503 errors, not raw generic 500 responses", async () => {
  const h = await fileHarness();
  h.controls.failArchiveRead = true;
  const before = h.rawState();
  const response = await httpHarness(h.store, { requireDb: () => false })("/api/paper-trader/history");
  assert.equal(response.status, 503);
  assert.equal(response.payload.stage, "history_read");
  assert.equal(response.payload.code, "storage_unavailable");
  assert.equal(response.payload.retryable, true);
  const serialized = JSON.stringify(response.payload);
  for (const sensitive of ["mongodb://", "dummy-password", "private-host", "secret-db", "EACCES"]) assert.equal(serialized.includes(sensitive), false);
  assert.equal(h.rawState(), before);
  assert.equal(h.metrics.writes, 0);
  assert.equal(h.metrics.stateWrites, 0);
});

await check("Corrupt files and archive failures cannot turn a mutation-capable read into replacement default state", async () => {
  const corrupted = await fileHarness();
  corrupted.files.set(corrupted.stateFile, "corrupt JSON preserved verbatim");
  await assert.rejects(corrupted.store.getState(), (error) => error.code === "storage_unavailable" && error.stage === "state_load");
  assert.equal(corrupted.rawState(), "corrupt JSON preserved verbatim");
  assert.equal(corrupted.metrics.writes, 0);
  const archiveFailure = await fileHarness();
  const before = archiveFailure.rawState();
  archiveFailure.controls.failArchiveRead = true;
  await assert.rejects(archiveFailure.store.getState(), (error) => error.code === "storage_unavailable" && error.stage === "state_load");
  assert.equal(archiveFailure.rawState(), before);
  assert.equal(archiveFailure.metrics.writes, 0);
  assert.equal(archiveFailure.metrics.archiveOpens, 0);
  // The independent pure read continues to return the saved position.
  assert.equal((await archiveFailure.store.readState()).paperTrader.positions[0].qty, 2);
});

await check("A missing file is initialized once only by an explicit mutation-capable getState", async () => {
  const h = await fileHarness(null);
  assert.equal(h.metrics.reads.length, 0);
  assert.equal(h.metrics.mkdir, 0);
  await assert.rejects(h.store.readState(), (error) => error.code === "state_uninitialized");
  assert.equal(h.metrics.writes, 0);
  assert.equal(h.rawState(), undefined);
  await h.store.getState();
  assert.equal(h.metrics.stateWrites, 1);
  const seeded = h.rawState();
  assert.ok(seeded);
  await h.store.getState();
  await h.store.readState();
  assert.equal(h.metrics.stateWrites, 1);
  assert.equal(h.rawState(), seeded);
});

await check("ENOENT opening the archive cannot be mistaken for a missing existing state file", async () => {
  const h = await fileHarness();
  const before = h.rawState();
  h.controls.failArchiveOpen = true;
  await assert.rejects(h.store.getState(), (error) => error.code === "storage_unavailable" && error.stage === "state_load");
  assert.equal(h.metrics.archiveOpens, 1, "The injected failure occurs after reading the existing state");
  assert.equal(h.metrics.stateWrites, 0);
  assert.equal(h.metrics.writes, 0);
  assert.equal(h.rawState(), before, "Archival ENOENT must never replace a populated portfolio with defaults");
  assert.equal((await h.store.readState()).paperTrader.positions[0].qty, 2);
});

await check("ENOENT while appending the archive cannot seed over a successfully read portfolio", async () => {
  const h = await fileHarness();
  const before = h.rawState();
  h.controls.failArchiveWrite = true;
  await assert.rejects(h.store.getState(), (error) => error.code === "storage_unavailable" && error.stage === "state_load");
  assert.equal(h.metrics.archiveOpens, 1);
  assert.equal(h.metrics.stateWrites, 0);
  assert.equal(h.metrics.writes, 0);
  assert.equal(h.rawState(), before);
  assert.equal((await h.store.readState()).paperTrader.positions[0].qty, 2);
});

await check("No dashboard reader may fall back to the mutation-capable legacy getState method", async () => {
  let called = false;
  const h = dashboardHarness({ mode: "mongodb", persistent: true, getState() { called = true; return {}; } });
  await assert.rejects(h.read(), (error) => error.code === "storage_unavailable");
  assert.equal(called, false);
});

await check("Production read readiness still rejects non-durable fallback stores", async () => {
  let read = false;
  const h = dashboardHarness({ mode: "memory", persistent: false, readState() { read = true; return {}; } });
  await assert.rejects(h.read(), (error) => error.code === "durable_mongodb_required");
  assert.equal(read, false);
});

await check("Dashboard deadline configuration stays below the browser deadline and rejects unbounded values", async () => {
  const h = dashboardHarness({});
  for (const [configured, expected] of [[undefined, 18000], ["90000", 18000], ["-12", 1000], ["1500", 1500], ["not-numeric", 18000]]) {
    h.context.ENV.DASHBOARD_READ_TIMEOUT_MS = configured;
    assert.equal(h.context.runtimeReadTimeoutMs(), expected);
  }
});

await check("Memory state reads do not invoke the legacy archival path", async () => {
  let archives = 0;
  const context = vm.createContext({
    sanitizeState, defaultState: fixture,
    archivePaperLedgerMemory: () => { archives += 1; },
    console: testConsole
  });
  vm.runInContext(runtimeFunction("createMemoryStore"), context);
  const store = context.createMemoryStore();
  await store.readState();
  await store.readState();
  assert.equal(archives, 0);
  await store.getState();
  assert.equal(archives, 1, "Legacy explicit mutation path retains its archival behavior");
});

await check("An explicit mutation can still initialize missing state after a pure read correctly refuses to seed it", async () => {
  const h = await mongoHarness(null);
  await assert.rejects(h.store.readState(), (error) => error.code === "state_uninitialized");
  assert.equal(h.metrics.writes, 0);
  await h.store.getState();
  assert.equal(h.metrics.writes, 1);
  assert.ok(h.saved());
});

await check("Quote symbol lookup reads the saved universe without archive or mark updates", async () => {
  const mongo = await mongoHarness();
  mongo.controls.failIndex = mongo.controls.failArchive = true;
  const h = dashboardHarness(mongo.store);
  h.context.normalizeScannerUniverse = (universe) => universe;
  vm.runInContext(["normalizeSymbol", "normalizeQuoteKeys", "resolveUpstoxQuoteInput"].map(runtimeFunction).join("\n"), h.context);
  const input = await h.context.resolveUpstoxQuoteInput(new URL("https://fixture.invalid/api/upstox/quote?symbol=TEST"));
  assert.equal(input.keys[0], "NSE_EQ|INE000000001");
  assert.equal(mongo.metrics.reads.length, 1);
  assert.equal(mongo.metrics.archiveCalls, 0);
  assert.equal(mongo.metrics.indexes.length, 0);
  assert.equal(mongo.metrics.writes, 0);
  await h.context.resolveUpstoxQuoteInput(new URL("https://fixture.invalid/api/upstox/quote?instrument_key=NSE_EQ%7CINE000000001"));
  assert.equal(mongo.metrics.reads.length, 1, "An explicit key does not need a saved-universe read");
});

await check("Failure diagnostics expose only bounded operation tags, never raw driver text", async () => {
  assert.ok(diagnosticLogs.length > 0);
  for (const log of diagnosticLogs) {
    const value = JSON.parse(log);
    assert.deepEqual(Object.keys(value).sort(), ["code", "error_kind", "event", "stage"]);
    assert.equal(value.event, "storage_operation_failed");
    for (const sensitive of ["dummy-password", "private-host", "secret-db", "mongodb://", "fixture archive", "fixture index"]) assert.equal(log.includes(sensitive), false);
  }
});

console.log(JSON.stringify({ ok: true, checks: checks.length, scenarios: checks, network: "forbidden", real_mongo: false, runtime_sha256: crypto.createHash("sha256").update(runtimeSource).digest("hex") }, null, 2));
