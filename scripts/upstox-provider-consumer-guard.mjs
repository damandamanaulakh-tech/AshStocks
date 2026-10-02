import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { UPSTOX_HTTP_FUNCTIONS } from "../lib/upstox-http.mjs";
import { applyUpstoxOAuthPatches } from "../server-upstox-oauth-patch.mjs";

// Actual embedded consumers, fake transport/storage only. This guard never
// imports the running server, opens sockets, reads credentials, or places orders.
const oauthSource = fs.readFileSync(new URL("../server-upstox-oauth-patch.mjs", import.meta.url), "utf8");
const quoteSource = fs.readFileSync(new URL("../server-upstox-quote-patch.mjs", import.meta.url), "utf8");
const oauthFunctions = oauthSource.match(/const UPSTOX_OAUTH_FUNCTIONS = String\.raw`([\s\S]*?)\n`;/)?.[1];
const quoteFunctions = quoteSource.match(/const UPSTOX_QUOTE_FUNCTIONS = String\.raw`([\s\S]*?)\n`;/)?.[1];
assert(oauthFunctions && quoteFunctions, "Actual embedded consumer functions must be present");
const baseSource = fs.readFileSync(new URL("../vendor/base-server-37a9e9ceacabd33bc5a2085ad621e368f8fc0cd8.mjs", import.meta.url), "utf8");
const patched = applyUpstoxOAuthPatches(baseSource, (source, before, after, label) => {
  assert(source.includes(before), "Patch anchor exists: " + label);
  return source.replace(before, after);
});
const candleStart = patched.indexOf("async function fetchUpstoxCandles(");
const candleEnd = patched.indexOf("\nasync function runUpstoxScanner(", candleStart);
assert(candleStart >= 0 && candleEnd > candleStart, "Actual generated candle function must be bounded");
const candleFunction = patched.slice(candleStart, candleEnd);
const fixtureSecret = "fixture-consumer-private-token";
const fixtureClient = "fixture-consumer-client-id";
const fixtureClientSecret = "fixture-consumer-client-secret";
const fixtureCode = "fixture-consumer-oauth-code";
const fixtureRawError = "fixture-private-provider-body";
const fixtureRequest = { headers: { host: "fixture.invalid", "x-forwarded-proto": "https" } };
const asPlain = (value) => JSON.parse(JSON.stringify(value));
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
let groups = 0;
async function check(name, work) { await work(); groups++; console.log("PASS " + name); }

function safePublic(value) {
  const serialized = JSON.stringify(value);
  for (const sensitive of [fixtureSecret, fixtureClient, fixtureClientSecret, fixtureCode, fixtureRawError]) {
    assert(!serialized.includes(sensitive), "No fixture credential or raw provider diagnostic in public result");
  }
}

