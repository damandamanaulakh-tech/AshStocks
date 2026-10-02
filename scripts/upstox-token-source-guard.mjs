import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";

// Run the actual embedded OAuth helpers without starting the server, reading
// credentials, contacting a provider, or persisting any token.
const source = fs.readFileSync(new URL("../server-upstox-oauth-patch.mjs", import.meta.url), "utf8");
const match = source.match(/const UPSTOX_OAUTH_FUNCTIONS = String\.raw`([\s\S]*?)\n`;/);
assert(match, "OAuth helper insertion must exist");
const now = Date.parse("2026-10-02T09:00:00.000Z");
const future = "2026-10-03T09:00:00.000Z";
const past = "2026-10-01T09:00:00.000Z";
class Clock extends Date { static now() { return now; } }
let checks = 0;

function harness({ stored = null, envToken = "", readError = false, storeError = false, storeMissingMethod = false } = {}) {
  const activity = { reads: 0, writes: 0, network: 0 };
  const store = {
    async getUpstoxAuth() {
      activity.reads++;
      if (readError) throw new Error("synthetic private database detail must not escape");
      return stored;
    },
    async saveUpstoxAuth() { activity.writes++; throw new Error("writes forbidden"); }
  };
  if (storeMissingMethod) delete store.getUpstoxAuth;
  const context = vm.createContext({
    ENV: { UPSTOX_ACCESS_TOKEN: envToken }, Date: Clock, Buffer, URL, URLSearchParams, crypto,
    getStore: async () => {
      if (storeError) throw new Error("synthetic private database detail must not escape");
      return store;
    },
    upstoxStatus: () => ({ token_visible: false, live_orders: false }),
    fetch: async () => { activity.network++; throw new Error("network forbidden"); }
  });
  vm.runInContext(match[1], context, { timeout: 1000 });
  return { run: code => vm.runInContext(code, context, { timeout: 1000 }), activity };
}

async function check(name, options, expectedToken, expectedReason, expectedStoredExpiry) {
  const h = harness(options);
  assert.equal(await h.run("currentUpstoxAccessToken()"), expectedToken, name + ": selected token");
  const status = await h.run("upstoxRuntimeStatus()");
  assert.equal(status.token_selection_reason, expectedReason, name + ": selection reason");
  assert.equal(status.stored_token_expiry_state, expectedStoredExpiry, name + ": stored expiry");
  assert.equal(status.token_visible, Boolean(expectedToken), name + ": selected presence");
  const storageUnavailable = Boolean(options.readError || options.storeError || options.storeMissingMethod);
  assert.equal(status.auth_storage_status, storageUnavailable ? "unavailable" : "available", name + ": storage state");
  const knownPresent = Boolean(options.envToken?.trim() || (!storageUnavailable && options.stored?.access_token?.trim()));
  assert.equal(status.token_present, knownPresent ? true : storageUnavailable ? null : false, name + ": credential presence distinct from selection");
  const selectedExpiry = !expectedToken ? "missing" : expectedToken === options.stored?.access_token?.trim() ? expectedStoredExpiry : "unknown";
  assert.equal(status.token_expiry_state, selectedExpiry, name + ": selected expiry metadata");
  assert.equal(status.provider_auth_status, "not_checked", name + ": never imply provider acceptance");
  assert.equal(status.live_orders, false);
  assert.equal(status.token_printed, false);
  const encoded = JSON.stringify(status);
  for (const secret of [options.stored?.access_token?.trim(), options.stored?.refresh_token, options.envToken?.trim(), "synthetic private database detail"])
    if (secret) assert(!encoded.includes(secret), name + ": public response must not contain a credential or raw store error");
  assert.equal(h.activity.writes, 0); assert.equal(h.activity.network, 0);
  checks++;
  console.log("PASS " + name);
  return status;
}

