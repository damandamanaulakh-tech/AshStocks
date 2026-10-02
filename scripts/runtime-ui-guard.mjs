import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

// Evaluate the real browser application, not a copied implementation. All fetch,
// clock and DOM effects are isolated; this guard cannot reach live services.
const source = await fs.readFile(new URL("../app.js", import.meta.url), "utf8");
const response = (payload, status = 200) => ({
  ok: status >= 200 && status < 300, status,
  text: async () => JSON.stringify(payload)
});
const unavailableContext = { ok: false, status: "unavailable", cards: [], breadth: {},
  insight: { available: false, bias: "DATA NEEDED", confidence: null, notes: ["Provider data unavailable"] } };
const storageError = { ok: false, code: "storage_unavailable", dependency: "storage", retryable: true,
  error: "fixture internal connection details must not be reflected" };
function harness(handler = () => { throw new Error("Unexpected fixture fetch"); }) {
  const nodes = new Map(), lifecycle = {}, requests = [], timers = new Map(), intervals = [];
  let timerId = 0, clockMs = 0;
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: "", textContent: "", value: "", disabled: false,
      classList: { toggle() {}, add() {}, remove() {} }, querySelectorAll: () => [], addEventListener() {} });
    return nodes.get(id);
  };
  const context = vm.createContext({ console, Date, Intl, URL, URLSearchParams, AbortController,
    location: { origin: "https://offline.invalid" },
    fetch(path, options) { requests.push({ path, options }); return handler(path, options); },
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay, at: clockMs + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    document: { hidden: false, getElementById: node, querySelectorAll: () => [],
      addEventListener(name, callback) { lifecycle[name] = callback; } },
    window: { addEventListener() {}, setInterval(callback, delay) { intervals.push({ callback, delay }); } }
  });
  vm.runInContext(source, context, { filename: "app.js" });
  return { node, context, requests, timers, intervals, lifecycle,
    run: (code) => vm.runInContext(code, context),
    fire(delay) {
      const selected = [...timers].filter(([, timer]) => timer.delay === delay);
      assert(selected.length > 0, `Expected pending ${delay}ms timer`);
      for (const [id, timer] of selected) { timers.delete(id); timer.callback(); }
    },
    advance(delta) {
      clockMs += delta;
      const due = [...timers].filter(([, timer]) => timer.at <= clockMs).sort((left, right) => left[1].at - right[1].at);
      for (const [id, timer] of due) { timers.delete(id); timer.callback(); }
    }
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
let scenarios = 0;
async function test(name, work) { await work(); scenarios += 1; console.log(`PASS ${name}`); }

await test("storage errors retain safe classification without connection details", async () => {
  const h = harness(() => Promise.resolve(response(storageError, 503)));
  await assert.rejects(h.run('api("/api/ready")'), (error) => {
    assert.equal(error.code, "storage_unavailable"); assert.equal(error.dependency, "storage");
    assert.equal(error.retryable, true); assert.equal(error.status, 503);
    assert.doesNotMatch(error.message, /internal connection/); return true;
  });
  assert.equal(h.timers.size, 0);
  const mutation = harness(() => Promise.resolve(response(storageError, 503)));
  await assert.rejects(mutation.run('api("/fixture",{method:"POST"})'), (error) => {
    assert.equal(error.retryable, false); assert.equal(error.outcomeUnknown, true); return true;
  });
  const notRetryable = harness(() => Promise.resolve(response({ ...storageError, retryable: false }, 503)));
  await assert.rejects(notRetryable.run('api("/fixture")'), (error) => error.retryable === false);
});

await test("unknown server bodies and malformed success bodies are safe errors", async () => {
  for (const status of [500, 503, 200]) {
    const h = harness(() => Promise.resolve({ ok: status === 200, status, text: async () => "<html>fixture secret</html>" }));
    await assert.rejects(h.run('api("/fixture")'), (error) => {
      assert.doesNotMatch(error.message, /fixture secret|<html>/);
      assert.equal(error.code, status === 200 ? "invalid_response" : "http_error"); return true;
    });
    assert.equal(h.timers.size, 0);
  }
});

await test("read timeout bounds pending fetch and pending body, aborts and cleans up", async () => {
  for (const stage of ["fetch", "body"]) {
    const h = harness(() => stage === "fetch" ? new Promise(() => {})
      : Promise.resolve({ ok: true, status: 200, text: () => new Promise(() => {}) }));
    const rejected = assert.rejects(h.run('api("/fixture")'), (error) => {
      assert.equal(error.code, "request_timeout"); assert.equal(error.dependency, "network");
      assert.equal(error.retryable, true); assert.equal(error.outcomeUnknown, false); return true;
    });
    await flush(); h.fire(20_000); await rejected;
    assert.equal(h.requests.length, 1); assert.equal(h.requests[0].options.signal.aborted, true);
    assert.equal(h.timers.size, 0);
  }
});

await test("market context and history allow bounded sequential backend stages beyond 20 seconds", async () => {
  for (const [call, deadline, elapsed, payload] of [
    ["loadSignalMarketContext()", 30_000, 26_000, { ...unavailableContext, fixture: "slow-valid" }],
    ['fetchAllPaperHistory("closed")', 40_000, 36_000, { ok: true, records: [{ fixture: "slow-valid" }], next_cursor: null }]
  ]) {
    let resolveResponse;
    const h = harness(() => new Promise((resolve) => { resolveResponse = resolve; }));
    let settled = false;
    const pending = h.run(call).then((result) => { settled = true; return result; });
    await flush();
    assert.equal([...h.timers.values()][0].delay, deadline);
    h.advance(20_001); await flush();
    assert.equal(settled, false); assert.equal(h.requests[0].options.signal.aborted, false);
    h.advance(elapsed - 20_001); resolveResponse(response(payload));
    const result = await pending;
    assert.equal(Array.isArray(result) ? result[0].fixture : result.fixture, "slow-valid");
    assert.equal(h.requests.length, 1); assert.equal(h.timers.size, 0);
  }
  const ordinary = harness(() => new Promise(() => {}));
  const rejected = assert.rejects(ordinary.run('api("/api/health")'), (error) => error.code === "request_timeout");
  ordinary.advance(20_000); await rejected;
  assert.equal(ordinary.requests.length, 1); assert.equal(ordinary.requests[0].options.signal.aborted, true);
});

await test("routed context/history reads still time out once at their own deadlines", async () => {
  const context = harness(() => new Promise(() => {}));
  const contextRequest = context.run("loadSignalMarketContext()"); await flush();
  context.advance(30_000); await contextRequest;
  assert.equal(context.run("state.marketContext.code"), "request_timeout");
  assert.equal(context.requests.length, 1); assert.equal(context.requests[0].options.signal.aborted, true);
  const history = harness(() => new Promise(() => {}));
  const historyRequest = assert.rejects(history.run('fetchAllPaperHistory("closed")'), (error) => error.code === "request_timeout");
  history.advance(40_000); await historyRequest;
  assert.equal(history.requests.length, 1); assert.equal(history.requests[0].options.signal.aborted, true);
});

await test("mutation timeout is longer, never retries and reports unknown outcome", async () => {
  for (const [options, delay] of [["{method:'POST',body:{}}", 120_000],
    ["{method:'POST',timeoutMs:API_LONG_MUTATION_TIMEOUT_MS,body:{}}", 900_000]]) {
    const h = harness(() => new Promise(() => {}));
    const rejected = assert.rejects(h.run(`api('/fixture',${options})`), (error) => {
      assert.equal(error.retryable, false); assert.equal(error.outcomeUnknown, true);
      assert.match(error.message, /may still be running/); return true;
    });
    assert.equal([...h.timers.values()][0].delay, delay); h.fire(delay); await rejected;
    assert.equal(h.requests.length, 1); assert.equal(h.requests[0].options.signal.aborted, true);
    assert.equal(h.timers.size, 0);
  }
  for (const route of ["/api/scanner/run-upstox", "/api/paper-engine/run", "/api/data-bank/load-upstox-nse"]) {
    const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(source, new RegExp(`api\\("${escaped}", \\{ method: "POST", timeoutMs: API_LONG_MUTATION_TIMEOUT_MS`));
  }
});

await test("external cancellation works before/during fetch without another request", async () => {
  for (const preAborted of [false, true]) {
    const h = harness(() => new Promise(() => {}));
    const controller = new AbortController(); h.context.externalSignal = controller.signal;
    if (preAborted) controller.abort();
    const rejected = assert.rejects(h.run('api("/fixture",{method:"POST",signal:externalSignal})'), (error) => {
      assert.equal(error.code, "request_cancelled"); assert.equal(error.retryable, false);
      assert.equal(error.outcomeUnknown, true); return true;
    });
    if (!preAborted) controller.abort(); await rejected;
    assert.equal(h.requests.length, preAborted ? 0 : 1); assert.equal(h.timers.size, 0);
    if (!preAborted) assert.equal(h.requests[0].options.signal.aborted, true);
  }
});

await test("successful requests clean the deadline and external abort listener", async () => {
  const h = harness(() => Promise.resolve(response({ ok: true })));
  const listeners = new Set();
  h.context.externalSignal = { aborted: false,
    addEventListener(type, listener) { listeners.add(listener); },
    removeEventListener(type, listener) { listeners.delete(listener); } };
  assert.equal((await h.run('api("/fixture",{signal:externalSignal})')).ok, true);
  assert.equal(h.timers.size, 0); assert.equal(listeners.size, 0);
});

await test("network failure does not leak adapter internals or retry mutations", async () => {
  const h = harness(() => Promise.reject(new Error("fixture private provider URL")));
  await assert.rejects(h.run('api("/fixture",{method:"POST"})'), (error) => {
    assert.equal(error.code, "network_error"); assert.equal(error.retryable, false);
    assert.equal(error.outcomeUnknown, true); assert.doesNotMatch(error.message, /provider URL/); return true;
  });
  assert.equal(h.requests.length, 1); assert.equal(h.timers.size, 0);
});

await test("readiness failure does not imply an Upstox token problem", async () => {
  for (const payload of [storageError, { ...storageError, code: "storage_timeout" }, { error: "unclassified fixture" }]) {
    const h = harness((path) => Promise.resolve(path.startsWith("/api/market-context")
      ? response(unavailableContext) : response(payload, 503)));
    await h.run("refreshScan()"); await flush();
    assert.equal(h.requests.filter((r) => r.path === "/api/ready").length, 1);
    assert.equal(h.requests.filter((r) => r.path.startsWith("/api/upstox/quote")).length, 0);
    assert.doesNotMatch(h.node("marketStrip").innerHTML, /Renew the Upstox token/);
    assert.match(h.node("signalRadarStamp").textContent, /unavailable; no completed scan/);
    assert.doesNotMatch(h.node("signalRadarLegend").innerHTML, /<b>0<\/b>/);
    assert.equal(h.run("state.scanInFlight"), false);
  }
});

await test("only explicit provider authentication evidence enables token advice", async () => {
  for (const [payload, expected] of [
    [{ code: "upstox_token_expired", dependency: "upstox" }, true],
    [{ code: "upstox_token_expired", dependency: "storage" }, false],
    [{ error: "Unauthorized" }, false]
  ]) {
    const h = harness(() => Promise.resolve(response(payload, 401)));
    await h.run("refreshMarketStrip()");
    assert.equal(h.node("marketStrip").innerHTML.includes("Renew the Upstox token"), expected);
  }
});

await test("provider authorization rejection, missing token and access denial are not reported as expiry", async () => {
  for (const [code, message, providerAuth] of [
    ["upstox_auth_rejected", /rejected authorization.*expiry is not established/i, true],
    ["upstox_token_missing", /No usable Upstox token is selected/, true],
    ["upstox_access_denied", /denied access.*does not prove token expiry/i, false],
    ["upstox_authentication_failed", /requires attention.*expiry is not established/i, true]
  ]) {
    const h = harness(() => Promise.resolve(response({ code, dependency: "upstox", retryable: false, error: "fixture private upstream details" }, 502)));
    await assert.rejects(h.run('api("/fixture")'), (error) => {
      assert.match(error.message, message); assert.equal(error.providerAuth, providerAuth);
      assert.equal(error.retryable, false); assert.doesNotMatch(error.message, /private upstream/); return true;
    });
    await h.run("refreshMarketStrip()");
    assert.doesNotMatch(h.node("marketStrip").innerHTML, /Renew the Upstox token|Application sign-in/);
    assert.match(h.node("marketStrip").innerHTML, code === "upstox_access_denied" ? /API permissions/ : /selected token and authorization/);
  }
  const unknownProvider = harness(() => Promise.resolve(response({ code: "unrecognized_provider_error", dependency: "upstox", error: "fixture private upstream details" }, 401)));
  await assert.rejects(unknownProvider.run('api("/fixture")'), (error) => {
    assert.match(error.message, /Upstox request failed/); assert.doesNotMatch(error.message, /Application sign-in|private upstream/); return true;
  });
});

await test("current Upstox transport codes retain safe actionable browser classification", async () => {
  for (const [code, status, message] of [
    ["upstox_timeout", 504, /Upstox request timed out/],
    ["upstox_network_error", 502, /server could not reach Upstox/],
    ["upstox_rate_limited", 503, /Upstox rate limit reached/],
    ["upstox_unavailable", 503, /Upstox is temporarily unavailable/],
    ["upstox_quote_busy", 503, /quote service is busy/],
    ["upstox_invalid_response", 502, /Upstox returned an invalid response/],
    ["upstox_response_too_large", 502, /safe size limit/],
    ["upstox_redirect_refused", 502, /unexpected redirect/],
    ["upstox_request_target_invalid", 502, /request target was refused/],
    ["upstox_http_error", 502, /Upstox rejected this request/]
  ]) {
    const h = harness(() => Promise.resolve(response({ code, dependency: "upstox", error: "fixture private upstream details" }, status)));
    await h.run("refreshMarketStrip()");
    assert.match(h.node("marketStrip").innerHTML, message);
    assert.doesNotMatch(h.node("marketStrip").innerHTML, /Renew the Upstox token|private upstream/);
  }
});

await test("credential metadata shows presence and selection without claiming provider acceptance", async () => {
  const h = harness();
  h.run(`state.upstoxStatus={token_visible:true,token_present:true,token_source:'manual_paste',token_selection_reason:'stored_selected',token_expiry_state:'not_expired',stored_token_expiry_state:'not_expired',auth_storage_status:'available',provider_auth_status:'not_checked',oauth_configured:true,api_key_visible:true};renderRuntime()`);
  assert.match(h.node("runtimeDetails").innerHTML, /Selected via manual_paste/);
  assert.match(h.node("runtimeDetails").innerHTML, /provider acceptance not verified/);
  assert.doesNotMatch(h.node("runtimeDetails").innerHTML, /active via|active in server env/);
  assert.match(h.node("upstoxDetails").innerHTML, /Server credential metadata only/);
  assert.match(h.node("upstoxDetails").innerHTML, /Not verified by token metadata/);
  assert.match(h.node("upstoxDetails").innerHTML, /Expiry metadata has not passed; provider acceptance unverified/);
  assert.doesNotMatch(h.node("upstoxDetails").innerHTML, /secret active/);
  assert.equal(h.requests.length, 0, "Rendering metadata must not perform an implicit provider check or trade");
});

await test("expired, fallback and unreadable-store metadata remain distinct in Settings", async () => {
  for (const [status, selected, reason] of [
    [{ token_visible: false, token_present: true, token_selection_reason: "stored_expired_no_alternative", stored_token_expiry_state: "expired" }, /No usable token selected; stored token expiry has passed/, /no usable alternative selected/],
    [{ token_visible: true, token_source: "render_env", token_selection_reason: "stored_expired_environment_selected", stored_token_expiry_state: "expired", token_expiry_state: "unknown" }, /Selected via render_env/, /distinct environment credential selected/],
    [{ token_visible: true, token_source: "render_env", token_selection_reason: "storage_unavailable_environment_selected", auth_storage_status: "unavailable" }, /Selected via render_env/, /store unreadable; environment credential selected/],
    [{ token_visible: false, token_present: null, token_selection_reason: "storage_unavailable_no_token", auth_storage_status: "unavailable" }, /saved credential storage is unreadable/, /stored credential presence unknown/],
    [{ token_visible: false, token_present: false, token_selection_reason: "no_token", auth_storage_status: "available" }, /No token present/, /No credential found/],
    [{ error: "Safe unavailable message", token_visible: null }, /Selection check unavailable/, /Not checked/]
  ]) {
    const h = harness(); h.context.fixtureStatus = status;
    h.run("state.upstoxStatus=fixtureStatus;renderRuntime()");
    assert.match(h.node("runtimeDetails").innerHTML, selected); assert.match(h.node("upstoxDetails").innerHTML, reason);
    assert.doesNotMatch(h.node("runtimeDetails").innerHTML, /active via|token absent/);
  }
});

await test("successful token save confirms storage only, never a live provider connection", async () => {
  const h = harness(() => Promise.resolve(response({ ok: true, status: { token_visible: true, token_source: "manual_paste", token_saved_at: "2026-10-02T00:00:00Z", provider_auth_status: "not_checked" } })));
  h.node("upstoxAccessToken").value = "offline-test-only-credential";
  await h.run("submitUpstoxToken({preventDefault(){}})");
  assert.equal(h.requests.length, 1); assert.equal(h.requests[0].path, "/api/upstox/token");
  assert.equal(h.node("upstoxAccessToken").value, "");
  assert.match(h.node("upstoxTokenResult").textContent, /saved in the server credential store/);
  assert.match(h.node("noticeLine").textContent, /Saving does not verify provider acceptance/);
  assert.doesNotMatch(h.node("noticeLine").textContent, /will use it now|connected|offline-test-only-credential|Mongo/);
  assert.match(h.node("upstoxDetails").innerHTML, /Not verified by token metadata/);
});

await test("unconfirmed or failed token-save responses cannot display a successful connection", async () => {
  for (const [payload, status] of [[{ ok: false }, 200], [{ ok: true }, 200], [{ ok: true, status: [] }, 200], [storageError, 503]]) {
    const h = harness(() => Promise.resolve(response(payload, status)));
    h.node("upstoxAccessToken").value = "offline-test-only-credential";
    await h.run("submitUpstoxToken({preventDefault(){}})");
    assert.equal(h.requests.length, 1); assert.equal(h.node("upstoxAccessToken").value, "offline-test-only-credential");
    assert.equal(h.run("state.upstoxStatus"), null);
    assert.match(h.node("upstoxTokenResult").textContent, /Token save failed/);
    assert.doesNotMatch(h.node("noticeLine").textContent, /token saved|connected|offline-test-only-credential/);
  }
});

await test("startup starts independent health/context/readiness and registers the existing timer immediately", async () => {
  const h = harness((path) => {
    if (path.startsWith("/api/paper-trader/orders") || path.startsWith("/api/settings/formulas")) return new Promise(() => {});
    if (path === "/api/ready") return Promise.resolve(response(storageError, 503));
    if (path.startsWith("/api/market-context")) return Promise.resolve(response(unavailableContext));
    return Promise.resolve(response({ ok: true, status: {}, targets: [], commit: "fixture" }));
  });
  h.run("bindUi=()=>{};startClock=()=>{};renderAll=()=>{};renderFormulaSettings=()=>{};renderValuationTargets=()=>{};renderMarketImportProvenance=()=>{}");
  let finished = false; const startup = h.lifecycle.DOMContentLoaded().then(() => { finished = true; });
  await flush();
  assert.equal(finished, false); assert.equal(h.intervals.length, 1);
  for (const prefix of ["/api/health", "/api/market-context", "/api/ready"]) {
    assert.equal(h.requests.filter((r) => r.path.startsWith(prefix)).length, 1, prefix);
  }
  h.fire(20_000); await startup;
  assert.equal(h.run("state.orders.ok"), false); assert.equal(h.timers.size, 0);
});

await test("failed context can be retried on Refresh, concurrent readers are deduplicated", async () => {
  let resolveContext, contextCalls = 0;
  const h = harness((path) => {
    if (path.startsWith("/api/market-context")) {
      contextCalls += 1;
      return contextCalls === 1 ? new Promise((resolve) => { resolveContext = resolve; }) : Promise.resolve(response(unavailableContext));
    }
    return Promise.resolve(response(storageError, 503));
  });
  const first = h.run("loadSignalMarketContext()"), second = h.run("loadSignalMarketContext()");
  assert.equal(first, second); await flush(); assert.equal(contextCalls, 1);
  resolveContext(response(storageError, 503)); await first;
  assert.equal(h.run("state.marketContext.dependency"), "storage");
  await h.run("refreshScan()"); await flush(); assert.equal(contextCalls, 2);
  assert.equal(h.run("state.marketContext.status"), "unavailable");
  assert.equal(h.run("state.marketContext.insight.confidence"), null);
  assert.match(h.node("signalMarketRegime").innerHTML, /Strength DATA NEEDED/);
  assert.doesNotMatch(h.node("signalMarketRegime").innerHTML, /Strength 0/);
});

await test("scanner in-flight guard still prevents overlapping readiness requests", async () => {
  let resolveReady;
  const h = harness((path) => path === "/api/ready" ? new Promise((resolve) => { resolveReady = resolve; }) : Promise.resolve(response(unavailableContext)));
  const first = h.run("refreshScan()"); const second = h.run("refreshScan()");
  assert.equal(await second, null); assert.equal(h.requests.filter((r) => r.path === "/api/ready").length, 1);
  resolveReady(response(storageError, 503)); await first; assert.equal(h.run("state.scanInFlight"), false);
});

await test("no scan yet, loading, failed and completed empty scan are distinct", async () => {
  const h = harness(); h.run("renderSignalDashboard()");
  assert.equal(h.node("signalRadarStamp").textContent, "No completed scan yet");
  assert.doesNotMatch(h.node("signalRadarLegend").innerHTML, /<b>0<\/b>/);
  h.run("state.scanInFlight=true;renderSignalDashboard()");
  assert.match(h.node("signalRadarStamp").textContent, /loading; no completed scan/);
  h.run("state.scanInFlight=false;state.scanError='fixture';renderSignalDashboard()");
  assert.match(h.node("signalRadarStamp").textContent, /unavailable; no completed scan/);
  h.run("state.scanError='';state.scan={ok:true,rows:[]};renderSignalDashboard()");
  assert.equal(h.node("signalRadarStamp").textContent, "0 stocks evaluated from the latest scan");
  assert.match(h.node("signalRadarLegend").innerHTML, /SELECT <b>0<\/b>/);
  h.run("state.scanError='fixture';renderSignalDashboard()");
  assert.match(h.node("signalRadarStamp").textContent, /failed; previous results shown/);
});

await test("logical scanner failure cannot replace previous evidence with fabricated zero success", async () => {
  const h = harness((path) => Promise.resolve(path === "/api/scanner/run-upstox"
    ? response({ ok: false, error: "fixture" }) : response({ ok: true })));
  h.run("loadSignalMarketContext=async()=>{};refreshUpstoxStatus=async()=>{};loadUniverseForFreshScan=async()=>{};refreshMarketStrip=async()=>{};renderAll=()=>{};state.scan={ok:true,rows:[],asOf:'2026-09-29T00:00:00Z'}");
  assert.equal(await h.run("refreshScan()"), null);
  assert.equal(h.run("state.scan.asOf"), "2026-09-29T00:00:00Z");
  assert.match(h.node("noticeLine").textContent, /did not return a completed result/);
  assert.match(h.node("signalRadarStamp").textContent, /failed; previous results shown/);
});

await test("independent startup cannot interpret an absent or failed ledger as no positions", async () => {
  const h = harness();
  h.run("nseMarketOpenNow=()=>true;state.upstoxStatus={token_visible:true};state.rows=[{symbol:'FIXTURE',decision:'SELECT'}];globalThis.engineCalls=0;runPaperEngineNow=async()=>{engineCalls++}");
  await h.run("maybeAutoStartPaperPortfolio()"); assert.equal(h.run("engineCalls"), 0);
  h.run("state.orders={ok:false,positions:[]}"); await h.run("maybeAutoStartPaperPortfolio()");
  assert.equal(h.run("engineCalls"), 0);
});

await test("unknown engine mutation outcome pauses the existing browser automatic loop", async () => {
  const h = harness(() => new Promise(() => {}));
  h.run("nseMarketOpenNow=()=>true;state.upstoxStatus={token_visible:true};state.orders={ok:true,positions:[]};state.rows=[{symbol:'FIXTURE',decision:'SELECT'}]");
  const pending = h.run("runPaperEngineNow()");
  h.fire(900_000); assert.equal(await pending, null);
  assert.equal(h.run("state.paperEngineOutcomeUnknown"), true);
  assert.match(h.node("autoOrderReadiness").innerHTML, /Automatic browser retries are paused/);
  await h.run("maybeAutoStartPaperPortfolio()");
  assert.equal(h.requests.length, 1, "Automatic tick must not retry an uncertain mutation");
});

await test("partial proxy breadth and unavailable confidence are not rendered as complete observations", async () => {
  const h = harness();
  h.run("state.marketContext={insight:{available:false,bias:'DATA NEEDED',confidence:null},breadth:{status:'partial',advancing:2,declining:1,unchanged:0,unknown:2}};renderSignalDashboard()");
  assert.match(h.node("signalMarketRegime").innerHTML, /Paper ranking breadth/);
  assert.doesNotMatch(h.node("signalMarketRegime").innerHTML, /66.7% advance|Strength 0/);
  assert.match(h.node("signalMarketRegime").innerHTML, /Strength DATA NEEDED/);
});

await test("stored marks are visibly labelled without changing saved prices or P&L", async () => {
  const h = harness();
  h.run(`state.orders={ok:true,orders:[],closed_trades:[],positions:[{symbol:'FIXTURE',qty:2,entry_price:100,current_price:105,market_value:210,unrealized_pnl:10,unrealized_pnl_pct:5,quote_timestamp:'2026-09-28T10:00:00Z'}],funds:{unrealized_pnl:10},mark_to_market:{source:'Stored position snapshot',status:'stored_snapshot_not_live',refreshed_on_read:false,as_of:null,marked_positions:0}};state.orderWorkspaceView='positions';renderPortfolioDashboard();renderOrders()`);
  for (const id of ["portfolioDashboardStamp", "paperTradeDashboardStamp"]) {
    assert.match(h.node(id).textContent, /Stored position snapshot/);
    assert.match(h.node(id).textContent, /were not refreshed by this read/);
  }
  for (const id of ["portfolioDashboard", "paperTradeDashboard", "paperBook", "ordersLedger"]) {
    assert.match(h.node(id).innerHTML, /Stored marks|Stored position snapshot/);
    assert.match(h.node(id).innerHTML, /Saved mark/);
    assert.doesNotMatch(h.node(id).innerHTML, /Live mark-to-market|Live marks/);
  }
  assert.equal(h.run("state.orders.positions[0].current_price"), 105);
  assert.equal(h.run("buildPortfolioViewModel().unrealizedPnl"), 10);
  assert.equal(h.requests.length, 0);
});

console.log(`Runtime UI guard passed: ${scenarios} actual-source grouped scenarios; no network, Mongo, deployment or trading calls.`);
