import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import vm from "node:vm";
import { UPSTOX_HTTP_FUNCTIONS } from "../lib/upstox-http.mjs";

// Execute only the embedded HTTP helpers: no application boot, environment
// credential reads, provider requests, database calls, file writes or orders.
// Native Response/ReadableStream instances exercise real body-reader behavior.
const checks = [];
const API = "https://api.upstox.com/v2/fixture";
const SECRET = "fixture-secret-never-emit";
const STAGES = ["candles", "quote", "oauth_preflight", "oauth_exchange"];
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness(fetchMock, env = {}) {
  const events = { calls: [], timers: [], cleared: [], logs: [] };
  const context = vm.createContext({
    ENV: { ...env }, Buffer, URL, URLSearchParams, TextDecoder, TextEncoder,
    Uint8Array, ArrayBuffer, AbortController, Date, Response, ReadableStream,
    console: {
      log: (...args) => events.logs.push(args.join(" ")),
      warn: (...args) => events.logs.push(args.join(" ")),
      error: (...args) => events.logs.push(args.join(" "))
    },
    fetch: async (url, init) => {
      events.calls.push({ url, init });
      return fetchMock(url, init);
    },
    // Production still receives its normal 1000..15000ms deadline. Only the
    // VM timer executes faster so offline stall cases finish promptly.
    setTimeout: (fn, ms, ...args) => {
      const handle = setTimeout(fn, Math.min(Number(ms), 25), ...args);
      events.timers.push({ requested: ms, handle });
      return handle;
    },
    clearTimeout: handle => { events.cleared.push(handle); clearTimeout(handle); }
  });
  vm.runInContext(UPSTOX_HTTP_FUNCTIONS, context, { timeout: 1000 });
  return {
    events, context,
    request: (url = API, init = {}, stage = "candles") => context.upstoxFetchJson(url, init, stage),
    failure: (...args) => context.upstoxRequestFailure(...args),
    payload: error => context.upstoxRequestPayload(error)
  };
}

async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Offline guard watchdog: request did not settle")), 1000);
      })
    ]);
  } finally { clearTimeout(timer); }
}

function assertRedacted(value) {
  const text = JSON.stringify(value);
  assert(!text.includes(SECRET), "Synthetic credentials/provider detail must not escape");
  assert(!text.includes("https://api.upstox.com"), "Provider URLs must not escape through errors");
  assert(!text.includes("Bearer "), "Authorization headers must not escape through errors");
}

async function expectFailure(h, work, code, { status, upstream, stage = "candles" } = {}) {
  let captured;
  await assert.rejects(bounded(work), error => {
    captured = error;
    assert.equal(error.code, code);
    if (status !== undefined) assert.equal(error.status, status);
    assert.equal(error.dependency, "upstox");
    assert.equal(error.stage, stage);
    if (upstream !== undefined) assert.equal(error.upstream_status, upstream);
    assertRedacted({ message: error.message, stack: error.stack, ...error });
    return true;
  });
  const payload = h.payload(captured);
  assert(payload && typeof payload === "object", "Known failure has a structured public payload");
  assert.equal(payload.code, code);
  assert.equal(payload.dependency, "upstox");
  assertRedacted(payload);
  assertRedacted(h.events.logs);
  return { error: captured, payload };
}

async function check(name, work) {
  await work();
  checks.push(name);
  console.log("PASS " + name);
}

function streamResponse(chunks, { status = 200, headers = {}, onCancel = () => {} } = {}) {
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
      controller.close();
    },
    cancel: onCancel
  }), { status, headers });
}

await check("JSON success preserves payload and uses the protected fetch policy", async () => {
  const h = harness(async () => streamResponse(["{\"data\":", "{\"price\":12.5}}"]));
  const result = await bounded(h.request(API, { headers: { authorization: "Bearer " + SECRET } }));
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.payload.data.price, 12.5);
  assert.equal(h.events.calls.length, 1);
  assert.equal(h.events.calls[0].init.redirect, "error");
  assert.ok(h.events.calls[0].init.signal instanceof AbortSignal);
  assert.equal(h.events.timers[0].requested, 8000);
  assert(h.events.cleared.includes(h.events.timers[0].handle), "Success clears its deadline");
});

