const PAPER_SELECTION_SCHEMA_VERSION = "1.0";

const PAPER_SELECTION_DEFINITIONS = Object.freeze([
  {
    id: "minScoreSelect",
    label: "SELECT score floor",
    group: "Decision thresholds",
    group_description: "Phase 1 ACTIVE: thresholds already consumed by the paper scanner.",
    description: "Minimum governed scanner score for SELECT.",
    formula: "SELECT when score >= floor",
    type: "number",
    min: 0,
    max: 100,
    step: 0.01,
    default: 70,
    unit: "score points",
    phase: "1 ACTIVE",
    editable: true
  },
  {
    id: "minScoreWatch",
    label: "WATCH score floor",
    group: "Decision thresholds",
    description: "Minimum score for WATCH; cannot exceed the SELECT floor.",
    formula: "WATCH when score >= floor and below SELECT",
    type: "number",
    min: 0,
    max: 100,
    step: 0.01,
    default: 55,
    unit: "score points",
    phase: "1 ACTIVE",
    editable: true
  },
  {
    id: "minReturn6mPct",
    label: "Minimum 6M return",
    group: "Momentum gates",
    group_description: "Phase 1 ACTIVE: absolute momentum and volatility gates.",
    description: "Required six-month return before selection.",
    formula: "return_6m >= threshold",
    type: "number",
    min: -100,
    max: 500,
    step: 0.01,
    default: 8,
    unit: "%",
    phase: "1 ACTIVE",
    editable: true
  },
  {
    id: "minReturn12mPct",
    label: "Minimum 12M return",
    group: "Momentum gates",
    description: "Required twelve-month return before selection.",
    formula: "return_12m >= threshold",
    type: "number",
    min: -100,
    max: 1000,
    step: 0.01,
    default: 12,
    unit: "%",
    phase: "1 ACTIVE",
    editable: true
  },
  {
    id: "maxVol252Pct",
    label: "Maximum 252D volatility",
    group: "Momentum gates",
    description: "Annualized volatility ceiling.",
    formula: "volatility_252d <= threshold",
    type: "number",
    min: 0,
    max: 500,
    step: 0.01,
    default: 55,
    unit: "%",
    phase: "1 ACTIVE",
    editable: true
  },
  {
    id: "adv20Min",
    label: "Minimum ADV20",
    group: "Liquidity and freshness",
    group_description: "Phase 1 ACTIVE: execution-quality filters used by every persisted scan path.",
    description: "Minimum twenty-session average volume in shares.",
    formula: "ADV20 >= threshold",
    type: "number",
    integer: true,
    min: 0,
    max: 1000000000,
    step: 1000,
    default: 200000,
    unit: "shares",
    phase: "1 ACTIVE",
    editable: true
  },
  {
    id: "turnoverCrMin",
    label: "Minimum turnover",
    group: "Liquidity and freshness",
    description: "Minimum average rupee turnover.",
    formula: "turnover >= threshold",
    type: "number",
    min: 0,
    max: 1000000,
    step: 0.01,
    default: 5,
    unit: "₹ crore",
    phase: "1 ACTIVE",
    editable: true
  },
  {
    id: "maxStaleDays",
    label: "Maximum stale days",
    group: "Liquidity and freshness",
    description: "Maximum age of the latest daily candle.",
    formula: "candle_age_days <= threshold",
    type: "number",
    integer: true,
    min: 0,
    max: 30,
    step: 1,
    default: 7,
    unit: "days",
    phase: "1 ACTIVE",
    editable: true
  },
  {
    id: "targetPotentialPct",
    label: "Target room",
    group: "Portfolio gates",
    group_description: "Phase 1 ACTIVE: diversification and target-room operands; capital limits remain locked.",
    description: "Required room to the 252-session high.",
    formula: "potential_to_252d_high >= threshold",
    type: "number",
    min: 0,
    max: 100,
    step: 0.01,
    default: 15,
    unit: "%",
    phase: "1 ACTIVE",
    editable: true
  },
  {
    id: "targetPotentialHardGate",
    label: "Enforce target-room gate",
    group: "Portfolio gates",
    description: "When enabled, insufficient target room blocks selection.",
    formula: "hard gate on target-room result",
    type: "boolean",
    default: false,
    unit: "on/off",
    phase: "1 ACTIVE",
    editable: true
  },
  {
    id: "correlationThreshold",
    label: "Maximum correlation",
    group: "Portfolio gates",
    description: "Maximum accepted correlation to an existing holding.",
    formula: "correlation <= threshold",
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.85,
    unit: "coefficient",
    phase: "1 ACTIVE",
    editable: true
  }
]);

