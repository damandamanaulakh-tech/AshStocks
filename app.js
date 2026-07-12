const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const state = {
  parameters: [],
  universe: [],
  rows: [],
  summary: { total: 0, SELECT: 0, WATCH: 0, REJECT: 0, BLOCKED: 0, DATA_NEEDED: 0 },
  activeView: "scanner",
  lastPayload: null,
  sectors: []
};

const DECISIONS = ["SELECT", "WATCH", "REJECT", "BLOCKED", "DATA_NEEDED"];
const UPSTOX_NSE_INSTRUMENTS_URL = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz";
const MAX_MASTER_POOL = 1000;

function init() {
  document.body.classList.toggle("dark", localStorage.getItem("ashstocks-theme") === "dark");
  setDefaultDates();
  bindEvents();
  refreshIcons();
  boot();
}

async function boot() {
  try {
    await Promise.all([loadReady(), loadParameters()]);
    await runServerScan();
  } catch (error) {
    setMessage(error.message, "negative");
  }
}

function bindEvents() {
  $$("[data-view]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });
  $("#themeBtn")?.addEventListener("click", toggleTheme);
  $("#defaultPoolBtn")?.addEventListener("click", async () => {
    state.universe = [];
    $("#csvInput").value = "";
    await loadParameters();
    await runServerScan();
  });
  $("#masterPoolBtn")?.addEventListener("click", loadUpstoxMasterPool);
  $("#runScanBtn")?.addEventListener("click", runServerScan);
  $("#runUpstoxBtn")?.addEventListener("click", runUpstoxScan);
  $("#exportBtn")?.addEventListener("click", exportRows);
  $("#templateBtn")?.addEventListener("click", loadTemplate);
  $("#applyCsvBtn")?.addEventListener("click", applyCsv);
  $("#csvFile")?.addEventListener("change", readCsvFile);
  $("#searchInput")?.addEventListener("input", renderRows);
  $("#decisionFilter")?.addEventListener("change", renderRows);
  $("#sectorFilter")?.addEventListener("change", renderRows);
}

async function loadReady() {
  const payload = await api("/api/ready");
  const upstox = payload.upstox || {};
  $("#connectionLabel").textContent = payload.storage ? `${payload.storage} storage` : "backend ready";
  $("#runtimeLabel").textContent = payload.warning || "Render backend";
  $("#upstoxLabel").textContent = upstox.token_visible ? "Token visible" : "Token missing";
}

async function loadParameters() {
  const payload = await api("/api/scanner/parameters");
  state.parameters = payload.parameters || [];
  if (!state.universe.length) state.universe = payload.universe || [];
  renderParameters();
}

async function runServerScan() {
  setBusy(true, "Running scanner");
  try {
    const payload = await api("/api/scanner/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ universe: state.universe })
    });
    applyScanPayload(payload, "Server scan complete");
  } catch (error) {
    setMessage(error.message, "negative");
  } finally {
    setBusy(false);
  }
}

async function runUpstoxScan() {
  setBusy(true, "Fetching Upstox candles");
  try {
    const payload = await api("/api/scanner/run-upstox", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        universe: state.universe,
        from: $("#fromDate").value,
        to: $("#toDate").value
      })
    });
    const failures = payload.failures?.length ? `, ${payload.failures.length} fetch gaps` : "";
    applyScanPayload(payload, `Upstox scan complete${failures}`);
  } catch (error) {
    setMessage(error.message, "negative");
  } finally {
    setBusy(false);
  }
}

async function loadUpstoxMasterPool() {
  setBusy(true, "Loading Upstox NSE master");
  try {
    const instruments = await fetchUpstoxNseMaster();
    const rows = instrumentsToUniverse(instruments);
    if (!rows.length) throw new Error("No NSE equity instruments found in Upstox master");
    state.universe = rows;
    $("#csvInput").value = rowsToCsv(rows);
    await runServerScan();
    switchView("scanner");
    setMessage(`Loaded ${rows.length} NSE equity instruments from Upstox master`, "positive");
  } catch (error) {
    setMessage(error.message, "negative");
  } finally {
    setBusy(false);
  }
}

