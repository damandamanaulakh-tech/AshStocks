import fs from "node:fs";
import path from "node:path";
import { loadPaperCapitalPolicy } from "../lib/paper-capital-policy.mjs";

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

function mustNotMatch(file, regex, reason) {
  if (regex.test(read(file))) failures.push(`${file}: ${reason}`);
}

for (const text of [
  "ashstocks-paper-order-lifecycle-v0.10-safe-share-rounding",
  "idempotency_key",
  "legacy_60_second_fingerprint",
  "idempotency_key_reused_with_different_request",
  "replayed: true",
  "exceeds held quantity",
  "paperTransactionCost",
  "transaction_costs_paid",
  "gross_realized_pnl",
  "round_trip_cost",
  "net_entry_value",
  "net_exit_value",
  "preparePaperMarketOrder",
  "exact_nse_equity_instrument_key_required",
  "server_upstox_weighted_ask",
  "server_upstox_weighted_bid",
  "insufficient_upstox_ask_depth_for_full_paper_buy",
  "upstox_bid_depth_unavailable_for_paper_exit",
  "server_upstox_partial_weighted_bid",
  "PAPER_SELL_PARTIALLY_FILLED",
  "PAPER_PARTIALLY_FILLED",
  "IOC_SIMULATED",
  "CANCELLED_REMAINDER",
  "quote_snapshot_key",
  "levels_used",
  "nse_market_closed_for_market_paper_fill",
  "test_fixture_only",
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
  "preparePaperLifecycleMonitor",
  "paperMonitorDepthPrice",
  "server-upstox-market-quote-monitor",
  "GTT_SELL_TRIGGERED",
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
  /const prepared = await preparePaperLifecycleMonitor\(state\)[\s\S]*applyPaperLifecycleMonitor\(state, prepared\.rows \|\| \[\]/,
  "manual monitor route should use only server-prepared Upstox quote rows"
);
mustNotMatch(
  "server-paper-order-lifecycle-patch.mjs",
  /url\.pathname === "\/api\/paper-trader\/monitor"[\s\S]{0,900}runScanner/,
  "manual monitor route must not fall back to caller or historical scanner rows"
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
  /plan\.side === "SELL"[\s\S]*next\.positions\.splice\(existingIndex, 1\)[\s\S]*GTT_SELL_TRIGGERED/,
  "triggered SELL GTTs should create a closed trade and reduce or remove the holding"
);
mustMatch(
  "server-paper-order-lifecycle-patch.mjs",
  /request\.side === "BUY"[\s\S]*kelly\.blockNewEntries[\s\S]*proposedValue > roundedMaximumValue/,
  "paper BUY and GTT entries should pass the Kelly/base position cap"
);
mustMatch(
  "server-paper-order-lifecycle-patch.mjs",
  /requestValue < PAPER_CAPITAL_POLICY\.minimumEntryValue[\s\S]*requestDebit > finiteOr\(lifecycleFunds\.buying_power/,
  "paper BUY should enforce the one-lakh minimum and cost-inclusive buying power"
);
mustMatch(
  "server-paper-order-lifecycle-patch.mjs",
  /entry_price: entryPrice[\s\S]*exit_price: request\.price[\s\S]*return_pct:[\s\S]*holding_days:/,
  "manual SELL should persist complete closed-trade return evidence"
);
mustMatch(
  "server-paper-order-lifecycle-patch.mjs",
  /replayCutoff[\s\S]*request_fingerprint[\s\S]*priorOrder[\s\S]*idempotency_key[\s\S]*replayed: true/,
  "paper-order retries should return the original ledger result by explicit key or short legacy fingerprint"
);
mustMatch(
  "server-paper-order-lifecycle-patch.mjs",
  /request\.qty > heldQty[\s\S]*exceeds held quantity[\s\S]*const sellQty = executedQty/,
  "oversized paper SELL requests should fail instead of being silently clamped"
);
mustMatch(
  "server-paper-order-lifecycle-patch.mjs",
  /paperDepthExecution\(levels, request\.qty, request\.side === "SELL"\)[\s\S]*request\.side === "SELL"[\s\S]*server_upstox_partial_weighted_bid/,
  "SELL should accept only proven visible bid quantity while BUY retains full-depth behavior"
);
mustMatch(
  "server-paper-order-lifecycle-patch.mjs",
  /trustedFilledQty[\s\S]*executedQty[\s\S]*requested_qty: request\.qty[\s\S]*partial_fill: partialFill/,
  "paper accounting should preserve requested quantity and use only server-verified filled quantity"
);
mustNotMatch(
  "server-paper-order-lifecycle-patch.mjs",
  /request\.side === "SELL"[\s\S]{0,800}(?:last_price|midpoint)[\s\S]{0,800}(?:fallback|fill_price)/i,
  "SELL execution must not invent undisplayed liquidity from LTP or midpoint"
);
mustInclude("server-paper-engine-autobuy-patch.mjs", "idempotency_key", "automatic paper BUYs should carry a stable quote-scoped idempotency key");
for (const text of [
  "ashstocks-state-mutation-v0.1",
  "stateMutationTail",
  "function withStateMutation(work)",
  "serialize data-bank state mutation",
  "serialize direct state mutation"
]) {
  mustInclude("server.js", text);
}
mustMatch(
  "server-paper-order-lifecycle-patch.mjs",
  /url\.pathname === "\/api\/paper-trader\/order"[\s\S]*withStateMutation[\s\S]*store\.saveState\(applied\.nextState\)/,
  "manual paper orders should serialize read-apply-save mutations"
);
mustMatch(
  "server-paper-order-lifecycle-patch.mjs",
  /url\.pathname === "\/api\/paper-trader\/monitor"[\s\S]*withStateMutation[\s\S]*store\.saveState\(result\.nextState\)/,
  "paper monitors should serialize read-apply-save mutations"
);
mustInclude("server-paper-engine-autobuy-patch.mjs", "return withStateMutation(async () =>", "automatic paper engine should serialize its ledger mutation");
mustInclude("server-paper-trader-patch-v3.mjs", "withStateMutation(async () =>", "paper planning should serialize its ledger mutation");
mustMatch(
  "server-paper-engine-autobuy-patch.mjs",
  /monitorTrader\.gtt\.filter[\s\S]*paperMonitorDepthExecution\(quote\?\.depth\?\.asks[\s\S]*paperMonitorDepthExecution\(quote\?\.depth\?\.bids/,
  "automatic monitoring should quote active GTTs with full BUY depth and partial visible SELL depth"
);
mustInclude("server-upstox-quote-patch.mjs", "UPSTOX_QUOTE_MAX_KEYS = 500", "Upstox marking and monitoring must support all 500 position slots");
mustMatch("server-upstox-quote-patch.mjs", /for \(let index = 0; index < instrumentKeys\.length; index \+= UPSTOX_QUOTE_MAX_KEYS\)[\s\S]*batch_count: batches\.length/, "quote retrieval must batch beyond 500 keys without truncation");
mustMatch("server-paper-engine-autobuy-patch.mjs", /monitorTrader\.positions[\s\S]*side === "SELL"[\s\S]*tickets\.map/, "live positions and SELL GTT exits must precede new BUY candidates in quote priority");
mustInclude("server-paper-engine-autobuy-patch.mjs", "UPSTOX_FULL_VISIBLE_ASK_DEPTH_FOK", "automatic BUY must declare full visible ask-depth FOK execution");
mustInclude("server-paper-engine-autobuy-patch.mjs", "insufficient_upstox_ask_depth_for_full_paper_buy", "automatic BUY must reject partial visible ask depth explicitly");
mustInclude("server-paper-order-lifecycle-patch.mjs", "paperWholeShareRoundedCapValue", "one whole-share rounding must be governed explicitly");
mustMatch("server-paper-order-lifecycle-patch.mjs", /need\.buy_qty && !buyExecution[\s\S]*need\.sell_qty && !sellExecution[\s\S]*rows\.push/, "missing BUY depth must not suppress an independently executable live-position SELL monitor row");
mustMatch(
  "server-paper-order-lifecycle-patch.mjs",
  /resolvePaperOrderInstrumentKey\(state, body\)[\s\S]*paperRouteOrderReplay\(state, resolvedBody\)[\s\S]*await preparePaperMarketOrder\(resolvedBody\)[\s\S]*applyPaperOrderLifecycle\(state, prepared\.body\)/,
  "manual paper MARKET routes should resolve idempotency before fetching and authorizing a server quote"
);
mustMatch(
  "server-paper-order-lifecycle-patch.mjs",
  /ENV\.NODE_ENV === "test" && body\.test_fixture_price === true/,
  "fixture prices should only bypass quote authority in the test environment"
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
mustInclude("app-paper-order-lifecycle.js", 'instrument_key: row.instrument_key || ""', "workspace paper ticket should send the selected NSE instrument key");
mustInclude("app-ashstocks-trading-terminal.js", "instrument_key: instrumentKey(row)", "trading terminal paper ticket should send the selected NSE instrument key");

for (const text of [
  "Closed Trades",
  "data-paper-ledger-tab=\"closed\"",
  "closed_trades",
  "realized return",
  "Transaction costs paid",
  "Net realized P&L",
  "Net return",
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

const capitalPolicy = loadPaperCapitalPolicy();
const currentCapitalPolicy = JSON.parse(read("config/paper-trader-capital.v0.6.json") || "{}");
if (capitalPolicy.startingCapital !== 50000000) failures.push("capital policy: startingCapital must be 50000000");
if (capitalPolicy.minimumEntryValue !== 100000) failures.push("capital policy: minimumEntryValue must be 100000");
if (capitalPolicy.maximumCandidateEntries !== 80) failures.push("capital policy: maximumCandidateEntries must be 80");
if (capitalPolicy.minimumEntryPct !== 0.2) failures.push("capital policy: minimumEntryPct must be 0.2");
if (capitalPolicy.baseEntryPct !== 0.2) failures.push("capital policy: baseEntryPct must be 0.2");
if (capitalPolicy.maximumOpenPositions !== 500) failures.push("capital policy: maximumOpenPositions must be 500");
if (capitalPolicy.deploymentTargetPct !== 100) failures.push("capital policy: deploymentTargetPct must be 100");
if (capitalPolicy.transactionCostOneWayPct !== 0.08) failures.push("capital policy: transactionCostOneWayPct must be 0.08");
if (capitalPolicy.affordableOpenPositionsAtMinimum !== 500) failures.push("capital policy: ₹5 crore / ₹1 lakh must equal 500 affordable positions");
if (capitalPolicy.initialAffordableOpenPositionsAfterEntryCost !== 499) failures.push("capital policy: approved BUY cost must reduce initial affordable positions to 499");
for (const key of ["startingCapital", "minimumEntryValue", "maximumCandidateEntries", "maximumOpenPositions", "affordableOpenPositionsAtMinimum", "initialAffordableOpenPositionsAfterEntryCost", "transactionCostOneWayPct"]) {
  if (currentCapitalPolicy[key] !== capitalPolicy[key]) failures.push(`current capital mirror: ${key} drifted from the runtime registry`);
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
