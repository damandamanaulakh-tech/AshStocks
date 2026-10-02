// Embedded into the generated server before the OAuth/quote consumers. Keep
// provider I/O failures separate from application authentication and storage.
export const UPSTOX_HTTP_FUNCTIONS = String.raw`
function upstoxHttpTimeoutMs() {
  const value = Number(ENV.UPSTOX_HTTP_TIMEOUT_MS || 8000);
  return Number.isFinite(value) ? Math.max(1000, Math.min(15000, value)) : 8000;
}

function upstoxRequestFailure(stage, code, upstreamStatus = null) {
  const stages = ["candles", "quote", "oauth_preflight", "oauth_exchange"];
  const messages = {
    upstox_timeout: "provider request timed out",
    upstox_network_error: "provider could not be reached",
    upstox_auth_rejected: "provider rejected authorization; token expiry is not established",
    upstox_access_denied: "provider denied access",
    upstox_rate_limited: "provider rate limit reached",
    upstox_unavailable: "provider temporarily unavailable",
    upstox_http_error: "provider rejected the request",
    upstox_invalid_response: "provider returned an invalid response",
    upstox_response_too_large: "provider response exceeded the allowed size",
    upstox_redirect_refused: "provider redirect refused",
    upstox_request_target_invalid: "provider request target refused",
    upstox_token_missing: "no locally usable provider token is selected",
    upstox_quote_busy: "another quote request must finish before retry"
  };
  const safeStage = stages.includes(stage) ? stage : "quote";
  const safeCode = Object.hasOwn(messages, code) ? code : "upstox_network_error";
  const httpStatus = Number.isInteger(upstreamStatus) && upstreamStatus >= 100 && upstreamStatus <= 599 ? upstreamStatus : null;
  const error = new Error("Upstox " + safeStage + (httpStatus ? " " + httpStatus : "") + ": " + messages[safeCode]);
  Object.assign(error, {
    upstoxRequestFailure: true, code: safeCode, dependency: "upstox", stage: safeStage,
    upstream_status: httpStatus,
    status: safeCode === "upstox_timeout" ? 504 : ["upstox_rate_limited", "upstox_unavailable", "upstox_quote_busy"].includes(safeCode) ? 503 : 502,
    retryable: ["upstox_timeout", "upstox_network_error", "upstox_rate_limited", "upstox_unavailable", "upstox_quote_busy"].includes(safeCode)
  });
  return error;
}

function upstoxHttpFailure(stage, status) {
  return upstoxRequestFailure(stage, status === 401 ? "upstox_auth_rejected" : status === 403 ? "upstox_access_denied"
    : status === 429 ? "upstox_rate_limited" : status >= 500 ? "upstox_unavailable" : "upstox_http_error", status);
}

function upstoxRequestPayload(error) {
  if (error?.runtimeStorageFailure === true) {
    if (typeof runtimeStoragePayload === "function") return runtimeStoragePayload(error);
    return { ok: false, error: "Saved provider credentials are temporarily unavailable.", code: "storage_unavailable",
      dependency: "storage", stage: "auth_read", retryable: true, read_ready: false, write_ready: null, trading_ready: false };
  }
  const safe = error?.upstoxRequestFailure === true
    ? upstoxRequestFailure(error.stage, error.code, error.upstream_status)
    : upstoxRequestFailure("quote", "upstox_network_error");
  return { ok: false, error: safe.message, code: safe.code, dependency: safe.dependency, stage: safe.stage,
    upstream_status: safe.upstream_status, retryable: safe.retryable, token_printed: false };
}

async function upstoxFetchJson(url, init = {}, stage = "candles") {
  const limits = { candles: 2 * 1024 * 1024, quote: 8 * 1024 * 1024,
    oauth_preflight: 1024 * 1024, oauth_exchange: 256 * 1024 };
  if (!Object.hasOwn(limits, stage)) throw upstoxRequestFailure(stage, "upstox_request_target_invalid");
  let target;
  try { target = new URL(url); } catch { throw upstoxRequestFailure(stage, "upstox_request_target_invalid"); }
  if (target.origin !== "https://api.upstox.com" || target.username || target.password || target.hash) {
    throw upstoxRequestFailure(stage, "upstox_request_target_invalid");
  }
  const controller = new AbortController();
  let reader, response, timer;
  const ensureActive = () => {
    if (!controller.signal.aborted) return;
    // A fetch implementation can ignore abort and deliver headers after the
    // outer finally already ran. Close that late body too; never consume it.
    try { if (!reader && response?.body) void response.body.cancel().catch(() => {}); } catch (_) {}
    throw upstoxRequestFailure(stage, "upstox_timeout");
  };
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(upstoxRequestFailure(stage, "upstox_timeout")); }, upstoxHttpTimeoutMs());
  });
  const request = (async () => {
    response = await fetch(target.href, { ...init, redirect: stage === "oauth_preflight" ? "manual" : "error", signal: controller.signal });
    ensureActive();
    if (response.redirected || (response.url && response.url !== target.href)) throw upstoxRequestFailure(stage, "upstox_redirect_refused");
    if (stage !== "oauth_preflight" && response.status >= 300 && response.status < 400) throw upstoxRequestFailure(stage, "upstox_redirect_refused", response.status);
    if (stage !== "oauth_preflight" && !response.ok) throw upstoxHttpFailure(stage, response.status);
    // A manual authorization redirect is a normal preflight result, not proof
    // that a market-data token works. Do not follow it or read an unneeded body.
    if (stage === "oauth_preflight" && response.status >= 300 && response.status < 400) return { ok: response.ok, status: response.status, payload: null };
    const length = response.headers?.get("content-length");
    if (length !== null && length !== undefined && (!/^\d{1,12}$/.test(length) || Number(length) > limits[stage])) {
      throw upstoxRequestFailure(stage, "upstox_response_too_large");
    }
    if (!response.body?.getReader) throw upstoxRequestFailure(stage, "upstox_invalid_response");
    reader = response.body.getReader();
    const chunks = []; let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      ensureActive();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw upstoxRequestFailure(stage, "upstox_invalid_response");
      bytes += value.byteLength;
      if (bytes > limits[stage] || chunks.length >= 4096) throw upstoxRequestFailure(stage, "upstox_response_too_large");
      chunks.push(Buffer.from(value));
    }
    ensureActive();
    let payload;
    try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, bytes))); }
    catch { if (stage === "oauth_preflight") return { ok: response.ok, status: response.status, payload: null }; throw upstoxRequestFailure(stage, "upstox_invalid_response"); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw upstoxRequestFailure(stage, "upstox_invalid_response");
    ensureActive();
    return { ok: response.ok, status: response.status, payload };
  })();
  try { return await Promise.race([request, timeout]); }
  catch (error) {
    if (controller.signal.aborted) throw upstoxRequestFailure(stage, "upstox_timeout");
    throw error?.upstoxRequestFailure === true ? error : upstoxRequestFailure(stage, "upstox_network_error");
  } finally {
    clearTimeout(timer);
    controller.abort();
    try { if (reader) void reader.cancel().catch(() => {}); else if (response?.body) void response.body.cancel().catch(() => {}); } catch (_) {}
  }
}
`;
