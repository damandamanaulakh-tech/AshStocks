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

mustInclude("app-broker-nav-guard.js", "./app-upstox-parameter-reasoning-bridge.js", "parameter reasoning bridge loader");

for (const text of [
  "ashstocks:upstox-parameter-trade-filter",
  "uwParameterReasoningBridge",
  "data-uw-active-parameter-ticket",
  "matched_symbols",
  "currentSymbol",
  "parameterDecision",
  "PASS",
  "BLOCKED",
  "Candle Structure + Volume",
  "Entry Target Stop",
  "Paper Safety"
]) {
  mustInclude("app-upstox-parameter-reasoning-bridge.js", text);
}

for (const text of [
  ".uw-parameter-reasoning-bridge",
  ".uw-parameter-ticket-note",
  "[data-uw-active-parameter-ticket]"
]) {
  mustInclude("upstox-reasoning-dock.css", text);
}

mustInclude("package.json", "scripts/ashstocks-upstox-reasoning-bridge-guard.mjs", "reasoning bridge guard wired");
mustInclude("package.json", "node --check app-upstox-parameter-reasoning-bridge.js", "syntax check for reasoning bridge");

if (failures.length) {
  console.error("AshStocks Upstox reasoning bridge guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("AshStocks Upstox reasoning bridge guard passed.");