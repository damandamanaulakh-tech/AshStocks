import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { applyParameterTunnelPatches } from "../server-parameter-tunnel-patch.mjs";
import { applyUpstoxInstitutionalPatches } from "../server-upstox-institutional-patch.mjs";

// Offline unit/integration contract: execute the composed production helpers,
// including the interpolated catalog, but never evaluate the server entry point.
// No source archive, provider, Mongo, token, filesystem write or order is used.
function captureHelpers(applyPatch, targetLabel, changes = new Map()) {
  let captured;
  applyPatch("", (source, search, replacement, label) => {
    changes.set(label, { search, replacement });
    if (label === targetLabel) {
      assert.equal(captured, undefined, "Helper insertion must be unique");
      assert(replacement.endsWith(search), "Helper insertion anchor changed: " + label);
      captured = replacement.slice(0, -search.length);
    }
    return source;
  });
  assert(captured, "Missing composed helper insertion: " + targetLabel);
  return captured;
}

const base = fs.readFileSync(new URL("../vendor/base-server-37a9e9ceacabd33bc5a2085ad621e368f8fc0cd8.mjs", import.meta.url), "utf8");
function baseFunction(name) {
  const start = base.indexOf("\nfunction " + name + "(");
  assert(start >= 0, "Missing production base helper: " + name);
  const remainder = base.slice(start + 1);
  const next = remainder.search(/\n(?:async )?function /);
  assert(next > 0, "Missing next production function boundary: " + name);
  return remainder.slice(0, next);
}
const parameterChanges = new Map();
const parameterHelpers = captureHelpers(applyParameterTunnelPatches, "insert 175-node parameter tunnel", parameterChanges);
const institutionalHelpers = captureHelpers(applyUpstoxInstitutionalPatches, "Upstox institutional functions");
const normalizationPatch = parameterChanges.get("preserve raw formula evidence through candle normalization");
assert(normalizationPatch, "The scanner normalizer must preserve raw formula input lineage");
const originalNormalizer = baseFunction("normalizeCandles");
assert(originalNormalizer.includes(normalizationPatch.search), "Production normalization patch anchor changed");
const patchedNormalizer = originalNormalizer.replace(normalizationPatch.search, normalizationPatch.replacement);
let forbiddenCalls = 0;
const forbidden = () => { forbiddenCalls += 1; throw new Error("Offline guard forbids network/provider/store access"); };
const sandbox = vm.createContext({
  fetch: forbidden, currentUpstoxAccessToken: forbidden, getStore: forbidden,
  normalizeSymbol: (value) => String(value || "").trim().toUpperCase()
});
vm.runInContext(
  ["numericValue", "clamp", "round"].map(baseFunction).join("\n") + "\n" + patchedNormalizer +
  parameterHelpers + institutionalHelpers + `
  globalThis.subject = {
    catalog: PARAMETER_TUNNEL_CATALOG,
    data: parameterTunnelData,
    context: buildParameterTunnelContext,
    normalize: normalizeCandles,
    slice: tunnelFormulaSlice,
    node: evaluateParameterTunnelNode,
    evaluate: evaluateParameterTunnel,
    attach: attachParameterTunnel,
    overlay: attachUpstoxInstitutionalEvidence
  };`, sandbox, { timeout: 5000 }
);
const run = sandbox.subject;
const parameter = (suffix) => {
  const found = run.catalog.parameters.find((item) => item.id === "T12W_" + suffix);
  assert(found, "Catalog ID missing: " + suffix);
  return found;
};
const plain = (value) => JSON.parse(JSON.stringify(value));
const round = (value, places = 3) => Math.round(value * 10 ** places) / 10 ** places;
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const candles = (count, make = () => ({})) => Array.from({ length: count }, (_, index) => ({
  date: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10),
  open: 100, high: 101, low: 99, close: 100, volume: 100, ...make(index)
}));
const evaluate = (suffix, input, extra = {}) => {
  const row = { symbol: "OFFLINE_FIXTURE", sector: "Fixture", candles: input, ...extra };
  return run.node(parameter(suffix), row, run.data(row), run.context([row], []));
};
const state = (suffix, input, expected, message) => {
  const result = evaluate(suffix, input);
  assert.equal(result.state, expected, message || suffix);
  if (expected === "SOURCE_REQUIRED") assert.equal(result.value, null, "Unavailable evidence must not publish a numerical value");
  return result;
};
const extension = () => candles(20, (index) => index === 19 ? { open: 120, high: 128, low: 118, close: 120 } : {});
const expanding = (count = 17) => candles(count, (index) => {
  const tail = index - (count - 3);
  if (tail < 0) return {};
  const close = 100 - tail, halfRange = tail + 1;
  return { open: close, high: close + halfRange, low: close - halfRange, close };
});
const compressed = (count = 266) => candles(count, (index) => {
  const halfRange = 20 - index * 0.06;
  return { high: 100 + halfRange, low: 100 - halfRange };
});
const upVolume = (upAmount = 62, otherAmount = 38) => candles(8, (index) => ({
  close: index === 0 ? 100 : 101, open: index === 0 ? 100 : 101, high: 102,
  volume: index === 0 ? 9999 : index === 1 ? upAmount : index === 2 ? otherAmount : 0
}));

