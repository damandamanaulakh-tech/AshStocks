import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";
import { Readable } from "node:stream";
import {
  OFFICIAL_NSE_MASTER_URL, OFFICIAL_NSE_SUSPENDED_URL, buildOfficialNseUniverse,
  diffOfficialNseUniverse, fetchOfficialInstrumentSource, fetchOfficialNseMaster,
  officialNseImportMetadata, sanitizeOfficialNseImport, validateOfficialSuspendedRows
} from "../lib/official-nse-master.mjs";

const now = "2026-09-09T03:00:00.000Z";
const rows = (count, offset = 0) => Array.from({ length: count }, (_, n) => {
  const index = n + offset;
  const isin = `INE${String(index).padStart(9, "0")}`;
  return { exchange: "NSE", segment: "NSE_EQ", instrument_type: "EQ", isin,
    instrument_key: `NSE_EQ|${isin}`, trading_symbol: `TEST${String(index).padStart(4, "0")}`,
    name: `Test Company ${index}` };
});
const response = (data, { gzip = false, status = 200, headers = {} } = {}) => {
  const bytes = typeof data === "string" ? data : JSON.stringify(data);
  return new Response(gzip ? zlib.gzipSync(bytes) : bytes, { status,
    headers: { "last-modified": "Tue, 08 Sep 2026 00:01:59 GMT", ...headers } });
};

let calls = [];
const fetchImpl = async (url, init) => {
  calls.push({ url, init });
  assert.ok([OFFICIAL_NSE_MASTER_URL, OFFICIAL_NSE_SUSPENDED_URL].includes(url));
  return response(url === OFFICIAL_NSE_MASTER_URL ? rows(3) : [], { gzip: url === OFFICIAL_NSE_MASTER_URL });
};
const first = await fetchOfficialNseMaster({ fetchImpl, now });
assert.equal(first.universe.length, 3);
assert.equal(first.master.encoding, "gzip");
assert.equal(first.suspended.encoding, "json");
assert.match(first.master.source_sha256, /^[a-f0-9]{64}$/);
assert.equal(first.master.source_last_modified, "2026-09-08T00:01:59.000Z");
assert.equal(first.master.source_time_verified, true);
assert.ok(calls.every(({ init }) => init.cache === "no-store" && init.redirect === "error" && init.signal));
await fetchOfficialNseMaster({ fetchImpl, now });
assert.equal(calls.length, 4, "Every click reads BOTH official sources afresh, including same-day repeats");
await assert.rejects(fetchOfficialNseMaster({ url: "http://localhost/private", fetchImpl, now }), /source_not_allowed/);
await assert.rejects(fetchOfficialInstrumentSource(`${OFFICIAL_NSE_MASTER_URL}?cached=1`, { fetchImpl, now }), /source_not_allowed/);
assert.equal(calls.length, 4, "Unapproved URL must be rejected before any network request");
const metadata = officialNseImportMetadata(first);
assert.equal(metadata.added_count, 3);
assert.equal(metadata.requested_count, 2400);
assert.equal(metadata.shortfall, 2397);
assert.equal(metadata.is_live_quote_data, false);
const unchanged = officialNseImportMetadata(first, first.universe, metadata);
assert.equal(unchanged.added_count, 0);
assert.equal(unchanged.updated_count, 0);
assert.equal(unchanged.unchanged_count, 3);
assert.equal(unchanged.source_changed, false);
const changedRows = structuredClone(first.universe);
changedRows[1].name = "Updated legal name";
changedRows.pop();
changedRows.push(buildOfficialNseUniverse(rows(1, 50), []).universe[0]);
const diff = diffOfficialNseUniverse(first.universe, changedRows);
assert.deepEqual([diff.added_count, diff.updated_count, diff.removed_count, diff.unchanged_count], [1, 1, 1, 1]);
assert.deepEqual(sanitizeOfficialNseImport(metadata), metadata);
assert.equal(sanitizeOfficialNseImport({ version: "unknown" }), null);

