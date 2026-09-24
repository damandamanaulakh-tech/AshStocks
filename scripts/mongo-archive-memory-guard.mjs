import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
// Exercise the installed 6.x collection result, which deliberately has no
// `acknowledged` property (unlike MongoClient bulk-write results).
import { BulkWriteResult } from "mongodb/lib/bulk/common.js";

const originalCwd = process.cwd();
const originalEnv = globalThis.__ASH_STOCK_ENV;
const originalFetch = globalThis.fetch;
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "ashstocks-mongo-archive-guard-"));
let runtimeSource;
let sanitizeState;
try {
  process.chdir(temp);
  globalThis.__ASH_STOCK_ENV = {
    NODE_ENV: "test", REQUIRE_DB: "false", REQUIRE_AUTH: "false",
    DISABLE_DATA_BANK_AUTO_BOOTSTRAP: "true", DISABLE_PAPER_ENGINE_SCHEDULER: "true"
  };
  globalThis.fetch = async () => { throw new Error("No upstream calls allowed in the Mongo archive guard"); };
  ({ sanitizeState } = await import("../server.js"));
  const runtimeDir = path.join(temp, ".ashstocks-runtime-server");
  const files = await fs.readdir(runtimeDir);
  assert.equal(files.length, 1);
  runtimeSource = await fs.readFile(path.join(runtimeDir, files[0]), "utf8");
} finally {
  process.chdir(originalCwd);
  if (originalEnv === undefined) delete globalThis.__ASH_STOCK_ENV;
  else globalThis.__ASH_STOCK_ENV = originalEnv;
  globalThis.fetch = originalFetch;
}

// Let the JS parser find the closing brace, including functions with strings,
// template expressions or nested callbacks. No copied production algorithms.
function runtimeFunction(name) {
  const match = new RegExp(`^(?:async )?function ${name}\\(`, "m").exec(runtimeSource);
  assert.ok(match, `Missing generated function ${name}`);
  const start = match.index;
  for (let end = runtimeSource.indexOf("}", start); end >= 0; end = runtimeSource.indexOf("}", end + 1)) {
    const source = runtimeSource.slice(start, end + 1);
    try { new vm.Script(`(${source})`); return source; } catch (_) { /* closing brace is inside the function */ }
  }
  throw new Error(`Cannot extract generated function ${name}`);
}

const archiveStart = runtimeSource.indexOf('const PAPER_LEDGER_SCHEMA_VERSION = "ashstocks-paper-ledger-v1";');
const archiveEnd = runtimeSource.indexOf("\nasync function getStore()", archiveStart);
assert.ok(archiveStart >= 0 && archiveEnd > archiveStart);
const archiveHelpers = runtimeSource.slice(archiveStart, archiveEnd);
const sanitizerHelpers = ["finiteOr", "round", "normalizeSymbol", "sanitizeParameterEvidence", "sanitizeExecutionEvidence",
  "valuationClone", "valuationExecutionFields", "sanitizePaperOrder", "sanitizePaperTrade"].map(runtimeFunction).join("\n");
const driverImport = '  const { MongoClient } = await import("mongodb");';
let mongoStoreSource = runtimeFunction("createMongoStore");
assert.ok(mongoStoreSource.includes(driverImport));
mongoStoreSource = mongoStoreSource.replace(driverImport, "  const { MongoClient } = globalThis.fakeMongo;");
const returnAnchor = '      return {\n        mode: "mongodb",';
assert.ok(mongoStoreSource.includes(returnAnchor));
mongoStoreSource = mongoStoreSource.replace(returnAnchor, `      globalThis.inspectArchive = () => ({
        confirmed: [...confirmedPaperLedgerEvents.entries()], pending: paperLedgerArchivePending
      });\n${returnAnchor}`);

const at = "2026-09-24T05:00:00.000Z";
function rawState(orderCount = 200, tradeCount = 300) {
  const orders = Array.from({ length: orderCount }, (_, index) => ({
    id: `order-${index}`, symbol: `TEST${index}`, qty: 1, price: 100, status: "PAPER_FILLED", created_at: at, updated_at: at
  }));
  const trades = Array.from({ length: tradeCount }, (_, index) => ({
    id: `trade-${index}`, order_id: `order-${index}`, symbol: `TEST${index}`, qty: 1, price: 100, side: "BUY", traded_at: at
  }));
  return { universe: [{ symbol: "HELD", name: "Held", instrument_key: "NSE_EQ|INE000000001" }],
    paperTrader: { orders, trades, positions: [{ symbol: "HELD", qty: 10, entry_price: 100, current_price: 110 }] } };
}

