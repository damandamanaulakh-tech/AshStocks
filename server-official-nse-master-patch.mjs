import { readFileSync } from "node:fs";

const officialMasterCode = readFileSync(new URL("./lib/official-nse-master.mjs", import.meta.url), "utf8")
  .replace(/^import (?:crypto|zlib) from "node:(?:crypto|zlib)";\n/gm, "")
  .replaceAll("export async function ", "async function ")
  .replaceAll("export function ", "function ")
  .replaceAll("export const ", "const ");

const LOADER = String.raw`
let officialMasterImportInFlight = false;
async function loadUpstoxNseDataBank(options = {}) {
  if (officialMasterImportInFlight) throw officialMasterError("official_nse_import_busy");
  officialMasterImportInFlight = true;
  try {
    // Only the source selection is accepted from the request. Fetch limits and
    // test injection are internal to the library, never user-controlled.
    const snapshot = await fetchOfficialNseMaster({ url: options.url });
    if (snapshot.universe.length > MAX_UNIVERSE_ROWS) throw officialMasterError("official_nse_storage_capacity_exceeded");
    const store = await getStore();
    const state = await withStateMutation(async () => {
      const previous = await store.getState();
      const metadata = officialNseImportMetadata(snapshot, previous.universe, previous.universeImport);
      const saved = await store.saveUniverseMetadata({ ...previous, universe: snapshot.universe,
        universeImport: metadata, scannerRotation: {}, universeRevision: (previous.universeRevision || 0) + 1 });
      latestParameterTunnelScan = null;
      suspendedInstrumentCache = { at: Date.now(), promise: null, payload: officialSuspendedPayload(snapshot.suspended, snapshot.suspendedRows) };
      return saved;
    });
    return { ok: true, source: "NSE EQ-series companies + Upstox instrument master", url: OFFICIAL_NSE_MASTER_URL,
      equity_source_url: OFFICIAL_NSE_EQUITY_URL,
      total_records_read: snapshot.master.records.length, saved_universe: state.universe.length,
      rows_with_instrument_key: state.universe.filter((row) => row.instrument_key).length,
      sample: state.universe.slice(0, 5), import: sanitizeOfficialNseImport(state.universeImport), data_bank: dataBankSummary(state) };
  } finally { officialMasterImportInFlight = false; }
}

function officialSuspendedPayload(source, rows) {
  const symbols = rows.map((row) => row.symbol).sort();
  return { ok: true, source: OFFICIAL_NSE_SUSPENDED_URL, fetched_at: source.fetched_at,
    source_last_modified: source.source_last_modified, source_sha256: source.source_sha256,
    total_rows: source.records.length, nse_eq_eq_rows: rows.length, unique_symbols: symbols.length,
    sample_symbols: symbols.slice(0, 24), symbols };
}
`;

const SUSPENDED_LOADER = String.raw`
async function loadSuspendedInstrumentPayload(force = false) {
  const now = Date.now();
  if (!force && suspendedInstrumentCache.payload?.ok === true && now - suspendedInstrumentCache.at < 30 * 60 * 1000) return suspendedInstrumentCache.payload;
  if (!force && suspendedInstrumentCache.promise) return suspendedInstrumentCache.promise;
  const pending = (async () => {
    try {
      const source = await fetchOfficialInstrumentSource(OFFICIAL_NSE_SUSPENDED_URL);
      const result = officialSuspendedPayload(source, validateOfficialSuspendedRows(source.records));
      suspendedInstrumentCache = { at: Date.now(), payload: result, promise: null };
      return result;
    } catch (error) {
      const result = { ok: false, source: OFFICIAL_NSE_SUSPENDED_URL, fetched_at: new Date().toISOString(),
        error: error.message, total_rows: 0, nse_eq_eq_rows: 0, unique_symbols: 0, sample_symbols: [], symbols: [] };
      suspendedInstrumentCache = { at: Date.now(), payload: result, promise: null };
      return result;
    }
  })();
  suspendedInstrumentCache.promise = pending;
  return pending;
}
`;

