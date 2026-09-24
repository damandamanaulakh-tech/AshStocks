const UPSTOX_INSTITUTIONAL_FUNCTIONS = String.raw`
const UPSTOX_INSTITUTIONAL_VERSION = "ashstocks-upstox-institutional-v0.2";
const UPSTOX_SHARE_HOLDINGS_URL = "https://api.upstox.com/v2/fundamentals";
const UPSTOX_FII_ACTIVITY_URL = "https://api.upstox.com/v2/market/fii";
const UPSTOX_DII_ACTIVITY_URL = "https://api.upstox.com/v2/market/dii";
const UPSTOX_MARKET_TIMINGS_URL = "https://api.upstox.com/v2/market/timings/";
const UPSTOX_SHARE_HOLDINGS_CACHE_MS = 6 * 60 * 60 * 1000;
const UPSTOX_INSTITUTIONAL_MARKET_CACHE_MS = 15 * 60 * 1000;
const UPSTOX_INSTITUTIONAL_MAX_STOCKS = 12;
const INSTITUTIONAL_NEGATIVE_CACHE_MS = 30_000;
const INSTITUTIONAL_REQUEST_TIMEOUT_MS = 4_000;
const INSTITUTIONAL_MAX_RESPONSE_BYTES = 262_144;
const institutionalCache = new Map();
const institutionalPending = new Map();
let institutionalActiveRequests = 0;
const institutionalRequestQueue = [];

function institutionalNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function institutionalDay(timestamp) {
  return new Date(timestamp + 330 * 60_000).toISOString().slice(0, 10);
}

function institutionalIso(timestamp) { return new Date(timestamp).toISOString(); }

function institutionalError(reason) {
  const error = new Error(reason);
  error.institutionalCode = reason;
  return error;
}

function institutionalReason(error) {
  return error?.institutionalCode || "institutional_request_failed";
}

async function institutionalCached(key, ttl, work, positive = (value) => value.ok) {
  const now = Date.now();
  const cached = institutionalCache.get(key);
  if (cached && now >= cached.at && now < cached.expires) return { ...cached.value, cache_hit: true };
  if (cached) institutionalCache.delete(key);
  if (institutionalPending.has(key)) return institutionalPending.get(key);
  if (institutionalPending.size >= 32) return { ok: false, reason: "institutional_busy_retry",
    fetched_at: institutionalIso(now), cache_expires_at: institutionalIso(now + INSTITUTIONAL_NEGATIVE_CACHE_MS) };
  const pending = (async () => {
    let value;
    try { value = await work(); } catch (error) { value = { ok: false, reason: institutionalReason(error) }; }
    const at = Date.now();
    const expires = at + (positive(value) ? ttl : INSTITUTIONAL_NEGATIVE_CACHE_MS);
    const result = { ...value, fetched_at: institutionalIso(at), cache_expires_at: institutionalIso(expires), cache_hit: false };
    if (institutionalCache.size >= 256) institutionalCache.delete(institutionalCache.keys().next().value);
    institutionalCache.set(key, { at, expires, value: result });
    return result;
  })();
  institutionalPending.set(key, pending);
  try { return await pending; } finally { institutionalPending.delete(key); }
}

async function institutionalRequestSlot(work) {
  if (institutionalActiveRequests >= 4) {
    if (institutionalRequestQueue.length >= 32) throw institutionalError("institutional_busy_retry");
    await new Promise((resolve) => institutionalRequestQueue.push(resolve));
  } else institutionalActiveRequests += 1;
  try { return await work(); }
  finally {
    const next = institutionalRequestQueue.shift();
    if (next) next(); else institutionalActiveRequests -= 1;
  }
}

function institutionalRound(value, digits = 2) {
  const number = institutionalNumber(value);
  if (number === null) return null;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
}

function institutionalIsin(input = {}) {
  const explicit = String(input.isin || "").trim().toUpperCase();
  const instrumentPart = String(input.instrument_key || input.instrumentKey || "").split("|").at(-1)?.trim().toUpperCase() || "";
  const key = String(input.instrument_key || input.instrumentKey || "");
  const candidate = explicit || instrumentPart;
  if (key && (key !== "NSE_EQ|" + candidate || (explicit && explicit !== instrumentPart))) return "";
  return /^IN[A-Z0-9]{10}$/.test(candidate) && !candidate.startsWith("INF") ? candidate : "";
}

function normalizeInstitutionalInputs(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)
    || (Object.hasOwn(body, "instruments") && !Array.isArray(body.instruments))
    || (Object.hasOwn(body, "rows") && !Array.isArray(body.rows))
    || (Object.hasOwn(body, "market_only") && typeof body.market_only !== "boolean")) {
    throw institutionalError("institutional_inputs_invalid");
  }
  const source = Array.isArray(body.instruments) ? body.instruments : Array.isArray(body.rows) ? body.rows : [];
  if (source.length > UPSTOX_INSTITUTIONAL_MAX_STOCKS) throw institutionalError("institutional_too_many_instruments");
  const output = [];
  for (const raw of source) {
    const input = typeof raw === "string" ? { instrument_key: raw } : (raw || {});
    const symbol = normalizeSymbol(input.symbol || input.trading_symbol || "");
    const instrumentKey = String(input.instrument_key || input.instrumentKey || "").trim();
    const isin = institutionalIsin(input);
    if (!isin) throw institutionalError("institutional_instrument_identity_invalid");
    const key = isin;
    if (output.some((item) => (item.key === key && item.symbol !== symbol) || (symbol && item.symbol === symbol && item.isin !== isin))) {
      throw institutionalError("institutional_instrument_identity_ambiguous");
    }
    if (output.some((item) => item.key === key)) continue;
    output.push({ key, symbol, instrument_key: instrumentKey || "NSE_EQ|" + isin, isin });
    if (output.length >= UPSTOX_INSTITUTIONAL_MAX_STOCKS) break;
  }
  return output;
}

function institutionalPeriod(period) {
  if (typeof period !== "string" || !/^(Mar|Jun|Sep|Dec) (20[0-9]{2})$/.test(period)) return null;
  const [month, yearText] = period.split(" ");
  const year = Number(yearText), quarter = ["Mar", "Jun", "Sep", "Dec"].indexOf(month);
  const end = new Date(Date.UTC(year, quarter * 3 + 3, 0)).toISOString().slice(0, 10);
  return { period, ordinal: year * 4 + quarter, end };
}

function categoryHistory(rows, category) {
  const entries = rows.filter((item) => item?.category === category);
  const values = new Map();
  for (const entry of entries) {
    if (!Array.isArray(entry.history) || entry.history.length > 100) throw institutionalError("shareholding_history_invalid");
    for (const item of entry.history) {
      const period = institutionalPeriod(item?.period), value = institutionalNumber(item?.value);
      if (!period || period.end >= institutionalDay(Date.now()) || value === null || value < 0 || value > 100) {
        throw institutionalError("shareholding_value_or_quarter_invalid");
      }
      if (values.has(period.period) && values.get(period.period).value !== value) throw institutionalError("shareholding_quarter_conflict");
      values.set(period.period, { ...period, value });
    }
  }
  return [...values.values()].sort((a, b) => b.ordinal - a.ordinal);
}

function holdingValueAt(history, period) {
  return history.find((item) => item.period === period)?.value ?? null;
}

function normalizeShareHoldings(rows, input) {
  if (!Array.isArray(rows) || rows.length > 32) throw institutionalError("shareholding_schema_invalid");
  const fii = categoryHistory(rows, "fii");
  const otherDii = categoryHistory(rows, "other_dii");
  const mutualFunds = categoryHistory(rows, "mutual_funds");
  const current = fii[0] || null;
  const previous = current && fii[1]?.ordinal === current.ordinal - 1 ? fii[1] : null;
  if (!current) {
    return {
      ...input,
      status: "DATA_NEEDED",
      reason: "shareholding_fii_category_missing",
      source: "Upstox Share Holdings API",
      latest_reported_quarter: true
    };
  }
  const otherDiiValue = holdingValueAt(otherDii, current.period);
  const mutualFundValue = holdingValueAt(mutualFunds, current.period);
  const priorPeriod = previous?.period || null;
  const priorOtherDiiValue = priorPeriod ? holdingValueAt(otherDii, priorPeriod) : null;
  const priorMutualFundValue = priorPeriod ? holdingValueAt(mutualFunds, priorPeriod) : null;
  const diiHolding = otherDiiValue !== null && mutualFundValue !== null ? otherDiiValue + mutualFundValue : null;
  const priorDiiHolding = priorOtherDiiValue !== null && priorMutualFundValue !== null ? priorOtherDiiValue + priorMutualFundValue : null;
  if ((diiHolding !== null && current.value + diiHolding > 100) || (priorDiiHolding !== null && previous.value + priorDiiHolding > 100)) {
    throw institutionalError("shareholding_total_exceeds_100");
  }
  const fiiChange = previous ? current.value - previous.value : null;
  const otherDiiChange = otherDiiValue === null || priorOtherDiiValue === null ? null : otherDiiValue - priorOtherDiiValue;
  const mutualFundChange = mutualFundValue === null || priorMutualFundValue === null ? null : mutualFundValue - priorMutualFundValue;
  const diiChange = diiHolding !== null && priorDiiHolding !== null ? diiHolding - priorDiiHolding : null;
  const changes = [fiiChange, otherDiiChange, mutualFundChange];
  const breadthCount = changes.every((value) => value !== null) ? changes.filter((value) => value > 0).length : null;
  const today = institutionalDay(Date.now());
  const latestCompletedQuarter = Number(today.slice(0, 4)) * 4 + Math.floor((Number(today.slice(5, 7)) - 1) / 3) - 1;
  return {
    ...input,
    status: "REPORTED",
    source: "Upstox Share Holdings API",
    source_endpoint: "/v2/fundamentals/:isin/share-holdings",
    latest_reported_quarter: true,
    as_of: current.end,
    currentness: current.ordinal === latestCompletedQuarter ? "LATEST_COMPLETED_QUARTER" : "OLDER_REPORT",
    current_evidence_eligible: current.ordinal === latestCompletedQuarter,
    comparison_status: previous ? "ADJACENT_QUARTER" : "UNAVAILABLE",
    fii_holding_pct: institutionalRound(current.value),
    fii_period: current.period,
    fii_previous_holding_pct: previous ? institutionalRound(previous.value) : null,
    fii_previous_period: previous?.period || null,
    fii_change_pp: institutionalRound(fiiChange),
    fii_direction: fiiChange === null ? "NO_COMPARISON" : fiiChange > 0 ? "ACCUMULATING" : fiiChange < 0 ? "REDUCING" : "UNCHANGED",
    other_dii_holding_pct: otherDiiValue === null ? null : institutionalRound(otherDiiValue),
    mutual_fund_holding_pct: mutualFundValue === null ? null : institutionalRound(mutualFundValue),
    dii_holding_pct: institutionalRound(diiHolding),
    dii_previous_holding_pct: institutionalRound(priorDiiHolding),
    dii_change_pp: institutionalRound(diiChange),
    other_dii_change_pp: institutionalRound(otherDiiChange),
    mutual_fund_change_pp: institutionalRound(mutualFundChange),
    institutional_breadth_increasing_count: breadthCount,
    institutional_holding_pct: diiHolding === null ? null : institutionalRound(current.value + diiHolding)
  };
}

async function fetchUpstoxInstitutionalJson(url) {
  return institutionalRequestSlot(async () => {
    const controller = new AbortController();
    let reader, timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(institutionalError("institutional_timeout")); }, INSTITUTIONAL_REQUEST_TIMEOUT_MS);
    });
    const request = (async () => {
      const accessToken = await currentUpstoxAccessToken();
      if (!accessToken) throw institutionalError("upstox_token_missing");
      if (controller.signal.aborted) throw institutionalError("institutional_timeout");
      const response = await fetch(url, { method: "GET", redirect: "error", signal: controller.signal,
        headers: { accept: "application/json", authorization: "Bearer " + accessToken } });
      if (response.redirected || (response.url && response.url !== url)) throw institutionalError("institutional_redirect_refused");
      if (!response.ok) throw institutionalError(response.status === 429 ? "institutional_rate_limited" : "institutional_http_error");
      const declared = response.headers?.get("content-length");
      if (declared !== null && declared !== undefined && (!/^[0-9]{1,10}$/.test(declared) || Number(declared) > INSTITUTIONAL_MAX_RESPONSE_BYTES)) {
        throw institutionalError("institutional_response_too_large");
      }
      if (!response.body?.getReader) throw institutionalError("institutional_json_invalid");
      reader = response.body.getReader();
      const chunks = [];
      let bytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!(value instanceof Uint8Array)) throw institutionalError("institutional_json_invalid");
        bytes += value.byteLength;
        if (bytes > INSTITUTIONAL_MAX_RESPONSE_BYTES || chunks.length >= 4096) throw institutionalError("institutional_response_too_large");
        chunks.push(value);
      }
      const buffer = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
      let payload;
      try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer)); }
      catch { throw institutionalError("institutional_json_invalid"); }
      if (!payload || typeof payload !== "object" || Array.isArray(payload) || payload.status !== "success") {
        throw institutionalError("institutional_schema_invalid");
      }
      return payload;
    })();
    try { return await Promise.race([request, timeout]); }
    catch (error) { throw institutionalError(institutionalReason(error)); }
    finally {
      clearTimeout(timer);
      controller.abort();
      if (reader) void reader.cancel().catch(() => {});
    }
  });
}

async function fetchUpstoxShareHolding(input) {
  const url = UPSTOX_SHARE_HOLDINGS_URL + "/" + encodeURIComponent(input.isin) + "/share-holdings";
  const cached = await institutionalCached(url, UPSTOX_SHARE_HOLDINGS_CACHE_MS, async () => {
    const payload = await fetchUpstoxInstitutionalJson(url);
    const normalized = normalizeShareHoldings(payload.data, {});
    return { ok: normalized.status === "REPORTED", data: payload.data, reason: normalized.reason };
  });
  const today = institutionalDay(Date.now());
  const nextQuarter = Date.UTC(Number(today.slice(0, 4)), (Math.floor((Number(today.slice(5, 7)) - 1) / 3) + 1) * 3, 1) - 330 * 60_000;
  const metadata = { fetched_at: cached.fetched_at,
    cache_expires_at: institutionalIso(Math.min(Date.parse(cached.cache_expires_at), nextQuarter)), cache_hit: cached.cache_hit };
  try {
    if (!cached.ok) throw institutionalError(cached.reason);
    // Reevaluate quarter eligibility on every read, including cached data crossing a quarter boundary.
    return { ...normalizeShareHoldings(cached.data, input), ...metadata };
  } catch (error) {
    return { ...input, ...metadata, status: "DATA_NEEDED", reason: institutionalReason(error),
      source: "Upstox Share Holdings API", latest_reported_quarter: true, current_evidence_eligible: false,
      fii_holding_pct: null, fii_change_pp: null, dii_change_pp: null, institutional_breadth_increasing_count: null };
  }
}

function institutionalActivityRows(payload) {
  const rows = payload?.data?.["NSE_EQ|CASH"];
  if (!Array.isArray(rows) || rows.length > 64) throw institutionalError("institutional_activity_schema_invalid");
  const byDate = new Map();
  for (const row of rows) {
    const timestamp = institutionalNumber(row?.time_stamp), buy = institutionalNumber(row?.buy_amount), sell = institutionalNumber(row?.sell_amount);
    if (!Number.isSafeInteger(timestamp) || timestamp < 946684800000 || timestamp > Date.now()
      || buy === null || sell === null || buy < 0 || sell < 0 || buy > Number.MAX_SAFE_INTEGER || sell > Number.MAX_SAFE_INTEGER) {
      throw institutionalError("institutional_activity_row_invalid");
    }
    const day = institutionalDay(timestamp), previous = byDate.get(day);
    if (previous && (previous.buy_amount !== buy || previous.sell_amount !== sell)) throw institutionalError("institutional_activity_date_conflict");
    byDate.set(day, { day, time_stamp: Math.max(timestamp, previous?.time_stamp || 0), buy_amount: buy, sell_amount: sell });
  }
  return [...byDate.values()].sort((a, b) => b.time_stamp - a.time_stamp);
}

function institutionalNetCr(rows, days) {
  if (rows.length !== days) return null;
  return institutionalRound(rows.reduce((sum, row) => sum + row.buy_amount - row.sell_amount, 0) / 10000000);
}

function normalizeInstitutionalTimings(payload, day) {
  if (!Array.isArray(payload.data) || payload.data.length > 32) throw institutionalError("institutional_calendar_schema_invalid");
  let nse = null;
  for (const entry of payload.data) {
    if (!entry || typeof entry.exchange !== "string") throw institutionalError("institutional_calendar_schema_invalid");
    if (entry.exchange !== "NSE") continue;
    const start = institutionalNumber(entry.start_time), end = institutionalNumber(entry.end_time);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start <= 0 || end <= start
      || institutionalDay(start) !== day || institutionalDay(end) !== day) throw institutionalError("institutional_calendar_timing_invalid");
    if (nse && (nse.start !== start || nse.end !== end)) throw institutionalError("institutional_calendar_timing_conflict");
    nse = { start, end };
  }
  return { ok: true, day, nse };
}

async function institutionalSessionCalendar() {
  const now = Date.now(), today = institutionalDay(now), midnight = Date.parse(today + "T00:00:00Z");
  const dates = Array.from({ length: 14 }, (_, index) => new Date(midnight - index * 86400000).toISOString().slice(0, 10));
  const results = [];
  // The global request pool limits all calendar/stock/activity requests to four concurrent reads.
  for (let index = 0; index < dates.length; index += 4) {
    results.push(...await Promise.all(dates.slice(index, index + 4).map((day) => institutionalCached(
      UPSTOX_MARKET_TIMINGS_URL + day, day === today ? UPSTOX_INSTITUTIONAL_MARKET_CACHE_MS : UPSTOX_SHARE_HOLDINGS_CACHE_MS,
      async () => normalizeInstitutionalTimings(await fetchUpstoxInstitutionalJson(UPSTOX_MARKET_TIMINGS_URL + day), day)
    ))));
  }
  const evaluatedNow = Date.now();
  const failures = results.map((result, index) => result.ok ? null : { date: dates[index], reason: result.reason }).filter(Boolean);
  if (institutionalDay(evaluatedNow) !== today) failures.push({ date: institutionalDay(evaluatedNow), reason: "session_calendar_day_changed_during_fetch" });
  const completed = results.filter((result) => result.ok && result.nse && result.nse.end <= evaluatedNow).map((result) => result.day);
  const expected = completed.slice(0, 5);
  const transitions = [Date.parse(today + "T00:00:00+05:30") + 86400000,
    ...results.filter((result) => result.ok && result.nse?.end > evaluatedNow).map((result) => result.nse.end)];
  const expires = Math.min(...results.map((result) => Date.parse(result.cache_expires_at)), ...transitions);
  return { status: !failures.length && expected.length === 5 ? "VERIFIED" : "UNVERIFIED",
    source: "Upstox Market Timings API", lookback_calendar_days: 14,
    expected_session_dates: !failures.length && expected.length === 5 ? expected : [],
    latest_completed_session: !failures.length ? completed[0] || null : null,
    reason: failures.length ? "session_calendar_fetch_or_validation_failed" : expected.length < 5 ? "five_completed_sessions_unverified" : null,
    failures, fetched_at: institutionalIso(Math.max(...results.map((result) => Date.parse(result.fetched_at)))),
    cache_expires_at: institutionalIso(expires) };
}

function institutionalFeedView(cached, calendar) {
  const rows = cached.rows || [], latest = rows[0] || null;
  const base = { status: "DATA_NEEDED", reason: cached.reason || null, fetched_at: cached.fetched_at,
    cache_expires_at: cached.cache_expires_at, cache_hit: cached.cache_hit,
    observed_at: latest ? institutionalIso(latest.time_stamp) : null, observed_date: latest?.day || null,
    days_available: rows.length, window_dates: [], net_1d_cr: null, net_5d_cr: null };
  if (!cached.ok) return { ...base, status: "ERROR" };
  if (calendar.status !== "VERIFIED") return { ...base, reason: "session_calendar_unverified" };
  const expected = calendar.expected_session_dates;
  if (!latest) return { ...base, reason: "institutional_activity_empty" };
  if (latest.day !== expected[0]) return { ...base, status: latest.day < expected[0] ? "STALE" : "INCOMPLETE",
    reason: latest.day < expected[0] ? "latest_completed_session_missing" : "latest_reported_session_not_completed" };
  const window = expected.map((day) => rows.find((row) => row.day === day));
  const available = window.filter(Boolean);
  return { ...base, status: available.length === 5 ? "READY" : "INCOMPLETE",
    reason: available.length === 5 ? null : "five_session_window_incomplete", window_dates: available.map((row) => row.day),
    net_1d_cr: institutionalNetCr([latest], 1), net_5d_cr: available.length === 5 ? institutionalNetCr(available, 5) : null };
}

async function fetchUpstoxInstitutionalMarket() {
  const query = "?data_type=" + encodeURIComponent("NSE_EQ|CASH") + "&interval=1D";
  const load = (url) => institutionalCached(url + query, UPSTOX_INSTITUTIONAL_MARKET_CACHE_MS, async () => {
    const rows = institutionalActivityRows(await fetchUpstoxInstitutionalJson(url + query));
    return { ok: true, rows };
  }, (value) => value.ok && value.rows.length > 0);
  const [calendar, fiiData, diiData] = await Promise.all([institutionalSessionCalendar(), load(UPSTOX_FII_ACTIVITY_URL), load(UPSTOX_DII_ACTIVITY_URL)]);
  const shortenRetry = (data, url, view) => {
    if (view.status === "READY") return view;
    const key = url + query, entry = institutionalCache.get(key);
    if (entry) {
      entry.expires = Math.min(entry.expires, entry.at + INSTITUTIONAL_NEGATIVE_CACHE_MS);
      entry.value = { ...entry.value, cache_expires_at: institutionalIso(entry.expires) };
      return { ...view, cache_expires_at: entry.value.cache_expires_at };
    }
    return view;
  };
  const fii = shortenRetry(fiiData, UPSTOX_FII_ACTIVITY_URL, institutionalFeedView(fiiData, calendar));
  const dii = shortenRetry(diiData, UPSTOX_DII_ACTIVITY_URL, institutionalFeedView(diiData, calendar));
  const readyCount = [fii, dii].filter((feed) => feed.status === "READY").length;
  return { status: readyCount === 2 ? "READY" : readyCount ? "PARTIAL" : "DATA_NEEDED",
    source: "Upstox FII/DII Activity API", source_endpoints: ["/v2/market/fii", "/v2/market/dii"],
    amount_unit: "INR converted to crore", as_of: readyCount === 2 ? calendar.latest_completed_session : null,
    fetched_at: institutionalIso(Math.max(Date.parse(fii.fetched_at), Date.parse(dii.fetched_at))),
    cache_expires_at: institutionalIso(Math.min(Date.parse(calendar.cache_expires_at), Date.parse(fii.cache_expires_at), Date.parse(dii.cache_expires_at),
      Date.now() + (readyCount === 2 ? UPSTOX_INSTITUTIONAL_MARKET_CACHE_MS : INSTITUTIONAL_NEGATIVE_CACHE_MS))),
    calendar, feeds: { fii, dii }, fii_cash_1d_net_cr: fii.net_1d_cr, fii_cash_5d_net_cr: fii.net_5d_cr,
    dii_cash_1d_net_cr: dii.net_1d_cr, dii_cash_5d_net_cr: dii.net_5d_cr, fii_days: fii.days_available, dii_days: dii.days_available };
}

function institutionalCurrentStock(stock) {
  if (stock?.status !== "REPORTED") return stock;
  const now = Date.now(), today = institutionalDay(now), period = institutionalPeriod(stock.fii_period);
  const latestCompletedQuarter = Number(today.slice(0, 4)) * 4 + Math.floor((Number(today.slice(5, 7)) - 1) / 3) - 1;
  const fetched = Date.parse(stock.fetched_at), expires = Date.parse(stock.cache_expires_at);
  const current = Boolean(period && period.ordinal === latestCompletedQuarter && period.end === stock.as_of);
  const fresh = Number.isFinite(fetched) && fetched <= now && Number.isFinite(expires) && now < expires;
  return { ...stock, currentness: current ? "LATEST_COMPLETED_QUARTER" : "OLDER_REPORT",
    current_evidence_eligible: current && fresh,
    eligibility_reason: !current ? "report_is_not_latest_completed_quarter" : !fresh ? "report_cache_context_expired" : null };
}

function institutionalCurrentMarket(market) {
  if (!market) return market;
  const now = Date.now(), fetched = Date.parse(market.fetched_at), expires = Date.parse(market.cache_expires_at);
  const calendarFetched = Date.parse(market.calendar?.fetched_at), calendarExpires = Date.parse(market.calendar?.cache_expires_at);
  if (Number.isFinite(fetched) && fetched <= now && Number.isFinite(expires) && now < expires
    && Number.isFinite(calendarFetched) && calendarFetched <= now && Number.isFinite(calendarExpires) && now < calendarExpires) return market;
  return { ...market, status: "DATA_NEEDED", reason: "institutional_context_expired", as_of: null,
    calendar: { ...market.calendar, status: "UNVERIFIED", reason: "institutional_context_expired" },
    feeds: Object.fromEntries(["fii", "dii"].map((name) => [name, { ...market.feeds?.[name],
      status: "DATA_NEEDED", reason: "institutional_context_expired", net_1d_cr: null, net_5d_cr: null }])),
    fii_cash_1d_net_cr: null, fii_cash_5d_net_cr: null, dii_cash_1d_net_cr: null, dii_cash_5d_net_cr: null };
}

async function upstoxInstitutionalResponse(body = {}) {
  let inputs;
  try { inputs = normalizeInstitutionalInputs(body); }
  catch (error) { return { ok: false, error: institutionalReason(error), stocks: [] }; }
  if (!inputs.length && body.market_only !== true) return { ok: false, error: "institution_required", stocks: [] };
  const marketPromise = fetchUpstoxInstitutionalMarket();
  // Promise.all retains requested identity order; the shared pool caps provider reads at four.
  const fetchedStocks = await Promise.all(inputs.map(fetchUpstoxShareHolding));
  const fetchedMarket = await marketPromise;
  // Another provider read may have crossed session/quarter boundaries while this peer waited.
  const stocks = fetchedStocks.map(institutionalCurrentStock);
  const market = institutionalCurrentMarket(fetchedMarket);
  return {
    ok: true,
    status: stocks.some((stock) => stock.status === "REPORTED") || market.status !== "DATA_NEEDED" ? "AVAILABLE" : "DATA_NEEDED",
    version: UPSTOX_INSTITUTIONAL_VERSION,
    provider: "Upstox",
    fetched_at: new Date().toISOString(),
    stocks,
    market,
    requested: inputs.length,
    reported_stocks: stocks.filter((stock) => stock.status === "REPORTED").length,
    live_stocks: 0,
    data_needed: stocks.filter((stock) => stock.status !== "REPORTED").length,
    truth_labels: {
      stock_specific: "Quarterly FII/DII shareholding from Upstox by ISIN",
      market_wide: "Daily NSE cash FII/DII activity; five-day values require five verified completed NSE sessions",
      not_claimed: "No stock-wise daily FII cash-flow attribution"
    },
    token_printed: false
  };
}

function institutionalTunnelNode(previous, state, value, evidence, effect) {
  return { ...previous, state, value, evidence, effect };
}

function institutionalTunnelSummary(results) {
  const evaluated = results.filter((result) => result.state !== "SOURCE_REQUIRED");
  const positiveHits = results.filter((result) => result.state === "HIT").length;
  const riskClear = results.filter((result) => result.state === "CLEAR").length;
  const riskHits = results.filter((result) => result.state === "RISK").length;
  const misses = results.filter((result) => result.state === "MISS").length;
  const sourceRequired = results.length - evaluated.length;
  const evidenceScore = evaluated.length ? clamp(((positiveHits + riskClear) / evaluated.length) * 100, 0, 100) : 0;
  return {
    evaluated: evaluated.length,
    positive_hits: positiveHits,
    risk_clear: riskClear,
    risk_hits: riskHits,
    misses,
    source_required: sourceRequired,
    coverage_pct: round(evaluated.length / Math.max(1, results.length) * 100, 2),
    evidence_score: round(evidenceScore, 2)
  };
}

function attachUpstoxInstitutionalEvidence(row, stock, market) {
  stock = institutionalCurrentStock(stock);
  market = institutionalCurrentMarket(market);
  if (stock && (!row.instrument_key || stock.instrument_key !== row.instrument_key
    || (row.isin && stock.isin !== row.isin) || normalizeSymbol(stock.symbol) !== normalizeSymbol(row.symbol))) {
    stock = { status: "DATA_NEEDED", reason: "institutional_stock_identity_mismatch", current_evidence_eligible: false };
  }
  if (!row?.parameter_tunnel?.results?.length) return { ...row, institutional_evidence: { stock, market } };
  const results = row.parameter_tunnel.results.map((result) => {
    if (result.id === "NO03" && stock?.status === "REPORTED" && stock.current_evidence_eligible === true && institutionalNumber(stock.fii_change_pp) !== null) {
      return institutionalTunnelNode(result, stock.fii_change_pp > 0 ? "HIT" : "MISS", stock.fii_change_pp, "Upstox FII holding " + stock.fii_holding_pct + "% in " + stock.fii_period + "; QoQ change " + stock.fii_change_pp + " pp", "stock-specific reported ownership evidence");
    }
    if (result.id === "NO04" && stock?.status === "REPORTED" && stock.current_evidence_eligible === true && institutionalNumber(stock.dii_change_pp) !== null) {
      return institutionalTunnelNode(result, stock.dii_change_pp > 0 ? "HIT" : "MISS", stock.dii_change_pp, "Upstox DII plus mutual-fund holding " + stock.dii_holding_pct + "%; QoQ change " + stock.dii_change_pp + " pp", "stock-specific reported domestic ownership evidence");
    }
    if (result.id === "NO05" && stock?.status === "REPORTED" && stock.current_evidence_eligible === true && institutionalNumber(stock.institutional_breadth_increasing_count) !== null) {
      const breadth = stock.institutional_breadth_increasing_count;
      return institutionalTunnelNode(result, breadth >= 2 ? "HIT" : "MISS", breadth, breadth + " of FII, other DII and mutual-fund groups increased QoQ", "stock-specific institutional breadth evidence");
    }
    if (result.id === "NO08" && market?.feeds?.fii?.status === "READY" && institutionalNumber(market.fii_cash_5d_net_cr) !== null) {
      return institutionalTunnelNode(result, market.fii_cash_5d_net_cr > 0 ? "HIT" : "MISS", market.fii_cash_5d_net_cr, "Upstox NSE cash FII five-day net " + market.fii_cash_5d_net_cr + " Cr", "market-wide institutional regime evidence");
    }
    if (["NO03", "NO04", "NO05", "NO08"].includes(result.id)) {
      return institutionalTunnelNode(result, "SOURCE_REQUIRED", null,
        result.id === "NO08" ? market?.feeds?.fii?.reason || "Verified five-session FII evidence unavailable"
          : stock?.reason || "Current adjacent-quarter ownership comparison unavailable",
        "missing or historical evidence cannot evaluate current institutional signals");
    }
    return result;
  });
  const summary = institutionalTunnelSummary(results);
  const baseScore = tunnelFinite(row.base_score, tunnelFinite(row.score, 0));
  const hasExecutableEvidence = summary.evaluated > 0;
  const advisoryScore = ["DATA_NEEDED", "BLOCKED"].includes(row.decision) || !hasExecutableEvidence
    ? baseScore
    : round(baseScore * 0.70 + summary.evidence_score * 0.30, 2);
  return {
    ...row,
    score: baseScore,
    selection_score: baseScore,
    institutional_advisory_score: advisoryScore,
    parameter_tunnel: { ...row.parameter_tunnel, summary, results },
    parameter_selection_effect: {
      ...(row.parameter_selection_effect || {}),
      status: hasExecutableEvidence ? "ADVISORY_ONLY" : "BASE_SCORE_PRESERVED",
      base_score: baseScore,
      tunnel_score: summary.evidence_score,
      advisory_score: advisoryScore,
      hard_gate_decision_preserved: true,
      primary_rank_preserved: true,
      institutional_overlay: UPSTOX_INSTITUTIONAL_VERSION
    },
    institutional_evidence: { stock, market },
    fii_holding_pct: stock?.fii_holding_pct ?? null,
    fii_change_pp: stock?.fii_change_pp ?? null,
    fii5dNetCr: market?.fii_cash_5d_net_cr ?? null,
    dii5dNetCr: market?.dii_cash_5d_net_cr ?? null
  };
}

async function attachUpstoxInstitutionalScan(scan) {
  const instruments = (scan?.rows || []).slice(0, UPSTOX_INSTITUTIONAL_MAX_STOCKS).map((row) => ({ symbol: row.symbol, instrument_key: row.instrument_key, isin: row.isin || "" }));
  const institutional = await upstoxInstitutionalResponse({ instruments, market_only: instruments.length === 0 });
  const stocksByKey = new Map((institutional.stocks || []).map((stock) => [stock.instrument_key, stock]));
  scan.rows = (scan.rows || []).map((row) => attachUpstoxInstitutionalEvidence(row, stocksByKey.get(row.instrument_key) || null, institutional.market || null));
  scan.rows.sort((a, b) => decisionRank(a.decision) - decisionRank(b.decision) || Number(b.score || 0) - Number(a.score || 0) || String(a.symbol).localeCompare(String(b.symbol)));
  scan.institutional = institutional;
  return scan;
}
`;

