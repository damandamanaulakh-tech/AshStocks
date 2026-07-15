const CANDLE_PATTERN_FUNCTIONS = String.raw`
const CANDLE_PATTERN_VERSION = "ashstocks-candle-pattern-v0.2-scored";
const CANDLE_PARAMETER_RULES = Object.freeze({
  bullish_engulfing: { parameter: 681, label: "Bullish engulfing", direction: "bullish", weight: 18 },
  hammer_rejection: { parameter: 683, label: "Hammer rejection", direction: "bullish", weight: 16 },
  morning_star: { parameter: 684, label: "Morning star reversal", direction: "bullish", weight: 18 },
  piercing_line: { parameter: 685, label: "Piercing line recovery", direction: "bullish", weight: 14 },
  near_252d_breakout: { parameter: 686, label: "Near 252D breakout", direction: "bullish", weight: 18 },
  breakout_retest: { parameter: 687, label: "Breakout retest hold", direction: "bullish", weight: 16 },
  volume_confirmation: { parameter: 688, label: "Volume confirmation", direction: "confirm", weight: 14 },
  higher_high_higher_low: { parameter: 689, label: "Higher high higher low", direction: "bullish", weight: 10 },
  bullish_marubozu: { parameter: 690, label: "Bullish wide body", direction: "bullish", weight: 12 },
  three_candle_continuation_watch: { parameter: 691, label: "Three candle continuation", direction: "watch", weight: 8 },
  tight_range_expansion: { parameter: 692, label: "Tight range expansion", direction: "bullish", weight: 10 },
  doji_exhaustion_watch: { parameter: 696, label: "Doji exhaustion watch", direction: "caution", weight: -8 },
  supply_rejection_watch: { parameter: 697, label: "Supply rejection watch", direction: "caution", weight: -10 },
  bearish_engulfing: { parameter: 698, label: "Bearish engulfing", direction: "caution", weight: -14 },
  gap_down_recovery: { parameter: 699, label: "Gap down recovery", direction: "bullish", weight: 12 }
});

function normalizeCandleBody(candle) {
  if (Array.isArray(candle)) {
    return {
      date: candle[0],
      open: Number(candle[1]),
      high: Number(candle[2]),
      low: Number(candle[3]),
      close: Number(candle[4]),
      volume: Number(candle[5] || 0)
    };
  }
  return {
    date: candle.date || candle.timestamp || candle.time,
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
    volume: Number(candle.volume || candle.vol || 0)
  };
}

function candleAverageVolume(candles, fallback) {
  const recent = candles.slice(Math.max(0, candles.length - 21), Math.max(0, candles.length - 1));
  const volumes = recent.map((candle) => Number(candle.volume || 0)).filter((value) => Number.isFinite(value) && value > 0);
  if (volumes.length) return volumes.reduce((sum, value) => sum + value, 0) / volumes.length;
  return Number(fallback || 0);
}

function pushCandlePattern(patterns, pattern, evidence) {
  const rule = CANDLE_PARAMETER_RULES[pattern];
  if (!rule) return;
  patterns.push({ pattern, ...rule, evidence });
}

function candlePatternAnalysis(row = {}, metrics = {}) {
  const candles = Array.isArray(row.candles) ? row.candles
    .map(normalizeCandleBody)
    .filter((candle) =>
      Number.isFinite(candle.open) &&
      Number.isFinite(candle.high) &&
      Number.isFinite(candle.low) &&
      Number.isFinite(candle.close)
    ) : [];
  if (!candles.length) {
    return {
      version: CANDLE_PATTERN_VERSION,
      status: "DATA_NEEDED",
      score: 0,
      patterns: [],
      parameter_hits: [],
      evidence: "No OHLC candle bodies attached to scanner row",
      reason: "Run Upstox historical scan to unlock candle structure parameters"
    };
  }

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2] || last;
  const prev2 = candles[candles.length - 3] || prev;
  const close = Number(last.close);
  const open = Number(last.open);
  const high = Number(last.high);
  const low = Number(last.low);
  const prevOpen = Number(prev.open);
  const prevClose = Number(prev.close);
  const prev2Close = Number(prev2.close);
  const range = Math.max(0.0001, high - low);
  const prevRange = Math.max(0.0001, Number(prev.high) - Number(prev.low));
  const body = Math.abs(close - open);
  const prevBody = Math.abs(prevClose - prevOpen);
  const upperWick = high - Math.max(open, close);
  const lowerWick = Math.min(open, close) - low;
  const bullish = close > open;
  const bearish = close < open;
  const volume = Number(last.volume || 0);
  const avgVolume20 = candleAverageVolume(candles, metrics.adv20 || row.adv20);
  const high252 = Number(metrics.high252 || row.high_252 || 0);
  const parameterHits = [];

  if (bullish && open <= prevClose && close >= prevOpen && close > prevClose && body >= prevBody * 0.8) pushCandlePattern(parameterHits, "bullish_engulfing", "latest candle engulfs previous body and closes higher");
  if (bearish && open >= prevClose && close <= prevOpen && close < prevClose && body >= prevBody * 0.8) pushCandlePattern(parameterHits, "bearish_engulfing", "latest candle engulfs previous body downward");
  if (bullish && lowerWick / range >= 0.45 && upperWick / range <= 0.25) pushCandlePattern(parameterHits, "hammer_rejection", "long lower wick with bullish close");
  if (Number(prev2.close) > Number(prev2.open) && Number(prev.close) < Number(prev.open) && bullish && close > (prevOpen + prevClose) / 2) pushCandlePattern(parameterHits, "morning_star", "two-day selloff followed by bullish recovery above midpoint");
  if (Number(prev.close) < Number(prev.open) && bullish && open < prevClose && close > (prevOpen + prevClose) / 2) pushCandlePattern(parameterHits, "piercing_line", "bullish candle pierces prior bearish body midpoint");
  if (body / range >= 0.72 && bullish && upperWick / range <= 0.18 && lowerWick / range <= 0.18) pushCandlePattern(parameterHits, "bullish_marubozu", "wide bullish body with small wicks");
  if (high252 && close >= high252 * 0.97) pushCandlePattern(parameterHits, "near_252d_breakout", "close is within 3% of 252D high");
  if (high252 && low <= high252 * 1.01 && close >= high252 * 0.985 && bullish) pushCandlePattern(parameterHits, "breakout_retest", "price tested breakout area and closed back near high");
  if (bullish && volume && avgVolume20 && volume >= avgVolume20 * 1.5) pushCandlePattern(parameterHits, "volume_confirmation", "latest volume is at least 1.5x 20D average");
  if (high > Number(prev.high) && low > Number(prev.low) && close > prevClose) pushCandlePattern(parameterHits, "higher_high_higher_low", "latest candle forms higher high and higher low");
  if (bullish && close > prevClose && prevClose > prev2Close) pushCandlePattern(parameterHits, "three_candle_continuation_watch", "three-candle close continuation is positive");
  if (body / range >= 0.55 && prevRange / Math.max(0.0001, close) <= 0.025 && bullish) pushCandlePattern(parameterHits, "tight_range_expansion", "wide bullish expansion after tight previous range");
  if (Math.abs(close - open) / range <= 0.12) pushCandlePattern(parameterHits, "doji_exhaustion_watch", "small body after directional move needs confirmation");
  if (bearish && upperWick / range >= 0.45) pushCandlePattern(parameterHits, "supply_rejection_watch", "large upper wick shows supply rejection");
  if (open < prevClose * 0.985 && bullish && close > prevClose) pushCandlePattern(parameterHits, "gap_down_recovery", "gap down recovered above previous close");

  const score = round(Math.max(0, Math.min(100, parameterHits.reduce((sum, hit) => sum + Number(hit.weight || 0), 0))), 2);
  const patterns = parameterHits.map((hit) => hit.pattern);
  const bullishHits = parameterHits.filter((hit) => hit.direction === "bullish" || hit.direction === "confirm").length;
  const cautionHits = parameterHits.filter((hit) => hit.direction === "caution").length;
  const status = score >= 55 && bullishHits > cautionHits ? "HIT" : parameterHits.length ? "WATCH" : "NO_HIT";
  return {
    version: CANDLE_PATTERN_VERSION,
    status,
    score,
    patterns,
    parameter_hits: parameterHits.map((hit) => ({ parameter: hit.parameter, pattern: hit.pattern, label: hit.label, direction: hit.direction, weight: hit.weight, evidence: hit.evidence })),
    evidence: "O " + round(open, 2) + " H " + round(high, 2) + " L " + round(low, 2) + " C " + round(close, 2) + "; body " + round((body / range) * 100, 1) + "% range; volume " + (Number.isFinite(volume) ? Math.round(volume) : "NA") + "; avg20 " + (Number.isFinite(avgVolume20) ? Math.round(avgVolume20) : "NA"),
    reason: parameterHits.length ? parameterHits.map((hit) => "P" + hit.parameter + " " + hit.label).join(", ") : "No proven candle structure hit on latest candle"
  };
}
`;