function collectionResult(matched, upsertedIds) {
  return new BulkWriteResult({ ok: 1, nMatched: matched, nModified: 0, nInserted: 0, nRemoved: 0,
    upserted: upsertedIds, insertedIds: [], writeErrors: [], writeConcernErrors: [] }, false);
}

async function harness(initialState = rawState(), sharedRecords = new Map()) {
  let clock = Date.parse(at);
  let persisted = structuredClone(initialState);
  let active = 0;
  const actions = [];
  const metrics = { calls: [], stateWrites: 0, maxActive: 0 };
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  function apply(operations) {
    let matched = 0;
    const upserted = [];
    for (const [index, operation] of operations.entries()) {
      assert.deepEqual(Object.keys(operation), ["updateOne"]);
      assert.deepEqual(Object.keys(operation.updateOne.update), ["$setOnInsert"]);
      assert.equal(operation.updateOne.upsert, true);
      const id = operation.updateOne.filter._id;
      assert.equal(id, operation.updateOne.update.$setOnInsert.event_id);
      if (sharedRecords.has(id)) matched += 1;
      else { sharedRecords.set(id, structuredClone(operation.updateOne.update.$setOnInsert)); upserted.push({ index, _id: id }); }
    }
    return collectionResult(matched, upserted);
  }
  const ledger = {
    writeConcern: { w: "majority" },
    async createIndex() {},
    async bulkWrite(operations, options) {
      metrics.calls.push(operations.map((item) => item.updateOne.filter._id));
      assert.equal(options.ordered, false);
      assert.ok(operations.length <= 500, "One driver call must have at most 500 events");
      active += 1;
      metrics.maxActive = Math.max(metrics.maxActive, active);
      try {
        const action = actions.shift();
        return action ? await action(operations, apply) : apply(operations);
      } finally { active -= 1; }
    }
  };
  const collection = {
    async createIndex() {},
    async findOne() { return { state: structuredClone(persisted) }; },
    async updateOne(filter, update) {
      assert.equal(filter._id, "default");
      assert.ok(update.$set.state);
      metrics.stateWrites += 1;
      persisted = structuredClone(update.$set.state);
      return { matchedCount: 1, acknowledged: true };
    }
  };
  const context = vm.createContext({
    console, crypto, Buffer, Date: TestDate, sanitizeState, fakeMongo: { MongoClient: class {
      async connect() {}
      async close() {}
      db() { return { collection: (name) => name === "paper_ledger" ? ledger : name === "app_state" ? collection : { async createIndex() {} } }; }
    } }, ENV: {}, mongoTimeoutMs: () => 100,
    mongoUriCandidates: () => [{ key: "MOCK_URI", uri: "mongodb://mock.invalid" }],
    withTimeout: (promise) => promise,
    defaultState: () => { throw new Error("Fixture state unexpectedly missing"); }
  });
  vm.runInContext(`const PAPER_VISIBLE_DEPTH_LEVELS = 5;\n${sanitizerHelpers}\n${archiveHelpers}\n${mongoStoreSource}`, context);
  const store = await vm.runInContext("createMongoStore()", context);
  return { store, metrics, records: sharedRecords, ledger, actions,
    inspect: () => context.inspectArchive(), setClock: (value) => { clock = value; },
    advance: (ms) => { clock += ms; }, getClock: () => clock,
    state: () => structuredClone(persisted), replaceState: (value) => { persisted = structuredClone(value); },
    archiveRecords: (value) => context.paperLedgerArchiveRecords(value),
    operationCount: () => metrics.calls.reduce((count, batch) => count + batch.length, 0) };
}

