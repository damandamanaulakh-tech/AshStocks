import { readFileSync } from "node:fs";

const preRiseParameters = JSON.parse(
  readFileSync(
    new URL("./config/pre-rise-patterns.v0.1.json", import.meta.url),
    "utf8",
  ),
);
const embeddedPreRiseTracker = readFileSync(
  new URL("./lib/pre-rise-pattern-tracker.mjs", import.meta.url),
  "utf8",
)
  .replaceAll("export function ", "function ")
  .replace(/\nexport \{[^}]+\};\s*$/, "");

const PRE_RISE_FUNCTIONS = String.raw`
const PRE_RISE_PATTERN_PARAMETERS = Object.freeze(${JSON.stringify(preRiseParameters)});
${embeddedPreRiseTracker}
`;

export function applyPreRisePatternPatches(source, mustReplace) {
  let output = source;

  output = mustReplace(
    output,
    "\nfunction runScanner(universe, options = {}) {",
    `\n${PRE_RISE_FUNCTIONS}\nfunction runScanner(universe, options = {}) {`,
    "insert pre-rise pattern tracker",
  );

  output = mustReplace(
    output,
    "  const candleAnalysis = candlePatternAnalysis(row, metrics);\n  if (!missing.length && momentum !== null && qualityScore !== null) {",
    "  const candleAnalysis = candlePatternAnalysis(row, metrics);\n  const preRiseAnalysis = evaluatePreRisePattern(row.candles || [], PRE_RISE_PATTERN_PARAMETERS);\n  if (!missing.length && momentum !== null && qualityScore !== null) {",
    "evaluate pre-rise pattern",
  );

  output = mustReplace(
    output,
    "    candle_engine: candleAnalysis.version,\n    target_potential: targetPotential,",
    `    candle_engine: candleAnalysis.version,
    pre_rise_status: preRiseAnalysis.status,
    pre_rise_score: preRiseAnalysis.score,
    pre_rise_pattern_id: preRiseAnalysis.patternId,
    pre_rise_pattern_name: preRiseAnalysis.patternName,
    pre_rise_reason: preRiseAnalysis.reason,
    pre_rise_evidence: preRiseAnalysis.evidence,
    pre_rise_inside_bars_10d: preRiseAnalysis.insideBarsIn10,
    pre_rise_volume_multiple_20d: preRiseAnalysis.positiveVolumeMultipleVs20d,
    pre_rise_positive_close: preRiseAnalysis.positiveClose,
    pre_rise_historical_evidence: preRiseAnalysis.historicalEvidence,
    pre_rise_edge_confirmed: false,
    pre_rise_model: preRiseAnalysis.modelVersion,
    target_potential: targetPotential,`,
    "pre-rise fields on scanner row",
  );

  output = mustReplace(
    output,
    "      candle_score: candleAnalysis.score,\n      hard_gates:",
    `      candle_score: candleAnalysis.score,
      pre_rise_model: preRiseAnalysis.modelVersion,
      pre_rise_status: preRiseAnalysis.status,
      pre_rise_pattern_id: preRiseAnalysis.patternId,
      pre_rise_evidence: preRiseAnalysis.evidence,
      pre_rise_edge_confirmed: false,
      hard_gates:`,
    "pre-rise proof fields",
  );

  output = mustReplace(
    output,
    "    candle_engine: row.candle_engine,\n    target_potential: row.target_potential,",
    `    candle_engine: row.candle_engine,
    pre_rise_status: row.pre_rise_status,
    pre_rise_score: row.pre_rise_score,
    pre_rise_pattern_id: row.pre_rise_pattern_id,
    pre_rise_pattern_name: row.pre_rise_pattern_name,
    pre_rise_reason: row.pre_rise_reason,
    pre_rise_evidence: row.pre_rise_evidence,
    pre_rise_inside_bars_10d: row.pre_rise_inside_bars_10d,
    pre_rise_volume_multiple_20d: row.pre_rise_volume_multiple_20d,
    pre_rise_positive_close: row.pre_rise_positive_close,
    pre_rise_historical_evidence: row.pre_rise_historical_evidence,
    pre_rise_edge_confirmed: false,
    pre_rise_model: row.pre_rise_model,
    target_potential: row.target_potential,`,
    "compact scan row pre-rise fields",
  );

  return output;
}