function harness(options = {}) {
  const activity = { network: [], reads: 0, writes: 0, normalizations: [], timers: [] };
  const control = { fetch: options.fetch || (() => jsonResponse({ status: "success" })), stored: options.stored ?? null };
  const context = vm.createContext({
    ENV: { NODE_ENV: "test", UPSTOX_OAUTH_PREFLIGHT: "true", UPSTOX_API_KEY: fixtureClient,
      UPSTOX_API_SECRET: fixtureClientSecret, UPSTOX_ACCESS_TOKEN: fixtureSecret, ...options.env },
    Buffer, URL, URLSearchParams, crypto, AbortController, TextDecoder, Uint8Array, Date,
    setTimeout: (callback, ms) => { activity.timers.push(ms); return setTimeout(callback, Math.min(ms, 20)); },
    clearTimeout,
    fetch: async (url, init) => { activity.network.push({ url, init }); return control.fetch(url, init); },
    sessionSecret: () => "fixture-session-signature-only",
    finiteOr: (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    getStore: async () => {
      if (options.storeError) throw new Error(fixtureRawError);
      return {
        async getUpstoxAuth() { activity.reads++; return control.stored; },
        async saveUpstoxAuth(value) { activity.writes++; control.stored = value; return value; }
      };
    },
    upstoxStatus: () => ({ token_visible: false, live_orders: false }),
    normalizeCandles: (rows) => { activity.normalizations.push(rows); return rows; },
    fixtureRequest
  });
  vm.runInContext(UPSTOX_HTTP_FUNCTIONS + oauthFunctions + candleFunction, context, { timeout: 1000 });
  const run = (code) => vm.runInContext(code, context, { timeout: 1000 });
  return {
    context, activity, control, run,
    preflight: () => run("preflightUpstoxOAuthConfiguration(fixtureRequest)"),
    candles: () => run('fetchUpstoxCandles("NSE_EQ|INEFIXTURE001", "2026-09-01", "2026-10-01")'),
    exchange: () => {
      context.fixtureCallback = new URL("https://fixture.invalid/api/upstox/callback");
      context.fixtureCallback.searchParams.set("code", fixtureCode);
      context.fixtureCallback.searchParams.set("state", run("createUpstoxOAuthState(fixtureRequest)"));
      return run("exchangeUpstoxOAuthCode(fixtureRequest, fixtureCallback)");
    },
    payload: (error) => { context.fixtureError = error; return run("upstoxRequestPayload(fixtureError)"); }
  };
}

async function rejectsProvider(h, work, code, stage, upstreamStatus = null) {
  let caught;
  await assert.rejects(work, (error) => { caught = error; return error.code === code && error.dependency === "upstox" && error.stage === stage; });
  assert.equal(caught.upstream_status, upstreamStatus);
  safePublic(h.payload(caught));
  assert.equal(h.activity.writes, 0, "Rejected provider result cannot persist credentials");
  return caught;
}

await check("OAuth preflight manual 302 is accepted without following or consuming login HTML", async () => {
  let cancelled = false;
  const h = harness({ fetch: () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 302, headers: { location: "https://fixture-login.invalid" } }) });
  const result = await h.preflight();
  assert.deepEqual(asPlain(result), { ok: true, status: 302 });
  assert.equal(h.activity.network.length, 1);
  assert.equal(h.activity.network[0].init.redirect, "manual");
  assert(!new URL(h.activity.network[0].url).searchParams.has("state"));
  assert.equal(cancelled, true); assert.equal(h.activity.writes, 0); safePublic(result);
});

for (const rejection of [
  { errorCode: "UDAPI100068", message: fixtureRawError },
  { errorCode: fixtureRawError, message: "redirect_uri invalid " + fixtureClientSecret }
]) {
  await check("OAuth configuration rejection remains explicit and sanitized " + (rejection.errorCode === "UDAPI100068" ? "known-code" : "401-message"), async () => {
    const h = harness({ fetch: () => jsonResponse({ errors: [rejection] }, 401) });
    const result = await h.preflight();
    assert.equal(result.ok, false); assert.equal(result.status, 401);
    assert.equal(result.error_code, rejection.errorCode === "UDAPI100068" ? "UDAPI100068" : "UPSTOX_OAUTH_CONFIGURATION_REJECTED");
    assert.equal(result.message, "Upstox rejected the configured client_id and redirect_uri.");
    assert.equal(result.callback_url, "https://fixture.invalid/api/upstox/callback");
    assert.match(result.client_id_fingerprint, /^[a-f0-9]{12}$/);
    assert.equal(h.activity.writes, 0); safePublic(result);
  });
}

for (const [name, fetch, code] of [
  ["header timeout", () => new Promise(() => {}), "upstox_timeout"],
  ["body timeout", () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("{")); } })), "upstox_timeout"],
  ["network failure", () => { throw new Error(fixtureRawError + fixtureSecret); }, "upstox_network_error"],
  ["generic unauthorized", () => jsonResponse({ message: fixtureRawError }, 401), "upstox_auth_rejected"],
  ["rate limit", () => jsonResponse({ message: fixtureRawError }, 429), "upstox_rate_limited"]
]) {
  await check("OAuth preflight " + name + " stays a sanitized soft warning", async () => {
    const h = harness({ fetch }); const result = await h.preflight();
    assert.equal(result.ok, true); assert.equal(result.warning, "preflight_unavailable");
    assert.equal(result.code, code); assert.equal(result.dependency, "upstox");
    assert.equal(h.activity.writes, 0); safePublic(result);
  });
}

await check("OAuth preflight ordinary successful HTML remains non-validating availability evidence", async () => {
  const h = harness({ fetch: () => new Response("<html>login</html>", { status: 200 }) });
  const result = await h.preflight();
  assert.deepEqual(asPlain(result), { ok: true, status: 200 });
  assert.equal(result.provider_auth_status, undefined); assert.equal(h.activity.writes, 0);
});

