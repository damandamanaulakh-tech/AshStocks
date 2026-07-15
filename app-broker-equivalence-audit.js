(() => {
  const state = {
    scan: null,
    ledger: null,
    health: null,
    quoteSeen: 0,
    lastQuoteAt: "",
    message: "Checking broker-grade workflow evidence",
    booted: false
  };

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const url = String(args[0] || "");
    if (url.includes("/api/scanner/run")) captureJson(response, (payload) => {
      if (Array.isArray(payload.rows)) state.scan = payload;
      renderBrokerEquivalenceAudit();
    });
    if (url.includes("/api/paper-trader/orders")) captureJson(response, (payload) => {
      if (payload && payload.ok !== false) state.ledger = payload;
      renderBrokerEquivalenceAudit();
    });
    if (url.includes("/api/health")) captureJson(response, (payload) => {
      if (payload && payload.ok !== false) state.health = payload;
      renderBrokerEquivalenceAudit();
    });
    if (url.includes("/api/upstox/quote")) captureJson(response, (payload) => {
      if (payload && payload.ok !== false) {
        const count = Array.isArray(payload.quotes) ? payload.quotes.length : Object.keys(payload.data || {}).length;
        if (count) {
          state.quoteSeen += count;
          state.lastQuoteAt = new Date().toLocaleTimeString();
        }
      }
      renderBrokerEquivalenceAudit();
    });
    return response;
  };

  window.addEventListener("DOMContentLoaded", () => bootBrokerEquivalenceAudit().catch(() => {}));
  window.addEventListener("ashstocks:upstox-quote", () => {
    state.quoteSeen += 1;
    state.lastQuoteAt = new Date().toLocaleTimeString();
    renderBrokerEquivalenceAudit();
  });
  window.addEventListener("ashstocks:upstox-realtime-tick", () => {
    state.quoteSeen += 1;
    state.lastQuoteAt = new Date().toLocaleTimeString();
    renderBrokerEquivalenceAudit();
  });

  async function bootBrokerEquivalenceAudit() {
    if (state.booted) return;
    state.booted = true;
    await waitForShell();
    installBrokerEquivalenceAudit();
    await refreshEvidence();
    renderBrokerEquivalenceAudit();
    setInterval(() => refreshEvidence().catch(() => {}), 90000);
  }

  function waitForShell() {
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (document.querySelector("#upstoxWorkspaceView") || document.querySelector("#brokerReportsView") || document.querySelector("#dataView")) return resolve();
        if (Date.now() - started > 12000) return resolve();
        setTimeout(tick, 80);
      };
      tick();
    });
  }

  function installBrokerEquivalenceAudit() {
    installDashboardAudit();
    installReportsAudit();
    installSettingsAudit();
  }

  function installDashboardAudit() {
    const view = document.querySelector("#upstoxWorkspaceView");
    if (!view || document.querySelector("#brokerEquivalenceAudit")) return;
    const anchor = view.querySelector(".uw-main-grid") || view.firstElementChild;
    const html = `
      <section class="panel broker-equivalence-audit" id="brokerEquivalenceAudit">
        <div class="panel-header">
          <div><span class="eyebrow">Upstox-Style Equivalence Gate</span><h3>Broker Workflow Checker</h3></div>
          <span id="brokerEquivalenceVerdict" class="equivalence-verdict">NOT_EQUIVALENT_YET</span>
        </div>
        <div class="equivalence-summary" id="brokerEquivalenceSummary"></div>
        <div class="equivalence-grid" id="brokerEquivalenceGrid"></div>
        <div class="equivalence-note" id="brokerEquivalenceNote"></div>
      </section>
    `;
    if (anchor) anchor.insertAdjacentHTML("beforebegin", html);
    else view.insertAdjacentHTML("afterbegin", html);
  }

  function installReportsAudit() {
    const view = document.querySelector("#brokerReportsView");
    if (!view || document.querySelector("#brokerReportsEquivalence")) return;
    const anchor = view.querySelector(".broker-page-head") || view.firstElementChild;
    const html = `<section class="panel broker-equivalence-audit compact" id="brokerReportsEquivalence"><div class="panel-header"><h3>Broker Equivalence Report</h3><span id="brokerReportsEquivalenceState">Checking</span></div><div class="equivalence-table-wrap"><table><thead><tr><th>Workflow</th><th>Status</th><th>Evidence</th><th>Missing</th></tr></thead><tbody id="brokerReportsEquivalenceRows"></tbody></table></div></section>`;
    if (anchor) anchor.insertAdjacentHTML("afterend", html);
    else view.insertAdjacentHTML("afterbegin", html);
  }

  function installSettingsAudit() {
    const view = document.querySelector("#brokerSettingsView");
    if (!view || document.querySelector("#brokerSettingsEquivalence")) return;
    view.insertAdjacentHTML("beforeend", `<section class="panel broker-equivalence-audit compact" id="brokerSettingsEquivalence"><div class="panel-header"><h3>Product Rule Lock</h3><span>Paper execution only</span></div><div class="equivalence-rules"><strong>AshStocks rule:</strong><span>Real data, real workflow, real paper ledger, no broker write order.</span><strong>Failure rule:</strong><span>Any blank feed must show DATA_NEEDED and must not be replaced by fake values.</span><strong>Equivalence rule:</strong><span>Do not call this Upstox-equivalent until all required workflow rows are ACTIVE except live-money order placement.</span></div></section>`);
  }

  async function refreshEvidence() {
    await Promise.allSettled([
      fetchJson("/api/health").then((payload) => { if (payload?.ok !== false) state.health = payload; }),
      fetchJson("/api/paper-trader/orders").then((payload) => { if (payload?.ok !== false) state.ledger = payload; })
    ]);
  }

  function renderBrokerEquivalenceAudit() {
    installBrokerEquivalenceAudit();
    const items = auditItems();
    const active = items.filter((item) => item.status === "ACTIVE").length;
    const partial = items.filter((item) => item.status === "PARTIAL").length;
    const needed = items.filter((item) => item.status === "DATA_NEEDED").length;
    const locked = items.filter((item) => item.status === "LOCKED_BY_RULE").length;
    const verdict = needed === 0 && partial === 0 ? "BROKER_WORKFLOW_READY_PAPER_ONLY" : "NOT_UPSTOX_EQUIVALENT_YET";

    const verdictNode = document.querySelector("#brokerEquivalenceVerdict");
    if (verdictNode) {
      verdictNode.textContent = verdict;
      verdictNode.className = `equivalence-verdict ${verdict === "BROKER_WORKFLOW_READY_PAPER_ONLY" ? "ready" : "not-ready"}`;
    }

    const summary = document.querySelector("#brokerEquivalenceSummary");
    if (summary) {
      summary.innerHTML = [
        ["ACTIVE", active],
        ["PARTIAL", partial],
        ["DATA_NEEDED", needed],
        ["LOCKED", locked],
        ["Quote Events", state.quoteSeen],
        ["Scanner Rows", rows().length]
      ].map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
    }

    const grid = document.querySelector("#brokerEquivalenceGrid");
    if (grid) grid.innerHTML = items.map(renderItemCard).join("");

    const note = document.querySelector("#brokerEquivalenceNote");
    if (note) note.innerHTML = `<strong>Current truth:</strong><span>${escapeHtml(state.message)}. Paper trading is intentional: money is simulated, but scanner, quote, parameters, candles, order book, positions, GTT and reports must behave like a broker workflow.</span>`;

    const reportsState = document.querySelector("#brokerReportsEquivalenceState");
    if (reportsState) reportsState.textContent = verdict;
    const table = document.querySelector("#brokerReportsEquivalenceRows");
    if (table) table.innerHTML = items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td><span class="equivalence-status ${item.status}">${escapeHtml(item.status)}</span></td><td>${escapeHtml(item.evidence)}</td><td>${escapeHtml(item.missing)}</td></tr>`).join("");
  }

  function auditItems() {
    const r = rows();
    const ledger = state.ledger || {};
    const orders = arrayFrom(ledger.orders, ledger.paperTrader?.orders, ledger.status?.orders);
    const trades = arrayFrom(ledger.trades, ledger.paperTrader?.trades, ledger.status?.trades);
    const positions = arrayFrom(ledger.positions, ledger.paperTrader?.positions, ledger.status?.positions);
    const gtt = arrayFrom(ledger.gtt, ledger.paperTrader?.gtt, ledger.status?.gtt);
    const terminalReady = Boolean(document.querySelector("#ashBrokerTerminal"));
    const realtimeMonitorReady = Boolean(document.querySelector("#upstoxRealtimeMonitor"));
    const paramsReady = Boolean(document.querySelector("#uwParameterKeyBoard") || document.querySelector("#uwPianoQuick") || document.querySelector("#parameterPiano") || document.querySelector("#abtParamGrid"));
    const quoteReady = state.quoteSeen > 0 || Object.keys(window.__ashstocksUpstoxQuoteCache || {}).length > 0;
    const scannerReady = r.length > 0;
    const candleRows = r.filter((row) => row.candle_status || row.candle_patterns?.length || row.candle_engine || row.candles?.length);
    const tokenReady = Boolean(state.health?.upstox?.token_visible || state.health?.key_visible || state.health?.token_visible);
    const mongoReady = String(state.health?.storage?.type || state.health?.storage || "").toLowerCase().includes("mongo") || state.health?.persistent === true;

    return [
      item("Unified broker terminal", terminalReady ? "ACTIVE" : "DATA_NEEDED", terminalReady ? "AshStocks terminal mounted with market watch, chart, ticket, parameters, candles and ledger panels" : "#ashBrokerTerminal not mounted", terminalReady ? "none" : "Load app-ashstocks-broker-terminal.js and CSS"),
      item("NSE universe and scanner", scannerReady ? "ACTIVE" : "DATA_NEEDED", scannerReady ? `${r.length} scanner rows in browser state` : "No scanner run captured in this browser session", scannerReady ? "none" : "Run scanner or Upstox historical scan"),
      item("2000 parameter piano", paramsReady ? "ACTIVE" : "DATA_NEEDED", paramsReady ? "Parameter board exists in DOM" : "Parameter board not found on current page", paramsReady ? "none" : "Load parameter board and exact-click detail"),
      item("Candle parameters 681-800", candleRows.length ? "ACTIVE" : document.querySelector("#uwCandleTriggerTape") || document.querySelector("#abtCandleBox") ? "PARTIAL" : "DATA_NEEDED", candleRows.length ? `${candleRows.length} rows have candle evidence` : "Candle tape exists but row candle evidence is not present", candleRows.length ? "none" : "Upstox historical candles or server candle_status rows"),
      item("Upstox quote and depth", quoteReady ? "ACTIVE" : document.querySelector("#uwMarketWatchPulse") || document.querySelector("#ashBrokerTerminal") ? "PARTIAL" : "DATA_NEEDED", quoteReady ? `${state.quoteSeen} quote events, last ${state.lastQuoteAt || "unknown"}` : "Quote module loaded without quote evidence yet", quoteReady ? "none" : "Valid Upstox token and quote request during market/data availability"),
      item("Realtime quote polling", realtimeMonitorReady && quoteReady ? "ACTIVE" : realtimeMonitorReady ? "PARTIAL" : "DATA_NEEDED", realtimeMonitorReady ? "Upstox realtime monitor mounted with 15s quote polling fallback" : "#upstoxRealtimeMonitor not mounted", quoteReady ? "none" : "Need successful /api/upstox/quote tick payload"),
      item("Broker market watch", document.querySelector("#brokerMarketWatchPulse") || document.querySelector("#uwMarketWatchPulse") || document.querySelector("#abtWatchBody") ? "ACTIVE" : "DATA_NEEDED", document.querySelector("#abtWatchBody") ? "Unified terminal market watch mounted" : document.querySelector("#brokerMarketWatchPulse") ? "Broker market watch pulse mounted" : document.querySelector("#uwMarketWatchPulse") ? "Dashboard quote pulse mounted" : "No market watch pulse in DOM", "Mount watchlist quote strip and table"),
      item("Symbol workspace and chart", document.querySelector("#uwSymbolWorkspace") || document.querySelector("#abtChartBox") ? "ACTIVE" : "PARTIAL", document.querySelector("#abtChartBox") ? "Unified terminal chart panel mounted" : document.querySelector("#uwSymbolWorkspace") ? "Selected symbol workspace mounted" : "Main dashboard has selected-stock mini chart only", document.querySelector("#uwSymbolWorkspace") || document.querySelector("#abtChartBox") ? "none" : "Full broker symbol chart panel"),
      item("Buy Sell GTT ticket", document.querySelector("#uwOrderTicket button[data-paper-action]") || document.querySelector("#brokerHubOrderBox") || document.querySelector("#abtTicket") ? "ACTIVE" : "PARTIAL", document.querySelector("#abtTicket") ? "Unified terminal paper ticket mounted" : document.querySelector("#uwOrderTicket") ? "Paper ticket mounted and lifecycle script can bind actions" : "Ticket not visible on current view", "Keep only paper order POST, no broker write"),
      item("Order book and trade book", orders.length || trades.length ? "ACTIVE" : document.querySelector("#riskOrdersPanel") || document.querySelector("#uwPaperLedgerPanel") || document.querySelector("#abtOrderBook") ? "PARTIAL" : "DATA_NEEDED", `${orders.length} orders, ${trades.length} trades in ledger`, orders.length || trades.length ? "none" : "Create paper order to prove lifecycle"),
      item("Positions and exits", positions.length ? "ACTIVE" : document.querySelector("#riskPositionsPanel") || document.querySelector("#abtPositions") ? "PARTIAL" : "DATA_NEEDED", `${positions.length} positions in paper ledger`, positions.length ? "none" : "Paper filled BUY position or imported ledger position"),
      item("GTT target stop plans", gtt.length ? "ACTIVE" : document.querySelector("#riskGttPanel") || document.querySelector("#abtPositions") ? "PARTIAL" : "DATA_NEEDED", `${gtt.length} GTT plans in paper ledger`, gtt.length ? "none" : "Create paper GTT from signal/ticket"),
      item("Reports and audit trail", document.querySelector("#brokerReportsEquivalenceRows") || document.querySelector("#uwReportBox") ? "ACTIVE" : "DATA_NEEDED", "Equivalence report and scanner summary are rendered when reports/dashboard exist", "Add exportable report later"),
      item("Funds and risk console", document.querySelector("#paperRiskConsole") ? "ACTIVE" : "DATA_NEEDED", document.querySelector("#paperRiskConsole") ? "Paper broker risk console mounted" : "Risk console not mounted", "Funds, exposure and P&L panel"),
      item("Data persistence", mongoReady ? "ACTIVE" : "PARTIAL", mongoReady ? "Mongo/persistent storage reported by health" : "Health did not prove Mongo persistence in this browser check", mongoReady ? "none" : "Fix MONGODB_URI if Render ready still falls back to file"),
      item("Upstox auth readiness", tokenReady ? "ACTIVE" : "DATA_NEEDED", tokenReady ? "Upstox key/token visible as yes/no in health" : "Health did not prove Upstox key/token", tokenReady ? "none" : "Set Render env UPSTOX_API_KEY and UPSTOX_ACCESS_TOKEN"),
      item("Realtime websocket ticks", "DATA_NEEDED", "No websocket tick stream is implemented yet; polling fallback is not the same as websocket streaming", "Add safe websocket/streaming quote layer"),
      item("Live money broker order", "LOCKED_BY_RULE", "Intentionally disabled. AshStocks paper execution only.", "none by product rule")
    ];
  }

  function renderItemCard(item) {
    return `<article class="equivalence-card ${item.status}"><div><strong>${escapeHtml(item.name)}</strong><span class="equivalence-status ${item.status}">${escapeHtml(item.status)}</span></div><p>${escapeHtml(item.evidence)}</p><small>${escapeHtml(item.missing)}</small></article>`;
  }

  function item(name, status, evidence, missing) { return { name, status, evidence, missing }; }
  function rows() { return Array.isArray(state.scan?.rows) ? state.scan.rows : []; }
  function arrayFrom(...values) { return values.find(Array.isArray) || []; }

  async function fetchJson(path) {
    try {
      const response = await fetch(path);
      if (response.status === 401) return {};
      return await response.json();
    } catch (_) {
      return {};
    }
  }

  function captureJson(response, callback) {
    response.clone().json().then((payload) => callback(payload)).catch(() => {});
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }
})();