// Independent arithmetic reference: no seeded first true range is accepted as
// a fully anchored observation. This is not a replacement production indicator.
function anchoredAtr(input) {
  const ranges = input.slice(1).map((item, offset) => Math.max(
    item.high - item.low, Math.abs(item.high - input[offset].close), Math.abs(item.low - input[offset].close)
  ));
  return ranges.slice(13).map((_, offset) => mean(ranges.slice(offset, offset + 14)));
}

let groups = 0;
function test(name, work) {
  try { work(); groups += 1; }
  catch (error) { throw new Error(name + ": " + error.message, { cause: error }); }
}

test("catalog preserves 175 nodes and exactly the pre-existing 64 trigger IDs", () => {
  assert.equal(run.catalog.total, 175);
  assert.equal(run.catalog.parameters.length, 175);
  assert.equal(new Set(run.catalog.parameters.map((item) => item.id)).size, 175);
  const preservedTriggerNumbers = [
    ...Array.from({ length: 32 }, (_, index) => index + 1), 51, 52, 53, 54, 55, 56, 63, 64, 65, 66,
    ...Array.from({ length: 20 }, (_, index) => index + 69), 100, 101
  ];
  assert.deepEqual(Array.from(run.catalog.parameters.filter((item) => item.id.startsWith("T12W_")).map((item) => item.id)),
    preservedTriggerNumbers.map((number) => "T12W_" + String(number).padStart(4, "0")));
  for (const [id, minimum] of [["0004", 266], ["0018", 8], ["0080", 20], ["0084", 17]]) {
    assert.equal(parameter(id).implementation_status, "EXECUTABLE");
    assert.equal(parameter(id).minimum_candles, minimum);
  }
  assert.equal(parameter("0018").formula, "sum(volume where close>prior_close last7) / total_volume_7d >= 0.62");
});

test("five unresolved contracts and seven no-branch rows never activate", () => {
  const held = ["0009", "0012", "0073", "0078", "0079", "0081", "0082", "0083", "0085", "0086", "0087", "0088"];
  for (const id of held) {
    const item = parameter(id);
    assert.equal(item.implementation_status, "SOURCE_REQUIRED");
    assert.equal(item.status, "DEFINED");
    assert(["FORMULA_CONTRACT_REQUIRED", "IMPLEMENTATION_REQUIRED"].includes(item.readiness));
    assert(item.formula && item.source && item.implementation_note);
    for (const input of [[], compressed(), extension(), expanding(30), upVolume()]) state(id, input, "SOURCE_REQUIRED");
  }
});

test("empty null and incomplete windows stay unavailable", () => {
  for (const [id, minimum] of [["0004", 266], ["0018", 8], ["0080", 20], ["0084", 17]]) {
    for (const input of [undefined, null, [], candles(1), candles(minimum - 1)]) state(id, input, "SOURCE_REQUIRED");
  }
  assert.equal(anchoredAtr(compressed(265)).length, 251);
  assert.equal(anchoredAtr(compressed(266)).length, 252);
  assert.equal(anchoredAtr(expanding(16)).length, 2);
  assert.equal(anchoredAtr(expanding(17)).length, 3);
});

