import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// Execute the exact embedded backend helpers, with no server, database or network.
const patch = fs.readFileSync(new URL("../server-upstox-institutional-patch.mjs", import.meta.url), "utf8");
const embedded = patch.split("const UPSTOX_INSTITUTIONAL_FUNCTIONS = String.raw`")[1]?.split("\n`;")[0];
assert(embedded, "institutional helper block must be available");
const NOW = Date.parse("2026-09-24T12:00:00Z");
const SESSIONS = ["2026-09-24", "2026-09-23", "2026-09-22", "2026-09-21", "2026-09-18"];
const INPUT = { symbol: "RELIANCE", instrument_key: "NSE_EQ|INE002A01018", isin: "INE002A01018" };
const cash = (dates = SESSIONS) => dates.map((day) => ({ time_stamp: Date.parse(day + "T09:59:00Z"), buy_amount: 20_000_000, sell_amount: 10_000_000 }));
const shares = () => [
  { category: "fii", history: [{ period: "Jun 2026", value: 18 }, { period: "Mar 2026", value: 17 }] },
  { category: "other_dii", history: [{ period: "Jun 2026", value: 10 }, { period: "Mar 2026", value: 9 }] },
  { category: "mutual_funds", history: [{ period: "Jun 2026", value: 5 }, { period: "Mar 2026", value: 4 }] }
];
const json = (data) => new Response(JSON.stringify({ status: "success", data }));

function runtime(options = {}) {
  let now = options.now ?? NOW;
  const calls = [], timers = [];
  const clock = class extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  };
  let active = 0, maximumActive = 0;
  const context = {
    Date: clock, Response, ReadableStream, Uint8Array, TextDecoder, AbortController, URL,
    setTimeout: (callback, delay) => { timers.push(delay); return setTimeout(callback, Math.min(delay, 40)); },
    clearTimeout,
    normalizeSymbol: (value) => String(value).trim().toUpperCase(),
    clamp: (value, low, high) => Math.max(low, Math.min(high, value)),
    round: (value, places) => Number(value.toFixed(places)),
    tunnelFinite: (value, fallback) => typeof value === "number" && Number.isFinite(value) ? value : fallback,
    decisionRank: (value) => ({ SELECT: 0, WATCH: 1, DATA_NEEDED: 2 }[value] ?? 3),
    currentUpstoxAccessToken: options.token || (async () => "fixture-token-never-print"),
    fetch: async (url, init) => {
      calls.push({ url, init });
      active += 1; maximumActive = Math.max(maximumActive, active);
      try {
        assert.equal(init.redirect, "error");
        assert.equal(init.method, "GET");
        if (options.fetch) return await options.fetch(url, init);
        const override = options.override?.(url, init);
        if (override !== undefined) return await override;
        if (url.includes("/market/timings/")) {
          const day = url.slice(-10);
          return json((options.sessions || SESSIONS).includes(day) ? [{ exchange: "NSE",
            start_time: Date.parse(day + "T03:45:00Z"), end_time: Date.parse(day + "T10:00:00Z") }] : []);
        }
        if (url.includes("/market/fii")) return json({ "NSE_EQ|CASH": options.fii ?? cash(options.sessions || SESSIONS) });
        if (url.includes("/market/dii")) return json({ "NSE_EQ|CASH": options.dii ?? cash(options.sessions || SESSIONS) });
        if (url.includes("/share-holdings")) return json(options.shares ?? shares());
        throw new Error("Offline fixture refuses unexpected request");
      } finally { active -= 1; }
    }
  };
  vm.createContext(context);
  vm.runInContext(embedded + `
globalThis.helpers = { institutionalNumber, institutionalRound, institutionalActivityRows,
 normalizeShareHoldings, fetchUpstoxShareHolding, institutionalSessionCalendar, fetchUpstoxInstitutionalMarket,
 upstoxInstitutionalResponse, attachUpstoxInstitutionalEvidence, fetchUpstoxInstitutionalJson,
 institutionalCached, cacheSize: () => institutionalCache.size, pendingSize: () => institutionalPending.size };
`, context);
  return { ...context.helpers, calls, timers, setNow: (value) => { now = value; }, maximumActive: () => maximumActive };
}

