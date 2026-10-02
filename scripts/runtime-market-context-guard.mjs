import assert from "node:assert/strict";
import vm from "node:vm";
import { applyMarketContextPatches } from "../server-market-context-patch.mjs";

// Pure patch-module import only. No server entry point, actual fetch, database,
// process timer, credentials, provider request or application boot is used.
const shell = '\nasync function dataBankStatus() {}\nasync function route(req, res, url) {\n      if (url.pathname === "/api/paper-trader/parameters") {}\n}';
const applied = [];
const generated = applyMarketContextPatches(shell, (source, search, replacement, label) => {
  assert.equal(source.split(search).length - 1, 1, label);
  applied.push(label);
  return source.replace(search, replacement);
});
assert.deepEqual(applied, ["insert market context functions", "market context api route"]);
const keys = ["nifty50", "sensex", "banknifty", "indiavix", "usdinr", "gold"];
const symbols = ["^NSEI", "^BSESN", "^NSEBANK", "^INDIAVIX", "INR=X", "GC=F"];
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const chart = (price = 101, previous = 100, closes = [99, 100, price]) => ({ chart: { result: [{ meta: { regularMarketPrice: price, previousClose: previous }, indicators: { quote: [{ close: closes }] } }] } });
const stateWith = returns => ({ paperTrader: { last_plan: { top_ranked: returns.map(return_6m_pct => ({ return_6m_pct })) } } });
async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
function harness(fetcher = () => ({ ok: true, json: async () => chart() })) {
  let now = Date.parse("2026-09-29T00:00:00Z");
  let timerId = 0;
  const timers = new Map();
  const calls = [];
  const routeReplies = [];
  let dashboardReads = 0;
  const control = { fetcher, state: stateWith([]), dashboardError: null };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const context = vm.createContext({
    Date: ClockDate, AbortController, URL,
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, at: now + delay, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch(url, options) {
      const symbol = decodeURIComponent(new URL(url).pathname.split("/").at(-1));
      const key = keys[symbols.indexOf(symbol)];
      assert(key, "only the six declared synthetic feeds requested");
      const call = { key, signal: options.signal }; calls.push(call);
      return Promise.resolve().then(() => control.fetcher(key, call));
    },
    defaultState: () => stateWith([]), sanitizePaperTraderState: value => value,
    readDashboardState: async () => { dashboardReads++; if (control.dashboardError) throw control.dashboardError; return { store: { mode: "stub" }, state: control.state }; },
    getStore: () => { throw new Error("forbidden_mutating_store_path"); },
    json: (_res, status, body) => { routeReplies.push({ status, body: plain(body) }); }
  });
  vm.runInContext(generated + "\nglobalThis.testApi = { marketNumber, marketRound, marketTone, fetchYahooMarketCard, buildMarketBreadth, marketInsight, marketContextPayload, route, symbols: MARKET_CONTEXT_SYMBOLS };", context);
  return {
    api: context.testApi, calls, timers, control, routeReplies, get dashboardReads() { return dashboardReads; },
    async advance(ms) { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); } await flush(); }
  };
}
const results = [];
async function test(name, fn) { await fn(); results.push({ name, pass: true }); }

await test("strict_numeric_missing_values_never_become_zero", async () => {
  const h = harness();
  for (const value of [null, undefined, "", "  ", NaN, Infinity, -Infinity, "invalid", true, false, [], {}, [0]]) {
    assert.equal(h.api.marketNumber(value), null);
    assert.equal(h.api.marketRound(value), null);
    assert.equal(h.api.marketTone(value), "neutral");
  }
  for (const value of [0, "0", " 0 "]) assert.equal(h.api.marketRound(value), 0);
});

await test("empty_or_invalid_provider_fields_and_closes_remain_unknown", async () => {
  const h = harness(() => ({ ok: true, json: async () => chart(" ", null, [null, "", " ", false, "bad"]) }));
  const payload = await h.api.marketContextPayload();
  assert.equal(payload.status, "unavailable"); assert.equal(payload.ok, false);
  assert(payload.cards.every(c => c.price === null && c.previous_close === null && c.change === null && c.change_pct === null && c.spark.length === 0 && c.tone === "neutral"));
  assert.equal(payload.insight.confidence, null); assert.equal(payload.insight.bias, "DATA NEEDED");
  assert.equal(h.timers.size, 0);
});

await test("all_six_failed_feeds_are_unavailable_and_immediately_retryable", async () => {
  const h = harness(() => { throw new Error("synthetic-private-provider-details"); });
  const first = await h.api.marketContextPayload();
  assert.equal(first.ok, false); assert.equal(first.status, "unavailable");
  assert.equal(first.insight.confidence, null); assert.equal(first.insight.bias, "DATA NEEDED");
  assert.equal(first.insight.missing_required.length, 4);
  assert(first.cards.every(c => c.error === "market_feed_unavailable" && c.available === false));
  assert(!JSON.stringify(first).includes("synthetic-private-provider-details"));
  h.control.fetcher = () => ({ ok: true, json: async () => chart() });
  assert.equal((await h.api.marketContextPayload()).status, "available");
  assert.equal(h.calls.length, 12);
});