test("0004 independently recomputes 252-sample percentile and its price-low conjunction", () => {
  const input = compressed(), values = anchoredAtr(input);
  const percentile = values.filter((value) => value <= values.at(-1)).length / 252 * 100;
  assert(percentile <= 20);
  assert.equal(state("0004", input, "HIT").value, round(percentile) + "pct");
  state("0004", candles(266), "MISS", "Tied ATR samples use empirical <= rank, not minimum rank");
  const equalLow = candles(266, (index) => ({ open: 100, high: 140 - index * 0.1, low: 100, close: 100 }));
  const lowValues = anchoredAtr(equalLow);
  assert(lowValues.filter((value) => value <= lowValues.at(-1)).length / lowValues.length <= 0.2);
  state("0004", equalLow, "MISS", "Low ATR alone is insufficient when close equals the 20D low");
  equalLow.at(-1).close = 100.01;
  state("0004", equalLow, "HIT");
});

test("0018 seven-session share includes first predecessor and excludes unchanged volume", () => {
  assert.equal(state("0018", upVolume(), "HIT").value, "62%");
  assert.equal(state("0018", upVolume(61.99, 38.01), "MISS").value, "61.99%");
  assert.equal(state("0018", candles(8), "MISS").value, "0%", "Unchanged candles never count as up volume");
  const downFirst = upVolume(); downFirst[0].close = 102;
  assert.equal(state("0018", downFirst, "MISS").value, "0%");
  state("0018", candles(8, (index) => ({ close: 100 + index, volume: 0 })), "SOURCE_REQUIRED");
  const priorVolumeUnused = upVolume(); priorVolumeUnused[0].volume = null;
  state("0018", priorVolumeUnused, "HIT", "The predecessor contributes a close, not an eighth volume");
});

test("0080 uses mean extension AND weak CLV, never the down-volume rule", () => {
  state("0080", extension(), "RISK");
  const clvBoundary = extension(); Object.assign(clvBoundary.at(-1), { high: 126, low: 116 });
  state("0080", clvBoundary, "CLEAR", "CLV exactly 0.4 is not below 0.4");
  const ratioBoundary = candles(20, (index) => index === 19
    ? { open: 112, close: 112, high: 120, low: 110 }
    : { open: index < 13 ? 100 : 98, close: index < 13 ? 100 : 98, high: 101, low: 97 });
  assert.equal(ratioBoundary.at(-1).close / mean(ratioBoundary.map((item) => item.close)), 1.12);
  state("0080", ratioBoundary, "CLEAR", "Mean extension exactly 1.12 is not greater than 1.12");
  const downVolumeOnly = candles(20, (index) => ({ open: 124 - index, close: 124 - index, high: 134 - index, low: 123 - index, volume: index > 15 ? 1000 : 1 }));
  state("0080", downVolumeOnly, "CLEAR", "Heavy down volume cannot substitute for mean extension");
});

test("0084 uses three anchored ATR observations and strictly below SMA10", () => {
  const input = expanding(), values = anchoredAtr(input);
  assert.equal(values.length, 3);
  assert(values[2] > values[1] && values[1] > values[0]);
  assert(input.at(-1).close < mean(input.slice(-10).map((item) => item.close)));
  assert.equal(state("0084", input, "RISK").value, String(round(values.at(-1))));
  state("0084", candles(17), "CLEAR", "Flat ATR is not rising");
  const meanBoundary = expanding();
  for (const item of meanBoundary) { item.high += 100 - item.close; item.low += 100 - item.close; item.close = 100; }
  const rising = anchoredAtr(meanBoundary);
  assert(rising[2] > rising[1] && rising[1] > rising[0]);
  state("0084", meanBoundary, "CLEAR", "Close equal to SMA10 is not below SMA10");
  state("0080", expanding(30), "CLEAR");
  state("0084", expanding(30), "RISK", "ATR expansion remains distinct from mean extension");
  state("0080", extension(), "RISK");
  state("0084", extension(), "CLEAR");
  state("0079", extension(), "SOURCE_REQUIRED");
  state("0081", expanding(30), "SOURCE_REQUIRED");
});

test("required raw fields reject null blank Boolean malformed and nonfinite inputs", () => {
  const cases = [
    ["0004", compressed, ["high", "low", "close"]], ["0018", upVolume, ["close", "volume"]],
    ["0080", extension, ["high", "low", "close"]], ["0084", expanding, ["high", "low", "close"]]
  ];
  for (const [id, fixture, fields] of cases) {
    for (const field of fields) {
      for (const bad of [null, undefined, "", " ", true, false, NaN, Infinity, -Infinity, "0x64", "100x", "100,000"]) {
        const input = fixture(); input.at(-1)[field] = bad;
        state(id, input, "SOURCE_REQUIRED", id + " rejects " + field + "=" + String(bad));
      }
    }
    const hole = fixture(); hole[Math.floor(hole.length / 2)].close = null;
    state(id, hole, "SOURCE_REQUIRED", "Normalizer may not silently remove an interior close hole");
  }
});