let scenarios = 0;
async function test(name, work) {
  try { await work(); scenarios += 1; }
  catch (error) { throw new Error(name + ": " + error.message, { cause: error }); }
}

await test("five exact completed NSE sessions and source metadata", async () => {
  const run = runtime();
  const market = await run.fetchUpstoxInstitutionalMarket();
  assert.equal(market.status, "READY");
  assert.equal(market.fii_cash_5d_net_cr, 5);
  assert.equal(market.dii_cash_1d_net_cr, 1);
  assert.deepEqual([...market.calendar.expected_session_dates], SESSIONS);
  assert.equal(market.feeds.fii.observed_date, SESSIONS[0]);
  assert.notEqual(market.feeds.fii.observed_at, market.feeds.fii.fetched_at);
  assert.equal(run.calls.length, 16);
  assert(run.maximumActive() <= 4);
});

await test("zero one four and sparse five rows are never five sessions", async () => {
  for (const dates of [[], SESSIONS.slice(0, 1), SESSIONS.slice(0, 4), [SESSIONS[0], ...SESSIONS.slice(2), "2026-09-17"]]) {
    const market = await runtime({ fii: cash(dates) }).fetchUpstoxInstitutionalMarket();
    assert.equal(market.fii_cash_5d_net_cr, null);
    assert.equal(market.dii_cash_5d_net_cr, 5);
    assert.equal(market.status, "PARTIAL");
    assert.equal(market.feeds.fii.days_available, dates.length);
  }
});

await test("identical duplicate dates collapse and conflicts fail closed", async () => {
  const rows = cash().reverse(); rows.push({ ...rows[0] });
  const good = await runtime({ fii: rows }).fetchUpstoxInstitutionalMarket();
  assert.equal(good.fii_cash_5d_net_cr, 5);
  assert.equal(good.fii_days, 5);
  const duplicateOnly = await runtime({ fii: Array.from({ length: 5 }, () => cash()[0]) }).fetchUpstoxInstitutionalMarket();
  assert.equal(duplicateOnly.fii_cash_5d_net_cr, null);
  rows.push({ ...rows[0], buy_amount: 30_000_000 });
  const bad = await runtime({ fii: rows }).fetchUpstoxInstitutionalMarket();
  assert.equal(bad.feeds.fii.reason, "institutional_activity_date_conflict");
  assert.equal(bad.fii_cash_1d_net_cr, null);
});

await test("strict amounts timestamps and bounded rows", async () => {
  for (const change of [{ buy_amount: null }, { buy_amount: "20" }, { buy_amount: true }, { buy_amount: "" },
    { sell_amount: -1 }, { time_stamp: 0 }, { time_stamp: NOW + 1 }, { time_stamp: "2026-09-24" }]) {
    const rows = cash(); rows[0] = { ...rows[0], ...change };
    const market = await runtime({ fii: rows }).fetchUpstoxInstitutionalMarket();
    assert.equal(market.feeds.fii.status, "ERROR");
    assert.equal(market.fii_cash_5d_net_cr, null);
  }
  assert.throws(() => runtime().institutionalActivityRows({ data: { "NSE_EQ|CASH": Array(65).fill(cash()[0]) } }));
});

await test("stale peer preserves observation but never actionable flow", async () => {
  const market = await runtime({ fii: cash(["2026-04-30"]) }).fetchUpstoxInstitutionalMarket();
  assert.equal(market.status, "PARTIAL");
  assert.equal(market.feeds.fii.status, "STALE");
  assert.equal(market.feeds.fii.observed_date, "2026-04-30");
  assert.equal(market.fii_cash_1d_net_cr, null);
  assert.equal(market.fii_cash_5d_net_cr, null);
  assert.equal(market.dii_cash_5d_net_cr, 5);
});

await test("independent failures retain valid peer and safe error codes", async () => {
  for (const endpoint of ["fii", "dii"]) {
    const market = await runtime({ override: (url) => url.includes("/market/" + endpoint + "?")
      ? new Response("SECRET provider error", { status: 429 }) : undefined }).fetchUpstoxInstitutionalMarket();
    assert.equal(market.feeds[endpoint].reason, "institutional_rate_limited");
    assert.equal(market.feeds[endpoint === "fii" ? "dii" : "fii"].status, "READY");
    assert.equal(JSON.stringify(market).includes("SECRET"), false);
  }
});