await test("each_missing_required_index_or_vix_suppresses_confident_insight", async () => {
  for (const absent of keys.slice(0, 4)) {
    const h = harness(key => ({ ok: true, json: async () => key === absent ? chart(101, null, [101]) : chart() }));
    const payload = await h.api.marketContextPayload();
    assert.equal(payload.status, "partial"); assert.equal(payload.insight.confidence, null);
    assert.deepEqual(plain(payload.insight.missing_required), [absent]);
    assert.equal(payload.cards.find(c => c.key === absent).change_pct, null);
    await h.api.marketContextPayload(); assert.equal(h.calls.length, 12);
  }
});

await test("optional_macro_failure_does_not_invent_notes_or_hide_core_evidence", async () => {
  const h = harness(key => { if (["gold", "usdinr"].includes(key)) throw new Error("offline"); return { ok: true, json: async () => chart() }; });
  const payload = await h.api.marketContextPayload();
  assert.equal(payload.status, "partial"); assert.equal(payload.insight.status, "available");
  assert.equal(payload.insight.bias, "Constructive"); assert.equal(payload.insight.confidence, 76);
  assert(!payload.insight.notes.some(note => /gold|USD/.test(note)));
});

await test("genuine_zero_change_is_valid_evidence_not_missing", async () => {
  const h = harness(() => ({ ok: true, json: async () => chart(100, 100, [99, 100, 100]) }));
  const payload = await h.api.marketContextPayload();
  assert(payload.cards.every(card => card.status === "available" && card.change === 0 && card.change_pct === 0));
  assert.equal(payload.status, "available"); assert.equal(payload.insight.bias, "Cautious"); assert.equal(payload.insight.confidence, 55);
  assert.equal(h.timers.size, 0);
});

await test("valid_data_original_bias_confidence_and_notes_are_unchanged", async () => {
  const h = harness();
  // The old formula's thresholds are preserved across all index-positive
  // counts and decreasing, flat, or rising VIX, using genuine known values.
  for (let positive = 0; positive <= 3; positive++) for (const vix of [-1, 0, 1]) {
    const cards = keys.map((key, i) => ({ key, group: i < 3 ? "index" : i === 3 ? "risk" : "macro", price: 100, change_pct: i < 3 ? (i < positive ? 1 : -1) : i === 3 ? vix : 1 }));
    const result = h.api.marketInsight(cards, { advancing: 2, declining: 1 });
    const oldBias = positive >= 2 && vix <= 0 ? "Bullish" : positive >= 2 ? "Constructive" : "Cautious";
    const oldConfidence = Math.min(95, Math.max(35, 45 + positive * 12 + (vix <= 0 ? 10 : -5)));
    assert.equal(result.bias, oldBias); assert.equal(result.confidence, oldConfidence);
    assert.deepEqual(plain(result.notes), [positive >= 2 ? "index breadth supportive" : "index confirmation weak", vix <= 0 ? "volatility easing" : "volatility rising", "gold bid shows risk hedge demand", "USD/INR pressure visible", "paper universe momentum breadth positive"]);
  }
});

await test("price_fallback_uses_only_real_numbers_and_zero_denominator_is_unknown", async () => {
  const h = harness(() => ({ ok: true, json: async () => chart(null, "", [null, "100", "101", ""]) }));
  const card = await h.api.fetchYahooMarketCard(h.api.symbols[0]);
  assert.equal(card.price, 101); assert.equal(card.previous_close, 100); assert.equal(card.change_pct, 1);
  h.control.fetcher = () => ({ ok: true, json: async () => chart(100, 0, []) });
  const zeroBase = await h.api.fetchYahooMarketCard(h.api.symbols[0]);
  assert.equal(zeroBase.previous_close, 0); assert.equal(zeroBase.change_pct, null); assert.equal(zeroBase.status, "partial");
});

await test("breadth_unknown_returns_are_not_counted_unchanged", async () => {
  const h = harness();
  const state = stateWith([1, -1, 0, null, "", " ", false]);
  const breadth = h.api.buildMarketBreadth(state, state.paperTrader);
  assert.deepEqual(plain(breadth), { advancing: 1, declining: 1, unchanged: 1, unknown: 4, status: "partial", source: "latest paper ranking proxy" });
});