for (const [name, fetch, code, status] of [
  ["header timeout", () => new Promise(() => {}), "upstox_timeout", null],
  ["body timeout", () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("{")); } })), "upstox_timeout", null],
  ["malformed JSON", () => new Response("{broken " + fixtureSecret), "upstox_invalid_response", null],
  ["unauthorized", () => jsonResponse({ message: fixtureRawError + fixtureSecret }, 401), "upstox_auth_rejected", 401],
  ["provider unavailable", () => jsonResponse({ message: fixtureRawError }, 503), "upstox_unavailable", 503],
  ["error status despite token field", () => jsonResponse({ status: "error", access_token: fixtureSecret }), "upstox_invalid_response", null]
]) {
  await check("OAuth exchange " + name + " never saves a credential", async () => {
    const h = harness({ fetch });
    await rejectsProvider(h, () => h.exchange(), code, "oauth_exchange", status);
    assert.equal(h.activity.network.length, 1);
    assert.equal(h.activity.network[0].init.method, "POST");
    assert.equal(h.activity.network[0].init.redirect, "error");
    assert.equal(h.activity.network[0].init.body.get("grant_type"), "authorization_code");
  });
}

await check("OAuth exchange missing token and bad state fail without writes", async () => {
  const h = harness({ fetch: () => jsonResponse({ status: "success", data: {} }) });
  await rejectsProvider(h, () => h.exchange(), "upstox_invalid_response", "oauth_exchange");
  assert.equal(h.activity.writes, 0);
  h.context.fixtureCallback = new URL("https://fixture.invalid/api/upstox/callback?code=fixture&state=bad.signature");
  await assert.rejects(() => h.run("exchangeUpstoxOAuthCode(fixtureRequest, fixtureCallback)"), (error) => error.message === "upstox_state_invalid");
  assert.equal(h.activity.network.length, 1, "Invalid state must stop before network");
  assert.equal(h.activity.writes, 0);
});

for (const [name, payload] of [
  ["object access token", { status: "success", access_token: { not: "a-token" } }],
  ["array access token", { status: "success", access_token: [fixtureSecret] }],
  ["numeric access token", { status: "success", access_token: 123 }],
  ["boolean access token", { status: "success", access_token: true }],
  ["whitespace access token", { status: "success", access_token: "   " }],
  ["null access token", { status: "success", access_token: null }],
  ["array payload", [{ access_token: fixtureSecret }]],
  ["nested array payload", { status: "success", data: [{ access_token: fixtureSecret }] }],
  ["object refresh token", { status: "success", access_token: fixtureSecret, refresh_token: {} }],
  ["numeric refresh token", { status: "success", access_token: fixtureSecret, refresh_token: 123 }],
  ["unsupported token type", { status: "success", access_token: fixtureSecret, token_type: "Basic" }],
  ["object token type", { status: "success", access_token: fixtureSecret, token_type: {} }]
]) {
  await check("OAuth exchange rejects " + name + " before any credential save", async () => {
    const h = harness({ fetch: () => jsonResponse(payload) });
    await rejectsProvider(h, () => h.exchange(), "upstox_invalid_response", "oauth_exchange");
    assert.equal(h.activity.network.length, 1); assert.equal(h.control.stored, null);
  });
}

