// Main-release adapter, applied last: keep the existing archive-before-save contract.
// No universe rotation, valuation strategy or archive-optimization feature is imported.
export const RUNTIME_STORAGE_FUNCTIONS = String.raw`
const RUNTIME_STORAGE_VERSION = "ashstocks-read-only-runtime-v1";
let dashboardStateReadInFlight = null;

function runtimeReadTimeoutMs() {
  const configured = Number(ENV.DASHBOARD_READ_TIMEOUT_MS || 18000);
  // Ordinary browser reads allow 20s; leave room for transport/JSON overhead.
  return Number.isFinite(configured) ? Math.max(1000, Math.min(18000, configured)) : 18000;
}

function runtimeStorageFailure(stage, original, code = "storage_unavailable") {
  if (original?.runtimeStorageFailure === true) return original;
  const stages = ["store_connect", "state_read", "state_load", "state_save", "index_setup", "archive_write",
    "history_read", "scan_read", "scan_write", "auth_read", "auth_write", "metadata_write", "dashboard_read"];
  const safeStage = stages.includes(stage) ? stage : "state_read";
  const safeArchiveCodes = ["paper_ledger_archive_busy_retry", "paper_ledger_archive_not_confirmed", "paper_ledger_acknowledged_writes_required"];
  const safeCode = safeArchiveCodes.includes(original?.message) ? original.message
    : ["storage_timeout", "state_uninitialized", "durable_mongodb_required"].includes(code) ? code : "storage_unavailable";
  const error = new Error(safeArchiveCodes.includes(safeCode) ? safeCode
    : safeCode === "state_uninitialized" ? "Saved application state has not been initialized. No default portfolio was created."
    : safeCode === "durable_mongodb_required" ? "Durable MongoDB storage is required. Trading remains blocked."
    : safeCode === "storage_timeout" ? "Saved data did not respond in time. Please retry."
    : "Saved data is temporarily unavailable. Please retry.");
  Object.assign(error, { runtimeStorageFailure: true, code: safeCode, dependency: "storage", stage: safeStage,
    retryable: !["state_uninitialized", "durable_mongodb_required", "paper_ledger_acknowledged_writes_required"].includes(safeCode), status: 503 });
  // Never log raw driver messages, stack/cause, URIs, hostnames or documents.
  const kinds = ["MongoNetworkTimeoutError", "MongoServerSelectionError", "MongoNetworkError", "MongoOperationTimeoutError", "MongoWaitQueueTimeoutError", "MongoServerError"];
  console.warn(JSON.stringify({ event: "storage_operation_failed", stage: safeStage, code: safeCode,
    error_kind: kinds.includes(original?.name) ? original.name : "StorageError" }));
  return error;
}

function runtimeStoragePayload(error) {
  const safe = error?.runtimeStorageFailure === true ? error : runtimeStorageFailure("state_read", error);
  return { ok: false, error: safe.message, code: safe.code, dependency: "storage", stage: safe.stage,
    retryable: safe.retryable, read_ready: false, write_ready: null, trading_ready: false };
}

async function runtimeStorageOperation(stage, work) {
  try { return await work(); }
  catch (error) { throw runtimeStorageFailure(stage, error); }
}

async function runtimeReadDeadline(promise, stage = "dashboard_read") {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(runtimeStorageFailure(stage, null, "storage_timeout")), runtimeReadTimeoutMs());
  });
  try { return await Promise.race([promise, deadline]); }
  finally { clearTimeout(timer); }
}

function instrumentRuntimeStore(store) {
  const stages = { readState: "state_read", getState: "state_load", saveState: "state_save",
    appendScanRecord: "scan_write", listScanRecords: "scan_read", archivePaperLedgerState: "archive_write",
    listPaperLedger: "history_read", getUpstoxAuth: "auth_read", saveUpstoxAuth: "auth_write" };
  for (const [name, stage] of Object.entries(stages)) {
    if (typeof store[name] !== "function") continue;
    const original = store[name];
    store[name] = function (...args) { return runtimeStorageOperation(stage, () => original.apply(this, args)); };
  }
  return store;
}

async function readDashboardState() {
  if (!dashboardStateReadInFlight) {
    const work = (async () => {
      const store = await runtimeStorageOperation("store_connect", () => getStore());
      if (requireDb() && (store.mode !== "mongodb" || store.persistent !== true)) {
        throw runtimeStorageFailure("store_connect", null, "durable_mongodb_required");
      }
      // Never fall back to getState: that path may seed, migrate or archive.
      if (typeof store.readState !== "function") throw runtimeStorageFailure("state_read", null);
      const state = await runtimeStorageOperation("state_read", () => store.readState());
      return { store, state };
    })();
    const tracked = work.finally(() => {
      if (dashboardStateReadInFlight === tracked) dashboardStateReadInFlight = null;
    });
    dashboardStateReadInFlight = tracked;
  }
  // A response timeout is not cancellation. Keep the underlying read single-flight
  // until the driver settles; never cache its late value or duplicate its work.
  return runtimeReadDeadline(dashboardStateReadInFlight);
}
`;