const sequential = await harness();
const original = sequential.state();
for (let index = 0; index < 20; index += 1) await sequential.store.getState();
assert.equal(sequential.metrics.calls.length, 1);
assert.equal(sequential.operationCount(), 500);
assert.equal(sequential.records.size, 500);
assert.deepEqual(sequential.state(), original, "Backfill must never rewrite positions or the state document");
assert.equal(sequential.metrics.stateWrites, 0);
assert.equal(sequential.inspect().pending, 0);
for (const record of sequential.archiveRecords(original)) {
  const saved = sequential.records.get(record.event_id);
  assert.ok(saved, "Existing content-based event IDs must not change");
  assert.equal(saved.payload_hash, record.payload_hash);
  assert.equal(JSON.stringify(saved.payload), JSON.stringify(record.payload));
}
const resultShape = collectionResult(500, []);
assert.equal("acknowledged" in resultShape, false, "Driver 6.x CollectionBulkWriteResult must be accepted without a fictitious flag");

const concurrent = await harness();
await Promise.all(Array.from({ length: 20 }, () => concurrent.store.getState()));
assert.equal(concurrent.metrics.calls.length, 1);
assert.equal(concurrent.operationCount(), 500);
assert.equal(concurrent.metrics.maxActive, 1);
assert.equal(concurrent.inspect().pending, 0);
const historyState = await concurrent.store.getState();
await concurrent.store.archivePaperLedgerState(historyState, { source: "history-backfill" });
assert.equal(concurrent.operationCount(), 500, "History's getState plus explicit backfill must not duplicate writes");

const changed = concurrent.state();
changed.paperTrader.orders[0].status = "PAPER_REJECTED";
changed.paperTrader.orders.unshift({ id: "new-order", symbol: "NEW", qty: 2, price: 120, created_at: at });
concurrent.replaceState(changed);
await concurrent.store.getState();
assert.equal(concurrent.operationCount(), 502, "New events and changed payload versions must both archive");
assert.equal(concurrent.records.size, 502, "The old order version remains in the append-only ledger");
await concurrent.store.saveState(changed);
assert.equal(concurrent.operationCount(), 502);
assert.equal(concurrent.metrics.stateWrites, 1);

const expiry = await harness(rawState(2, 0));
await expiry.store.getState();
const confirmedAt = expiry.inspect().confirmed[0][1];
for (let minute = 0; minute < 4; minute += 1) {
  expiry.advance(60_000);
  await expiry.store.getState();
  assert.equal(expiry.inspect().confirmed[0][1], confirmedAt, "Cache hits must not extend the fixed TTL");
}
assert.equal(expiry.operationCount(), 2);
expiry.advance(60_000);
await expiry.store.getState();
assert.equal(expiry.operationCount(), 4, "At five minutes, successful writes must be re-confirmed");
expiry.setClock(confirmedAt - 1);
await expiry.store.getState();
assert.equal(expiry.operationCount(), 6, "Clock rollback must not give cached records unlimited freshness");
const writeTime = await harness(rawState(1, 0));
writeTime.actions.push(async (operations, apply) => { writeTime.advance(120_000); return apply(operations); });
await writeTime.store.getState();
assert.equal(writeTime.inspect().confirmed[0][1], writeTime.getClock(), "TTL begins at the successful write, not at its start");

const overflow = await harness(rawState(1101, 1101));
await overflow.store.saveState(overflow.state());
assert.equal(overflow.records.size, 2202, "Archive raw orders/trades before applying hot-snapshot limits");
assert.equal(overflow.state().paperTrader.orders.length, 200);
assert.equal(overflow.state().paperTrader.trades.length, 300);
assert.equal(overflow.inspect().confirmed.length, 2000);
assert.ok(overflow.metrics.calls.every((batch) => batch.length <= 500));
for (const [id, timestamp] of overflow.inspect().confirmed) {
  assert.match(id, /^[a-f0-9]{64}$/);
  assert.equal(typeof timestamp, "number", "Cache stores only hash/timestamp entries, not records");
}
const firstArchivedOrder = [...overflow.records.values()].find((record) => record.entity_id === "order-0");
const single = rawState(0, 0);
single.paperTrader.orders.push(firstArchivedOrder.payload);
await overflow.store.archivePaperLedgerState(single);
assert.equal(overflow.records.size, 2202, "Cache eviction only repeats an idempotent upsert; no historical data is removed");
assert.equal(overflow.operationCount(), 2203);
assert.equal(overflow.inspect().confirmed.length, 2000);

const restarted = await harness(sequential.state(), sequential.records);
await restarted.store.getState();
assert.equal(restarted.operationCount(), 500, "A new store/process must verify its own cache from durable writes");
assert.equal(restarted.records.size, 500);
assert.equal(sequential.operationCount(), 500, "Stores must not share process-local confirmation state");