function replaceOfficialFunction(source, start, end, replacement, mustReplace, label) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (from < 0 || to < 0 || source.indexOf(start, from + start.length) !== -1) throw new Error("Patch anchor missing or ambiguous: " + label);
  return mustReplace(source, source.slice(from, to), replacement + "\n\n", label);
}

export function applyOfficialNseMasterPatches(source, mustReplace) {
  let output = mustReplace(source, "\nasync function dataBankStatus() {", `\n${officialMasterCode}\nasync function dataBankStatus() {`, "insert strict official NSE import helpers");
  output = mustReplace(output, '    security_type: String(row.security_type || row.securityType || "").trim(),',
    '    security_type: String(row.security_type || row.securityType || "").trim(),\n    ...(["EQ", "BE", "BZ"].includes(row.nse_series) ? { nse_series: row.nse_series } : {}),', "preserve verified NSE series through scanner storage");
  output = mustReplace(output, 'name: String(row.name || row.company || row.company_name || row.short_name || row.shortName || row.symbol || "").trim().slice(0, 120),',
    'name: String(row.name || row.company || row.company_name || row.short_name || row.shortName || row.symbol || "").trim().slice(0, row.nse_series ? 200 : 120),', "preserve full NSE company names without changing legacy name limits");
  output = replaceOfficialFunction(output, "async function loadUpstoxNseDataBank(options = {}) {", "function isoDate(date) {", LOADER, mustReplace, "fresh validated official NSE master import");
  output = replaceOfficialFunction(output, "async function loadSuspendedInstrumentPayload(force = false) {", "async function suspendedNseEqSymbolSet() {", SUSPENDED_LOADER, mustReplace, "bounded official suspension retrieval");
  output = replaceOfficialFunction(output, "async function filterSuspendedScannerRows(rows = []) {", "async function dataIntelligencePayload(force = false) {", String.raw`
async function filterSuspendedScannerRows(rows = []) {
  const payload = await loadSuspendedInstrumentPayload(false);
  if (payload.ok !== true) throw officialMasterError("suspended_status_unavailable");
  const suspended = new Set(payload.symbols);
  return rows.filter((row) => !suspended.has(normalizeSymbol(row.symbol || row.trading_symbol)));
}`, mustReplace, "fail closed when suspension status is unknown");
  output = mustReplace(output, "    universeRevision: rotationInt(input.universeRevision, 1000000000)",
    "    universeRevision: rotationInt(input.universeRevision, 1000000000),\n    universeImport: sanitizeOfficialNseImport(input.universeImport)", "persist master provenance via metadata-only stores");
  output = mustReplace(output, "    universeRevision: rotationInt(state.universeRevision, 1000000000)",
    "    universeRevision: rotationInt(state.universeRevision, 1000000000),\n    universeImport: sanitizeOfficialNseImport(state.universeImport)", "restore persisted master provenance");
  output = mustReplace(output, '      if (url.pathname === "/api/data-bank/status") {', String.raw`
      if (url.pathname === "/api/data-bank/market-import-status") {
        if (req.method !== "GET") { json(res, 405, { ok: false, error: "method_not_allowed", allowed: ["GET"] }); return; }
        const store = await getStore();
        const state = await store.getState();
        json(res, 200, { ok: true, import: sanitizeOfficialNseImport(state.universeImport), universe_count: state.universe.length,
          import_in_flight: officialMasterImportInFlight, requested_count: 2400, source_url: OFFICIAL_NSE_MASTER_URL,
          equity_source_url: OFFICIAL_NSE_EQUITY_URL, import_version: OFFICIAL_NSE_IMPORT_VERSION });
        return;
      }
      if (url.pathname === "/api/data-bank/status") {`, "read-only current market import provenance");
  return output;
}