await check("Timeout configuration uses default and bounded limits", async () => {
  for (const [value, expected] of [[undefined, 8000], ["invalid", 8000], ["100", 1000], ["50000", 15000], ["4500", 4500]]) {
    const h = harness(async () => new Response("{}"), { UPSTOX_HTTP_TIMEOUT_MS: value });
    await bounded(h.request());
    assert.equal(h.events.timers[0].requested, expected, String(value));
  }
});

await check("Non-Upstox, insecure and credential-bearing targets never reach fetch", async () => {
  for (const target of ["http://api.upstox.com/v2/fixture", "https://api.upstox.com.evil.invalid/v2/fixture", "https://evil.invalid/", "https://" + SECRET + "@api.upstox.com/v2/fixture", "https://api.upstox.com:444/v2/fixture", "not-a-url"]) {
    const h = harness(async () => { throw new Error("Fetch must not run"); });
    await expectFailure(h, h.request(target), "upstox_request_target_invalid");
    assert.equal(h.events.calls.length, 0);
  }
});

await check("Provider failures stay separate from application authentication and redact raw bodies", async () => {
  for (const [upstream, code, status] of [[401, "upstox_auth_rejected", 502], [403, "upstox_access_denied", 502], [429, "upstox_rate_limited", 503], [500, "upstox_unavailable", 503], [503, "upstox_unavailable", 503], [400, "upstox_http_error", 502]]) {
    const h = harness(async () => new Response(SECRET, { status: upstream }));
    await expectFailure(h, h.request(), code, { upstream, status });
  }
});

await check("Normal HTTP errors do not wait for an error body that never ends", async () => {
  let cancelled = false;
  const h = harness(async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 401 }));
  await expectFailure(h, h.request(), "upstox_auth_rejected", { status: 502, upstream: 401 });
  await tick();
  assert.equal(cancelled, true, "Rejected upstream body is cancelled without consuming it");
});

await check("Network rejection cannot expose transport or authorization details", async () => {
  const h = harness(async () => { throw new Error(API + "?secret=" + SECRET + " Bearer " + SECRET); });
  await expectFailure(h, h.request(), "upstox_network_error", { status: 502 });
});

await check("Fetch that ignores abort still settles as a timeout", async () => {
  const never = new Promise(() => {});
  const h = harness(async () => never);
  await expectFailure(h, h.request(), "upstox_timeout", { status: 504 });
  assert.equal(h.events.calls[0].init.signal.aborted, true);
});

await check("Deadline covers a stalled stream after successful response headers", async () => {
  let cancelled = false;
  const h = harness(async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode("{\"data\":")); },
    cancel() { cancelled = true; }
  })));
  await expectFailure(h, h.request(), "upstox_timeout", { status: 504 });
  await tick();
  assert.equal(h.events.calls[0].init.signal.aborted, true);
  assert.equal(cancelled, true);
});

await check("Late response after timeout cannot become a successful result", async () => {
  const pending = deferred();
  let cancelled = false;
  const h = harness(async () => pending.promise);
  await expectFailure(h, h.request(), "upstox_timeout", { status: 504 });
  pending.resolve(new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('{"late":true}')); },
    cancel() { cancelled = true; }
  })));
  await tick();
  assert.equal(h.events.calls.length, 1, "No implicit retry or extra provider request");
  assert.equal(cancelled, true, "A late body is cancelled even when fetch ignored abort");
});

await check("Malformed JSON never leaks provider text", async () => {
  const h = harness(async () => new Response("<html>" + SECRET + "</html>"));
  await expectFailure(h, h.request(), "upstox_invalid_response", { status: 502 });
});

await check("Successful JSON is decoded across split UTF-8 chunks", async () => {
  const bytes = new TextEncoder().encode('{"text":"₹ café"}');
  const h = harness(async () => streamResponse([...bytes].map(byte => new Uint8Array([byte]))));
  const result = await bounded(h.request());
  assert.equal(result.payload.text, "₹ café");
});