const partial = await harness(rawState(700, 500));
partial.actions.push((operations, apply) => apply(operations));
partial.actions.push((operations, apply) => { apply(operations.slice(0, 7)); throw new Error("mock_partial_bulk_failure"); });
const beforePartial = partial.state();
await assert.rejects(partial.store.saveState(beforePartial), /mock_partial_bulk_failure/);
assert.equal(partial.metrics.stateWrites, 0, "A failed archive must stop app_state replacement");
assert.deepEqual(partial.state(), beforePartial);
assert.equal(partial.records.size, 507, "The mock models real partial success before a rejected write");
assert.equal(partial.inspect().confirmed.length, 500, "Do not cache any item from a failed batch");
await partial.store.saveState(beforePartial);
assert.equal(partial.records.size, 1200);
assert.equal(partial.metrics.stateWrites, 1);
assert.equal(partial.operationCount(), 1700, "Retry only unconfirmed batches, including the partially written batch");
assert.equal(partial.inspect().pending, 0, "A rejected job must not poison or retain the queue");

for (const failureResult of [
  { matchedCount: 0, upsertedCount: 0 },
  { upsertedCount: 3 },
  { matchedCount: -1, upsertedCount: 4 },
  { matchedCount: 0, upsertedCount: 3, acknowledged: false },
  { matchedCount: 0, upsertedCount: 3, isOk: () => false },
  { matchedCount: 0, upsertedCount: 3, hasWriteErrors: () => true },
  { matchedCount: 0, upsertedCount: 3, getWriteConcernError: () => ({ message: "not durable" }) }
]) {
  const failed = await harness(rawState(3, 0));
  failed.actions.push(() => failureResult);
  await assert.rejects(failed.store.saveState(failed.state()), /paper_ledger_archive_not_confirmed/);
  assert.equal(failed.inspect().confirmed.length, 0);
  assert.equal(failed.metrics.stateWrites, 0);
  await failed.store.saveState(failed.state());
  assert.equal(failed.records.size, 3);
  assert.equal(failed.metrics.stateWrites, 1, "Failure must remain retryable");
}

const noAck = await harness(rawState(1, 0));
noAck.ledger.writeConcern.w = 0;
await assert.rejects(noAck.store.saveState(noAck.state()), /paper_ledger_acknowledged_writes_required/);
assert.equal(noAck.metrics.calls.length, 0);
assert.equal(noAck.metrics.stateWrites, 0);
noAck.ledger.writeConcern.w = "majority";
await noAck.store.saveState(noAck.state());
assert.equal(noAck.metrics.stateWrites, 1);

const queued = await harness(rawState(1, 0));
let release;
const gate = new Promise((resolve) => { release = resolve; });
queued.actions.push(async (operations, apply) => { await gate; return apply(operations); });
const waiting = Array.from({ length: 32 }, () => queued.store.archivePaperLedgerState(queued.state()));
assert.equal(queued.inspect().pending, 32);
await assert.rejects(queued.store.archivePaperLedgerState(queued.state()), /paper_ledger_archive_busy_retry/);
assert.equal(queued.inspect().pending, 32, "Backpressure must not append another retained raw-state closure");
release();
await Promise.all(waiting);
assert.equal(queued.metrics.maxActive, 1);
assert.equal(queued.operationCount(), 1);
assert.equal(queued.inspect().pending, 0);
await queued.store.getState();
assert.equal(queued.operationCount(), 1, "A drained queue must accept work after overload");

const failedQueue = await harness(rawState(2, 0));
failedQueue.actions.push(() => { throw new Error("mock_first_failure"); });
const first = failedQueue.store.getState();
const second = failedQueue.store.getState();
const failures = await Promise.allSettled([first, second]);
assert.equal(failures[0].status, "rejected");
assert.equal(failures[1].status, "fulfilled");
assert.equal(failedQueue.records.size, 2);
assert.equal(failedQueue.inspect().pending, 0);
assert.equal(failedQueue.metrics.maxActive, 1);

console.log("Mongo archive memory guard passed: 20 sequential/concurrent reads each write 500 events once; fixed TTL, bounded hash cache/queue, driver 6.x confirmation, retry safety, and archive-before-truncate verified without Mongo/network access.");
