const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const state = {
  parameters: [],
  framework: null,
  universe: [],
  rows: [],
  summary: { total: 0, SELECT: 0, WATCH: 0, REJECT: 0, BLOCKED: 0, DATA_NEEDED: 0 },
  activeView: "scanner",
  lastPayload: null,
  dataBank: null,
  sectors: []
};

const DECISIONS = ["SELECT", "WATCH", "REJECT", "BLOCKED", "DATA_NEEDED"];

function init() {
  document.body.classList.toggle("dark", localStorage.getItem("ashstocks-theme") === "dark");
  setDefaultDates();
  bindEvents();
  refreshIcons();
  boot();
}

async function boot() {
  try {
    await Promise.all([loadReady(), loadParameters(), loadFramework()]);
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
  state.dataBank = payload.data_bank || state.dataBank;
  $("#connectionLabel").textContent = payload.storage ? `${payload.storage} storage` : "backend ready";
  $("#runtimeLabel").textContent = dataBankRuntimeLabel(payload);
  $("#upstoxLabel").textContent = upstox.token_visible ? "Token visible" : "Token missing";
}

function dataBankRuntimeLabel(payload = {}) {
  if (payload.warning) return payload.warning;
  const count = payload.data_bank?.universe_count;
  if (Number.isFinite(Number(count))) return `${payload.engine || "engine"} | ${count} rows`;
  return payload.engine || "Render backend";
}

async function loadParameters() {
  const payload = await api("/api/scanner/parameters");
  state.parameters = payload.parameters || [];
  state.framework = payload.framework || state.framework;
  state.dataBank = payload.data_bank || state.dataBank;
  state.universe = payload.universe || [];
  renderParameters();
}

async function loadFramework() {
  const payload = await api("/api/framework");
  state.framework = payload;
  renderFramework();
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
    const loaded = await api("/api/data-bank/load-upstox-nse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    state.dataBank = loaded.data_bank || state.dataBank;
    await loadParameters();
    $("#csvInput").value = rowsToCsv(loaded.sample || state.universe.slice(0, 25));
    await runServerScan();
    switchView("scanner");
    setMessage(`Loaded ${loaded.saved_universe} NSE equity rows into data bank`, "positive");
  } catch (error) {
    setMessage(error.message, "negative");
  } finally {
    setBusy(false);
  }
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
    ["DATA GAP", summary.DATA_NEEDED || 0, "needed"]
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
    const text = `${row.symbol} ${row.name} ${row.sector} ${row.reason} ${formatTarget(row)} ${formatPaper(row)}`.toLowerCase();
    return (!query || text.includes(query)) && (decision === "ALL" || row.decision === decision) && (sector === "ALL" || row.sector === sector);
  });
}

function renderRows() {
  const rows = visibleRows();
  const body = $("#resultBody");
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="10" class="empty-cell">No rows match the current filters.</td></tr>`;
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
        <td>${formatScorePair(row)}</td>
        <td>${formatReturnPair(row)}</td>
        <td>${escapeHtml(formatTarget(row))}</td>
        <td>${escapeHtml(formatPaper(row))}</td>
        <td>${escapeHtml(formatLiquidity(row))}</td>
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

function renderFramework() {
  const framework = state.framework || {};
  const layers = framework.layers || [];
  const feeds = framework.required_feeds || [];
  $("#frameworkCount").textContent = `${layers.length} layers`;
  $("#frameworkTruth").innerHTML = framework.truth
    ? `
      <article class="framework-truth">
        <strong>${escapeHtml(framework.product || "AshStocks framework")}</strong>
        <span>Paper only: ${framework.truth.paper_only ? "YES" : "NO"}</span>
        <span>Live trade: ${framework.truth.live_trade ? "YES" : "NO"}</span>
        <p>${escapeHtml(framework.truth.reason || "")}</p>
      </article>
    `
    : "";
  $("#frameworkGrid").innerHTML = layers
    .map((layer) => `
      <article class="framework-card">
        <div class="framework-card-head">
          <span class="eyebrow">${escapeHtml(layer.id)}</span>
          <span class="status-pill">${escapeHtml(layer.status)}</span>
        </div>
        <strong>${escapeHtml(layer.name)}</strong>
        <p>${escapeHtml(layer.role)}</p>
        <small>${escapeHtml(layer.product_use || "")}</small>
      </article>
    `)
    .join("");
  $("#feedGrid").innerHTML = feeds
    .map((feed) => `
      <article class="feed-card">
        <strong>${escapeHtml(feed.name)}</strong>
        <span class="status-pill">${escapeHtml(feed.status)}</span>
        <small>Priority ${escapeHtml(feed.priority)} | ${escapeHtml(feed.minimum_history)}</small>
        <p>${escapeHtml((feed.unlocks || []).join(", "))}</p>
      </article>
    `)
    .join("");
}

function switchView(view) {
  state.activeView = view;
  $$("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $$("[data-view-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.viewPanel === view));
  const titles = { scanner: "Scanner", parameters: "Parameters", framework: "Framework", data: "Data" };
  $("#pageTitle").textContent = titles[view] || "Scanner";
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
    const saved = await api("/api/state", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ universe: rows })
    });
    state.universe = saved.state?.universe || rows;
    setMessage(`${state.universe.length} stock rows saved`, "positive");
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
  const headers = [
    "symbol",
    "name",
    "sector",
    "decision",
    "score",
    "momentum_score",
    "quality_score",
    "return_6m_pct",
    "return_12m_pct",
    "target_potential_label",
    "target_potential_left_pct",
    "paper_order_status",
    "paper_order_qty",
    "paper_order_value",
    "adv20",
    "rupee_turnover_cr",
    "reason"
  ];
  const csv = [headers.join(",")]
    .concat(rows.map((row) => headers.map((header) => csvCell(exportValue(row, header))).join(",")))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `ashstocks_scan_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportValue(row, header) {
  if (header === "target_potential_label") return row.target_potential?.label || "";
  if (header === "target_potential_left_pct") return row.target_potential?.potential_left_pct ?? "";
  if (header === "paper_order_status") return row.paper_order?.status || "";
  if (header === "paper_order_qty") return row.paper_order?.qty ?? "";
  if (header === "paper_order_value") return row.paper_order?.estimated_value ?? row.portfolio?.position_value ?? "";
  return row[header];
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

function formatScorePair(row) {
  return `${formatNumber(row.momentum_score)} / ${formatNumber(row.quality_score)}`;
}

function formatReturnPair(row) {
  return `${formatPct(row.return_6m_pct)} / ${formatPct(row.return_12m_pct)}`;
}

function formatTarget(row) {
  const target = row.target_potential || {};
  if (!target.label) return "-";
  const potential = Number.isFinite(Number(target.potential_left_pct)) ? ` ${Number(target.potential_left_pct).toFixed(1)}%` : "";
  return `${target.label}${potential}`;
}

function formatPaper(row) {
  const order = row.paper_order || {};
  if (order.status === "READY") return `READY ${order.qty || 0}`;
  return order.status || "-";
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