await check("Invalid UTF-8 and non-object JSON cannot become accepted provider payloads", async () => {
  for (const body of [new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc0, 0xaf, 0x22, 0x7d]), "null", "[]", "1", '"scalar"', ""]) {
    const h = harness(async () => new Response(body));
    await expectFailure(h, h.request(), "upstox_invalid_response", { status: 502 });
  }
});

await check("A missing response body is an invalid response, not empty successful evidence", async () => {
  const h = harness(async () => new Response(null, { status: 204 }));
  await expectFailure(h, h.request(), "upstox_invalid_response", { status: 502 });
});

await check("Per-stage byte caps apply to the actual streamed body", async () => {
  const caps = { candles: 2 * 1024 * 1024, quote: 8 * 1024 * 1024, oauth_preflight: 1024 * 1024, oauth_exchange: 256 * 1024 };
  for (const [stage, limit] of Object.entries(caps)) {
    const overhead = JSON.stringify({ padding: "" }).length;
    const exact = JSON.stringify({ padding: "a".repeat(limit - overhead) });
    const good = harness(async () => new Response(exact));
    const result = await bounded(good.request(API, {}, stage));
    assert.equal(result.payload.padding.length, limit - overhead, stage + " exact byte cap accepted");
    const bad = harness(async () => new Response(exact + " ", { headers: { "content-length": "2" } }));
    await expectFailure(bad, bad.request(API, {}, stage), "upstox_response_too_large", { status: 502, stage });
  }
});

await check("Oversized content-length cannot bypass size protection", async () => {
  const h = harness(async () => new Response("{}", { headers: { "content-length": String(2 * 1024 * 1024 + 1) } }));
  await expectFailure(h, h.request(), "upstox_response_too_large", { status: 502 });
});

await check("Excessive tiny chunks are bounded even below the byte cap", async () => {
  const h = harness(async () => streamResponse(Array.from({ length: 4097 }, () => " ")));
  await expectFailure(h, h.request(), "upstox_response_too_large", { status: 502 });
});

await check("The allowed chunk-count boundary still accepts valid JSON", async () => {
  const h = harness(async () => streamResponse(["{}", ...Array.from({ length: 4095 }, () => " ")]));
  const result = await bounded(h.request());
  assert.equal(result.ok, true);
});

await check("Redirects are refused on data and token exchange requests", async () => {
  for (const stage of ["candles", "quote", "oauth_exchange"]) {
    const h = harness(async () => new Response(SECRET, { status: 302, headers: { location: "https://evil.invalid/" + SECRET } }));
    await expectFailure(h, h.request(API, {}, stage), "upstox_redirect_refused", { status: 502, stage });
    assert.equal(h.events.calls[0].init.redirect, "error");
  }
});

await check("Already-followed or unexpected response URLs are refused", async () => {
  for (const change of [{ redirected: true }, { url: "https://evil.invalid/" + SECRET }]) {
    const response = new Response("{}");
    for (const [key, value] of Object.entries(change)) Object.defineProperty(response, key, { value });
    const h = harness(async () => response);
    await expectFailure(h, h.request(), "upstox_redirect_refused", { status: 502 });
  }
});

await check("OAuth preflight alone accepts a manual redirect without following it", async () => {
  const h = harness(async () => new Response("", { status: 302, headers: { location: "https://login.example.invalid/" + SECRET } }));
  const result = await bounded(h.request(API, { redirect: "manual" }, "oauth_preflight"));
  assert.equal(result.status, 302);
  assert.equal(h.events.calls[0].init.redirect, "manual");
  assert.equal(h.events.calls.length, 1);
  assertRedacted(result);
});

await check("OAuth preflight preserves configuration-error JSON rather than misclassifying token auth", async () => {
  const h = harness(async () => new Response('{"errors":[{"errorCode":"UDAPI100068","message":"fixture configuration rejected"}]}', { status: 401 }));
  const result = await bounded(h.request(API, {}, "oauth_preflight"));
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(result.payload.errors[0].errorCode, "UDAPI100068");
});

await check("OAuth preflight tolerates non-JSON HTML without returning the raw page", async () => {
  const h = harness(async () => new Response("<html>" + SECRET + "</html>", { status: 400 }));
  const result = await bounded(h.request(API, {}, "oauth_preflight"));
  assert.equal(result.status, 400);
  assertRedacted(result);
});