const stockRows = rows(4);
stockRows[1].name = "Example ETF";
const symbolOnlySuspension = { exchange: "NSE", segment: "NSE_EQ", instrument_type: "EQ", trading_symbol: stockRows[2].trading_symbol };
const filtered = buildOfficialNseUniverse(stockRows, [symbolOnlySuspension]);
assert.deepEqual(filtered.universe.map((row) => row.symbol), [stockRows[0].trading_symbol, stockRows[3].trading_symbol]);
assert.equal(filtered.counts.excluded_fund_count, 1);
assert.equal(filtered.counts.excluded_suspended_count, 1);
assert.equal(validateOfficialSuspendedRows([{ ...stockRows[2], isin: undefined }]).length, 1, "Suspension evidence may omit redundant ISIN");
assert.throws(() => validateOfficialSuspendedRows([{ ...symbolOnlySuspension, trading_symbol: "" }]), /suspension_identity_invalid/);
assert.throws(() => validateOfficialSuspendedRows([{ ...stockRows[2], instrument_key: stockRows[1].instrument_key }]), /suspension_identity_invalid/);
const dummySuspension = { ...symbolOnlySuspension, isin: "DUMMY10887", instrument_key: "NSE_EQ|DUMMY10887" };
assert.deepEqual(validateOfficialSuspendedRows([dummySuspension]), [{ symbol: symbolOnlySuspension.trading_symbol, instrument_key: "" }], "Official paired DUMMY identifiers must become symbol-only exclusion evidence");
assert.deepEqual(buildOfficialNseUniverse(stockRows, [dummySuspension]).universe, filtered.universe, "A DUMMY suspension blocks the matching real master stock by symbol");
const doubleYSuspension = { ...symbolOnlySuspension, isin: "DUMMYY000006", instrument_key: "NSE_EQ|DUMMYY000006" };
assert.deepEqual(validateOfficialSuspendedRows([doubleYSuspension]), [{ symbol: symbolOnlySuspension.trading_symbol, instrument_key: "" }], "Observed paired DUMMYY identifiers are symbol-only exclusions too");
assert.deepEqual(buildOfficialNseUniverse(stockRows, [doubleYSuspension]).universe, filtered.universe);
assert.throws(() => buildOfficialNseUniverse([{ ...stockRows[0], isin: doubleYSuspension.isin, instrument_key: doubleYSuspension.instrument_key }], []), /nse_identity_invalid/);
assert.throws(() => buildOfficialNseUniverse([{ ...stockRows[0], isin: dummySuspension.isin, instrument_key: dummySuspension.instrument_key }], []), /nse_identity_invalid/, "DUMMY identifiers must never become imported/tradable master instruments");
for (const invalid of [
  { ...dummySuspension, instrument_key: "NSE_EQ|DUMMY10888" },
  { ...dummySuspension, isin: "DUMMY0000287" },
  { ...dummySuspension, isin: "" },
  { ...dummySuspension, instrument_key: "" },
  { ...dummySuspension, isin: "DUMMY", instrument_key: "NSE_EQ|DUMMY" },
  { ...dummySuspension, isin: "DUMMY123456789012345678901", instrument_key: "NSE_EQ|DUMMY123456789012345678901" },
  { ...dummySuspension, isin: "DUMMYX", instrument_key: "NSE_EQ|DUMMYX" },
  { ...dummySuspension, isin: "DUMMYYY000006", instrument_key: "NSE_EQ|DUMMYYY000006" },
  { ...dummySuspension, trading_symbol: "" }
]) assert.throws(() => validateOfficialSuspendedRows([invalid]), /suspension_identity_invalid/, "Malformed or inconsistent DUMMY evidence must still fail closed");
assert.throws(() => buildOfficialNseUniverse([{ ...stockRows[0], isin: undefined }], []), /nse_identity_invalid/, "Master imports must still require a matching ISIN");
assert.throws(() => buildOfficialNseUniverse([{ ...stockRows[0], exchange: "BSE" }], []), /nse_identity_invalid/);
assert.throws(() => buildOfficialNseUniverse([{ ...stockRows[0], instrument_key: "NSE_EQ|WRONG" }], []), /nse_identity_invalid/);
assert.throws(() => buildOfficialNseUniverse([], []), /empty_master/);
assert.throws(() => buildOfficialNseUniverse(stockRows, { data: [] }), /array_required/);
assert.throws(() => buildOfficialNseUniverse([null], []), /record_invalid/);
assert.equal(buildOfficialNseUniverse([...rows(2), ...rows(2)], []).counts.duplicate_count, 2);
assert.throws(() => buildOfficialNseUniverse([stockRows[0], { ...stockRows[0], name: "Conflicting name" }], []), /duplicate_identity_conflict/);
assert.throws(() => buildOfficialNseUniverse([stockRows[0], { ...stockRows[0], trading_symbol: "DIFFERENT" }], []), /duplicate_identity_conflict/);
assert.equal(buildOfficialNseUniverse(rows(2501), []).universe.length, 2501, "Do not truncate valid stocks to the requested 2,400");
assert.throws(() => buildOfficialNseUniverse(rows(1), rows(1)), /empty_eligible_master/);

