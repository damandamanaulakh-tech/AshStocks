import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { Readable } from "node:stream";

// Exercise actual HTTP handlers without opening a socket. All provider traffic
// is mocked and runtime/state files live in a new temporary directory.
const nativeDate = Date;
const nativeFetch = globalThis.fetch;
const originalCwd = process.cwd();
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "ashstocks-valuation-integration-"));
let clock = nativeDate.parse("2026-09-09T05:00:00Z");
globalThis.Date = class extends nativeDate {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
};
process.chdir(temp);
globalThis.__ASH_STOCK_ENV = { NODE_ENV: "test", REQUIRE_AUTH: "false", REQUIRE_DB: "false",
  DISABLE_DATA_BANK_AUTO_BOOTSTRAP: "true", DISABLE_PAPER_ENGINE_SCHEDULER: "true",
  DISABLE_PAPER_ENGINE_AUTOBUY: "true", UPSTOX_ACCESS_TOKEN: "isolated-test-only" };
const key = "NSE_EQ|INE464A01036";
const masterRow = { symbol: "BBL", trading_symbol: "BBL", name: "Bharat Bijlee", isin: "INE464A01036",
  instrument_key: key, exchange: "NSE", segment: "NSE_EQ", instrument_type: "EQ" };
let master = [masterRow];
let feedFails = false;
let quotePrice = 2300;
let quoteAge = 0;
let depthQuantity = 100;
let onQuote = null;
const calls = [];
const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", "last-modified": new Date(clock).toUTCString() } });
globalThis.fetch = async (input) => {
  const url = String(input);
  calls.push(url);
  if (url.includes("suspended-instrument")) return jsonResponse([]);
  if (url === "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz") return jsonResponse(feedFails ? {} : master, feedFails ? 503 : 200);
  if (url.includes("/historical-candle/")) return jsonResponse({ status: "success", data: { candles: Array.from({ length: 253 }, (_, index) => {
    const close = 100 + index;
    return [new Date(clock - (252 - index) * 86400000).toISOString(), close * 0.99, close * 1.01, close * 0.98, close, 800000];
  }) } });
  if (url.startsWith("https://api.upstox.com/v2/market-quote/quotes")) {
    const timestamp = new Date(clock - quoteAge * 1000).toISOString();
    const result = jsonResponse({ status: "success", data: { "NSE_EQ:INE464A01036": {
      instrument_key: key, trading_symbol: "BBL", last_price: quotePrice, timestamp,
      depth: { buy: [{ price: quotePrice - 0.05, quantity: depthQuantity, orders: 10 }], sell: [{ price: quotePrice + 0.05, quantity: 100, orders: 10 }] }
    } } });
    if (onQuote) { const effect = onQuote; onQuote = null; await effect(); }
    return result;
  }
  if (url.startsWith("https://api.upstox.com/")) return jsonResponse({ status: "success", data: [] });
  throw new Error("Unexpected external request in integration guard: " + url);
};

