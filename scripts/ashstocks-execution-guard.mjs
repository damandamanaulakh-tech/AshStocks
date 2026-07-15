import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const warnings = [];

function read(file) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) {
    failures.push(`${file}: missing file`);
    return "";
  }
  return fs.readFileSync(fullPath, "utf8");
}

function mustInclude(file, text, reason) {
  const body = read(file);
  if (!body.includes(text)) failures.push(`${file}: missing ${reason || text}`);
}

function mustMatch(file, regex, reason) {
  const body = read(file);
  if (!regex.test(body)) failures.push(`${file}: missing ${reason}`);
}

function warnUnless(file, regex, reason) {
  const body = read(file);
  if (!regex.test(body)) warnings.push(`${file}: ${reason}`);
}

mustInclude("ASHSTOCKS_EXECUTION_GUARD.md", "AshStocks is a broker-grade Indian market product", "confirmed product rule");
mustInclude("ASHSTOCKS_EXECUTION_GUARD.md", "Candle Parameter Family", "candle parameter contract");

mustInclude("index.html", "./broker-shell.css", "broker shell CSS");
mustInclude("index.html", "./app-broker-shell.js", "broker shell script");
mustInclude("index.html", "./app-broker-nav-guard.js", "broker nav guard script");
mustInclude("index.html", "./app-parameter-piano.js", "Parameter Piano script");

for (const label of ["Markets", "Watchlist", "Signals", "Orders", "Positions", "GTT", "Reports", "Settings"]) {
  mustInclude("app-broker-shell.js", `label: "${label}"`, `${label} broker workflow view`);
}

mustMatch("app-broker-shell.js", /paper/i, "paper execution wording");
mustMatch("app-broker-shell.js", /buy|sell|order/i, "order workflow wording");
mustMatch("app-broker-shell.js", /gtt|target|stop/i, "target/stop or GTT workflow wording");

mustMatch("app-parameter-piano.js", /click|addEventListener/i, "clickable Parameter Piano behavior");
mustMatch("app-parameter-piano.js", /parameter/i, "parameter detail behavior");

mustMatch("server.js", /historical-candle/i, "Upstox historical candle endpoint");
mustMatch("server.js", /live_orders[^\n]*false|liveOrders[^\n]*false/i, "live orders locked false");

mustMatch("q1.html", /Upstox/i, "Q1 Upstox source label");
warnUnless("app-broker-shell.js", /candle/i, "candle hits are not yet visible in broker shell; do not claim candle merge complete");
warnUnless("server.js", /hammer|engulf|doji|inside bar|breakout candle|candle_pattern/i, "candle pattern scoring is not yet fully implemented; keep it in gap list");

if (warnings.length) {
  console.warn("AshStocks guard warnings:");
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (failures.length) {
  console.error("AshStocks execution guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("AshStocks execution guard passed.");