export function applyCandlePatternPatches(source, mustReplace) {
  let output = source;

  output = mustReplace(
    output,
    '  { key: "stuck_candle", group: "Data", label: "No latest OHLC stuck candle", threshold: "open/high/low/close not all equal", weight: 0, gate: true },',
    '  { key: "stuck_candle", group: "Data", label: "No latest OHLC stuck candle", threshold: "open/high/low/close not all equal", weight: 0, gate: true },\n  { key: "candle_structure", group: "Candle", label: "Latest candle structure", threshold: "P681/P683/P686/P688 and related candle confirmations", weight: 8, gate: false },',
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
    '  const score = missing.length || momentum === null || qualityScore === null ? 0 : round(0.65 * momentum + 0.35 * qualityScore, 2);',
    '  let score = missing.length || momentum === null || qualityScore === null ? 0 : round(0.65 * momentum + 0.35 * qualityScore, 2);',
    'make scanner score candle-adjustable'
  );

  output = mustReplace(
    output,
    '  const targetPotential = targetPotentialLabel(metrics, settings.targetPotentialPct);\n  const targetPotentialOk = !settings.targetPotentialHardGate || targetPotential.label === "PASS";',
    '  const targetPotential = targetPotentialLabel(metrics, settings.targetPotentialPct);\n  const targetPotentialOk = !settings.targetPotentialHardGate || targetPotential.label === "PASS";\n  const candleAnalysis = candlePatternAnalysis(row, metrics);\n  if (!missing.length && momentum !== null && qualityScore !== null) {\n    const candleScoreInput = candleAnalysis.status === "DATA_NEEDED" ? 50 : candleAnalysis.score;\n    score = round(0.58 * momentum + 0.32 * qualityScore + 0.10 * candleScoreInput, 2);\n  }',
    'candle analysis in evaluateStock'
  );

  output = mustReplace(
    output,
    '    last_candle_age_days: metrics.lastCandleAgeDays,\n    target_potential: targetPotential,',
    '    last_candle_age_days: metrics.lastCandleAgeDays,\n    candle_patterns: candleAnalysis.patterns,\n    candle_parameter_hits: candleAnalysis.parameter_hits,\n    candle_score: candleAnalysis.score,\n    candle_status: candleAnalysis.status,\n    candle_reason: candleAnalysis.reason,\n    candle_evidence: candleAnalysis.evidence,\n    candle_engine: candleAnalysis.version,\n    target_potential: targetPotential,',
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
    '      formula: "0.58 * momentum_score + 0.32 * quality_score + 0.10 * candle_score_input",\n      candle_engine: CANDLE_PATTERN_VERSION,\n      candle_patterns: candleAnalysis.patterns,\n      candle_parameter_hits: candleAnalysis.parameter_hits,\n      candle_score: candleAnalysis.score,\n      hard_gates:',
    'candle proof fields'
  );

  output = mustReplace(
    output,
    '    close: row.close,\n    target_potential: row.target_potential,',
    '    close: row.close,\n    candle_patterns: row.candle_patterns,\n    candle_parameter_hits: row.candle_parameter_hits,\n    candle_score: row.candle_score,\n    candle_status: row.candle_status,\n    candle_reason: row.candle_reason,\n    candle_evidence: row.candle_evidence,\n    candle_engine: row.candle_engine,\n    target_potential: row.target_potential,',
    'compact scan row candle fields'
  );

  return output;
}