await check("Every request stage times out and identifies its own safe stage", async () => {
  for (const stage of STAGES) {
    const h = harness(async () => new Promise(() => {}));
    await expectFailure(h, h.request(API, {}, stage), "upstox_timeout", { status: 504, stage });
  }
});

await check("Public failure payload is allowlisted despite extra synthetic properties", async () => {
  const h = harness(async () => new Response("{}"));
  const error = h.failure("quote", "upstox_auth_rejected", 401);
  error.raw = SECRET;
  error.url = API + "?token=" + SECRET;
  error.headers = { authorization: "Bearer " + SECRET };
  error.body = SECRET;
  const payload = h.payload(error);
  assert.equal(payload.code, "upstox_auth_rejected");
  assert.equal(payload.dependency, "upstox");
  assertRedacted(payload);
  for (const key of ["raw", "url", "headers", "body", "stack", "cause"]) assert.equal(payload[key], undefined);
});

await check("Unknown errors, codes and stage names cannot inject provider messages", async () => {
  const h = harness(async () => new Response("{}"));
  for (const error of [new Error(SECRET), h.failure(SECRET, SECRET, SECRET), { upstoxRequestFailure: true, stage: SECRET, code: SECRET, upstream_status: SECRET, message: SECRET }]) {
    const payload = h.payload(error);
    assert.equal(payload.code, "upstox_network_error");
    assert.equal(payload.stage, "quote");
    assert.equal(payload.upstream_status, null);
    assertRedacted(payload);
  }
});

await check("A structured storage failure remains a storage failure", async () => {
  const h = harness(async () => new Response("{}"));
  h.context.runtimeStoragePayload = () => ({ ok: false, code: "storage_unavailable", dependency: "storage", retryable: true });
  const payload = h.payload({ runtimeStorageFailure: true, message: SECRET });
  assert.equal(payload.code, "storage_unavailable");
  assert.equal(payload.dependency, "storage");
  assertRedacted(payload);
});

const quoteSource = fs.readFileSync(new URL("../server-upstox-quote-patch.mjs", import.meta.url), "utf8");
const quoteMatch = quoteSource.match(/const UPSTOX_QUOTE_FUNCTIONS = String\.raw`([\s\S]*?)\n`;/);
assert(quoteMatch, "Quote consumers must expose the actual embedded functions under test");
function quoteHarness(fetchMock) {
  const h = harness(fetchMock);
  const auth = { token: SECRET + "-first", source: "fixture-first", reads: 0, statusReads: 0 };
  Object.assign(h.context, {
    crypto,
    upstoxRequestAuth: async () => { auth.reads++; return { auth: { access_token: auth.token }, source: auth.source }; },
    upstoxResolvedRuntimeStatus: selection => { auth.statusReads++; return { token_source: selection.source, provider_auth_status: "not_checked", token_printed: false }; }
  });
  vm.runInContext(quoteMatch[1], h.context, { timeout: 1000 });
  return { ...h, auth, quote: keys => h.context.fetchUpstoxMarketQuotes(keys) };
}
const quoteResponse = (price = 100) => new Response(JSON.stringify({ status: "success", data: {
  "NSE_EQ|FIXTURE": { instrument_key: "NSE_EQ|FIXTURE", trading_symbol: "FIXTURE", last_price: price }
} }));

await check("Same credential/key quote requests coalesce and fresh cache hits are labelled", async () => {
  const gate = deferred();
  const h = quoteHarness(async () => { await gate.promise; return quoteResponse(); });
  const first = h.quote(["NSE_EQ|FIXTURE"]);
  const second = h.quote(["NSE_EQ|FIXTURE", "NSE_EQ|FIXTURE"]);
  await tick();
  assert.equal(h.events.calls.length, 1);
  gate.resolve();
  const [a, b] = await bounded(Promise.all([first, second]));
  assert.equal(a.quotes[0].last_price, 100);
  assert.equal(b.quotes[0].last_price, 100);
  assert.equal(a.cache_hit, false);
  const cached = await h.quote(["NSE_EQ|FIXTURE"]);
  assert.equal(cached.cache_hit, true);
  assert.equal(cached.asOf, a.asOf, "Cache hit keeps original observation time");
  assert.equal(h.events.calls.length, 1);
  assert.equal(h.auth.statusReads, 1, "Metadata describes the captured selection, not a second credential lookup");
  assertRedacted(cached);
});