await test("complete_wave_cache_expires_at_two_minutes_without_freezing_breadth", async () => {
  const h = harness();
  const first = await h.api.marketContextPayload(stateWith([1]));
  await h.advance(119999);
  const second = await h.api.marketContextPayload(stateWith([-1]));
  assert.equal(h.calls.length, 6); assert.equal(first.asOf, second.asOf);
  assert.equal(first.breadth.advancing, 1); assert.equal(second.breadth.declining, 1);
  await h.advance(1); await h.api.marketContextPayload(); assert.equal(h.calls.length, 12);
});

await test("concurrent_requests_share_provider_wave_but_keep_own_breadth", async () => {
  const gate = deferred(); const h = harness(async () => { await gate.promise; return { ok: true, json: async () => chart() }; });
  const first = h.api.marketContextPayload(stateWith([1])); const second = h.api.marketContextPayload(stateWith([-1]));
  await flush(); assert.equal(h.calls.length, 6); gate.resolve();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.breadth.advancing, 1); assert.equal(b.breadth.declining, 1); assert.equal(h.timers.size, 0);
});

await test("stalled_headers_timeout_abort_and_release_single_flight_for_retry", async () => {
  const h = harness(() => new Promise(() => {}));
  const pending = h.api.marketContextPayload(); await flush();
  assert.equal(h.calls.length, 6); assert.equal(h.timers.size, 6);
  await h.advance(7999); assert(h.calls.every(call => !call.signal.aborted));
  await h.advance(1); const payload = await pending;
  assert(payload.cards.every(card => card.error === "market_feed_timeout")); assert.equal(payload.insight.confidence, null);
  assert(h.calls.every(call => call.signal.aborted)); assert.equal(h.timers.size, 0);
  h.control.fetcher = () => ({ ok: true, json: async () => chart() });
  assert.equal((await h.api.marketContextPayload()).status, "available"); assert.equal(h.calls.length, 12);
});

await test("stalled_body_timeout_and_late_resolution_cannot_restore_failed_cache", async () => {
  const body = deferred(); const h = harness(() => ({ ok: true, json: () => body.promise }));
  const pending = h.api.marketContextPayload(); await flush();
  await h.advance(8000); const first = await pending;
  assert.equal(first.status, "unavailable"); assert(first.cards.every(card => card.error === "market_feed_timeout"));
  body.resolve(chart(999, 100, [100, 999])); await flush();
  h.control.fetcher = () => ({ ok: true, json: async () => chart(101, 100) });
  const second = await h.api.marketContextPayload(); assert.equal(h.calls.length, 12);
  assert(second.cards.every(card => card.price === 101)); assert(first.cards.every(card => card.price === null));
});

await test("late_rejected_body_is_handled_and_next_request_can_retry", async () => {
  const body = deferred(); const h = harness(() => ({ ok: true, json: () => body.promise }));
  const pending = h.api.marketContextPayload(); await flush(); await h.advance(8000); await pending;
  body.reject(new Error("late synthetic body rejection")); await flush();
  h.control.fetcher = () => ({ ok: true, json: async () => chart() });
  assert.equal((await h.api.marketContextPayload()).status, "available");
});

await test("malformed_json_http_failure_and_empty_payload_remain_retryable", async () => {
  for (const fetcher of [() => ({ ok: false, status: 503 }), () => ({ ok: true, json: async () => { throw new SyntaxError("invalid JSON"); } }), () => ({ ok: true, json: async () => ({}) })]) {
    const h = harness(fetcher); assert.equal((await h.api.marketContextPayload()).status, "unavailable");
    await h.api.marketContextPayload(); assert.equal(h.calls.length, 12); assert.equal(h.timers.size, 0);
  }
});

await test("market_route_uses_non_mutating_dashboard_read_and_returns_typed_unknown", async () => {
  const h = harness(() => { throw new Error("offline"); });
  await h.api.route({ method: "GET" }, {}, new URL("https://stub.invalid/api/market-context"));
  assert.equal(h.dashboardReads, 1); assert.equal(h.routeReplies[0].status, 200);
  assert.equal(h.routeReplies[0].body.ok, false); assert.equal(h.routeReplies[0].body.insight.confidence, null);
});

await test("dashboard_read_failure_prevents_provider_calls_and_preserves_tagged_error", async () => {
  const h = harness(); const tagged = new Error("storage_read_unavailable"); tagged.status = 503; h.control.dashboardError = tagged;
  await assert.rejects(() => h.api.route({ method: "GET" }, {}, new URL("https://stub.invalid/api/market-context")), error => error === tagged);
  assert.equal(h.calls.length, 0); assert.equal(h.routeReplies.length, 0);
});

console.log(JSON.stringify({ ok: true, scenarios: results.length, source: "actual server-market-context-patch.mjs functions and route, generated by the real pure patch module", isolation: "VM; fake fetch, clock, timers and dashboard reader; no app boot/network/Mongo", results }, null, 2));