await test("calendar errors absence conflicts and wrong dates fail closed", async () => {
  for (const timing of [new Response("error", { status: 500 }), json({}), json([{ exchange: "NSE", start_time: 1, end_time: 2 }]),
    json([{ exchange: "NSE", start_time: Date.parse("2026-09-23T03:45Z"), end_time: Date.parse("2026-09-24T10:00Z") }]),
    json([{ exchange: "NSE", start_time: Date.parse("2026-09-24T03:45Z"), end_time: Date.parse("2026-09-24T10:00Z") },
      { exchange: "NSE", start_time: Date.parse("2026-09-24T03:45Z"), end_time: Date.parse("2026-09-24T11:00Z") }])]) {
    const market = await runtime({ override: (url) => url.endsWith("/timings/2026-09-24") ? timing : undefined }).fetchUpstoxInstitutionalMarket();
    assert.equal(market.calendar.status, "UNVERIFIED");
    assert.equal(market.fii_cash_5d_net_cr, null);
  }
  assert.equal((await runtime({ sessions: [] }).fetchUpstoxInstitutionalMarket()).calendar.status, "UNVERIFIED");
});

await test("special weekend sessions are taken from timings not guessed", async () => {
  const sessions = ["2026-09-24", "2026-09-23", "2026-09-22", "2026-09-21", "2026-09-20"];
  const market = await runtime({ sessions }).fetchUpstoxInstitutionalMarket();
  assert.equal(market.fii_cash_5d_net_cr, 5);
  assert.deepEqual([...market.calendar.expected_session_dates], sessions);
});

await test("year-boundary calendar dates and next completed session invalidate cache views", async () => {
  const sessions = ["2027-01-02", "2026-12-31", "2026-12-30", "2026-12-29", "2026-12-28", "2026-12-25"];
  const before = Date.parse("2027-01-02T09:59:30Z");
  const run = runtime({ now: before, sessions, fii: cash(sessions.slice(1)), dii: cash(sessions.slice(1)) });
  const first = await run.fetchUpstoxInstitutionalMarket();
  assert.equal(first.status, "READY");
  assert.equal(first.calendar.latest_completed_session, "2026-12-31");
  assert.equal(first.cache_expires_at, "2027-01-02T10:00:00.000Z");
  run.setNow(before + 60_000);
  const next = await run.fetchUpstoxInstitutionalMarket();
  assert.equal(next.feeds.fii.status, "STALE");
  assert.equal(next.fii_cash_5d_net_cr, null);
  assert.equal(next.calendar.latest_completed_session, "2027-01-02");
});

await test("session close and IST midnight crossed during fetch cannot return old readiness", async () => {
  let run, moved = false;
  run = runtime({ now: Date.parse("2026-09-24T09:59:30Z"), fii: cash(SESSIONS.slice(1)), dii: cash(SESSIONS.slice(1)),
    override: () => { if (!moved) { moved = true; run.setNow(Date.parse("2026-09-24T10:00:30Z")); } } });
  const close = await run.fetchUpstoxInstitutionalMarket();
  assert.equal(close.calendar.latest_completed_session, "2026-09-24");
  assert.equal(close.fii_cash_5d_net_cr, null);
  moved = false;
  run = runtime({ now: Date.parse("2026-09-24T18:29:30Z"), override: () => {
    if (!moved) { moved = true; run.setNow(Date.parse("2026-09-24T18:30:30Z")); }
  } });
  const midnight = await run.fetchUpstoxInstitutionalMarket();
  assert.equal(midnight.calendar.status, "UNVERIFIED");
  assert.equal(midnight.fii_cash_5d_net_cr, null);
});

await test("partial and empty results retry after thirty seconds, good peers retain cache", async () => {
  const run = runtime({ fii: cash(SESSIONS.slice(0, 2)) });
  const first = await run.fetchUpstoxInstitutionalMarket();
  assert.equal(Date.parse(first.feeds.fii.cache_expires_at) - NOW, 30_000);
  await run.fetchUpstoxInstitutionalMarket();
  assert.equal(run.calls.length, 16);
  run.setNow(NOW + 31_000);
  await run.fetchUpstoxInstitutionalMarket();
  assert.equal(run.calls.filter(({ url }) => url.includes("/market/fii?")).length, 2);
  assert.equal(run.calls.filter(({ url }) => url.includes("/market/dii?")).length, 1);
});