const failures = [
  [() => response([], { status: 503 }), /fetch_http_503/],
  [() => response("not JSON"), /JSON/],
  [() => response({ data: [] }), /array_required/],
  [() => response(""), /empty_response/],
  [() => response([], { headers: { "last-modified": "Thu, 01 Jan 2026 00:00:00 GMT" } }), /source_stale/],
  [() => response([], { headers: { "last-modified": "Thu, 10 Sep 2026 00:00:00 GMT" } }), /date_future/],
  [() => response([], { headers: { "last-modified": "bad date" } }), /date_invalid/]
];
for (const [fn, pattern] of failures) await assert.rejects(fetchOfficialInstrumentSource(OFFICIAL_NSE_MASTER_URL, { fetchImpl: fn, now }), pattern);
await assert.rejects(fetchOfficialInstrumentSource(OFFICIAL_NSE_MASTER_URL, { fetchImpl: async () => response(rows(2)), maxDownloadBytes: 10, now }), /download_too_large/);
await assert.rejects(fetchOfficialInstrumentSource(OFFICIAL_NSE_MASTER_URL, { fetchImpl: async () => response(rows(2), { gzip: true }), maxDecodedBytes: 10, now }), /larger than|too_large/);
await assert.rejects(fetchOfficialInstrumentSource(OFFICIAL_NSE_MASTER_URL, { fetchImpl: () => new Promise(() => {}), timeoutMs: 10, now }), /fetch_timeout/);
await assert.rejects(fetchOfficialNseMaster({ fetchImpl: async (url) => response(url === OFFICIAL_NSE_MASTER_URL ? rows(2) : [], { status: url === OFFICIAL_NSE_MASTER_URL ? 200 : 503 }), now }), /fetch_http_503/);
console.log("Official NSE unit guards passed: fixed fresh URLs, gzip/plain, bounded fetch, strict identities, exclusions, no padding, provenance and diffs.");

// Runtime integration is completely isolated and mocks every upstream. No live
// broker, database, private token or production portfolio is ever accessed.
const originalCwd = process.cwd();
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "ashstocks-official-master-guard-"));
const nativeFetch = globalThis.fetch;
process.chdir(temp);
globalThis.__ASH_STOCK_ENV = { NODE_ENV: "test", REQUIRE_AUTH: "false", REQUIRE_DB: "false",
  DISABLE_DATA_BANK_AUTO_BOOTSTRAP: "true", DISABLE_PAPER_ENGINE_SCHEDULER: "true", DISABLE_PAPER_ENGINE_AUTOBUY: "true" };
