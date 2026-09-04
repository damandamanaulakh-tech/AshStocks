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

for (const text of [
  'id="quickTradeDialog"',
  'id="quickTradeForm"',
  'id="quickTradeQty"',
  'id="quickTradePresets"',
  'id="quickTradeSubmit"',
  'id="quickTradeCancel"',
  './styles.css?v=20260903.1',
  './app.js?v=20260903.1',
  '<th>Action</th>'
]) mustInclude("index.html", text, "inline trade dialog and action column");

for (const text of [
  "function renderTradeActions(item",
  "function openPaperPosition(symbol)",
  "async function openQuickTrade(symbol, side)",
  "async function submitQuickTrade(event)",
  'data-quick-trade="BUY"',
  'data-quick-trade="SELL"',
  'source: "ash-stock-inline-controls"',
  'idempotency_key: `inline-',
  'order_type: "MARKET"',
  'paper_only: true',
  'broker_write_enabled: false',
  'api("/api/paper-trader/order"',
  "server-verified Upstox",
  "renderTradeActions(row, { compact: true })",
  "renderTradeActions(position, { compact: true })",
  "renderTradeActions(trade, { compact: true })",
  "renderTradeActions(order, { compact: true })"
]) mustInclude("app.js", text, "shared BUY ADD EXIT paper-order control");

for (const text of [
  ".inline-trade-actions",
  ".trade-action.buy",
  ".trade-action.sell",
  ".trade-action:disabled",
  ".quick-trade-dialog",
  ".quick-trade-submit.buy",
  ".quick-trade-submit.sell"
]) mustInclude("styles.css", text, "inline trade control styling");

if (failures.length) {
  console.error("AshStocks inline trade guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("AshStocks inline trade guard passed.");
