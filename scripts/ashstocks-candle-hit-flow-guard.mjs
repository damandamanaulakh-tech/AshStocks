import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(file) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    failures.push(`${file}: missing`);
    return "";
  }
  return fs.readFileSync(full, "utf8");
}

function mustInclude(file, text, reason = text) {
  if (!read(file).includes(text)) failures.push(`${file}: missing ${reason}`);
}

function mustMatch(file, regex, reason) {
  if (!regex.test(read(file))) failures.push(`${file}: missing ${reason}`);
}

mustInclude("app-broker-nav-guard.js", "./upstox-candle-hit-flow.css", "candle hit flow stylesheet loader");
mustInclude("app-broker-nav-guard.js", "./app-upstox-candle-hit-flow.js", "candle hit flow script loader");

for (const text of [
  "ashstocks:upstox-candle-hit-flow",
  "candle_parameter_hits",
  "patchPaperOrderPayload",
  "/api/paper-trader/order",
  "uwCandleHitFlow",
  "uwCandleHitTicket",
  "uwSymbolCandleHitProof",
  "uw-candle-hit-mini",
  "bullish_engulfing",
  "near_252d_breakout",
  "volume_confirmation",
  "P" + "681",
  "P" + "686",
  "P" + "688"
]) {
  mustInclude("app-upstox-candle-hit-flow.js", text);
}

mustMatch(
  "app-upstox-candle-hit-flow.js",
  /patchPaperOrderPayload[\s\S]*candle_status[\s\S]*candle_score[\s\S]*candle_patterns[\s\S]*candle_parameter_hits[\s\S]*candle_evidence/,
  "paper order payload should receive candle proof fields"
);
mustMatch(
  "app-upstox-candle-hit-flow.js",
  /decorateTradeQueueRows[\s\S]*#uwTradeQueueBody tr[\s\S]*uw-candle-hit-mini/,
  "trade queue rows should receive candle hit chips"
);
mustMatch(
  "app-upstox-candle-hit-flow.js",
  /renderReasoningCandlePanel[\s\S]*#uwReasoningDock[\s\S]*uwCandleHitFlow/,
  "reasoning dock should receive candle hit panel"
);
mustMatch(
  "app-upstox-candle-hit-flow.js",
  /renderTicketCandlePanel[\s\S]*#uwOrderTicket[\s\S]*data-uw-candle-hit-ticket/,
  "order ticket should receive candle hit panel"
);

for (const text of [
  ".uw-candle-hit-flow",
  ".uw-candle-hit-ticket",
  ".uw-symbol-candle-hit-proof",
  ".uw-candle-hit-mini",
  ".uw-candle-hit-chips .hit"
]) {
  mustInclude("upstox-candle-hit-flow.css", text);
}

mustInclude("package.json", "scripts/ashstocks-candle-hit-flow-guard.mjs", "candle hit flow guard wired");
mustInclude("package.json", "node --check app-upstox-candle-hit-flow.js", "syntax check for candle hit flow bridge");

if (failures.length) {
  console.error("AshStocks candle hit flow guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("AshStocks candle hit flow guard passed.");