let masterRows = rows(3), suspendedRows = [], mode = "normal", fetchCalls = 0;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (![OFFICIAL_NSE_MASTER_URL, OFFICIAL_NSE_SUSPENDED_URL].includes(url)) throw new Error("Unexpected upstream: " + url);
  fetchCalls += 1;
  if (mode === "network-failure") throw new Error("mock upstream unavailable");
  if (mode === "suspension-failure" && url === OFFICIAL_NSE_SUSPENDED_URL) return response([], { status: 503 });
  return response(url === OFFICIAL_NSE_MASTER_URL ? masterRows : suspendedRows, { gzip: true, headers: { "last-modified": new Date().toUTCString() } });
};
let server;
try {
  const { createServer } = await import("../server.js");
  server = createServer();
  // Invoke the actual HTTP request listener in-process. This does not bind a
  // socket and remains runnable in a sandbox that denies localhost listening.
  const call = (route, method = "GET", body) => new Promise((resolve, reject) => {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { url: route, method, headers: { host: "localhost", "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" } });
    const res = { statusCode: 200, headers: {}, headersSent: false,
      writeHead(status, headers) { this.statusCode = status; this.headers = headers; this.headersSent = true; },
      setHeader(name, value) { this.headers[name] = value; },
      end(value) { try { resolve({ status: this.statusCode, body: JSON.parse(String(value || "{}")) }); } catch (error) { reject(error); } }
    };
    Promise.resolve(server.listeners("request")[0](req, res)).catch(reject);
  });
  const load = (body = {}) => call("/api/data-bank/load-upstox-nse", "POST", body);
  assert.equal((await call("/api/data-bank/market-import-status", "POST", {})).status, 405);
  const seeded = (await call("/api/state")).body.state;
  seeded.paperTrader.positions = [{ symbol: "HELDSTOCK", name: "Existing holding", qty: 10, entry_price: 100, last_price: 100, status: "OPEN", instrument_key: "NSE_EQ|INE999999999", opened_at: "2026-08-01T05:00:00Z" }];
  assert.equal((await call("/api/state", "PUT", seeded)).status, 200);
  const ledgerBefore = (await call("/api/state")).body.state.paperTrader;
  const imported = await load({ limit: 1, max: 1, universe: rows(1, 900) });
  assert.equal(imported.status, 200, JSON.stringify(imported.body));
  assert.equal(imported.body.saved_universe, 3, "Caller cannot truncate the actual official market master");
  assert.equal(imported.body.import.eligible_count, 3);
  const after = (await call("/api/state")).body.state;
  assert.deepEqual(after.paperTrader, ledgerBefore, "Replacing scanner master must preserve existing holdings and ledger");
  const repeated = await load();
  assert.equal(repeated.body.import.added_count, 0);
  assert.equal(repeated.body.import.updated_count, 0);
  assert.equal(repeated.body.import.unchanged_count, 3);
  assert.equal(fetchCalls, 4);
  const prior = (await call("/api/state")).body.state;
  for (const failureMode of ["network-failure", "suspension-failure"]) {
    mode = failureMode;
    const failed = await load();
    assert.ok(failed.status >= 400);
    const state = (await call("/api/state")).body.state;
    for (const key of ["universe", "universeImport", "universeRevision", "paperTrader"]) assert.deepEqual(state[key], prior[key], `Failed ${failureMode} must preserve ${key}`);
  }
  mode = "normal";
  masterRows = [];
  assert.ok((await load()).status >= 400);
  assert.deepEqual((await call("/api/state")).body.state.universe, prior.universe);
  masterRows = rows(5001);
  assert.ok((await load()).status >= 400, "Do not silently truncate sources exceeding storage capacity");
  assert.deepEqual((await call("/api/state")).body.state.universe, prior.universe);
  const countBeforeBlocked = fetchCalls;
  assert.ok((await load({ url: "http://127.0.0.1/private" })).status >= 400);
  assert.equal(fetchCalls, countBeforeBlocked);
  masterRows = rows(4, 1);
  masterRows[0].name = "Updated legal name";
  suspendedRows = [{ exchange: "NSE", segment: "NSE_EQ", instrument_type: "EQ", trading_symbol: masterRows[3].trading_symbol }];
  const changed = await load();
  assert.equal(changed.body.saved_universe, 3);
  assert.deepEqual([changed.body.import.added_count, changed.body.import.updated_count, changed.body.import.removed_count], [1, 1, 1]);
  assert.equal(changed.body.import.excluded_suspended_count, 1);
  assert.deepEqual((await call("/api/state")).body.state.paperTrader, ledgerBefore);
  const status = await call("/api/data-bank/market-import-status");
  assert.equal(status.body.universe_count, 3);
  assert.equal(status.body.import.fetched_at, changed.body.import.fetched_at);

  // All three actual store implementations must update only master metadata;
  // raw nullable ledger fields must not be passed through financial sanitizers.
  const runtimeNames = await fs.readdir(path.join(temp, ".ashstocks-runtime-server"));
  const runtime = await fs.readFile(path.join(temp, ".ashstocks-runtime-server", runtimeNames[0]), "utf8");
  const methods = [...runtime.matchAll(/async saveUniverseMetadata\(nextState\) \{([\s\S]*?)\n\s+\},\n\s+async appendScanRecord/g)];
  assert.equal(methods.length, 3);
  const raw = { universe: [], paperTrader: { positions: [{ symbol: "HELD", qty: 10, last_price: null }], trades: [] }, scannerSettings: { minScoreSelect: 70 } };
  const requested = { universe: changed.body.sample, universeImport: changed.body.import, universeRevision: 7, scannerRotation: {}, paperTrader: {} };
  const universeMetadataFields = ({ universe, universeImport, universeRevision, scannerRotation }) => ({ universe, universeImport, universeRevision, scannerRotation });
  const memoryContext = vm.createContext({ state: structuredClone(raw), requested, universeMetadataFields });
  const memory = await vm.runInContext(`(async function(nextState) { ${methods[0][1]} })(requested)`, memoryContext);
  assert.deepEqual(memory.paperTrader, raw.paperTrader);
  let fileSaved;
  await vm.runInNewContext(`(async function(nextState) { ${methods[1][1]} })(requested)`, { state: {}, requested, universeMetadataFields, STATE_FILE: "isolated", fsp: { readFile: async () => JSON.stringify({ state: raw }) }, writeState: async (value) => { fileSaved = value; } });
  assert.deepEqual(JSON.parse(JSON.stringify(fileSaved.paperTrader)), raw.paperTrader);
  let mongoUpdate;
  await vm.runInNewContext(`(async function(nextState) { ${methods[2][1]} })(requested)`, { requested, universeMetadataFields, collection: { updateOne: async (filter, update) => { mongoUpdate = update; return { matchedCount: 1 }; } } });
  assert.deepEqual(Object.keys(mongoUpdate.$set).sort(), ["state.scannerRotation", "state.universe", "state.universeImport", "state.universeRevision", "updatedAt"].sort());
  console.log("Official NSE runtime guards passed: same-day fresh import, changes/exclusions, failure preservation, read-only status and metadata-only memory/file/Mongo writes.");
} finally {
  if (server?.listening) { server.closeAllConnections?.(); await new Promise((resolve) => server.close(resolve)); }
  globalThis.fetch = nativeFetch;
  delete globalThis.__ASH_STOCK_ENV;
  process.chdir(originalCwd);
}