async function fetchUpstoxNseMaster() {
  const response = await fetch(UPSTOX_NSE_INSTRUMENTS_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Upstox NSE master unavailable: ${response.status}`);
  const buffer = await response.arrayBuffer();
  const plainText = new TextDecoder().decode(buffer);
  try {
    return JSON.parse(plainText);
  } catch {
    if (!("DecompressionStream" in window)) throw new Error("Browser cannot decompress Upstox NSE master file");
    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
    const text = await new Response(stream).text();
    return JSON.parse(text);
  }
}

function instrumentsToUniverse(instruments) {
  const seen = new Set();
  return (Array.isArray(instruments) ? instruments : [])
    .filter((item) => item?.segment === "NSE_EQ" && item?.exchange === "NSE")
    .filter((item) => ["EQ", "BE"].includes(String(item.instrument_type || "").toUpperCase()))
    .map((item) => ({
      symbol: item.trading_symbol || item.short_name || item.name,
      name: item.name || item.short_name || item.trading_symbol,
      sector: "NSE Equity",
      exchange: "NSE",
      instrument_key: item.instrument_key,
      data_source: "Upstox NSE instrument master"
    }))
    .filter((row) => row.symbol && row.instrument_key)
    .filter((row) => {
      const key = `${row.symbol}|${row.instrument_key}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_MASTER_POOL);
}

function rowsToCsv(rows) {
  const headers = ["symbol", "name", "sector", "exchange", "instrument_key", "data_source"];
  return [headers.join(",")]
    .concat(rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")))
    .join("\n");
}

function applyScanPayload(payload, message) {
  state.lastPayload = payload;
  state.rows = payload.rows || [];
  state.summary = payload.summary || state.summary;
  state.sectors = [...new Set(state.rows.map((row) => row.sector).filter(Boolean))].sort();
  renderSummary();
  renderSectorFilter();
  renderRows();
  setMessage(message, "positive");
}

function renderSummary() {
  const summary = state.summary;
  const items = [
    ["Universe", summary.total ?? state.rows.length, "total"],
    ["SELECT", summary.SELECT || 0, "select"],
    ["WATCH", summary.WATCH || 0, "watch"],
    ["BLOCKED", summary.BLOCKED || 0, "blocked"],
    ["DATA_NEEDED", summary.DATA_NEEDED || 0, "needed"]
  ];
  $("#summaryGrid").innerHTML = items
    .map(([label, value, tone]) => `
      <article class="summary-tile ${tone}">
        <span>${label}</span>
        <strong>${value}</strong>
      </article>
    `)
    .join("");
}

function renderSectorFilter() {
  const select = $("#sectorFilter");
  const current = select.value || "ALL";
  select.innerHTML = `<option value="ALL">All</option>${state.sectors.map((sector) => `<option value="${escapeAttr(sector)}">${escapeHtml(sector)}</option>`).join("")}`;
  select.value = state.sectors.includes(current) ? current : "ALL";
}

function visibleRows() {
  const query = ($("#searchInput").value || "").trim().toLowerCase();
  const decision = $("#decisionFilter").value;
  const sector = $("#sectorFilter").value;
  return state.rows.filter((row) => {
    const text = `${row.symbol} ${row.name} ${row.sector} ${row.reason}`.toLowerCase();
    return (!query || text.includes(query)) && (decision === "ALL" || row.decision === decision) && (sector === "ALL" || row.sector === sector);
  });
}

function renderRows() {
  const rows = visibleRows();
  const body = $("#resultBody");
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="8" class="empty-cell">No rows match the current filters.</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map((row) => `
      <tr>
        <td>
          <strong>${escapeHtml(row.symbol)}</strong>
          <span>${escapeHtml(row.name || "")}</span>
        </td>
        <td>${escapeHtml(row.sector || "")}</td>
        <td><span class="decision ${row.decision}">${row.decision}</span></td>
        <td>${formatNumber(row.score)}</td>
        <td>${formatPct(row.return_6m_pct)}</td>
        <td>${formatPct(row.return_12m_pct)}</td>
        <td>${formatLiquidity(row)}</td>
        <td class="reason-cell">${escapeHtml(row.reason || "")}</td>
      </tr>
    `)
    .join("");
}

function renderParameters() {
  $("#parameterCount").textContent = `${state.parameters.length} active`;
  $("#parameterGrid").innerHTML = state.parameters
    .map((parameter) => `
      <article class="parameter-item">
        <div>
          <span class="eyebrow">${escapeHtml(parameter.group)}</span>
          <strong>${escapeHtml(parameter.label)}</strong>
        </div>
        <span class="param-threshold">${escapeHtml(parameter.threshold)}</span>
        <small>${parameter.gate ? "Hard gate" : `${parameter.weight}% weight`}</small>
      </article>
    `)
    .join("");
}

function switchView(view) {
  state.activeView = view;
  $$("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $$("[data-view-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.viewPanel === view));
  $("#pageTitle").textContent = view === "data" ? "Data" : view === "parameters" ? "Parameters" : "Scanner";
  refreshIcons();
}

async function loadTemplate() {
  try {
    const response = await fetch("/api/scanner/template");
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!response.ok) throw new Error("Template unavailable");
    $("#csvInput").value = await response.text();
    setMessage("Template loaded", "positive");
  } catch (error) {
    setMessage(error.message, "negative");
  }
}

