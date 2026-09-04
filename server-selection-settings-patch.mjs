import { readFileSync } from "node:fs";

const embeddedSelectionSettings = readFileSync(
  new URL("./lib/paper-selection-settings.mjs", import.meta.url),
  "utf8",
).replace(/\nexport\s*\{[\s\S]*?\};\s*$/, "");

const SELECTION_SETTINGS_FUNCTIONS = String.raw`
${embeddedSelectionSettings}

function governedScannerSettings(input = {}) {
  const normalized = normalizeScannerSettings(input || {});
  return {
    ...normalized,
    ...normalizePaperSelectionValues(normalized),
    ...PAPER_SELECTION_LOCKS
  };
}

function selectionSettingsRevision(state = {}) {
  return sanitizeSelectionSettingsControl(state.selectionSettingsControl || {}).revision;
}

function stampPersistedSelectionSettings(scan, state = {}) {
  if (!scan || typeof scan !== "object") return scan;
  scan.settings = governedScannerSettings(state.scannerSettings || {});
  scan.settingsRevision = selectionSettingsRevision(state);
  scan.settingsSource = "persisted-paper-settings";
  scan.paper_only = true;
  scan.broker_write_enabled = false;
  scan.edge_confirmed = false;
  return scan;
}
`;

const SELECTION_SETTINGS_ROUTES = String.raw`
      if (url.pathname === "/api/settings/formulas" || url.pathname === "/api/settings/selection") {
        const store = await getStore();
        if (req.method === "GET") {
          const state = await store.getState();
          json(res, 200, paperSelectionSettingsView(state, { storage: store.mode, persistent: store.persistent }));
          return;
        }
        if (req.method !== "POST" && req.method !== "PATCH") {
          json(res, 405, { ok: false, error: "method_not_allowed", allowed: ["GET", "POST", "PATCH"] });
          return;
        }
        if (ENV.NODE_ENV === "production" && store.persistent !== true) {
          json(res, 503, { ok: false, error: "settings_persistence_unavailable", storage: store.mode, persistent: store.persistent });
          return;
        }
        const body = await readJsonBody(req);
        const expectedRevision = body.expected_revision ?? body.expectedRevision;
        const reason = body.reason;
        const mutation = await withStateMutation(async () => {
          const current = await store.getState();
          const now = new Date().toISOString();
          const id = crypto.randomUUID();
          const result = body.action === "reset"
            ? resetPaperSelectionSettings({ state: current, expectedRevision, reason, now, id })
            : applyPaperSelectionChanges({ state: current, changes: body.settings ?? body.changes, expectedRevision, reason, now, id });
          if (!result.ok) return { result, state: current };
          const saved = await store.saveState(result.nextState);
          return { result, state: saved };
        });
        if (!mutation.result.ok) {
          json(res, mutation.result.status || 400, mutation.result);
          return;
        }
        json(res, 200, {
          ...paperSelectionSettingsView(mutation.state, { storage: store.mode, persistent: store.persistent }),
          changed: mutation.result.changed,
          audit_entry: mutation.result.auditEntry
        });
        return;
      }
`;