await check("OAuth timeout cannot overwrite an existing credential when headers arrive late", async () => {
  const pending = deferred();
  const stored = { access_token: "fixture-existing-credential", source: "manual_paste" };
  const h = harness({ stored, fetch: () => pending.promise });
  await rejectsProvider(h, () => h.exchange(), "upstox_timeout", "oauth_exchange");
  pending.resolve(jsonResponse({ access_token: fixtureSecret }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.activity.writes, 0); assert.equal(h.control.stored, stored);
});

await check("OAuth malformed credential cannot replace an existing saved token", async () => {
  const stored = { access_token: "fixture-existing-credential", source: "manual_paste" };
  const h = harness({ stored, fetch: () => jsonResponse({ access_token: { malformed: true } }) });
  await rejectsProvider(h, () => h.exchange(), "upstox_invalid_response", "oauth_exchange");
  assert.equal(h.control.stored, stored);
});

for (const nested of [false, true]) {
  await check("OAuth exchange valid " + (nested ? "nested" : "flat") + " response saves once and returns no token", async () => {
    const tokenData = { access_token: fixtureSecret, token_type: "Bearer", expires_in: 3600 };
    const h = harness({ fetch: () => jsonResponse(nested ? { status: "success", data: tokenData } : tokenData) });
    const result = await h.exchange();
    assert.equal(h.activity.writes, 1); assert.equal(h.control.stored.access_token, fixtureSecret);
    assert.equal(result.token_source, "oauth"); assert.equal(result.token_visible, true);
    assert.equal(result.provider_auth_status, "not_checked"); assert.equal(result.token_printed, false); safePublic(result);
  });
}

await check("OAuth Bearer casing and omitted optional refresh fields remain compatible", async () => {
  const h = harness({ fetch: () => jsonResponse({ access_token: " " + fixtureSecret + " ", token_type: "bearer", refresh_token: null }) });
  const result = await h.exchange();
  assert.equal(h.activity.writes, 1); assert.equal(h.control.stored.access_token, fixtureSecret);
  assert.equal(h.control.stored.refresh_token, ""); assert.equal(result.token_type, "bearer"); safePublic(result);
});

await check("Candle consumer selects auth and validates a successful array before normalization", async () => {
  const candles = [["2026-10-01T00:00:00+05:30", 100, 110, 95, 105, 1200]];
  const h = harness({ fetch: () => jsonResponse({ status: "success", data: { candles } }) });
  assert.deepEqual(asPlain(await h.candles()), candles);
  assert.equal(h.activity.normalizations.length, 1);
  assert.equal(h.activity.network[0].init.headers.authorization, "Bearer " + fixtureSecret);
  assert.equal(new URL(h.activity.network[0].url).pathname, "/v2/historical-candle/NSE_EQ%7CINEFIXTURE001/day/2026-10-01/2026-09-01");
  assert.equal(h.activity.writes, 0);
});

await check("Candle successful empty history remains empty rather than invented evidence", async () => {
  const h = harness({ fetch: () => jsonResponse({ status: "success", data: { candles: [] } }) });
  assert.deepEqual(asPlain(await h.candles()), []);
  assert.equal(h.activity.normalizations.length, 1); assert.equal(h.activity.writes, 0);
});

for (const payload of [{ status: "error", data: { candles: [] } }, { status: "success", data: {} }, { status: "success", data: { candles: {} } }, {}]) {
  await check("Candle consumer rejects malformed provider schema " + JSON.stringify(payload), async () => {
    const h = harness({ fetch: () => jsonResponse(payload) });
    await rejectsProvider(h, () => h.candles(), "upstox_invalid_response", "candles");
    assert.equal(h.activity.normalizations.length, 0);
  });
}

for (const [name, fetch, code, status] of [
  ["header timeout", () => new Promise(() => {}), "upstox_timeout", null],
  ["malformed JSON", () => new Response(fixtureRawError), "upstox_invalid_response", null],
  ["unauthorized", () => jsonResponse({ message: fixtureRawError + fixtureSecret }, 401), "upstox_auth_rejected", 401]
]) {
  await check("Candle consumer " + name + " preserves safe provider classification", async () => {
    const h = harness({ fetch });
    await rejectsProvider(h, () => h.candles(), code, "candles", status);
    assert.equal(h.activity.normalizations.length, 0);
  });
}

await check("Candle storage failure is not misclassified as broker authorization", async () => {
  const h = harness({ storeError: true, env: { UPSTOX_ACCESS_TOKEN: "" } });
  await assert.rejects(() => h.candles(), (error) => error.runtimeStorageFailure === true && error.dependency === "storage" && error.stage === "auth_read");
  assert.equal(h.activity.network.length, 0); assert.equal(h.activity.writes, 0);
});

await check("Candle absent credential fails locally without a provider request", async () => {
  const h = harness({ env: { UPSTOX_ACCESS_TOKEN: "" } });
  await rejectsProvider(h, () => h.candles(), "upstox_token_missing", "candles");
  assert.equal(h.activity.network.length, 0); assert.equal(h.activity.normalizations.length, 0);
});

function streamHarness() {
  const activity = { requests: 0, headers: [], writes: [], intervals: [], cleared: [], ended: 0 };
  const controls = { input: () => ({ keys: ["NSE_EQ|INEFIXTURE001"], symbol: "FIXTURE" }), quote: () => Promise.resolve({ asOf: "fixture", quotes: [], failures: [], safety: { paper_only: true } }) };
  const req = new EventEmitter();
  const res = { writeHead: (...args) => activity.headers.push(args), write: (chunk) => activity.writes.push(chunk), end: () => activity.ended++ };
  const context = vm.createContext({
    Buffer, URL, Date, ENV: {}, crypto, fixtureRequest: req, fixtureResponse: res,
    setInterval: (callback, delay) => { const timer = { callback, delay, unref() {} }; activity.intervals.push(timer); return timer; },
    clearInterval: (timer) => activity.cleared.push(timer),
    fakeResolveInput: () => controls.input(),
    fakeRuntimeStatus: async () => ({ token_visible: true, provider_auth_status: "not_checked" }),
    fakeQuotes: () => { activity.requests++; return controls.quote(); }
  });
  vm.runInContext(UPSTOX_HTTP_FUNCTIONS + quoteFunctions + '\nresolveUpstoxQuoteInput = fakeResolveInput; upstoxRuntimeStatus = fakeRuntimeStatus; fetchUpstoxMarketQuotes = fakeQuotes;', context, { timeout: 1000 });
  return { req, res, activity, controls, start: () => vm.runInContext('streamUpstoxQuotes(new URL("https://fixture.invalid/api/upstox/quote-stream"), fixtureRequest, fixtureResponse)', context, { timeout: 1000 }) };
}

await check("SSE disconnect during identity lookup creates no stream or timer", async () => {
  const h = streamHarness(); const pending = deferred(); h.controls.input = () => pending.promise;
  const task = h.start(); h.req.emit("close"); pending.resolve({ keys: ["NSE_EQ|INEFIXTURE001"] }); await task;
  assert.equal(h.activity.headers.length, 0); assert.equal(h.activity.writes.length, 0);
  assert.equal(h.activity.requests, 0); assert.equal(h.activity.intervals.length, 0);
});

await check("SSE missing identity emits an error and ends without polling", async () => {
  const h = streamHarness(); h.controls.input = () => ({ keys: [], symbol: "MISSING" }); await h.start();
  assert.equal(h.activity.ended, 1); assert.equal(h.activity.requests, 0);
  assert.equal(h.activity.intervals.length, 0); assert(h.activity.writes.join("").includes("instrument_key_required"));
});

await check("SSE disconnect during first quote suppresses late output and polling timer", async () => {
  const h = streamHarness(); const pending = deferred(); h.controls.quote = () => pending.promise;
  const task = h.start(); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.activity.requests, 1); const writes = h.activity.writes.length;
  h.req.emit("close"); pending.resolve({ quotes: [], failures: [] }); await task;
  assert.equal(h.activity.writes.length, writes); assert.equal(h.activity.intervals.length, 0);
});

