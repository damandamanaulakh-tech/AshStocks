import { readFileSync } from "node:fs";

const rotationCode = readFileSync(new URL("./lib/universe-rotation.mjs", import.meta.url), "utf8")
  .replace(/^import crypto from "node:crypto";\n/m, "")
  .replaceAll("export function ", "function ")
  .replaceAll("export const ", "const ");

const FUNCTIONS = String.raw`
${rotationCode}
let universeBatchInFlight = false;

function universeMetadataFields(input = {}) {
  return {
    universe: normalizeScannerUniverse(input.universe).slice(0, MAX_UNIVERSE_ROWS),
    scannerRotation: sanitizeUniverseRotation(input.scannerRotation),
    universeRevision: rotationInt(input.universeRevision, 1000000000)
  };
}

async function runNextUniverseBatch(body = {}) {
  if (universeBatchInFlight) return { ok: false, error: "universe_batch_busy", message: "Another universe batch is running; wait for it to finish." };
  universeBatchInFlight = true;
  try {
    const store = await getStore();
    const state = await store.getState();
    const revision = state.universeRevision || 0;
    const settingsRevision = state.selectionSettingsControl?.revision || 0;
    const eligible = await filterSuspendedScannerRows(prioritizedStockRows(state.universe || [], MAX_UNIVERSE_ROWS));
    const plan = planUniverseBatch({
      universe: eligible, rotation: state.scannerRotation, horizon: body.horizon,
      revision: revision + ":" + settingsRevision, limit: Math.min(200, Math.max(1, Math.floor(finiteOr(ENV.UPSTOX_SCAN_LIMIT, 200))))
    });
    if (!plan.rows.length) return { ok: false, error: "empty_nse_universe", message: "Load the NSE Master before scanning." };
    // Explicit universe/settings overrides are not accepted by the rotation endpoint.
    const result = await runUpstoxScanner({ horizon: plan.horizon, universe: plan.rows, settings: state.scannerSettings, holdings: state.paperTrader?.positions || [], cacheScan: false }, plan.rows);
    if (!result.ok) return result;
    let completed;
    try { completed = completeUniverseBatch(plan, result); }
    catch (error) { return { ok: false, error: error.message, message: "Batch progress was not advanced; retry after resolving the data-feed failure.", failures: result.failures || [] }; }
    stampPersistedSelectionSettings(result, state);
    result.rotation = completed.view;
    const saved = await withStateMutation(async () => {
      const current = await store.getState();
      if ((current.universeRevision || 0) !== revision || (current.selectionSettingsControl?.revision || 0) !== settingsRevision || JSON.stringify(current.universe) !== JSON.stringify(state.universe)) return null;
      const ledger = await appendScanLedger(result, { store, mode: "universe-rotation", source: result.source || "Upstox historical candles" });
      result.ledger = scanLedgerMeta(ledger);
      const saved = await store.saveUniverseMetadata({ ...current, scannerRotation: { ...sanitizeUniverseRotation(current.scannerRotation), [plan.horizon]: completed.progress } });
      latestParameterTunnelScan = result;
      return saved;
    });
    if (!saved) return { ok: false, error: "universe_or_settings_changed_during_scan", message: "The master or settings changed during this batch. Start a scan of the refreshed universe." };
    return result;
  } finally {
    universeBatchInFlight = false;
  }
}
`;

const ROUTES = String.raw`
      if (url.pathname === "/api/scanner/next-batch") {
        if (req.method !== "POST") { json(res, 405, { ok: false, error: "method_not_allowed", allowed: ["POST"] }); return; }
        const result = await runNextUniverseBatch(await readJsonBody(req));
        json(res, result.ok ? 200 : 409, result);
        return;
      }
`;

export function applyUniverseRotationPatches(source, mustReplace) {
  let output = mustReplace(source, "\nasync function dataBankStatus() {", `\n${FUNCTIONS}\nasync function dataBankStatus() {`, "insert resumable full-universe rotation");
  output = mustReplace(output,
    "  latestParameterTunnelScan = result;\n  return result;",
    "  if (options.cacheScan !== false) latestParameterTunnelScan = result;\n  return result;",
    "defer caching rotation batches until their progress is committed");
  output = mustReplace(output,
    'const scan = runScanner(fetchedRows, { ...(body.settings || {}), source: "Upstox historical candles", holdings: body.holdings || body.existingHoldings || [] });',
    'const scan = runScanner(fetchedRows, { ...(body.settings || {}), source: "Upstox historical candles", holdings: body.holdings || body.existingHoldings || [], cacheScan: body.cacheScan !== false });',
    "forward the internal deferred-cache option without changing scoring");
  output = mustReplace(output,
    "    selectionSettingsControl: sanitizeSelectionSettingsControl(state.selectionSettingsControl || {})",
    "    selectionSettingsControl: sanitizeSelectionSettingsControl(state.selectionSettingsControl || {}),\n    scannerRotation: sanitizeUniverseRotation(state.scannerRotation || {}),\n    universeRevision: rotationInt(state.universeRevision, 1000000000)",
    "persist rotation progress separately from formulas and holdings");
  // Restrict metadata writes to these three fields. In particular, do not run a
  // loaded ledger through the non-idempotent financial sanitizers or replace it.
  output = mustReplace(output,
    "    async appendScanRecord(record) {\n      const saved = sanitizeScanRecord(record);",
    "    async saveUniverseMetadata(nextState) {\n      state = { ...state, ...universeMetadataFields(nextState) };\n      return state;\n    },\n    async appendScanRecord(record) {\n      const saved = sanitizeScanRecord(record);",
    "memory metadata writes preserve ledger and settings");
  output = mustReplace(output,
    "    async appendScanRecord(record) {\n      return appendLedger(record);",
    "    async saveUniverseMetadata(nextState) {\n      const payload = JSON.parse(await fsp.readFile(STATE_FILE, \"utf8\"));\n      const next = { ...(payload.state || payload), ...universeMetadataFields(nextState) };\n      await writeState(next);\n      state = next;\n      return state;\n    },\n    async appendScanRecord(record) {\n      return appendLedger(record);",
    "file metadata writes preserve raw persisted ledger and settings");
  output = mustReplace(output,
    "        async appendScanRecord(record) {\n          const saved = sanitizeScanRecord(record);",
    "        async saveUniverseMetadata(nextState) {\n          const metadata = universeMetadataFields(nextState);\n          const fields = Object.fromEntries(Object.entries(metadata).map(([key, value]) => [\"state.\" + key, value]));\n          const updated = await collection.updateOne({ _id: \"default\" }, { $set: { ...fields, updatedAt: new Date() } });\n          if (updated.matchedCount !== 1) throw new Error(\"universe_metadata_state_missing\");\n          return { ...nextState, ...metadata };\n        },\n        async appendScanRecord(record) {\n          const saved = sanitizeScanRecord(record);",
    "Mongo metadata writes never overwrite persisted ledger or settings");
  output = mustReplace(output,
    "    return store.saveState({ ...previous, universe });",
    "    const saved = await store.saveUniverseMetadata({ ...previous, universe, scannerRotation: {}, universeRevision: (previous.universeRevision || 0) + 1 });\n    latestParameterTunnelScan = null;\n    return saved;",
    "restart coverage after an explicit master replacement");
  output = mustReplace(output,
    '      if (url.pathname === "/api/scanner/parameters") {',
    `${ROUTES}\n      if (url.pathname === "/api/scanner/parameters") {`,
    "next-batch endpoint");
  return output;
}
