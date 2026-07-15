import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
const file = path.join(root, "server-candle-pattern-patch.mjs");
const source = fs.readFileSync(file, "utf8");
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

for (const text of [
  "ashstocks-candle-pattern-v0.2-scored",
  "CANDLE_PARAMETER_RULES",
  "candle_parameter_hits",
  "parameter_hits",
  "score = round(0.58 * momentum + 0.32 * qualityScore + 0.10 * candleScoreInput",
  "P681/P683/P686/P688",
  "bullish_engulfing",
  "hammer_rejection",
  "morning_star",
  "piercing_line",
  "breakout_retest",
  "volume_confirmation",
  "bearish_engulfing"
]) {
  assert(source.includes(text), `server-candle-pattern-patch.mjs missing ${text}`);
}

const match = source.match(/const CANDLE_PATTERN_FUNCTIONS = String\.raw`([\s\S]*?)`;\n\nexport function/);
assert(match, "could not extract CANDLE_PATTERN_FUNCTIONS");

if (match) {
  const sandbox = {
    Number,
    Math,
    Array,
    Object,
    String,
    Boolean,
    round(value, digits = 2) {
      const number = Number(value);
      if (!Number.isFinite(number)) return null;
      const factor = 10 ** digits;
      return Math.round(number * factor) / factor;
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(`${match[1]}\nthis.__analysis = candlePatternAnalysis;`, sandbox, { filename: "candle-pattern-functions.vm.js" });

  const candles = [];
  for (let index = 0; index < 20; index += 1) {
    candles.push({
      date: `2026-06-${String(index + 1).padStart(2, "0")}`,
      open: 130 + index * 0.7,
      high: 132 + index * 0.7,
      low: 128 + index * 0.7,
      close: 131 + index * 0.7,
      volume: 500000
    });
  }
  candles.push({ date: "2026-07-13", open: 155, high: 157, low: 148, close: 150, volume: 500000 });
  candles.push({ date: "2026-07-14", open: 149, high: 162, low: 148, close: 160, volume: 900000 });

  const analysis = sandbox.__analysis({ symbol: "CANDLEPROOF", candles, adv20: 500000, high_252: 162 }, { adv20: 500000, high252: 162 });
  const hitParams = new Set((analysis.parameter_hits || []).map((hit) => hit.parameter));
  assert(analysis.version === "ashstocks-candle-pattern-v0.2-scored", "candle version should be v0.2-scored");
  assert(analysis.status === "HIT", `proof candle should be HIT, got ${analysis.status}`);
  assert(Number(analysis.score) >= 55, `proof candle score should be >=55, got ${analysis.score}`);
  assert(hitParams.has(681), "proof candle should hit P681 bullish engulfing");
  assert(hitParams.has(686), "proof candle should hit P686 near 252D breakout");
  assert(hitParams.has(688), "proof candle should hit P688 volume confirmation");
  assert(Array.isArray(analysis.patterns) && analysis.patterns.includes("bullish_engulfing"), "patterns should include bullish_engulfing");
  assert(String(analysis.reason).includes("P681"), "reason should name parameter numbers");
}

if (failures.length) {
  console.error("AshStocks candle scoring guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("AshStocks candle scoring guard passed.");