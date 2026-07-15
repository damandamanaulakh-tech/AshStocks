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

mustInclude("app-broker-nav-guard.js", "./app-upstox-parameter-trade-bridge.js", "parameter trade queue bridge loader");

for (const text of [
  "TOTAL_PARAMETERS = 2000",
  "#uwParameterFilterPanel",
  "#uwTradeQueueBridge",
  "uwParameterTradeBridge",
  "Parameter trade filter",
  "data-clear-uw-param-trade-filter",
  "ashstocks:upstox-parameter-trade-filter",
  "matched_symbols",
  "visible_rows",
  "rowPassesFamily",
  "familyScore",
  "Candle Structure + Volume",
  "FII/DII Flow",
  "Entry Target Stop",
  "Paper Safety"
]) {
  mustInclude("app-upstox-parameter-trade-bridge.js", text);
}

mustMatch(
  "app-upstox-parameter-trade-bridge.js",
  /document\.addEventListener\("input"[\s\S]*#uwParameterFilterPanel[\s\S]*activateFromPanel/,
  "parameter panel input should activate trade queue filtering"
);
mustMatch(
  "app-upstox-parameter-trade-bridge.js",
  /document\.addEventListener\("change"[\s\S]*#uwParameterFilterPanel[\s\S]*activateFromPanel/,
  "parameter panel change should activate trade queue filtering"
);
mustMatch(
  "app-upstox-parameter-trade-bridge.js",
  /#uwTradeQueueBody tr[\s\S]*tr\.hidden = !pass[\s\S]*uw-param-filter-hidden/,
  "trade queue rows should be hidden by parameter matches"
);
mustMatch(
  "app-upstox-parameter-trade-bridge.js",
  /familyForParam[\s\S]*range\[0\][\s\S]*range\[1\]/,
  "parameter number should map to a 1-2000 family range"
);

for (const text of [
  ".uw-parameter-trade-bridge",
  ".uw-parameter-trade-bridge button",
  ".uw-trade-queue-table tr.uw-param-filter-hidden"
]) {
  mustInclude("upstox-trade-queue-bridge.css", text);
}

mustInclude("package.json", "node --check app-upstox-parameter-trade-bridge.js", "syntax check for parameter trade queue bridge");
mustInclude("package.json", "scripts/ashstocks-upstox-parameter-bridge-guard.mjs", "guard wired into npm guard/check");

if (failures.length) {
  console.error("AshStocks Upstox parameter bridge guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("AshStocks Upstox parameter bridge guard passed.");