await check("SSE interval never overlaps polls and closes before a pending result is written", async () => {
  const h = streamHarness(); await h.start();
  assert.equal(h.activity.requests, 1); assert.equal(h.activity.intervals.length, 1);
  const timer = h.activity.intervals[0]; assert.equal(timer.delay, 15000);
  const pending = deferred(); h.controls.quote = () => pending.promise;
  const first = timer.callback(); await timer.callback(); await timer.callback();
  assert.equal(h.activity.requests, 2, "Only one additional poll is allowed while pending");
  const writes = h.activity.writes.length; h.req.emit("close");
  assert.equal(h.activity.cleared[0], timer);
  pending.resolve({ quotes: [], failures: [] }); await first;
  assert.equal(h.activity.writes.length, writes); await timer.callback(); assert.equal(h.activity.requests, 2);
});

await check("SSE provider failures expose only classified sanitized events", async () => {
  const h = streamHarness(); h.controls.quote = () => Promise.reject(new Error(fixtureRawError + fixtureSecret));
  await h.start(); h.req.emit("close");
  const wire = h.activity.writes.join("");
  assert(wire.includes("event: error")); assert(wire.includes('"dependency":"upstox"'));
  assert(wire.includes('"code":"upstox_network_error"')); safePublic(wire);
  assert.equal(h.activity.cleared.length, 1);
});

console.log(`Upstox provider consumer guard passed: ${groups} groups; no sockets, real provider calls, credential reads, production writes or orders.`);
