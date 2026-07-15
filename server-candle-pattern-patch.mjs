const CANDLE_PATTERN_FUNCTIONS = String.raw`
const CANDLE_PATTERN_VERSION = "ashstocks-candle-pattern-v0.1";
function candlePatternAnalysis(row = {}, metrics = {}) {
  const candles = Array.isArray(row.candles) ? row.candles.filter((candle) =>
    Number.isFinite(Number(candle.open)) &&
    Number.isFinite(Number(candle.high)) &&
    Number.isFinite(Number(candle.low)) &&
    Number.isFinite(Number(candle.close))
  ) : [];
  if (!candles.length) {
    return {
      version: CANDLE_PATTERN_VERSION,
      status: "DATA_NEEDED",
      score: 0,
      patterns: [],
      evidence: "No OHLC candle bodies attached to scanner row",
      reason: "Run Upstox historical scan to unlock candle structure parameters"
    };
  }

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2] || last;
  const close = Number(last.close);
  const open = Number(last.open);
  const high = Number(last.high);
  const low = Number(last.low);
  const prevOpen = Number(prev.open);
  const prevClose = Number(prev.close);
  const range = Math.max(0.0001, high - low);
  const body = Math.abs(close - open);
  const upperWick = high - Math.max(open, close);
  const lowerWick = Math.min(open, close) - low;
  const bullish = close > open;
  const bearish = close < open;
  const volume = Number(last.volume || 0);
  const avgVolume20 = Number(metrics.adv20 || row.adv20 || 0);
  const high252 = Number(metrics.high252 || row.high_252 || 0);
  const patterns = [];

  if (bullish && open <= prevClose && close >= prevOpen && close > prevClose) patterns.push("bullish_engulfing");
  if (bearish && open >= prevClose && close <= prevOpen && close < prevClose) patterns.push("bearish_engulfing");
  if (bullish && lowerWick / range >= 0.45 && upperWick / range <= 0.25) patterns.push("hammer_rejection");
  if (body / range >= 0.65) patterns.push(bullish ? "wide_body_bullish" : "wide_body_bearish");
  if (high252 && close >= high252 * 0.97) patterns.push("near_252d_breakout");
  if (high <= Number(prev.high) && low >= Number(prev.low)) patterns.push("inside_bar");
  if (bullish && volume && avgVolume20 && volume >= avgVolume20 * 1.5) patterns.push("volume_confirmation");
  if (Math.abs(close - open) / range <= 0.12) patterns.push("doji_exhaustion_watch");
  if (bearish && upperWick / range >= 0.45) patterns.push("supply_rejection_watch");
  if (bullish && close > prevClose && Number(prev.close) > Number((candles[candles.length - 3] || prev).close || 0)) patterns.push("three_candle_continuation_watch");

  const bullishCount = patterns.filter((pattern) => !/bearish|supply|doji/.test(pattern)).length;
  const cautionCount = patterns.length - bullishCount;
  const score = round(Math.max(0, Math.min(100, bullishCount * 18 + (patterns.includes("near_252d_breakout") ? 18 : 0) + (patterns.includes("volume_confirmation") ? 14 : 0) - cautionCount * 8)), 2);
  const status = score >= 55 ? "HIT" : patterns.length ? "WATCH" : "NO_HIT";
  return {
    version: CANDLE_PATTERN_VERSION,
    status,
    score,
    patterns,
    evidence: "O " + round(open, 2) + " H " + round(high, 2) + " L " + round(low, 2) + " C " + round(close, 2) + "; body " + round((body / range) * 100, 1) + "% range; volume " + (Number.isFinite(volume) ? Math.round(volume) : "NA"),
    reason: patterns.length ? patterns.join(", ") : "No proven candle structure hit on latest candle"
  };
}
`;

export function applyCandlePatternPatches(source, mustReplace) {
  let output = source;

  output = mustReplace(
    output,
    '  { key: "stuck_candle", group: "Data", label: "No latest OHLC stuck candle", threshold: "open/high/low/close not all equal", weight: 0, gate: true },',
    '  { key: "stuck_candle", group: "Data", label: "No latest OHLC stuck candle", threshold: "open/high/low/close not all equal", weight: 0, gate: true },\n  { key: "candle_structure", group: "Candle", label: "Latest candle structure", threshold: "engulfing / hammer / breakout / volume confirmation", weight: 8, gate: false },',
    'candle scanner parameter'
  );

  output = mustReplace(
    output,
    '\nfunction runScanner(universe, options = {}) {',
    `\n${CANDLE_PATTERN_FUNCTIONS}\nfunction runScanner(universe, options = {}) {`,
    'insert candle pattern helpers'
  );

  output = mustReplace(
    output,
    '  const targetPotential = targetPotentialLabel(metrics, settings.targetPotentialPct);\n  const targetPotentialOk = !settings.targetPotentialHardGate || targetPotential.label === "PASS";',
    '  const targetPotential = targetPotentialLabel(metrics, settings.targetPotentialPct);\n  const targetPotentialOk = !settings.targetPotentialHardGate || targetPotential.label === "PASS";\n  const candleAnalysis = candlePatternAnalysis(row, metrics);',
    'candle analysis in evaluateStock'
  );

  output = mustReplace(
    output,
    '    last_candle_age_days: metrics.lastCandleAgeDays,\n    target_potential: targetPotential,',
    '    last_candle_age_days: metrics.lastCandleAgeDays,\n    candle_patterns: candleAnalysis.patterns,\n    candle_score: candleAnalysis.score,\n    candle_status: candleAnalysis.status,\n    candle_reason: candleAnalysis.reason,\n    candle_evidence: candleAnalysis.evidence,\n    candle_engine: candleAnalysis.version,\n    target_potential: targetPotential,',
    'candle fields on scanner row'
  );

  output = mustReplace(
    output,
    '      stuck_candle: stuckOk,\n      volatility_cap: volatilityOk,',
    '      stuck_candle: stuckOk,\n      candle_structure: candleAnalysis.status !== "DATA_NEEDED",\n      volatility_cap: volatilityOk,',
    'candle gate visibility'
  );

  output = mustReplace(
    output,
    '      formula: "0.65 * momentum_score + 0.35 * quality_score",\n      hard_gates:',
    '      formula: "0.65 * momentum_score + 0.35 * quality_score",\n      candle_engine: CANDLE_PATTERN_VERSION,\n      candle_patterns: candleAnalysis.patterns,\n      hard_gates:',
    'candle proof fields'
  );

  output = mustReplace(
    output,
    '    close: row.close,\n    target_potential: row.target_potential,',
    '    close: row.close,\n    candle_patterns: row.candle_patterns,\n    candle_score: row.candle_score,\n    candle_status: row.candle_status,\n    candle_reason: row.candle_reason,\n    candle_evidence: row.candle_evidence,\n    candle_engine: row.candle_engine,\n    target_potential: row.target_potential,',
    'compact scan row candle fields'
  );

  return output;
}