const PAPER_SELECTION_BY_ID = new Map(PAPER_SELECTION_DEFINITIONS.map((definition) => [definition.id, definition]));
const PAPER_SELECTION_LOCKS = Object.freeze({
  paperOnly: true,
  brokerWriteEnabled: false,
  startingCapital: 50000000,
  maxPositions: 500,
  maxPositionPct: 0.002
});

function isPlainRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function paperSelectionDefaults() {
  return Object.fromEntries(PAPER_SELECTION_DEFINITIONS.map((definition) => [definition.id, definition.default]));
}

function validatePaperSelectionChanges({ current = {}, changes = {} } = {}) {
  const errors = [];
  if (!isPlainRecord(changes)) return { valid: false, candidate: null, errors: [{ field: "settings", code: "object_required", message: "settings must be a plain JSON object" }], changedFields: [] };
  const keys = Object.keys(changes);
  if (keys.length > PAPER_SELECTION_DEFINITIONS.length) errors.push({ field: "settings", code: "too_many_fields", message: "too many setting fields" });
  const candidate = { ...paperSelectionDefaults(), ...normalizePaperSelectionValues(current) };
  for (const key of keys) {
    const definition = PAPER_SELECTION_BY_ID.get(key);
    if (!definition) {
      const protectedField = /paper|broker|live|token|secret|credential|capital|kelly|position/i.test(key);
      errors.push({ field: key, code: protectedField ? "locked_field" : "unknown_field", message: protectedField ? `${key} is protected and cannot be edited here` : `${key} is not an editable selection operand` });
      continue;
    }
    const value = changes[key];
    if (definition.type === "boolean") {
      if (typeof value !== "boolean") errors.push({ field: key, code: "boolean_required", message: `${key} must be a JSON boolean` });
      else candidate[key] = value;
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors.push({ field: key, code: "number_required", message: `${key} must be a finite JSON number` });
      continue;
    }
    if (definition.integer && !Number.isInteger(value)) errors.push({ field: key, code: "integer_required", message: `${key} must be an integer` });
    if (value < definition.min || value > definition.max) errors.push({ field: key, code: "out_of_range", message: `${key} must be between ${definition.min} and ${definition.max}`, min: definition.min, max: definition.max });
    if (!errors.some((error) => error.field === key)) candidate[key] = value;
  }
  if ((candidate.minScoreWatch ?? 0) > (candidate.minScoreSelect ?? 0)) {
    errors.push({ field: "minScoreWatch", code: "watch_above_select", message: "WATCH score floor cannot exceed SELECT score floor" });
  }
  const changedFields = PAPER_SELECTION_DEFINITIONS.map((definition) => definition.id).filter((key) => candidate[key] !== normalizePaperSelectionValues(current)[key]);
  return { valid: errors.length === 0, candidate: errors.length ? null : candidate, errors, changedFields };
}