await check("A rotated token cannot join or reuse the previous credential's quote", async () => {
  const gates = [deferred(), deferred()];
  let calls = 0;
  const h = quoteHarness(async () => { const index = calls++; await gates[index].promise; return quoteResponse(100 + index); });
  const old = h.quote(["NSE_EQ|FIXTURE"]);
  await tick();
  h.auth.token = SECRET + "-second";
  h.auth.source = "fixture-second";
  const current = h.quote(["NSE_EQ|FIXTURE"]);
  await tick();
  assert.equal(h.events.calls.length, 2);
  gates.forEach(gate => gate.resolve());
  const [a, b] = await bounded(Promise.all([old, current]));
  assert.equal(a.status.token_source, "fixture-first");
  assert.equal(b.status.token_source, "fixture-second");
  assert.equal(b.quotes[0].last_price, 101);
  const cached = await h.quote(["NSE_EQ|FIXTURE"]);
  assert.equal(cached.cache_hit, true);
  assert.equal(cached.quotes[0].last_price, 101);
  assertRedacted(cached);
});

await check("A failed shared quote clears in-flight state and is not cached", async () => {
  let calls = 0;
  const h = quoteHarness(async () => ++calls === 1 ? new Response(SECRET, { status: 401 }) : quoteResponse());
  await expectFailure(h, h.quote(["NSE_EQ|FIXTURE"]), "upstox_auth_rejected", { status: 502, upstream: 401, stage: "quote" });
  const result = await bounded(h.quote(["NSE_EQ|FIXTURE"]));
  assert.equal(result.cache_hit, false);
  assert.equal(h.events.calls.length, 2);
  assert.equal(vm.runInContext("upstoxQuoteInFlight.size", h.context), 0);
});

await check("Distinct quote flights are capped and excess work receives a safe busy failure", async () => {
  const gate = deferred();
  const h = quoteHarness(async () => { await gate.promise; return quoteResponse(); });
  const requests = Array.from({ length: 32 }, (_, i) => h.quote(["NSE_EQ|FIXTURE" + i]));
  const settled = Promise.all(requests);
  await tick();
  assert.equal(h.events.calls.length, 32);
  await expectFailure(h, h.quote(["NSE_EQ|EXCESS"]), "upstox_quote_busy", { status: 503, stage: "quote" });
  assert.equal(h.events.calls.length, 32);
  gate.resolve();
  await bounded(settled);
  assert.equal(vm.runInContext("upstoxQuoteInFlight.size", h.context), 0);
});

await check("Expired quote cache triggers a new provider observation", async () => {
  const h = quoteHarness(async () => quoteResponse());
  await h.quote(["NSE_EQ|FIXTURE"]);
  vm.runInContext("upstoxQuoteCache.at = Date.now() - 15001", h.context);
  const refreshed = await h.quote(["NSE_EQ|FIXTURE"]);
  assert.equal(refreshed.cache_hit, false);
  assert.equal(h.events.calls.length, 2);
});

await check("Malformed quote envelopes cannot populate the successful quote cache", async () => {
  for (const payload of [{ status: "error", data: {} }, { status: "success" }, { status: "success", data: SECRET }]) {
    const h = quoteHarness(async () => new Response(JSON.stringify(payload)));
    await expectFailure(h, h.quote(["NSE_EQ|FIXTURE"]), "upstox_invalid_response", { status: 502, stage: "quote" });
    assert.equal(vm.runInContext("upstoxQuoteCache.payload", h.context), null);
    assert.equal(vm.runInContext("upstoxQuoteInFlight.size", h.context), 0);
  }
});

console.log(`Upstox HTTP guard passed: ${checks.length} groups; actual Response streams, zero real network, credential reads, database writes or orders.`);
