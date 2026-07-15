(() => {
  const state = { plan: null, status: null, market: null, booted: false };
  const VIEWS = [
    { id: "brokerMarkets", label: "Markets", icon: "candlestick-chart" },
    { id: "brokerWatchlist", label: "Watchlist", icon: "star" },
    { id: "brokerSignals", label: "Signals", icon: "radio-tower" },
    { id: "brokerOrders", label: "Orders", icon: "book-open-check" },
    { id: "brokerPositions", label: "Positions", icon: "briefcase-business" },
    { id: "brokerGtt", label: "GTT", icon: "alarm-clock-check" },
    { id: "brokerReports", label: "Reports", icon: "file-bar-chart" },
    { id: "brokerSettings", label: "Settings", icon: "settings" }
  ];

  function $(selector) { return document.querySelector(selector); }
  function $all(selector) { return Array.from(document.querySelectorAll(selector)); }

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

  window.addEventListener("DOMContentLoaded", () => {
    bootBrokerShell().catch((error) => setLine(error.message || String(error), "negative"));
  });

  async function bootBrokerShell() {
    if (state.booted) return;
    state.booted = true;
    await waitForBaseShell();
    installBrokerNav();
    installBrokerViews();
    await refreshBrokerData();
    window.addEventListener("ashstocks:paper-plan", (event) => {
      state.plan = event.detail?.plan || state.plan;
      renderBrokerViews();
    });
    window.setInterval(() => refreshBrokerData().catch(() => {}), 120000);
  }

  function waitForBaseShell() {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        if ($(".nav-list") && $("#dataView")) return resolve();
        if (Date.now() - started > 10000) return reject(new Error("App shell did not mount"));
        setTimeout(tick, 100);
      };
      tick();
    });
  }

  function installBrokerNav() {
    const nav = $(".nav-list");
    if (!nav || $("[data-broker-view]")) return;
    const q1 = $('.nav-list a[href="/q1"]');
    for (const view of VIEWS) {
      const button = document.createElement("button");
      button.className = "nav-item";
      button.type = "button";
      button.dataset.brokerView = view.id;
      button.innerHTML = `<i data-lucide="${view.icon}" aria-hidden="true"></i><span>${escapeHtml(view.label)}</span>`;
      button.addEventListener("click", () => switchBrokerView(view.id, view.label));
      nav.insertBefore(button, q1 || null);
    }
    window.lucide?.createIcons();
  }

  function installBrokerViews() {
    const anchor = $("#dataView");
    if (!anchor || $("#brokerMarketsView")) return;
    anchor.insertAdjacentHTML("afterend", `
      <section class="view broker-view" id="brokerMarketsView" data-broker-panel="brokerMarkets">
        <div class="broker-page-head"><div><span class="eyebrow">Market Terminal</span><h3>Markets</h3></div><button class="secondary-button" id="brokerRefreshBtn" type="button"><i data-lucide="refresh-cw" aria-hidden="true"></i><span>Refresh</span></button></div>
        <div class="broker-control-strip" id="brokerControlStrip"></div>
        <div class="broker-market-strip" id="brokerMarketStrip"></div>
        <div class="broker-grid two"><section class="panel"><div class="panel-header"><h3>Session Context</h3><span id="brokerSessionStamp">Waiting</span></div><div id="brokerMarketContext" class="broker-copy"></div></section><section class="panel"><div class="panel-header"><h3>Parameter Dropdowns</h3><span>Real selection controls</span></div><div id="brokerParameterSelectors" class="broker-form-grid"></div></section></div>
      </section>
      <section class="view broker-view" id="brokerWatchlistView" data-broker-panel="brokerWatchlist">
        <div class="broker-page-head"><div><span class="eyebrow">Watchlists</span><h3>Selected, Target Room, Event, Theme</h3></div></div>
        <div class="broker-grid three" id="brokerWatchlists"></div>
      </section>
      <section class="view broker-view" id="brokerSignalsView" data-broker-panel="brokerSignals">
        <div class="broker-page-head"><div><span class="eyebrow">Signal Engine</span><h3>AshStocks Signals</h3></div></div>
        <div class="broker-grid two"><section class="panel"><div class="panel-header"><h3>Top Signals</h3><span id="brokerSignalCount">0</span></div><div class="broker-table-wrap"><table><thead><tr><th>Stock</th><th>Signal</th><th>Score</th><th>Risk</th><th>Action</th></tr></thead><tbody id="brokerSignalBody"></tbody></table></div></section><section class="panel"><div class="panel-header"><h3>Signal Evidence</h3><span>Paper only</span></div><div id="brokerSignalEvidence" class="broker-copy"></div></section></div>
      </section>
      <section class="view broker-view" id="brokerOrdersView" data-broker-panel="brokerOrders">
        <div class="broker-page-head"><div><span class="eyebrow">Paper Orders</span><h3>Buy / Sell / Intraday / Delivery</h3></div></div>
        <div class="broker-order-tabs"><button class="broker-tab active" data-order-tab="buy">Buy Queue</button><button class="broker-tab" data-order-tab="sell">Sell / Replace</button><button class="broker-tab" data-order-tab="intraday">Intraday</button><button class="broker-tab" data-order-tab="delivery">Delivery</button></div>
        <div id="brokerOrderTicket" class="broker-order-ticket"></div>
      </section>
      <section class="view broker-view" id="brokerPositionsView" data-broker-panel="brokerPositions">
        <div class="broker-page-head"><div><span class="eyebrow">Portfolio</span><h3>Positions & P&L</h3></div></div>
        <div class="broker-grid two"><section class="panel"><div class="panel-header"><h3>Open Positions</h3><span id="brokerPositionCount">0</span></div><div class="broker-table-wrap"><table><thead><tr><th>Stock</th><th>Qty</th><th>Entry</th><th>LTP</th><th>P&L</th><th>State</th></tr></thead><tbody id="brokerPositionBody"></tbody></table></div></section><section class="panel"><div class="panel-header"><h3>Funds</h3><span>Virtual capital</span></div><div id="brokerFunds" class="broker-funds"></div></section></div>
      </section>
      <section class="view broker-view" id="brokerGttView" data-broker-panel="brokerGtt">
        <div class="broker-page-head"><div><span class="eyebrow">Paper GTT</span><h3>Target / Stop Trigger Plans</h3></div></div>
        <div class="broker-table-wrap panel"><table><thead><tr><th>Stock</th><th>Entry</th><th>Target</th><th>Stop</th><th>Qty</th><th>Status</th></tr></thead><tbody id="brokerGttBody"></tbody></table></div>
      </section>
      <section class="view broker-view" id="brokerReportsView" data-broker-panel="brokerReports">
        <div class="broker-page-head"><div><span class="eyebrow">Reports</span><h3>Run History & Audit</h3></div></div>
        <div class="broker-grid two"><section class="panel"><div class="panel-header"><h3>Latest Run</h3><span id="brokerReportStamp">Waiting</span></div><div id="brokerReportSummary" class="broker-report-grid"></div></section><section class="panel"><div class="panel-header"><h3>History</h3><span id="brokerHistoryCount">0</span></div><div id="brokerHistory" class="compact-list"></div></section></div>
      </section>
      <section class="view broker-view" id="brokerSettingsView" data-broker-panel="brokerSettings">
        <div class="broker-page-head"><div><span class="eyebrow">Settings</span><h3>Paper Trading Controls</h3></div></div>
        <div class="broker-grid two"><section class="panel"><div class="panel-header"><h3>Risk Settings</h3><span>From latest plan</span></div><div id="brokerRiskSettings" class="broker-form-grid"></div></section><section class="panel"><div class="panel-header"><h3>Broker Connection</h3><span>Execution locked</span></div><div id="brokerConnection" class="broker-copy"></div></section></div>
      </section>
    `);
    $("#brokerRefreshBtn")?.addEventListener("click", () => refreshBrokerData().catch((error) => setLine(error.message, "negative")));
    $all(".broker-tab").forEach((button) => button.addEventListener("click", () => switchOrderTab(button.dataset.orderTab)));
    window.lucide?.createIcons();
  }

  async function refreshBrokerData() {
    const [status, market] = await Promise.allSettled([api("/api/paper-trader/status"), api("/api/market-context")]);
    if (status.status === "fulfilled") {
      state.status = status.value;
      state.plan = status.value.status?.last_plan || state.plan;
    }
    if (market.status === "fulfilled") state.market = market.value;
    renderBrokerViews();
  }

  function switchBrokerView(view, title) {
    $all("[data-view]").forEach((button) => button.classList.remove("active"));
    $all("[data-broker-view]").forEach((button) => button.classList.toggle("active", button.dataset.brokerView === view));
    $all("[data-view-panel]").forEach((panel) => panel.classList.remove("active"));
    $all("[data-broker-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.brokerPanel === view));
    const pageTitle = $("#pageTitle");
    if (pageTitle) pageTitle.textContent = title;
    renderBrokerViews();
    window.lucide?.createIcons();
  }

  function renderBrokerViews() {
    const plan = state.plan || {};
    const summary = plan.summary || {};
    const status = state.status || {};
    const positions = status.status?.positions || plan.hold_queue || [];
    renderControls(plan);
    renderMarkets();
    renderWatchlists(plan.watchlists || {});
    renderSignals(plan);
    renderOrders(plan);
    renderPositions(positions, plan);
    renderGtt(plan.buy_queue || []);
    renderReports(plan);
    renderSettings(plan, status);
  }

  function renderControls(plan) {
    const host = $("#brokerControlStrip");
    if (!host) return;
    host.innerHTML = `
      <label><span>Segment</span><select><option>NSE Equity</option><option disabled>F&O feed not wired</option></select></label>
      <label><span>Product</span><select><option>Paper Swing</option><option>Paper Intraday</option><option>Paper Positional</option><option>Paper Portfolio</option></select></label>
      <label><span>Order</span><select><option>Paper BUY</option><option>Paper SELL</option><option>Paper GTT</option><option>Paper Replace</option></select></label>
      <label><span>Parameter Set</span><select><option>All Active Parameters</option><option>Candle Structure</option><option>FII/DII Flow</option><option>Risk Governor</option><option>Hot Pocket</option></select></label>
      <label><span>Mode</span><select><option>Paper Only</option><option disabled>Live locked</option></select></label>
    `;
    const selectors = $("#brokerParameterSelectors");
    if (selectors) selectors.innerHTML = host.innerHTML;
  }

  function renderMarkets() {
    const host = $("#brokerMarketStrip");
    if (!host) return;
    const cards = state.market?.cards || [];
    host.innerHTML = cards.length ? cards.map((card) => `<article class="broker-market-card"><span>${escapeHtml(card.label)}</span><strong>${marketPrice(card)}</strong><b class="${Number(card.change_pct) >= 0 ? "positive" : "negative"}">${signed(card.change_pct)}%</b></article>`).join("") : `<article class="broker-market-card wide"><span>Market Feed</span><strong>Not loaded</strong><b>Refresh after login or check /api/market-context</b></article>`;
    const stamp = $("#brokerSessionStamp");
    if (stamp) stamp.textContent = state.market?.asOf ? new Date(state.market.asOf).toLocaleString() : "No market context";
    const insight = state.market?.insight || {};
    const copy = $("#brokerMarketContext");
    if (copy) copy.innerHTML = `<strong>${escapeHtml(insight.bias || "Market context not loaded")}</strong><p>${escapeHtml((insight.notes || []).join(". ") || "No fake market text. Refresh uses the connected market-context endpoint.")}</p><span>Confidence ${number(insight.confidence)} / 100</span>`;
  }

  function renderWatchlists(watchlists) {
    const host = $("#brokerWatchlists");
    if (!host) return;
    const entries = Object.entries({ Selected: watchlists.selected_30 || [], "Target Room": watchlists.target_room || [], "Event Resilient": watchlists.event_resilient || [], "Watch Not Buy": watchlists.watch_not_buy || [], ...(watchlists.themes || {}) }).filter(([, rows]) => Array.isArray(rows));
    host.innerHTML = entries.length ? entries.map(([name, rows]) => `<section class="panel broker-watch-card"><div class="panel-header"><h3>${escapeHtml(name)}</h3><span>${rows.length}</span></div>${rows.slice(0, 10).map((row) => `<button type="button"><strong>${escapeHtml(row.symbol)}</strong><span>${escapeHtml(row.readiness || row.decision || "WATCH")}</span><b>${number(row.intelligence_score || row.paper_score || row.score)}</b></button>`).join("") || `<div class="broker-empty">No stocks in this bucket after latest run.</div>`}</section>`).join("") : `<section class="panel broker-empty">No watchlists yet. Run Morning Engine to create real buckets.</section>`;
  }

  function renderSignals(plan) {
    const rows = plan.top_ranked || plan.buy_queue || [];
    const body = $("#brokerSignalBody");
    const count = $("#brokerSignalCount");
    if (count) count.textContent = String(rows.length || 0);
    if (body) body.innerHTML = rows.length ? rows.slice(0, 30).map((row) => `<tr><td><strong>${escapeHtml(row.symbol)}</strong><span>${escapeHtml(row.name || "")}</span></td><td>${escapeHtml(row.intelligence?.status || row.readiness || row.decision || "WATCH")}</td><td>${number(row.intelligence_score || row.paper_score || row.score)}</td><td>${number(row.regime_risk)}</td><td>${escapeHtml(row.paper_ready || row.readiness === "READY" ? "Paper ticket" : "Watch")}</td></tr>`).join("") : `<tr><td colspan="5" class="empty-cell">No signal rows yet. Run Morning Engine.</td></tr>`;
    const evidence = $("#brokerSignalEvidence");
    const top = rows[0] || {};
    if (evidence) evidence.innerHTML = top.symbol ? `<strong>${escapeHtml(top.symbol)}</strong><p>${escapeHtml(top.paper_reason || top.thesis || top.reason || "Evidence is not available for this row.")}</p><span>Source: ${escapeHtml(plan.source || "latest paper plan")}</span>` : `<strong>No top signal</strong><p>No fake signal evidence is shown until a real run produces rows.</p>`;
  }

  function renderOrders(plan) {
    const host = $("#brokerOrderTicket");
    if (!host) return;
    const buy = plan.buy_queue || [];
    const sell = plan.sell_queue || [];
    const first = buy[0] || {};
    host.innerHTML = `
      <section class="panel broker-ticket-main"><div class="panel-header"><h3>Paper Order Ticket</h3><span>${escapeHtml(first.symbol || "No stock selected")}</span></div>
        <div class="broker-ticket-grid">
          <label><span>Symbol</span><input value="${escapeAttr(first.symbol || "")}" readonly /></label>
          <label><span>Side</span><select><option>BUY</option><option>SELL</option></select></label>
          <label><span>Product</span><select><option>Paper Swing</option><option>Paper Intraday</option><option>Paper Positional</option></select></label>
          <label><span>Order Type</span><select><option>Market Paper</option><option>Limit Paper</option><option>GTT Paper</option></select></label>
          <label><span>Qty</span><input value="${escapeAttr(first.qty || 0)}" readonly /></label>
          <label><span>Entry</span><input value="${escapeAttr(entryZone(first))}" readonly /></label>
          <label><span>Target</span><input value="${escapeAttr(money(first.target2 || first.target_price))}" readonly /></label>
          <label><span>Stop</span><input value="${escapeAttr(money(first.stop_price))}" readonly /></label>
        </div>
        <div class="broker-action-row"><button class="primary-button" type="button" disabled>Paper BUY generated by engine</button><button class="secondary-button" type="button" disabled>Paper SELL uses sell queue</button><button class="secondary-button" type="button" disabled>Live broker order locked</button></div>
      </section>
      <section class="panel"><div class="panel-header"><h3>Queues</h3><span>${buy.length} buy / ${sell.length} sell</span></div><div class="broker-queue-grid"><div><strong>Buy Queue</strong>${queueList(buy, "No buy queue yet.")}</div><div><strong>Sell / Replace</strong>${queueList(sell, "No sell/replace queue yet.")}</div></div></section>
    `;
  }

  function switchOrderTab(tab) {
    $all(".broker-tab").forEach((button) => button.classList.toggle("active", button.dataset.orderTab === tab));
  }

  function renderPositions(positions, plan) {
    const body = $("#brokerPositionBody");
    const count = $("#brokerPositionCount");
    if (count) count.textContent = String(positions.length || 0);
    if (body) body.innerHTML = positions.length ? positions.map((row) => `<tr><td>${escapeHtml(row.symbol)}</td><td>${escapeHtml(row.qty || 0)}</td><td>${money(row.entry_price)}</td><td>${money(row.current_price)}</td><td>${number(row.pnl_pct)}%</td><td>${escapeHtml(row.action || row.status || "OPEN")}</td></tr>`).join("") : `<tr><td colspan="6" class="empty-cell">No paper positions exist yet. Buy queue is ready, but no persisted paper fills are present.</td></tr>`;
    const funds = $("#brokerFunds");
    const settings = plan.settings || {};
    const capital = Number(settings.startingCapital || 1000000);
    const deployed = (plan.buy_queue || []).reduce((sum, row) => sum + Number(row.estimated_value || 0), 0);
    if (funds) funds.innerHTML = `<article><span>Virtual Capital</span><strong>${money(capital)}</strong></article><article><span>Planned Deployment</span><strong>${money(deployed)}</strong></article><article><span>Mode</span><strong>Paper only</strong></article><article><span>Live Orders</span><strong>Locked</strong></article>`;
  }

  function renderGtt(rows) {
    const body = $("#brokerGttBody");
    if (!body) return;
    body.innerHTML = rows.length ? rows.slice(0, 40).map((row) => `<tr><td><strong>${escapeHtml(row.symbol)}</strong><span>${escapeHtml(row.name || "")}</span></td><td>${entryZone(row)}</td><td>${money(row.target2 || row.target_price)}</td><td>${money(row.stop_price)}</td><td>${escapeHtml(row.qty || 0)}</td><td>Paper GTT prepared, not sent to broker</td></tr>`).join("") : `<tr><td colspan="6" class="empty-cell">No GTT plans yet. Run Morning Engine to create target/stop paper plans.</td></tr>`;
  }

  function renderReports(plan) {
    const summary = plan.summary || {};
    const report = $("#brokerReportSummary");
    if (report) report.innerHTML = [["Scanned", summary.scanned], ["Buy Queue", summary.buy_queue], ["Data Gaps", summary.data_needed], ["Avg Intel", summary.avg_intelligence_score], ["Avg Risk", summary.avg_regime_risk], ["Source", plan.fallback_used || plan.source]].map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? "not available")}</strong></article>`).join("");
    const stamp = $("#brokerReportStamp");
    if (stamp) stamp.textContent = plan.asOf ? new Date(plan.asOf).toLocaleString() : "No run yet";
    const history = plan.history || [];
    const count = $("#brokerHistoryCount");
    if (count) count.textContent = String(history.length);
    const host = $("#brokerHistory");
    if (host) host.innerHTML = history.length ? history.slice(0, 12).map((row) => `<div class="compact-row"><strong>${escapeHtml(row.source || "paper run")}</strong><span>${escapeHtml(row.buy_queue || 0)} buy / ${escapeHtml(row.sell_queue || 0)} sell</span><small>${escapeHtml(row.at || "")}</small></div>`).join("") : `<div class="compact-row"><strong>No run history</strong><span>Run Morning Engine</span><small>History appears only after real paper runs.</small></div>`;
  }

  function renderSettings(plan, status) {
    const settings = plan.settings || {};
    const risk = $("#brokerRiskSettings");
    if (risk) risk.innerHTML = [["Starting Capital", money(settings.startingCapital)], ["Max Position", pct(Number(settings.maxPositionPct || 0) * 100)], ["Stop Loss", pct(settings.stopLossPct)], ["Target Hit", pct(settings.targetHitPct)], ["Replace Below", number(settings.replaceBelowScore)], ["Buy Queue Size", settings.buyQueueSize]].map(([label, value]) => `<label><span>${escapeHtml(label)}</span><input value="${escapeAttr(value ?? "not available")}" readonly /></label>`).join("");
    const conn = $("#brokerConnection");
    const upstox = status.upstox || {};
    if (conn) conn.innerHTML = `<strong>Upstox ${upstox.token_visible ? "token visible" : "token missing"}</strong><p>Execution is paper-only. Live broker order path is locked; generated orders use paper ticket data only.</p><span>Storage: ${escapeHtml(status.data_bank?.universe_count || "not available")} NSE rows</span>`;
  }

  function queueList(rows, empty) {
    return rows.length ? `<div class="broker-mini-list">${rows.slice(0, 10).map((row) => `<span><b>${escapeHtml(row.symbol)}</b><small>${number(row.intelligence_score || row.paper_score)} / ${escapeHtml(row.readiness || row.action || "PAPER")}</small></span>`).join("")}</div>` : `<div class="broker-empty">${escapeHtml(empty)}</div>`;
  }

  function entryZone(row) {
    const zone = row.entry_zone || row.advisor?.entry_zone;
    if (zone?.low && zone?.high) return `${money(zone.low)} - ${money(zone.high)}`;
    return money(row.close);
  }

  function marketPrice(card) {
    const value = Number(card.price);
    return Number.isFinite(value) ? value.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "not available";
  }

  function money(value) {
    return Number.isFinite(Number(value)) ? `Rs ${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "not available";
  }

  function number(value) {
    return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "not available";
  }

  function signed(value) {
    return Number.isFinite(Number(value)) ? `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(2)}` : "not available";
  }

  function pct(value) {
    return Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)}%` : "not available";
  }

  function setLine(message, tone = "") {
    const line = $("#messageLine");
    if (!line) return;
    line.textContent = message;
    line.className = `alert-line ${tone}`.trim();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }

  function escapeAttr(value) { return escapeHtml(value); }
})();