const token = expires_at => ({ access_token: "fixture-stored-secret", refresh_token: "fixture-refresh-secret", source: "manual_paste", saved_at: "2026-10-01T08:00:00.000Z", expires_at });
await check("expired stored falls back to distinct environment", { stored: token(past), envToken: "fixture-env-secret" }, "fixture-env-secret", "stored_expired_environment_selected", "expired");
await check("future stored retains precedence", { stored: token(future), envToken: "fixture-env-secret" }, "fixture-stored-secret", "stored_selected", "not_expired");
await check("unknown stored retains precedence", { stored: token(null), envToken: "fixture-env-secret" }, "fixture-stored-secret", "stored_selected", "unknown");
await check("known expired has no alternative", { stored: token(past) }, "", "stored_expired_no_alternative", "expired");
await check("same expired token cannot reenter via environment", { stored: token(past), envToken: "  fixture-stored-secret  " }, "", "stored_expired_no_alternative", "expired");
await check("expiry at exact current instant is expired", { stored: token(new Date(now).toISOString()), envToken: "fixture-env-secret" }, "fixture-env-secret", "stored_expired_environment_selected", "expired");
await check("explicit offset expiry uses instant", { stored: token("2026-10-02T14:30:00+05:30"), envToken: "fixture-env-secret" }, "fixture-env-secret", "stored_expired_environment_selected", "expired");
await check("environment only, trimmed and unverified", { envToken: "  fixture-env-secret  " }, "fixture-env-secret", "environment_selected", "missing");
await check("no credential", {}, "", "no_token", "missing");
const unavailable = await check("storage failure preserves honest fallback", { readError: true, envToken: "fixture-env-secret" }, "fixture-env-secret", "storage_unavailable_environment_selected", "unknown");
assert.equal(unavailable.auth_storage_status, "unavailable");
const unavailableEmpty = await check("storage failure without fallback stays unknown", { readError: true }, "", "storage_unavailable_no_token", "unknown");
assert.equal(unavailableEmpty.token_present, null);
await check("empty stored token does not shadow environment", { stored: { access_token: "   " }, envToken: "fixture-env-secret" }, "fixture-env-secret", "environment_selected", "missing");
await check("missing store method is unavailable, not absent", { storeMissingMethod: true, envToken: "fixture-env-secret" }, "fixture-env-secret", "storage_unavailable_environment_selected", "unknown");
await check("store initialization rejection remains unavailable", { storeError: true, envToken: "fixture-env-secret" }, "fixture-env-secret", "storage_unavailable_environment_selected", "unknown");
for (const expires of ["not-a-date", "0", 0, "2026-02-31T00:00:00Z", "2026-10-02T11:00:00", "2026-10-01", "2026-10-01T25:00:00Z", "2026-10-01T00:60:00Z", "2026-10-01T00:00:00+25:00", "2025-02-29T00:00:00Z"]) {
  await check("malformed expiry remains unknown " + JSON.stringify(expires), { stored: token(expires), envToken: "fixture-env-secret" }, "fixture-stored-secret", "stored_selected", "unknown");
}
const leap = await check("valid leap-day expiry recognized", { stored: token("2024-02-29T00:00:00.123Z"), envToken: "fixture-env-secret" }, "fixture-env-secret", "stored_expired_environment_selected", "expired");
assert.equal(leap.token_expiry_state, "unknown", "Environment fallback expiry remains unknown");
const saved = harness({ stored: token(future) }).run("upstoxAuthPublic({access_token:'fixture-save-secret', source:'manual_paste', expires_at:'2026-10-03T09:00:00Z'})");
assert.equal(saved.token_visible, true);
assert.equal(saved.token_source, "manual_paste");
assert.equal(saved.provider_auth_status, "not_checked");
assert.equal(saved.token_selection_reason, undefined, "Saving a credential does not claim runtime selection");
assert(!JSON.stringify(saved).includes("fixture-save-secret"));
checks++;
console.log("PASS saved-token status does not claim runtime selection");
console.log(`Upstox token-source guard passed: ${checks} groups; no provider, credential reads, storage writes or orders.`);