let server;
try {
  const { createServer } = await import("../server.js");
  server = createServer();
  const call = (url, method = "GET", body) => new Promise((resolve, reject) => {
    const request = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    Object.assign(request, { url, method, headers: { host: "localhost", "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" } });
    const headers = {};
    let status = 200;
    const timer = setTimeout(() => reject(new Error("Route timed out: " + url)), 10000);
    const response = {
      setHeader(name, value) { headers[name.toLowerCase()] = value; },
      getHeader(name) { return headers[name.toLowerCase()]; },
      writeHead(code, extra) { status = code; Object.assign(headers, extra || {}); },
      end(value = "") { clearTimeout(timer); try { resolve({ status, body: JSON.parse(String(value)), headers }); } catch (error) { reject(error); } }
    };
    server.emit("request", request, response);
  });
  const getState = async () => (await call("/api/state")).body.state;
  const post = (url, body) => call(url, "POST", body);

  let result = await call("/api/valuation-targets?symbol=BBL");
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(result.body.records.length, 12);
  assert.equal(result.body.selected.status, "REVIEW_REQUIRED");
  assert.equal(result.body.calibrated_prediction, false);
  assert.equal(result.body.broker_write_enabled, false);
  assert.match(result.body.formulas.sell_price, /not an exchange limit-order/);
  assert.equal((await call("/api/valuation-targets?symbol=MISSING")).body.selected.status, "DATA_NEEDED");
  assert.equal((await call("/api/valuation-targets/activate")).status, 405);

  result = await post("/api/data-bank/load-upstox-nse", {});
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.saved_universe, 1);
  assert.equal(result.body.import.requested_count, 2400);
  const state = await getState();
  state.paperTrader.positions = [{ symbol: "BBL", name: "Bharat Bijlee", instrument_key: key,
    qty: 10, entry_price: 2288, current_price: 2300, target_price: 3000, stop_price: 2000,
    entry_date: "2026-09-08T05:00:00Z", status: "OPEN" }];
  await call("/api/state", "PUT", state);
  const held = await getState();
  const originalLedger = structuredClone(held.paperTrader);
  const body = { symbol: "BBL", instrument_key: key, horizon: 12, price_policy: "mid", expected_revision: 0, reason: "Review approved scenario", confirm: true };
  assert.equal((await post("/api/valuation-targets/activate", body)).status, 409, "Unreviewed seed cannot become an executable target");
  let assumption = { ...(await call("/api/valuation-targets?symbol=BBL")).body.selected.assumption,
    corporate_action_reviewed: true, corporate_action_basis: "Test verified common adjusted share basis" };
  assert.equal((await post("/api/valuation-targets/assumptions", { assumption, expected_revision: 9, reason: "Revision mismatch test" })).status, 409);
  assert.equal((await post("/api/valuation-targets/assumptions", { assumption: { ...assumption, annual_eps: -1 }, expected_revision: 0, reason: "Invalid negative earnings" })).status, 400);
  result = await post("/api/valuation-targets/assumptions", { assumption, expected_revision: 0, reason: "Reviewed source and corporate actions" });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.revision, 1);
  assert.equal(result.body.selected.status, "READY");
  assert.deepEqual((await getState()).paperTrader, originalLedger, "Saving assumptions must not rewrite any paper-ledger field");
  body.expected_revision = 1;
  assert.equal((await post("/api/valuation-targets/activate", { ...body, confirm: false })).status, 400);
  quotePrice = 2700;
  assert.equal((await post("/api/valuation-targets/activate", body)).body.error, "valuation_target_not_above_market_and_entry");
  quotePrice = 2300;
  quoteAge = 3600;
  clock += 61000;
  assert.equal((await post("/api/valuation-targets/activate", body)).status, 409, "Stale quotes block activation");
  quoteAge = 0;
  clock += 61000;
  result = await post("/api/valuation-targets/activate", body);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.revision, 2);
  assert.equal(result.body.active_targets.BBL.price, 2585);
  assert.deepEqual((await getState()).paperTrader, originalLedger, "Activation stores metadata only and places no order");
  const activation = result.body.active_targets.BBL;
  result = await call("/api/paper-trader/orders");
  assert.equal(result.body.positions[0].effective_target_price, 2585, "Orders view must use full state, not just mark-to-market data");
  assert.equal(result.body.positions[0].target_price, 3000, "Legacy target remains intact");

  assumption = { ...assumption, annual_eps: 150 };
  result = await post("/api/valuation-targets/assumptions", { assumption, expected_revision: 2, reason: "Revise earnings without moving active exit" });
  assert.equal(result.body.active_targets.BBL.price, 2585, "Assumption edits cannot silently move an activated exit");
  assert.equal(result.body.active_targets.BBL.assumption_snapshot.annual_eps, 110);
  const generic = await getState();
  generic.valuationTargets = { assumptions: {}, activations: {}, revision: 999 };
  await call("/api/state", "PUT", generic);
  assert.equal((await getState()).valuationTargets.revision, 3, "Generic state writes cannot bypass activation controls");

  quotePrice = 2500;
  clock += 61000;
  result = await post("/api/paper-trader/monitor", {});
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal((await getState()).paperTrader.positions.length, 1, "Do not sell at legacy 80-percent progress for an activated target");
  quotePrice = 2600;
  quoteAge = 3600;
  clock += 61000;
  await post("/api/paper-trader/monitor", {});
  assert.equal((await getState()).paperTrader.positions.length, 1, "Local response receipt time cannot make a stale provider price executable");
  quoteAge = 0;
  depthQuantity = 0;
  clock += 61000;
  await post("/api/paper-trader/monitor", {});
  assert.equal((await getState()).paperTrader.positions.length, 1, "No target exit without executable bid depth");
  depthQuantity = 4;
  clock += 61000;
  await post("/api/paper-trader/monitor", {});
  assert.equal((await getState()).paperTrader.positions[0].qty, 6, "Valuation exit only consumes visible bids");
  assert.equal((await call("/api/paper-trader/orders")).body.positions[0].effective_target_price, 2585, "Partial exit remainder keeps the same reviewed entry generation");
  depthQuantity = 100;
  clock += 61000;
  globalThis.__ASH_STOCK_ENV.DISABLE_PAPER_ENGINE_AUTOBUY = "false";
  result = await post("/api/paper-engine/run", {});
  assert.equal(result.status, 200, JSON.stringify(result.body));
  globalThis.__ASH_STOCK_ENV.DISABLE_PAPER_ENGINE_AUTOBUY = "true";
  const sold = (await getState()).paperTrader;
  assert.equal(sold.positions.length, 0);
  assert.equal(sold.trades.length, 2, "Automatic engine and manual monitor must both execute activated exits");
  assert.equal(sold.trades[0].price, 2599.95, "Market simulation fills against visible bid, not valuation price");
  assert.equal(sold.trades[0].valuation_target_snapshot.id, activation.id);
  assert.equal(sold.trades[0].valuation_target_snapshot.assumption_snapshot.annual_eps, 110);
  assert.equal(sold.orders[0].valuation_target_snapshot.price, 2585);

  result = await post("/api/valuation-targets/deactivate", { ...body, expected_revision: 3 });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.active_targets, {});
  const beforeRefresh = await getState();
  const refresh = await post("/api/data-bank/load-upstox-nse", {});
  assert.equal(refresh.status, 200);
  assert.deepEqual((await getState()).paperTrader, beforeRefresh.paperTrader, "Official refresh preserves filled orders and trades");
  assert.deepEqual((await getState()).valuationTargets, beforeRefresh.valuationTargets, "Master refresh preserves valuation audit and active snapshots");
  assert.equal(refresh.body.import.added_count, 0, "A fresh download is not necessarily newly listed companies");
  const beforeFailure = await getState();
  feedFails = true;
  result = await post("/api/data-bank/load-upstox-nse", {});
  assert.notEqual(result.status, 200);
  assert.deepEqual(await getState(), beforeFailure, "Failed official download must not overwrite the saved universe or ledger");
  feedFails = false;
  result = await post("/api/data-bank/load-upstox-nse", { url: "https://example.com/fake-master.json" });
  assert.notEqual(result.status, 200);
  assert.ok(!calls.some((url) => url.includes("example.com")), "Alternate feed URLs must be rejected before any fetch");

  // Reopen only the isolated test holding; production routes never allow this
  // generic state fixture. Scale-ins must invalidate even an unchanged price.
  const reopened = await getState();
  reopened.paperTrader = structuredClone(originalLedger);
  reopened.paperTrader.positions[0].entry_date = new Date(clock).toISOString();
  await call("/api/state", "PUT", reopened);
  quotePrice = 2300;
  clock += 61000;
  result = await post("/api/valuation-targets/activate", { ...body, expected_revision: 4 });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  result = await post("/api/paper-trader/order", { symbol: "BBL", instrument_key: key, side: "BUY", qty: 50,
    price: 2288, source: "isolated-scale-in-test", test_fixture_price: true, paper_only: true, broker_write_enabled: false });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const expanded = await getState();
  assert.equal(expanded.paperTrader.positions[0].entry_price, 2288);
  assert.equal(expanded.paperTrader.positions[0].qty, 60);
  assert.ok(expanded.paperTrader.positions[0].valuation_entry_revision);
  assert.equal((await call("/api/paper-trader/orders")).body.positions[0].effective_target_price, null, "Same-price BUY requires reactivation");
  expanded.paperTrader.positions[0].qty = 5;
  await call("/api/state", "PUT", expanded);
  assert.equal((await call("/api/paper-trader/orders")).body.positions[0].effective_target_price, null, "Later smaller quantity does not undo the entry-generation change");
  clock += 61000;
  result = await post("/api/valuation-targets/activate", { ...body, expected_revision: 5 });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  result = await post("/api/valuation-targets/assumptions", { assumption: { ...assumption, corporate_action_reviewed: false }, expected_revision: 6, reason: "Withdraw share-basis review after event" });
  assert.equal(result.status, 200);
  assert.equal((await call("/api/paper-trader/orders")).body.positions[0].effective_target_price, null);
  quotePrice = 1990;
  clock += 61000;
  await post("/api/paper-trader/monitor", {});
  const stopped = (await getState()).paperTrader;
  assert.equal(stopped.positions.length, 0, "Blocked valuation must not disable the original stop");
  assert.match(stopped.trades[0].close_reason, /STOP_HIT/);
  assert.ok(!Object.hasOwn(stopped.trades[0], "valuation_target_snapshot"), "Legacy stop trades must not gain valuation fields or new archive hashes");

  // Verify the actual generated metadata-only methods for all storage backends.
  const runtimeDir = path.join(temp, ".ashstocks-runtime-server");
  const runtime = await fs.readFile(path.join(runtimeDir, (await fs.readdir(runtimeDir))[0]), "utf8");
  const methods = [...runtime.matchAll(/async saveValuationMetadata\(nextState\) \{([\s\S]*?)\n\s+\},\n\s+async saveUniverseMetadata/g)];
  assert.equal(methods.length, 3);
  const ledger = { positions: [{ last_price: null }], orders: [{ id: "old-order" }], trades: [{ id: "old-trade" }] };
  const stored = { paperTrader: ledger, scannerSettings: { minScoreSelect: 70 }, valuationTargets: { revision: 0 } };
  const requested = { paperTrader: {}, scannerSettings: {}, valuationTargets: { revision: 5 } };
  let written;
  let update;
  const context = vm.createContext({ state: structuredClone(stored), nextState: requested, valuationControl: (value) => value,
    STATE_FILE: "isolated", fsp: { readFile: async () => JSON.stringify({ state: stored }) },
    writeState: async (value) => { written = value; }, collection: { updateOne: async (filter, value) => { update = value; return { matchedCount: 1 }; } } });
  const memory = await vm.runInContext(`(async function(nextState) { ${methods[0][1]} })(nextState)`, context);
  assert.deepEqual(memory.paperTrader, ledger);
  await vm.runInContext(`(async function(nextState) { ${methods[1][1]} })(nextState)`, context);
  assert.deepEqual(JSON.parse(JSON.stringify(written.paperTrader)), ledger);
  await vm.runInContext(`(async function(nextState) { ${methods[2][1]} })(nextState)`, context);
  assert.deepEqual(Object.keys(update.$set).sort(), ["state.valuationTargets", "updatedAt"]);
  console.log("Valuation integration passed: actual routes, explicit activation, frozen snapshots, live-depth-only paper exits, safe refresh and metadata-only stores.");
} finally {
  server?.close();
  process.chdir(originalCwd);
  globalThis.Date = nativeDate;
  globalThis.fetch = nativeFetch;
  delete globalThis.__ASH_STOCK_ENV;
}
