import { readFileSync } from "node:fs";

const rotationCode = readFileSync(new URL("./lib/universe-rotation.mjs", import.meta.url), "utf8")
  .replace(/^import crypto from "node:crypto";\n/m, "")
  .replaceAll("export function ", "function ")
  .replaceAll("export const ", "const ");

const FUNCTIONS = String.raw`
${rotationCode}
let universeBatchInFlight = false;
let committedUniverseScan = null;

function paperEngineHoldingsFingerprint(state = {}) {
  return crypto.createHash("sha256").update(JSON.stringify(state.paperTrader?.positions || [])).digest("hex");
}

function paperEngineUniverseFingerprint(state = {}) {
  return crypto.createHash("sha256").update(JSON.stringify(state.universe || [])).digest("hex");
}

// Only an internally committed rotation batch can be reused for execution.
// An ad-hoc /scanner/run result must never become an execution authority.
async function paperEngineSelectionScan(state) {
  const cached = committedUniverseScan;
  const scan = cached?.scan;
  const age = scan?.asOf ? Date.now() - Date.parse(scan.asOf) : Infinity;
  const horizon = normalizeRotationHorizon(scan?.rotation?.horizon);
  const progress = sanitizeUniverseRotation(state.scannerRotation)[horizon];
  const day = new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
  if (cached && !cached.consumed && scan.ok === true && age >= 0 && age <= 5 * 60 * 1000
      && cached.universeRevision === (state.universeRevision || 0)
      && cached.universeFingerprint === paperEngineUniverseFingerprint(state)
      && cached.settingsRevision === selectionSettingsRevision(state)
      && cached.holdingsFingerprint === paperEngineHoldingsFingerprint(state)
      && scan.rotation?.day === day && progress?.key === scan.rotation.key
      && progress.cycle === scan.rotation.cycle && progress.offset === scan.rotation.attempted) {
    return { scan, cacheUsed: true };
  }
  // The caller owns the state mutation lock. The internal context is never
  // accepted from an HTTP request, preventing a nested-lock deadlock.
  return { scan: await runNextUniverseBatch({ horizon: "intraday" }, { stateMutationHeld: true }), cacheUsed: false };
}

function consumePaperEngineScan(scan) {
  if (committedUniverseScan?.scan === scan) committedUniverseScan.consumed = true;
}

function universeMetadataFields(input = {}) {
  return {
    universe: normalizeScannerUniverse(input.universe).slice(0, MAX_UNIVERSE_ROWS),
    scannerRotation: sanitizeUniverseRotation(input.scannerRotation),
    universeRevision: rotationInt(input.universeRevision, 1000000000)
  };
}

async function runNextUniverseBatch(body = {}, internal = {}) {
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
    const commitBatch = async () => {
      const current = await store.getState();
      if ((current.universeRevision || 0) !== revision || (current.selectionSettingsControl?.revision || 0) !== settingsRevision || JSON.stringify(current.universe) !== JSON.stringify(state.universe)) return null;
      const ledger = await appendScanLedger(result, { store, mode: "universe-rotation", source: result.source || "Upstox historical candles" });
      result.ledger = scanLedgerMeta(ledger);
      const saved = await store.saveUniverseMetadata({ ...current, scannerRotation: { ...sanitizeUniverseRotation(current.scannerRotation), [plan.horizon]: completed.progress } });
      latestParameterTunnelScan = result;
      committedUniverseScan = { scan: result, universeRevision: revision, settingsRevision,
        universeFingerprint: paperEngineUniverseFingerprint(state),
        holdingsFingerprint: paperEngineHoldingsFingerprint(state), consumed: false };
      return saved;
    };
    const saved = internal.stateMutationHeld === true ? await commitBatch() : await withStateMutation(commitBatch);
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
