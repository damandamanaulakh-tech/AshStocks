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
  "ashstocks-paper-order-lifecycle-v0.2",
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

for (const text of [
  "/api/paper-trader/monitor",
  "data-paper-monitor",
  "Monitor Targets / Stops / GTT",
  "runPaperMonitor",
  "PAPER_LIFECYCLE_MONITORED",
  "DATA_NEEDED",
  "paper execution only"
]) {
  mustInclude("app-paper-order-lifecycle.js", text);
}

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