function normalizePaperSelectionValues(input = {}) {
  const defaults = paperSelectionDefaults();
  const output = { ...defaults };
  for (const definition of PAPER_SELECTION_DEFINITIONS) {
    const value = input?.[definition.id];
    if (definition.type === "boolean") {
      if (typeof value === "boolean") output[definition.id] = value;
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    if (definition.integer && !Number.isInteger(value)) continue;
    if (value < definition.min || value > definition.max) continue;
    output[definition.id] = value;
  }
  if (output.minScoreWatch > output.minScoreSelect) output.minScoreWatch = Math.min(defaults.minScoreWatch, output.minScoreSelect);
  return output;
}

function sanitizeSelectionAuditEntry(entry = {}) {
  const changes = {};
  for (const [key, value] of Object.entries(isPlainRecord(entry.changes) ? entry.changes : {})) {
    if (!PAPER_SELECTION_BY_ID.has(key) || !isPlainRecord(value)) continue;
    changes[key] = { before: value.before, after: value.after };
  }
  return {
    id: String(entry.id || "").slice(0, 80),
    action: entry.action === "RESET" ? "RESET" : "UPDATE",
    revision_before: Math.max(0, Math.floor(Number(entry.revision_before) || 0)),
    revision_after: Math.max(0, Math.floor(Number(entry.revision_after) || 0)),
    changed_at: String(entry.changed_at || "").slice(0, 40),
    actor: "authenticated_session",
    reason: String(entry.reason || "").slice(0, 240),
    changes,
    paper_only: true
  };
}

function sanitizeSelectionSettingsControl(input = {}) {
  const revision = Math.max(0, Math.floor(Number(input.revision) || 0));
  return {
    schema_version: PAPER_SELECTION_SCHEMA_VERSION,
    revision,
    updated_at: input.updated_at ? String(input.updated_at).slice(0, 40) : null,
    audit: (Array.isArray(input.audit) ? input.audit : []).map(sanitizeSelectionAuditEntry)
  };
}

function applyPaperSelectionChanges({ state = {}, changes = {}, expectedRevision = 0, reason = "", now, id, action = "UPDATE" } = {}) {
  const control = sanitizeSelectionSettingsControl(state.selectionSettingsControl || {});
  const expected = Number(expectedRevision);
  if (!Number.isInteger(expected) || expected < 0) return { ok: false, status: 400, error: "invalid_expected_revision", currentRevision: control.revision };
  if (expected !== control.revision) return { ok: false, status: 409, error: "settings_revision_conflict", expectedRevision: expected, currentRevision: control.revision };
  const cleanReason = String(reason || "").trim();
  if (cleanReason.length < 3 || cleanReason.length > 240) return { ok: false, status: 400, error: "settings_reason_required", message: "reason must contain 3 to 240 characters" };
  const current = normalizePaperSelectionValues(state.scannerSettings || {});
  const validation = validatePaperSelectionChanges({ current, changes });
  if (!validation.valid) return { ok: false, status: 422, error: "settings_validation_failed", errors: validation.errors };
  const changedKeys = PAPER_SELECTION_DEFINITIONS.map((definition) => definition.id).filter((key) => current[key] !== validation.candidate[key]);
  const governedSettings = { ...(state.scannerSettings || {}), ...validation.candidate, ...PAPER_SELECTION_LOCKS };
  if (!changedKeys.length) return { ok: true, changed: false, nextState: { ...state, scannerSettings: governedSettings, selectionSettingsControl: control }, auditEntry: null };
  const revisionAfter = control.revision + 1;
  const auditEntry = sanitizeSelectionAuditEntry({
    id,
    action,
    revision_before: control.revision,
    revision_after: revisionAfter,
    changed_at: now,
    actor: "authenticated_session",
    reason: cleanReason,
    changes: Object.fromEntries(changedKeys.map((key) => [key, { before: current[key], after: validation.candidate[key] }])),
    paper_only: true
  });
  const nextControl = sanitizeSelectionSettingsControl({
    schema_version: PAPER_SELECTION_SCHEMA_VERSION,
    revision: revisionAfter,
    updated_at: now,
    audit: [auditEntry, ...control.audit]
  });
  return { ok: true, changed: true, nextState: { ...state, scannerSettings: governedSettings, selectionSettingsControl: nextControl }, auditEntry };
}

function resetPaperSelectionSettings({ state = {}, expectedRevision = 0, reason = "", now, id } = {}) {
  return applyPaperSelectionChanges({ state, changes: paperSelectionDefaults(), expectedRevision, reason, now, id, action: "RESET" });
}

function paperSelectionSettingsView(state = {}, meta = {}) {
  const control = sanitizeSelectionSettingsControl(state.selectionSettingsControl || {});
  return {
    ok: true,
    mode: "PAPER_ONLY",
    schema_version: PAPER_SELECTION_SCHEMA_VERSION,
    revision: control.revision,
    settings: normalizePaperSelectionValues(state.scannerSettings || {}),
    defaults: paperSelectionDefaults(),
    definitions: PAPER_SELECTION_DEFINITIONS,
    locked: [
      { id: "paperOnly", value: true, reason: "Live broker execution is outside this paper system." },
      { id: "brokerWriteEnabled", value: false, reason: "Broker writes remain hard disabled." },
      { id: "startingCapital", value: 50000000, reason: "Approved ₹5 crore paper capital baseline." },
      { id: "maxPositions", value: 500, reason: "Approved paper portfolio capacity; sector, Kelly, liquidity and cash gates still apply." },
      { id: "maxPositionPct", value: 0.002, reason: "Canonical automatic base allocation: 0.2% = ₹1 lakh at ₹5 crore; Kelly and the 10% hard cap remain ceilings." },
      { id: "kellySizing", value: "LOCKED", reason: "Kelly and position-risk controls require separate evidence validation." }
    ],
    phases: [
      { phase: 1, status: "ACTIVE", scope: "Persisted scanner thresholds and gates" },
      { phase: 2, status: "SHADOW", scope: "Volume confirmation, persistence and relative-strength challengers" },
      { phase: 3, status: "BLOCKED", scope: "Promotion to live authority until edge is confirmed" }
    ],
    audit: control.audit,
    updated_at: control.updated_at,
    storage: meta.storage || null,
    persistent: meta.persistent === true,
    paper_only: true,
    broker_write_enabled: false,
    edge_confirmed: false
  };
}

export {
  PAPER_SELECTION_SCHEMA_VERSION,
  PAPER_SELECTION_DEFINITIONS,
  PAPER_SELECTION_LOCKS,
  paperSelectionDefaults,
  validatePaperSelectionChanges,
  normalizePaperSelectionValues,
  sanitizeSelectionSettingsControl,
  applyPaperSelectionChanges,
  resetPaperSelectionSettings,
  paperSelectionSettingsView
};