export function applySelectionSettingsPatches(source, mustReplace) {
  let output = source;
  output = mustReplace(
    output,
    "\nasync function dataBankStatus() {",
    `\n${SELECTION_SETTINGS_FUNCTIONS}\nasync function dataBankStatus() {`,
    "insert governed paper selection settings",
  );
  output = mustReplace(
    output,
    "    scannerSettings: normalizeScannerSettings(state.scannerSettings || {}),\n    paperTrader: sanitizePaperTraderState(state.paperTrader || {})",
    "    scannerSettings: governedScannerSettings(state.scannerSettings || {}),\n    paperTrader: sanitizePaperTraderState(state.paperTrader || {}),\n    selectionSettingsControl: sanitizeSelectionSettingsControl(state.selectionSettingsControl || {})",
    "persist governed selection settings control",
  );
  output = mustReplace(
    output,
    "          const state = await withStateMutation(() => store.saveState(body.state || body));",
    `          const requested = body.state || body;
          if (ENV.NODE_ENV === "production") {
            json(res, 405, { ok: false, error: "state_mutation_disabled_in_production", message: "Use the governed domain endpoints; the production paper ledger is read-only through /api/state." });
            return;
          }
          const mutation = await withStateMutation(async () => {
            const current = await store.getState();
            const hasSettings = Object.prototype.hasOwnProperty.call(requested, "scannerSettings");
            const hasControl = Object.prototype.hasOwnProperty.call(requested, "selectionSettingsControl");
            const settingsChanged = hasSettings && JSON.stringify(governedScannerSettings(requested.scannerSettings || {})) !== JSON.stringify(governedScannerSettings(current.scannerSettings || {}));
            const controlChanged = hasControl && JSON.stringify(sanitizeSelectionSettingsControl(requested.selectionSettingsControl || {})) !== JSON.stringify(sanitizeSelectionSettingsControl(current.selectionSettingsControl || {}));
            if (settingsChanged || controlChanged) return { blocked: true, state: current };
            const state = await store.saveState({ ...requested, scannerSettings: current.scannerSettings, selectionSettingsControl: current.selectionSettingsControl });
            return { blocked: false, state };
          });
          if (mutation.blocked) {
            json(res, 409, { ok: false, error: "use_selection_settings_endpoint", endpoint: "/api/settings/formulas" });
            return;
          }
          const state = mutation.state;`,
    "protect selection settings from generic state writes",
  );
  output = mustReplace(
    output,
    '      if (url.pathname === "/api/scanner/run") {\n        const body = req.method === "POST" ? await readJsonBody(req) : {};',
    '      if (url.pathname === "/api/scanner/run") {\n        if (req.method !== "POST") { json(res, 405, { ok: false, error: "method_not_allowed", allowed: ["POST"] }); return; }\n        const body = await readJsonBody(req);',
    "manual scanner requires POST",
  );
  output = mustReplace(
    output,
    '        const store = await getStore();\n        const resolved = await resolveRequestUniverse(body);\n        const filteredUniverse = await filterSuspendedScannerRows(resolved.universe);',
    '        const store = await getStore();\n        const state = await store.getState();\n        const resolved = await resolveRequestUniverse(body);\n        const filteredUniverse = await filterSuspendedScannerRows(resolved.universe);',
    "manual scanner reads persisted settings",
  );
  output = mustReplace(
    output,
    '          ? runScanner(filteredUniverse, { ...(body.settings || {}), source: resolved.source, holdings: body.holdings, existingHoldings: body.existingHoldings })',
    '          ? runScanner(filteredUniverse, { ...state.scannerSettings, source: resolved.source, holdings: body.holdings, existingHoldings: body.existingHoldings })',
    "manual scanner ignores request settings override",
  );
  output = mustReplace(
    output,
    '              settings: normalizeScannerSettings(body.settings || {}),',
    '              settings: governedScannerSettings(state.scannerSettings || {}),',
    "empty manual scanner uses persisted settings",
  );
  output = mustReplace(
    output,
    '        const ledger = await appendScanLedger(scan, { store, mode: "scanner", source: resolved.source });',
    '        stampPersistedSelectionSettings(scan, state);\n        const ledger = await appendScanLedger(scan, { store, mode: "scanner", source: resolved.source });',
    "stamp manual scanner settings revision",
  );
  output = mustReplace(
    output,
    '        const store = await getStore();\n        const resolved = await resolveRequestUniverse(body);\n        const result = await runUpstoxScanner(body, resolved.universe);',
    '        const store = await getStore();\n        const state = await store.getState();\n        const resolved = await resolveRequestUniverse(body);\n        const result = await runUpstoxScanner({ ...body, settings: state.scannerSettings }, resolved.universe);\n        stampPersistedSelectionSettings(result, state);',
    "Upstox scanner uses persisted settings",
  );
  output = mustReplace(
    output,
    '          if (body.useUpstox !== false && ENV.UPSTOX_ACCESS_TOKEN) scan = await runUpstoxScanner(body, resolved.universe);\n          if (!scan || scan.ok === false) scan = runScanner(resolved.universe, { ...(body.settings || {}), source: resolved.source, holdings: body.holdings || state.paperTrader?.positions || [] });\n          const ledger = await appendScanLedger(scan, { store, mode: "paper-trader-scan", source: scan.source || resolved.source });',
    '          if (body.useUpstox !== false) scan = await runUpstoxScanner({ ...body, settings: state.scannerSettings }, resolved.universe);\n          if (!scan || scan.ok === false) scan = runScanner(resolved.universe, { ...state.scannerSettings, source: resolved.source, holdings: body.holdings || state.paperTrader?.positions || [] });\n          stampPersistedSelectionSettings(scan, state);\n          const ledger = await appendScanLedger(scan, { store, mode: "paper-trader-scan", source: scan.source || resolved.source });',
    "paper trader scanner uses persisted settings",
  );
  output = mustReplace(
    output,
    '          const plan = buildPaperTraderPlan(scan, state, body);',
    '          const plan = buildPaperTraderPlan(scan, state, { ...body, settings: state.scannerSettings });',
    "paper trader plan ignores request settings override",
  );
  output = mustReplace(
    output,
    '    settings: normalizeScannerSettings(record.settings || {}),\n    rows',
    '    settings: normalizeScannerSettings(record.settings || {}),\n    settingsRevision: Math.max(0, Math.floor(finiteOr(record.settingsRevision, 0))),\n    settingsSource: String(record.settingsSource || "unknown").slice(0, 80),\n    paper_only: record.paper_only !== false,\n    broker_write_enabled: false,\n    edge_confirmed: false,\n    rows',
    "retain selection settings provenance in scan records",
  );
  output = mustReplace(
    output,
    '    settings: scan.settings,\n    rows: scan.rows',
    '    settings: scan.settings,\n    settingsRevision: scan.settingsRevision,\n    settingsSource: scan.settingsSource,\n    paper_only: scan.paper_only,\n    broker_write_enabled: scan.broker_write_enabled,\n    edge_confirmed: scan.edge_confirmed,\n    rows: scan.rows',
    "copy selection settings provenance into scan ledger",
  );
  output = mustReplace(
    output,
    '  return record ? { id: record.id, createdAt: record.createdAt, mode: record.mode, source: record.source } : null;',
    '  return record ? { id: record.id, createdAt: record.createdAt, mode: record.mode, source: record.source, settingsRevision: record.settingsRevision, settingsSource: record.settingsSource } : null;',
    "expose selection settings revision in scan ledger metadata",
  );
  output = mustReplace(
    output,
    '      if (url.pathname === "/api/scanner/parameters") {',
    `${SELECTION_SETTINGS_ROUTES}\n      if (url.pathname === "/api/scanner/parameters") {`,
    "selection settings API routes",
  );
  return output;
}