test("invalid prices ranges and volume denominators fail closed without inventing input requirements", () => {
  for (const [id, fixture] of [["0004", compressed], ["0080", extension], ["0084", expanding]]) {
    for (const change of [{ close: 0 }, { high: -1 }, { low: 0 }, { high: 90, low: 110 }, { close: 999 }]) {
      const input = fixture(); Object.assign(input.at(-1), change); state(id, input, "SOURCE_REQUIRED");
    }
  }
  const flatLatest = extension(); Object.assign(flatLatest.at(-1), { high: 120, low: 120 });
  state("0080", flatLatest, "SOURCE_REQUIRED", "Undefined CLV denominator cannot be a CLEAR result");
  const negativeVolume = upVolume(); negativeVolume[3].volume = -1;
  state("0018", negativeVolume, "SOURCE_REQUIRED");
  const noUnneededOhlc = upVolume().map((item) => ({ ...item, open: null, high: null, low: null }));
  state("0018", noUnneededOhlc, "HIT");
  const oldRangeUnused = extension(); oldRangeUnused[0].high = null; oldRangeUnused[0].low = null;
  state("0080", oldRangeUnused, "RISK", "Extension needs historical closes, not historical HLC ranges");
});

test("dates and dropped rows cannot manufacture a complete lookback", () => {
  for (const [id, fixture] of [["0004", compressed], ["0018", upVolume], ["0080", extension], ["0084", expanding]]) {
    for (const badDate of [undefined, "", "invalid-date", "2024-02-30", 1704067200000]) {
      const input = fixture(); input.at(-1).date = badDate; state(id, input, "SOURCE_REQUIRED");
    }
    const duplicate = fixture(); duplicate.at(-1).date = duplicate.at(-2).date + "T16:00:00Z";
    state(id, duplicate, "SOURCE_REQUIRED", "Two timestamps on one date are not two observations");
    const extraInvalid = fixture(); extraInvalid.unshift({ ...extraInvalid[0], date: "invalid-date" });
    state(id, extraInvalid, "SOURCE_REQUIRED", "Enough retained rows cannot conceal a dropped raw record");
    assert.equal(evaluate(id, fixture().reverse()).state, evaluate(id, fixture()).state, "Valid unsorted provider rows are normalized");
  }
});

test("scanner retention and repeated normalization preserve raw invalid-input evidence", () => {
  // The full server loader creates runtime files, so inspect its retention
  // contract here and execute its exact normalizer/slice helpers in the VM.
  // Actual assembled scanner integration belongs to the separate smoke guard.
  const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
  const retained = server.match(/candles: tunnelFormulaSlice\(row\.candles, (\d+)\)/);
  assert(retained, "Evaluated scanner rows must carry bounded raw formula lineage");
  const retention = Number(retained[1]);
  assert(retention >= 266 && retention <= 300, "Scanner retention must cover 252 fully anchored ATR samples and remain bounded");
  const pipeline = (input) => run.slice(run.normalize(run.normalize(input)), retention);
  const good = compressed(300), before = structuredClone(good);
  const bounded = pipeline(good);
  assert.equal(bounded.length, retention);
  state("0004", bounded, "HIT", "Valid 300-candle history must still satisfy the 266-candle formula after scanner retention");
  assert.deepEqual(good, before);
  const extended = candles(300, (index) => index === 299
    ? { open: 150, high: 200, low: 140, close: 150 } : {});
  state("0080", pipeline(extended), "RISK");
  for (const bad of [null, "100%", "100,000", false, ""]) {
    const input = structuredClone(extended); input[295].close = bad;
    state("0080", pipeline(input), "SOURCE_REQUIRED", "Repeated normalization must not conceal " + String(bad));
  }
  for (const [id, fixture] of [["0004", compressed], ["0018", upVolume], ["0080", extension], ["0084", expanding]]) {
    const nullRecord = fixture(); nullRecord[nullRecord.length - 2] = null;
    state(id, nullRecord, "SOURCE_REQUIRED", "Null raw records fail closed rather than throw");
    state(id, pipeline(nullRecord), "SOURCE_REQUIRED", "Null record lineage survives repeated normalization");
  }
  const invalid = extension(); invalid[5].close = null;
  const forged = { formulaCandles: extension(), formula_candles: extension(), formulaInputValid: true };
  assert.equal(evaluate("0080", pipeline(invalid), forged).state, "SOURCE_REQUIRED", "JSON metadata cannot replace process-local raw provenance");
});

