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

for (const text of [
  "ashstocks-paper-order-lifecycle-v0.4-capital-closed-trades",
  "PAPER_CAPITAL_POLICY",
  "minimumEntryValue",
  "maximumCandidateEntries",
  "maximumOpenPositions",
  "Insufficient paper buying power",
  "Paper BUY must be at least Rs",
  "paperClosedTradeSummary",
  "closed_trades",
  "return_pct",
  "holding_days",
  "/api/paper-trader/monitor",
  "applyPaperLifecycleMonitor",
  "paperPriceMap",
  "closePaperPosition",
  "openPaperPositionFromGtt",
  "TARGET_HIT: paper monitor closed at target",
  "STOP_HIT: paper monitor closed at stop",
  "latest price missing for target/stop monitor",
  "latest price missing for GTT trigger monitor",
  "PAPER_LIFECYCLE_MONITORED",
  "paperKellySizing",
  "Kelly governor blocked new paper entries",
  "effective Kelly/base cap",
  "position_cap_pct",
  "paper_only: true",
  "live_orders: false",
  "broker_write_enabled: false"
]) {
  mustInclude("server-paper-order-lifecycle-patch.mjs", text);
}

mustMatch(
  "server-paper-order-lifecycle-patch.mjs",
  /if \(body\.useUpstox !== false && ENV\.UPSTOX_ACCESS_TOKEN\) scan = await runUpstoxScanner[\s\S]*if \(!scan \|\| scan\.ok === false\) scan = runScanner/,
  "monitor should prefer Upstox scan and fall back to scanner rows"
);
mustMatch(
  "server-paper-order-lifecycle-patch.mjs",
  /price >= target[\s\S]*closePaperPosition[\s\S]*price <= stop[\s\S]*closePaperPosition/,
  "monitor should close positions on target and stop"
);
mustMatch(
  "server-paper-order-lifecycle-patch.mjs",
  /plan\.side === "BUY" \? found\.price >= trigger : found\.price <= trigger[\s\S]*openPaperPositionFromGtt/,
  "monitor should trigger paper GTT plans from latest price"
);
mustMatch(
  "server-paper-order-lifecycle-patch.mjs",
  /request\.side === "BUY"[\s\S]*kelly\.blockNewEntries[\s\S]*proposedValue > maximumValue/,
  "paper BUY and GTT entries should pass the Kelly/base position cap"
);
mustMatch(
  "server-paper-order-lifecycle-patch.mjs",
  /requestValue < PAPER_CAPITAL_POLICY\.minimumEntryValue[\s\S]*requestValue > finiteOr\(lifecycleFunds\.buying_power/,
  "paper BUY should enforce the one-lakh minimum and real buying power"
);
mustMatch(
  "server-paper-order-lifecycle-patch.mjs",
  /entry_price: entryPrice[\s\S]*exit_price: request\.price[\s\S]*return_pct:[\s\S]*holding_days:/,
  "manual SELL should persist complete closed-trade return evidence"
);

for (const text of [
  "/api/paper-trader/monitor",
  "data-paper-monitor",
  "Monitor Targets / Stops / GTT",
  "runPaperMonitor",
  "PAPER_LIFECYCLE_MONITORED",
  "DATA_NEEDED",
  "Paper execution only"
]) {
  mustInclude("app-paper-order-lifecycle.js", text);
}

for (const text of [
  "Closed Trades",
  "data-paper-ledger-tab=\"closed\"",
  "closed_trades",
  "realized return",
  "Starting capital",
  "Buying power",
  "minimum entry"
]) {
  mustInclude("app.js", text);
}

for (const text of [
  "#ordersSection.section.active",
  "overflow-y: auto",
  ".ledger-tabs",
  ".ledger-scroll"
]) {
  mustInclude("styles.css", text);
}

const capitalPolicy = JSON.parse(read("config/paper-trader-capital.v0.4.json") || "{}");
if (capitalPolicy.startingCapital !== 5000000) failures.push("capital policy: startingCapital must be 5000000");
if (capitalPolicy.minimumEntryValue !== 100000) failures.push("capital policy: minimumEntryValue must be 100000");
if (capitalPolicy.maximumCandidateEntries !== 80) failures.push("capital policy: maximumCandidateEntries must be 80");
if (capitalPolicy.deploymentTargetPct !== 100) failures.push("capital policy: deploymentTargetPct must be 100");
if (capitalPolicy.affordableOpenPositionsAtMinimum !== 50) failures.push("capital policy: ₹50 lakh / ₹1 lakh must equal 50 affordable positions");

for (const text of [
  ".uw-paper-toolbar",
  ".uw-paper-toolbar button",
  ".uw-paper-toolbar small"
]) {
  mustInclude("upstox-workspace.css", text);
}

mustInclude("package.json", "scripts/ashstocks-paper-lifecycle-guard.mjs", "paper lifecycle guard wired into npm guard/check");
mustInclude("package.json", "node --check server-paper-order-lifecycle-patch.mjs", "server lifecycle syntax check");
mustInclude("package.json", "node --check app-paper-order-lifecycle.js", "paper lifecycle UI syntax check");

if (failures.length) {
  console.error("AshStocks paper lifecycle guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("AshStocks paper lifecycle guard passed.");