await test("provider error recovery uses short negative cache without receipt-time renewal", async () => {
  let failed = true;
  const run = runtime({ override: (url) => failed && url.includes("/market/fii?")
    ? new Response("SECRET temporary failure", { status: 503 }) : undefined });
  const first = await run.fetchUpstoxInstitutionalMarket();
  assert.equal(first.feeds.fii.status, "ERROR");
  failed = false;
  run.setNow(NOW + 10_000);
  const cached = await run.fetchUpstoxInstitutionalMarket();
  assert.equal(cached.feeds.fii.fetched_at, first.feeds.fii.fetched_at);
  assert.equal(cached.feeds.fii.cache_expires_at, first.feeds.fii.cache_expires_at);
  assert.equal(cached.feeds.fii.status, "ERROR");
  run.setNow(NOW + 31_000);
  const recovered = await run.fetchUpstoxInstitutionalMarket();
  assert.equal(recovered.status, "READY");
  assert.equal(recovered.fii_cash_5d_net_cr, 5);
  assert.equal(run.calls.length, 17);
});

await test("cache timestamps do not renew on hits, rollback invalidates and concurrent calls coalesce", async () => {
  const run = runtime();
  const markets = await Promise.all(Array.from({ length: 20 }, () => run.fetchUpstoxInstitutionalMarket()));
  assert(markets.every((item) => item.status === "READY"));
  assert.equal(run.calls.length, 16);
  run.setNow(NOW + 1000);
  const hit = await run.fetchUpstoxInstitutionalMarket();
  assert.equal(hit.feeds.fii.fetched_at, markets[0].feeds.fii.fetched_at);
  assert.equal(hit.feeds.fii.cache_expires_at, markets[0].feeds.fii.cache_expires_at);
  run.setNow(NOW - 1000);
  await run.fetchUpstoxInstitutionalMarket();
  assert.equal(run.calls.length, 32);
});

await test("shareholdings require valid percentages exact periods and adjacent comparison", async () => {
  const run = runtime();
  assert.equal(run.institutionalRound(null), null);
  const full = run.normalizeShareHoldings(shares(), INPUT);
  assert.equal(full.status, "REPORTED");
  assert.equal(full.current_evidence_eligible, true);
  assert.equal(full.dii_change_pp, 2);
  assert.equal(full.institutional_breadth_increasing_count, 3);
  const single = run.normalizeShareHoldings([{ category: "fii", history: [{ period: "Jun 2026", value: 18 }] }], INPUT);
  assert.equal(single.fii_change_pp, null);
  assert.equal(single.dii_holding_pct, null);
  assert.equal(single.dii_change_pp, null);
  assert.equal(single.institutional_breadth_increasing_count, null);
  for (const value of [null, "18", true, -1, 101, Infinity]) {
    assert.throws(() => run.normalizeShareHoldings([{ category: "fii", history: [{ period: "Jun 2026", value }] }], INPUT));
  }
  for (const period of ["Sep 2026", "Jun2026", " June 2026", "May 2026", "Dec 2027"]) {
    assert.throws(() => run.normalizeShareHoldings([{ category: "fii", history: [{ period, value: 18 }] }], INPUT));
  }
  const gap = run.normalizeShareHoldings([{ category: "fii", history: [{ period: "Jun 2026", value: 18 }, { period: "Dec 2025", value: 17 }] }], INPUT);
  assert.equal(gap.fii_change_pp, null);
  const mismatch = shares(); mismatch[1].history.pop();
  assert.equal(run.normalizeShareHoldings(mismatch, INPUT).dii_change_pp, null);
  const conflict = shares(); conflict[0].history.push({ period: "Jun 2026", value: 19 });
  assert.throws(() => run.normalizeShareHoldings(conflict, INPUT), /conflict/);
});