const UPSTOX_INSTITUTIONAL_ROUTES = String.raw`
      if (url.pathname === "/api/upstox/institutional-flow") {
        if (req.method !== "POST") {
          json(res, 405, { ok: false, error: "method_not_allowed", allowed: ["POST"] });
          return;
        }
        const payload = await upstoxInstitutionalResponse(await readJsonBody(req));
        json(res, payload.ok === false && payload.error ? 400 : 200, payload);
        return;
      }
`;

export function applyUpstoxInstitutionalPatches(source, mustReplace) {
  let output = source;
  output = mustReplace(
    output,
    '    historical_candles_only: true,\n    live_orders: false,\n    endpoint: "https://api.upstox.com/v2/historical-candle/{instrument_key}/day/{to_date}/{from_date}",',
    '    historical_candles_only: false,\n    live_quotes_enabled: true,\n    institutional_analytics_enabled: true,\n    institutional_sources: ["share_holdings", "fii_activity", "dii_activity"],\n    live_orders: false,\n    endpoint: "https://api.upstox.com/v2/historical-candle/{instrument_key}/day/{to_date}/{from_date}",',
    "Upstox runtime capability identity"
  );
  output = mustReplace(
    output,
    "\nasync function dataBankStatus() {",
    `${UPSTOX_INSTITUTIONAL_FUNCTIONS}\nasync function dataBankStatus() {`,
    "Upstox institutional functions"
  );
  output = mustReplace(
    output,
    '      if (url.pathname === "/api/upstox/status") {',
    `${UPSTOX_INSTITUTIONAL_ROUTES}\n      if (url.pathname === "/api/upstox/status") {`,
    "Upstox institutional route"
  );
  output = mustReplace(
    output,
    '  const scan = runScanner(fetchedRows, { ...(body.settings || {}), source: "Upstox historical candles", holdings: body.holdings || body.existingHoldings || [] });\n  return {\n    ...scan,',
    '  const scan = runScanner(fetchedRows, { ...(body.settings || {}), source: "Upstox historical candles", holdings: body.holdings || body.existingHoldings || [] });\n  await attachUpstoxInstitutionalScan(scan);\n  return {\n    ...scan,',
    "attach Upstox institutional evidence to scanner rows"
  );
  return output;
}