test("decimal strings and provider array candles retain valid results with no mutation", () => {
  for (const [id, fixture] of [["0004", compressed], ["0018", upVolume], ["0080", extension], ["0084", expanding]]) {
    const input = fixture(), before = structuredClone(input), expected = plain(evaluate(id, input));
    const strings = input.map((item) => Object.fromEntries(Object.entries(item).map(([key, value]) => [key, key === "date" ? value : String(value)])));
    assert.deepEqual(plain(evaluate(id, strings)), expected);
    const arrays = input.map((item) => [item.date, item.open, item.high, item.low, item.close, item.volume]);
    assert.deepEqual(plain(evaluate(id, arrays)), expected);
    assert.deepEqual(input, before);
  }
});

test("generic score remains 70/30 and decisions and hard gates are preserved", () => {
  for (const decision of ["SELECT", "WATCH", "DATA_NEEDED", "BLOCKED"]) {
    const row = { symbol: "OFFLINE_FIXTURE", sector: "Fixture", candles: compressed(), score: 80, decision,
      hard_gates: { liquidity: "blocked", correlation: "data_needed" }, blocked_reasons: ["fixture-existing-gate"] };
    const before = structuredClone(row);
    const output = run.attach(row, {}, run.context([row], []));
    const summary = output.parameter_tunnel.summary;
    assert(summary.evaluated > 0);
    const expected = ["DATA_NEEDED", "BLOCKED"].includes(decision) ? 80 : round(80 * 0.70 + summary.evidence_score * 0.30, 2);
    assert.equal(output.score, expected);
    assert.equal(output.base_score, 80);
    assert.equal(output.decision, decision);
    assert.equal(output.parameter_selection_effect.hard_gate_decision_preserved, true);
    assert.deepEqual(output.hard_gates, row.hard_gates);
    assert.deepEqual(output.blocked_reasons, row.blocked_reasons);
    assert.deepEqual(row, before);
  }
  const row = { symbol: "EMPTY", candles: [], score: 80, decision: "WATCH" };
  const output = run.attach(row, {}, run.context([row], []));
  assert.equal(output.parameter_tunnel.summary.evaluated, 0);
  assert.equal(output.score, 80);
  assert.equal(output.parameter_selection_effect.status, "BASE_SCORE_PRESERVED");
});

test("Upstox overlay restores base primary rank while retaining advisory evidence", () => {
  for (const decision of ["SELECT", "WATCH", "DATA_NEEDED", "BLOCKED"]) {
    const row = { symbol: "OFFLINE_FIXTURE", sector: "Fixture", candles: compressed(), score: 80, decision,
      hard_gates: { correlation: "data_needed" }, selected: false };
    const generic = run.attach(row, {}, run.context([row], []));
    const before = plain(generic);
    const upstox = run.overlay(generic, null, null);
    assert.equal(upstox.score, 80);
    assert.equal(upstox.selection_score, 80);
    assert.equal(upstox.base_score, 80);
    assert.equal(upstox.decision, decision);
    assert.equal(upstox.selected, false);
    assert.deepEqual(upstox.hard_gates, row.hard_gates);
    assert.equal(upstox.parameter_selection_effect.primary_rank_preserved, true);
    assert.equal(upstox.parameter_selection_effect.hard_gate_decision_preserved, true);
    assert.equal(upstox.parameter_selection_effect.status, "ADVISORY_ONLY");
    const summary = upstox.parameter_tunnel.summary;
    assert.equal(upstox.institutional_advisory_score, ["DATA_NEEDED", "BLOCKED"].includes(decision)
      ? 80 : round(80 * 0.70 + summary.evidence_score * 0.30, 2));
    for (const id of ["NO03", "NO04", "NO05", "NO08"]) {
      assert.equal(upstox.parameter_tunnel.results.find((item) => item.id === id).state, "SOURCE_REQUIRED");
    }
    assert.deepEqual(plain(generic), before);
  }
});

assert.equal(forbiddenCalls, 0, "The guard must remain entirely offline");
console.log("parameter-formula-parity-guard: " + groups + " offline groups passed; 175 nodes preserved; no provider/store/order calls");