await test("reported quarters remain dated and cache hits lose eligibility at quarter boundary", async () => {
  const old = runtime().normalizeShareHoldings([{ category: "fii", history: [{ period: "Mar 2026", value: 18 }] }], INPUT);
  assert.equal(old.status, "REPORTED");
  assert.equal(old.currentness, "OLDER_REPORT");
  assert.equal(old.current_evidence_eligible, false);
  const before = Date.parse("2026-09-30T18:29:00Z"), run = runtime({ now: before });
  const first = await run.fetchUpstoxShareHolding(INPUT);
  assert.equal(first.current_evidence_eligible, true);
  assert.equal(first.cache_expires_at, "2026-09-30T18:30:00.000Z");
  run.setNow(before + 120_000);
  const next = await run.fetchUpstoxShareHolding(INPUT);
  assert.equal(next.current_evidence_eligible, false);
  assert.equal(next.currentness, "OLDER_REPORT");
  assert.equal(next.fetched_at, first.fetched_at);
});

await test("empty shareholding retries quickly and invalid identity makes no request", async () => {
  const run = runtime({ shares: [] });
  const first = await run.fetchUpstoxShareHolding(INPUT);
  assert.equal(first.status, "DATA_NEEDED");
  assert.equal(Date.parse(first.cache_expires_at) - NOW, 30_000);
  run.setNow(NOW + 31_000);
  await run.fetchUpstoxShareHolding(INPUT);
  assert.equal(run.calls.length, 2);
  const invalid = runtime();
  const result = await invalid.upstoxInstitutionalResponse({ instruments: [{ ...INPUT, isin: "INE009A01021" }] });
  assert.equal(result.ok, false);
  assert.equal(invalid.calls.length, 0);
  for (const body of [{ market_only: true, instruments: "not-an-array" },
    { instruments: [INPUT, { ...INPUT, symbol: "OTHER" }] },
    { instruments: [INPUT, { ...INPUT, isin: "INE009A01021", instrument_key: "NSE_EQ|INE009A01021" }] }]) {
    assert.equal((await invalid.upstoxInstitutionalResponse(body)).ok, false);
    assert.equal(invalid.calls.length, 0);
  }
});

await test("explicit market-only refresh is structured even when all data is unavailable", async () => {
  const run = runtime({ fii: [], dii: [] });
  const result = await run.upstoxInstitutionalResponse({ market_only: true, instruments: [] });
  assert.equal(result.ok, true);
  assert.equal(result.status, "DATA_NEEDED");
  assert.equal(result.market.fii_cash_5d_net_cr, null);
  assert.equal(result.live_stocks, 0);
  assert.equal((await runtime().upstoxInstitutionalResponse({ instruments: [] })).ok, false);
});

await test("twelve stock identities share the four-request pool and preserve requested order", async () => {
  const run = runtime();
  const instruments = Array.from({ length: 12 }, (_, index) => ({ symbol: "FIXTURE" + index,
    isin: "INE" + String(index).padStart(9, "0") }));
  const result = await run.upstoxInstitutionalResponse({ instruments });
  assert.equal(result.ok, true);
  assert.equal(result.reported_stocks, 12);
  assert.deepEqual([...result.stocks].map((stock) => stock.symbol), instruments.map((input) => input.symbol));
  assert(run.maximumActive() <= 4);
  assert.equal(run.calls.length, 28);
});

await test("advisory-only overlay preserves primary score and clears unavailable evidence", async () => {
  const run = runtime(), row = { decision: "SELECT", base_score: 75, score: 75,
    ...INPUT,
    parameter_tunnel: { results: ["NO03", "NO04", "NO05", "NO08"].map((id) => ({ id, state: "HIT", value: 999 })) } };
  const stock = await run.fetchUpstoxShareHolding(INPUT), market = await run.fetchUpstoxInstitutionalMarket();
  const full = run.attachUpstoxInstitutionalEvidence(row, stock, market);
  assert.equal(full.score, 75); assert.equal(full.selection_score, 75); assert.equal(full.decision, "SELECT");
  assert.equal(full.parameter_selection_effect.hard_gate_decision_preserved, true);
  assert.equal(full.parameter_selection_effect.primary_rank_preserved, true);
  assert(full.parameter_tunnel.results.every((item) => item.state === "HIT"));
  const missing = run.attachUpstoxInstitutionalEvidence(full, { ...stock, fii_period: "Mar 2026", as_of: "2026-03-31", current_evidence_eligible: false }, null);
  assert(missing.parameter_tunnel.results.every((item) => item.state === "SOURCE_REQUIRED" && item.value === null));
  assert.equal(missing.score, 75);
  const mismatched = run.attachUpstoxInstitutionalEvidence(row, { ...stock, instrument_key: "NSE_EQ|INE009A01021" }, market);
  assert(mismatched.parameter_tunnel.results.filter((item) => item.id !== "NO08").every((item) => item.state === "SOURCE_REQUIRED"));
  assert.equal(mismatched.fii_holding_pct, null);
});

