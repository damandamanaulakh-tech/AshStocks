import crypto from "node:crypto";

export const UNIVERSE_ROTATION_VERSION = "ashstocks-universe-rotation-v0.1";
const ROTATION_HORIZONS = ["intraday", "swing", "positional", "portfolio"];
const rotationInt = (value, max = 5000) => Math.min(max, Math.max(0, Math.floor(Number(value) || 0)));

export function normalizeRotationHorizon(value) {
  return ROTATION_HORIZONS.includes(value) ? value : "intraday";
}

export function sanitizeUniverseRotation(input = {}) {
  const result = {};
  for (const horizon of ROTATION_HORIZONS) {
    const value = input?.[horizon];
    if (!value || typeof value !== "object") continue;
    result[horizon] = {
      key: String(value.key || "").slice(0, 64),
      cycle: Math.max(1, rotationInt(value.cycle, 1000000)),
      offset: rotationInt(value.offset),
      failed_symbols: [...new Set((Array.isArray(value.failed_symbols) ? value.failed_symbols : [])
        .map((symbol) => String(symbol).slice(0, 80)))].slice(0, 5000),
      decisions: Object.fromEntries(["SELECT", "WATCH", "REJECT", "BLOCKED", "DATA_NEEDED"]
        .map((key) => [key, rotationInt(value.decisions?.[key])])),
      updated_at: String(value.updated_at || "").slice(0, 40)
    };
  }
  return result;
}

export function planUniverseBatch({ universe = [], rotation = {}, horizon = "intraday", limit = 200, revision = 0, now = new Date() } = {}) {
  horizon = normalizeRotationHorizon(horizon);
  const byKey = new Map();
  const bySymbol = new Set();
  for (const row of universe) {
    const symbol = String(row?.symbol || row?.trading_symbol || "").trim().toUpperCase();
    const key = String(row?.instrument_key || "").trim();
    if (!symbol || !key.startsWith("NSE_EQ|") || bySymbol.has(symbol) || byKey.has(key)) continue;
    bySymbol.add(symbol);
    byKey.set(key, { ...row, symbol, instrument_key: key });
  }
  const rows = [...byKey.values()].sort((a, b) => a.symbol.localeCompare(b.symbol) || a.instrument_key.localeCompare(b.instrument_key));
  const day = new Date(new Date(now).getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
  const key = crypto.createHash("sha256").update(JSON.stringify([day, horizon, revision, rows.map((row) => [row.symbol, row.instrument_key])])).digest("hex");
  const previous = sanitizeUniverseRotation(rotation)[horizon];
  const matches = previous?.key === key;
  const finished = matches && previous.offset >= rows.length;
  const start = matches && !finished ? previous.offset : 0;
  const size = Math.max(1, Math.min(200, rotationInt(limit, 200) || 200));
  const progress = matches && !finished ? previous : {
    key, cycle: finished ? previous.cycle + 1 : 1, offset: 0, failed_symbols: [],
    decisions: { SELECT: 0, WATCH: 0, REJECT: 0, BLOCKED: 0, DATA_NEEDED: 0 }, updated_at: ""
  };
  return { horizon, key, day, start, total: rows.length, batch_size: size, rows: rows.slice(start, start + size), progress };
}

export function completeUniverseBatch(plan, scan, now = new Date()) {
  if (!scan?.ok) throw new Error("Cannot advance a failed scan");
  // A silently truncated batch must be retried, never recorded as covered.
  if (Number(scan.scanned) !== plan.rows.length) throw new Error("batch_scan_count_mismatch");
  const allowed = new Set(plan.rows.map((row) => row.symbol));
  const failures = (Array.isArray(scan.failures) ? scan.failures : []).map((row) => row.symbol).filter((symbol) => allowed.has(symbol));
  if (plan.rows.length && new Set(failures).size === plan.rows.length) throw new Error("all_batch_fetches_failed");
  const progress = {
    ...plan.progress,
    offset: plan.start + plan.rows.length,
    failed_symbols: [...new Set([...plan.progress.failed_symbols, ...failures])],
    decisions: Object.fromEntries(Object.keys(plan.progress.decisions).map((key) => [key, plan.progress.decisions[key] + rotationInt(scan.summary?.[key])])),
    updated_at: new Date(now).toISOString()
  };
  return {
    progress,
    view: {
      version: UNIVERSE_ROTATION_VERSION, horizon: plan.horizon, day: plan.day, key: plan.key,
      cycle: progress.cycle, batch_start: plan.start, batch_count: plan.rows.length,
      batch_size: plan.batch_size, total: plan.total, attempted: progress.offset,
      remaining: Math.max(0, plan.total - progress.offset), complete: progress.offset >= plan.total,
      failed_count: progress.failed_symbols.length, failed_symbols: progress.failed_symbols,
      decisions: progress.decisions, updated_at: progress.updated_at,
      coverage_means: "Unique symbols attempted this cycle; fetch failures are not successful evaluations."
    }
  };
}