function replaceSection(source, start, end, transform, label) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`Patch anchor missing: ${label}`);
  return source.slice(0, from) + transform(source.slice(from, to)) + source.slice(to);
}

export function applyRuntimeResiliencePatches(source, mustReplace) {
  let output = mustReplace(source, "\nasync function getStore() {", `\n${RUNTIME_STORAGE_FUNCTIONS}\nasync function getStore() {`, "runtime storage helpers");
  output = mustReplace(output, "      storePromise = null;\n      throw error;", "      storePromise = null;\n      throw runtimeStorageFailure(\"store_connect\", error);", "safe connection diagnostics");

  output = replaceSection(output, "async function createMongoStore() {", "\nfunction normalizeScannerRows(", (mongo) => {
    mongo = mustReplace(mongo, "      connectTimeoutMS: timeoutMs,", "      connectTimeoutMS: timeoutMs,\n      waitQueueTimeoutMS: Math.max(1000, Math.min(30000, timeoutMs)),", "bounded Mongo connection checkout");
    const start = mongo.indexOf("      await withTimeout(collection.createIndex(");
    const end = mongo.indexOf("      async function archivePaperLedgerMongo(", start);
    if (start < 0 || end < 0) throw new Error("Patch anchor missing: deferred Mongo indexes");
    const indexes = mongo.slice(start, end).replace(/createIndex\((\{[^\n]+?\})\)/g, 'createIndex($1, { timeoutMS: timeoutMs })');
    if ((indexes.match(/createIndex\(/g) || []).length !== 5) throw new Error("Unexpected Mongo index setup sequence");
    mongo = mongo.slice(0, start) + `      let mongoIndexesPromise = null;
      function ensureMongoIndexes() {
        if (!mongoIndexesPromise) {
          mongoIndexesPromise = runtimeStorageOperation("index_setup", async () => {
${indexes}
          }).catch((error) => { mongoIndexesPromise = null; throw error; });
        }
        return mongoIndexesPromise;
      }
` + mongo.slice(end);
    // Preserve initialization/backfill for all mutation-capable methods.
    for (const signature of ["getState()", "saveState(nextState)", "appendScanRecord(record)", "saveUpstoxAuth(nextAuth)",
      "archivePaperLedgerState(rawState, context = {})"]) {
      const anchor = `        async ${signature} {`;
      mongo = mustReplace(mongo, anchor, `${anchor}\n          await ensureMongoIndexes();`, `lazy indexes for ${signature}`);
    }
    mongo = mustReplace(mongo, '        async getState() {', `        async readState() {
          const doc = await collection.findOne({ _id: "default" }, { timeoutMS: Math.min(runtimeReadTimeoutMs(), Math.max(1000, timeoutMs)) });
          if (!doc?.state) throw runtimeStorageFailure("state_read", null, "state_uninitialized");
          return sanitizeState(doc.state);
        },
        async getState() {`, "pure Mongo state reader");
    for (const args of ['doc.state, "startup-backfill"', 'nextState, "state-save"', 'rawState, context.source || "state-save"']) {
      mongo = mustReplace(mongo, `archivePaperLedgerMongo(${args})`,
        `runtimeStorageOperation("archive_write", () => archivePaperLedgerMongo(${args}))`, "archive-stage diagnostics");
    }
    mongo = mustReplace(mongo, 'paperLedger.find(query).sort(', 'paperLedger.find(query, { timeoutMS: runtimeReadTimeoutMs() }).sort(', "bounded archive history read");
    mongo = mustReplace(mongo, '      return {\n        mode: "mongodb",', '      return instrumentRuntimeStore({\n        mode: "mongodb",', "instrument Mongo store");
    mongo = mustReplace(mongo, '      };\n    } catch (error) {', '      });\n    } catch (error) {', "close instrumented Mongo store");
    return mongo;
  }, "Mongo read/write split");

  output = mustReplace(output, '    async getState() {\n      archivePaperLedgerMemory(paperLedger, state, "startup-backfill");',
    '    async readState() { return sanitizeState(state); },\n    async getState() {\n      archivePaperLedgerMemory(paperLedger, state, "startup-backfill");', "pure memory state reader");
  output = replaceSection(output, "async function createFileStore(warning) {", "\nasync function createMongoStore() {", (file) => {
    file = mustReplace(file, '  await fsp.mkdir(path.dirname(STATE_FILE), { recursive: true });', `  async function readStoredState() {
    let payload;
    try { payload = JSON.parse(await fsp.readFile(STATE_FILE, "utf8")); }
    catch (error) {
      if (error.code === "ENOENT") throw runtimeStorageFailure("state_read", null, "state_uninitialized");
      throw runtimeStorageFailure("state_read", error);
    }
    return sanitizeState(payload.state || payload);
  }`, "non-mutating file initialization");
    file = mustReplace(file, '  let state = await readState();\n  await writeState(state);', '  let state; // Materialize only on the explicit read or mutation path.', "no startup archive/write for file storage");
    file = mustReplace(file, '    async getState() {\n      state = await readState();', '    async readState() { return readStoredState(); },\n    async getState() {\n      state = await readState();', "pure file state reader");
    file = mustReplace(file, '  async function readState() {\n    try {',
      '  async function readState() {\n    let stateWasRead = false;\n    try {', "track successful state read before archival");
    file = mustReplace(file, '      const payload = JSON.parse(await fsp.readFile(STATE_FILE, "utf8"));\n      const rawState',
      '      const payload = JSON.parse(await fsp.readFile(STATE_FILE, "utf8"));\n      stateWasRead = true;\n      const rawState', "archive errors are not missing state");
    file = mustReplace(file, '      if (error.code !== "ENOENT") console.warn(`File store read failed: ${error.message}`);\n      return sanitizeState(defaultState());',
      '      if (error.code !== "ENOENT" || stateWasRead) throw runtimeStorageFailure("state_load", error);\n      const seeded = sanitizeState(defaultState());\n      await writeState(seeded);\n      return seeded;', "initialize only when the state-file read itself reports ENOENT");
    file = mustReplace(file, '    warning: warning?.message || null,', '    warning: warning ? "MongoDB unavailable; file fallback is in use." : null,', "safe fallback warning");
    file = mustReplace(file, '  return {\n    mode: "file",', '  return instrumentRuntimeStore({\n    mode: "file",', "instrument file store errors");
    const close = file.lastIndexOf('  };\n}');
    if (close < 0) throw new Error("Patch anchor missing: instrumented file store close");
    file = file.slice(0, close) + file.slice(close).replace('  };\n}', '  });\n}');
    return file;
  }, "file read/write split");

  output = replaceSection(output, '      if (url.pathname === "/api/ready") {', '      if (url.pathname === "/login"', (route) => {
    const start = route.indexOf('          const timeoutMs = mongoTimeoutMs();');
    const end = route.indexOf('          if (requireDb()', start);
    if (start < 0 || end < 0) throw new Error("Patch anchor missing: readiness state read");
    route = route.slice(0, start) + '          const { store, state } = await readDashboardState();\n' + route.slice(end);
    route = mustReplace(route, '            provider: "AshStocks India Scanner",', '            read_ready: true,\n            write_ready: null,\n            trading_ready: null,\n            readiness_scope: "stored-state-read",\n            provider: "AshStocks India Scanner",', "honest read readiness scope");
    const catchStart = route.indexOf('        } catch (error) {');
    const catchEnd = route.indexOf('\n        return;', catchStart);
    if (catchStart < 0 || catchEnd < 0) throw new Error("Patch anchor missing: readiness error");
    return route.slice(0, catchStart) + '        } catch (error) {\n          json(res, 503, runtimeStoragePayload(error));\n        }' + route.slice(catchEnd);
  }, "read-only readiness route");

  output = mustReplace(output, 'async function dataBankStatus() {\n  const store = await getStore();\n  const state = await store.getState();',
    'async function dataBankStatus() {\n  const { store, state } = await readDashboardState();', "read-only data bank status");
  output = replaceSection(output, '      if (url.pathname === "/api/state") {', '      if (url.pathname === "/api/data-bank/status") {', (route) => {
    route = mustReplace(route, '        const store = await getStore();\n        if (req.method === "GET") {', '        if (req.method === "GET") {\n          const { store, state } = await readDashboardState();', "read-only state GET");
    route = mustReplace(route, '            state: await store.getState()', '            state', "pure state response");
    return mustReplace(route, '        if (req.method === "PUT" || req.method === "PATCH") {', '        const store = await getStore();\n        if (req.method === "PUT" || req.method === "PATCH") {', "retain governed state writes");
  }, "state API split");
  output = mustReplace(output, '        const store = await getStore();\n        if (req.method === "GET") {\n          const state = await store.getState();\n          json(res, 200, paperSelectionSettingsView(state, { storage: store.mode, persistent: store.persistent }));\n          return;\n        }',
    '        if (req.method === "GET") {\n          const { store, state } = await readDashboardState();\n          json(res, 200, paperSelectionSettingsView(state, { storage: store.mode, persistent: store.persistent }));\n          return;\n        }\n        const store = await getStore();', "read-only settings GET");
  output = mustReplace(output, '      if (url.pathname === "/api/scanner/parameters") {\n        const store = await getStore();\n        const state = await store.getState();',
    '      if (url.pathname === "/api/scanner/parameters") {\n        const { state } = await readDashboardState();', "read-only scanner universe parameters");
  output = mustReplace(output, 'if (url.pathname === "/api/paper-trader/status") { const store = await getStore(); const state = await store.getState();',
    'if (url.pathname === "/api/paper-trader/status") { const { state } = await readDashboardState();', "read-only paper status");
  output = mustReplace(output, '  const store = await getStore();\n  const state = await store.getState();\n  const universe = normalizeScannerUniverse(state.universe || state.saved_universe || state.data_bank?.universe || []);',
    '  const { state } = await readDashboardState();\n  const universe = normalizeScannerUniverse(state.universe || state.saved_universe || state.data_bank?.universe || []);', "read-only quote symbol lookup");

  output = replaceSection(output, '      if (url.pathname === "/api/paper-trader/history") {', '      if (url.pathname === "/api/paper-trader/orders") {', (route) => {
    route = mustReplace(route, '        const store = await getStore();\n        const state = await store.getState();\n        if (store.archivePaperLedgerState) await store.archivePaperLedgerState(state, { source: "history-backfill" });',
      '        const { store } = await readDashboardState();', "history GET never backfills");
    route = mustReplace(route, '          schema_version: PAPER_LEDGER_SCHEMA_VERSION,', '          archive_scope: "persisted_archive_only",\n          backfill_on_read: false,\n          schema_version: PAPER_LEDGER_SCHEMA_VERSION,', "honest archive-only history scope");
    return mustReplace(route, 'await store.listPaperLedger({ kind, limit: url.searchParams.get("limit"), cursor: url.searchParams.get("cursor") })',
      'await runtimeReadDeadline(store.listPaperLedger({ kind, limit: url.searchParams.get("limit"), cursor: url.searchParams.get("cursor") }), "history_read")', "history response deadline");
  }, "read-only history route");
  output = mustReplace(output, '        const store = await getStore();\n        const marked = await withStateMutation(async () => {\n          const state = await store.getState();\n          return refreshPaperTraderMarks(state, store);\n        });',
    `        if (req.method !== "GET") { json(res, 405, { ok: false, error: "method_not_allowed", allowed: ["GET"] }); return; }
        const { state } = await readDashboardState();
        const marked = { paperTrader: sanitizePaperTraderState(state.paperTrader || {}),
          quote_as_of: null, marked_positions: 0, unpriced_symbols: [], quote_error: null };`, "orders GET reads stored marks without saving");
  output = mustReplace(output, '          mark_to_market: {\n            source: "Upstox Market Quote API",',
    '          mark_to_market: {\n            source: "Stored position snapshot",\n            status: "stored_snapshot_not_live",\n            refreshed_on_read: false,', "label stored marks honestly");
  output = mustReplace(output, '    } catch (error) {\n      json(res, 500, { ok: false, error: error.message });',
    '    } catch (error) {\n      if (error?.runtimeStorageFailure === true) {\n        json(res, 503, runtimeStoragePayload(error));\n        return;\n      }\n      json(res, 500, { ok: false, error: error.message });', "consistent storage dependency HTTP status");
  return output;
}