await test("slower stock peer crossing quarter and IST day invalidates completed peer evidence", async () => {
  const before = Date.parse("2026-09-30T18:29:30Z");
  const sessions = ["2026-09-30", "2026-09-29", "2026-09-28", "2026-09-25", "2026-09-24"];
  let run;
  run = runtime({ now: before, sessions, override: (url) => url.includes("/fundamentals/INE000000001/")
    ? new Promise((resolve) => setTimeout(() => { run.setNow(before + 60_000); resolve(json(shares())); }, 1)) : undefined });
  const response = await run.upstoxInstitutionalResponse({ instruments: [INPUT, { symbol: "SECOND", isin: "INE000000001" }] });
  assert.equal(response.stocks.length, 2);
  assert(response.stocks.every((stock) => stock.status === "REPORTED" && stock.current_evidence_eligible === false));
  assert.equal(response.stocks[0].currentness, "OLDER_REPORT");
  assert.equal(response.market.status, "DATA_NEEDED");
  assert.equal(response.market.fii_cash_5d_net_cr, null);
});

await test("last attachment independently rejects expired session context", async () => {
  const sessions = [...SESSIONS, "2026-09-17"], before = Date.parse("2026-09-24T09:59:30Z");
  const run = runtime({ now: before, sessions, fii: cash(sessions.slice(1)), dii: cash(sessions.slice(1)) });
  const market = await run.fetchUpstoxInstitutionalMarket();
  assert.equal(market.status, "READY");
  run.setNow(before + 60_000);
  const row = run.attachUpstoxInstitutionalEvidence({ ...INPUT, decision: "SELECT", score: 75, base_score: 75,
    parameter_tunnel: { results: [{ id: "NO08", state: "SOURCE_REQUIRED" }] } }, null, market);
  assert.equal(row.parameter_tunnel.results[0].state, "SOURCE_REQUIRED");
  assert.equal(row.fii5dNetCr, null);
  assert.equal(row.score, 75);
});

await test("bounded fetch and body timeout redirects size invalid JSON and errors are redacted", async () => {
  for (const fetch of [async () => { throw Error("SECRET_TOKEN"); }, async () => new Response("SECRET_TOKEN"),
    async () => new Response("SECRET_TOKEN", { status: 302 }), async () => new Response(" ".repeat(262145)),
    async () => new Response(JSON.stringify({ status: "error", message: "SECRET_TOKEN" })),
    async () => new Promise(() => {}), async () => new Response(new ReadableStream())]) {
    const run = runtime({ fetch });
    await assert.rejects(run.fetchUpstoxInstitutionalJson("https://api.upstox.com/v2/market/fii"),
      (error) => { assert.equal(error.message.includes("SECRET"), false); return true; });
    assert(run.timers.includes(4000));
  }
  const run = runtime({ token: () => new Promise(() => {}) });
  await assert.rejects(run.fetchUpstoxInstitutionalJson("https://api.upstox.com/v2/market/fii"), /timeout/);
  assert.equal(run.calls.length, 0);
});

await test("caches and shared pending work are bounded", async () => {
  const run = runtime();
  for (let index = 0; index < 300; index += 1) await run.institutionalCached("fixture-" + index, 1000, async () => ({ ok: true }));
  assert.equal(run.cacheSize(), 256);
  const releases = [];
  const work = Array.from({ length: 32 }, (_, index) => run.institutionalCached("pending-" + index, 1000,
    () => new Promise((resolve) => releases.push(resolve))));
  assert.equal(run.pendingSize(), 32);
  const overflow = await run.institutionalCached("overflow", 1000, async () => ({ ok: true }));
  assert.equal(overflow.reason, "institutional_busy_retry");
  releases.forEach((release) => release({ ok: true }));
  await Promise.all(work);
  assert.equal(run.pendingSize(), 0);
});

console.log(JSON.stringify({ ok: true, scenarios, networkRequests: 0,
  note: "Actual embedded institutional helpers checked with provider/calendar fixtures; no production API, Mongo or trading action." }));