async function readCsvFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  $("#csvInput").value = await file.text();
  await applyCsv();
}

async function applyCsv() {
  try {
    const rows = csvToObjects($("#csvInput").value);
    if (!rows.length) throw new Error("CSV has no stock rows");
    state.universe = rows;
    setMessage(`${rows.length} stock rows applied`, "positive");
    await runServerScan();
    switchView("scanner");
  } catch (error) {
    setMessage(error.message, "negative");
  }
}

function csvToObjects(text) {
  const records = parseCsv(text).filter((row) => row.some((cell) => String(cell).trim()));
  if (records.length < 2) return [];
  const headers = records[0].map((header) => normalizeHeader(header));
  return records.slice(1).map((record) => {
    const row = {};
    headers.forEach((header, index) => {
      if (header) row[header] = record[index] ?? "";
    });
    return row;
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

function normalizeHeader(header) {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function exportRows() {
  const rows = visibleRows();
  const headers = ["symbol", "name", "sector", "decision", "score", "return_6m_pct", "return_12m_pct", "adv20", "rupee_turnover_cr", "reason"];
  const csv = [headers.join(",")]
    .concat(rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `ashstocks_scan_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.href = "/login";
    throw new Error("Login required");
  }
  if (!response.ok || payload.ok === false) throw new Error(payload.error || `Request failed: ${response.status}`);
  return payload;
}

function setDefaultDates() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 470);
  $("#toDate").value = to.toISOString().slice(0, 10);
  $("#fromDate").value = from.toISOString().slice(0, 10);
}

function toggleTheme() {
  const dark = !document.body.classList.contains("dark");
  document.body.classList.toggle("dark", dark);
  localStorage.setItem("ashstocks-theme", dark ? "dark" : "light");
  refreshIcons();
}

function setBusy(busy, message = "") {
  $$("button").forEach((button) => {
    if (!button.closest(".nav-list")) button.disabled = busy;
  });
  if (message) setMessage(message);
}

function setMessage(message, tone = "") {
  const line = $("#messageLine");
  line.textContent = message;
  line.className = `alert-line ${tone}`.trim();
}

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "-";
}

function formatPct(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? "-" : `${Number(value).toFixed(2)}%`;
}

function formatLiquidity(row) {
  const adv = Number.isFinite(Number(row.adv20)) ? compact(row.adv20) : "-";
  const turnover = Number.isFinite(Number(row.rupee_turnover_cr)) ? `${Number(row.rupee_turnover_cr).toFixed(1)} cr` : "-";
  return `${adv} / ${turnover}`;
}

function compact(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  if (number >= 10000000) return `${(number / 10000000).toFixed(1)}Cr`;
  if (number >= 100000) return `${(number / 100000).toFixed(1)}L`;
  if (number >= 1000) return `${(number / 1000).toFixed(1)}K`;
  return String(Math.round(number));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return map[char];
  });
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function refreshIcons() {
  window.lucide?.createIcons();
}

window.addEventListener("DOMContentLoaded", init);
