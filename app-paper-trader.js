(() => {
  const traderState = { lastPlan: null, status: null, booted: false };

  function $(selector) {
    return document.querySelector(selector);
  }

  function $all(selector) {
    return Array.from(document.querySelectorAll(selector));
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

  function installPaperTraderView() {
    const nav = $(".nav-list");
    let button = $('[data-view="paperTrader"]');
    if (!button) {
      const first = nav?.firstElementChild;
      button = document.createElement("button");
      button.className = "nav-item";
      button.type = "button";
      button.dataset.view = "paperTrader";
      button.innerHTML = '<i data-lucide="layout-dashboard" aria-hidden="true"></i><span>Dashboard</span>';
      nav?.insertBefore(button, first || null);
    }

    if ($("#paperTraderView")) return;
    const section = document.createElement("section");
    section.className = "view paper-dashboard-view";
    section.id = "paperTraderView";
    section.dataset.viewPanel = "paperTrader";
    section.innerHTML = `
      <div class="trade-hero">
        <div>
          <span class="eyebrow">AM07 Paper Trading</span>
          <h3>Good morning, Trader</h3>
          <p id="paperTraderStamp">Rules first. Capital second. Emotions last.</p>
        </div>
        <div class="trade-mode">
          <span class="mode-pill active">Paper</span>
          <span class="mode-pill">Live Locked</span>
          <button class="primary-button" id="paperTraderRunBtn" type="button"><i data-lucide="play" aria-hidden="true"></i><span>Run Morning Engine</span></button>
        </div>
      </div>

      <div class="metric-grid paper-metrics" id="paperTraderMetrics"></div>

      <div class="trade-grid-main">
        <section class="panel signal-panel">
          <div class="panel-header"><h3>URR Verified Thesis</h3><span class="status-dot">Paper Only</span></div>
          <div id="urrThesis" class="urr-thesis"></div>
        </section>
        <section class="panel signal-panel">
          <div class="panel-header"><h3>10-Factor Ranking</h3><span id="rankingScore">0 / 100</span></div>
          <div id="factorBars" class="factor-bars"></div>
        </section>
      </div>

      <div class="paper-layout actionable-layout">
        <section class="panel paper-panel buy-panel">
          <div class="panel-header"><h3>Selected Stocks</h3><span id="buyQueueCount">0</span></div>
          <div class="paper-table-wrap"><table><thead><tr><th>Rank</th><th>Stock</th><th>Action</th><th>Score</th><th>Entry</th><th>Target</th><th>Stop</th><th>Qty</th><th>Reason</th></tr></thead><tbody id="buyQueueBody"></tbody></table></div>
        </section>
        <section class="panel paper-panel side-panel">
          <div class="panel-header"><h3>Sell / Replace</h3><span id="sellQueueCount">0</span></div>
          <div id="sellQueueBody" class="compact-list"></div>
        </section>
      </div>

      <div class="trade-grid-main">
        <section class="panel paper-panel">
          <div class="panel-header"><h3>Theme Watchlists</h3><span id="watchlistCount">0 buckets</span></div>
          <div class="watchlist-grid" id="watchlistGrid"></div>
        </section>
        <section class="panel paper-panel">
          <div class="panel-header"><h3>Order Readiness</h3><span>Upstox Historical</span></div>
          <div id="orderReadiness" class="readiness-grid"></div>
        </section>
      </div>
    `;
    $("#scannerView")?.before(section);

    button.addEventListener("click", () => switchPaperView());
    $("#paperTraderRunBtn")?.addEventListener("click", runPaperTrader);
    window.lucide?.createIcons();
  }

  function switchPaperView() {
    $all("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === "paperTrader"));
    $all("[data-view-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.viewPanel === "paperTrader"));
    const title = $("#pageTitle");
    if (title) title.textContent = "Trading Dashboard";
    window.lucide?.createIcons();
  }

  async function loadPaperTraderStatus() {
    const payload = await api("/api/paper-trader/status");
    traderState.status = payload.status || null;
    traderState.lastPlan = payload.status?.last_plan || traderState.lastPlan;
    renderPaperTrader(traderState.lastPlan, payload);
    return payload;
  }

  async function runPaperTrader() {
    setBusy(true, "Running morning paper engine");
    try {
      const payload = await api("/api/paper-trader/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ useUpstox: true, settings: { replaceBelowScore: 35, buyQueueSize: 30, maxCandidates: 50 } })
      });
      traderState.lastPlan = payload;
      renderPaperTrader(payload);
      setLine(`Selected ${payload.summary?.buy_queue || 0} paper stocks`, "positive");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  async function bootPaperTrader() {
    if (traderState.booted) return;
    traderState.booted = true;
    installPaperTraderView();
    switchPaperView();
    try {
      const status = await loadPaperTraderStatus();
      const lastPlan = status.status?.last_plan;
      const emptyOrOldPlan = !lastPlan || lastPlan.engine !== "ashstocks-paper-trader-v0.3" || Number(lastPlan.summary?.buy_queue || 0) === 0;
      const key = `ashstocks-paper-auto-v3-${new Date().toISOString().slice(0, 10)}`;
      if (emptyOrOldPlan && !sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        setTimeout(() => runPaperTrader().catch(showError), 500);
      }
    } catch (error) {
      showError(error);
    }
  }

  function renderPaperTrader(plan, statusPayload = {}) {
    const summary = plan?.summary || {};
    const stamp = $("#paperTraderStamp");
    if (stamp) stamp.textContent = plan?.asOf ? `Last run ${new Date(plan.asOf).toLocaleString()}` : `${statusPayload?.data_bank?.universe_count || 0} NSE rows ready. Run morning engine.`;
    renderMetrics(summary, statusPayload);
    renderThesis(plan);
    renderFactors(plan);
    renderBuyQueue(plan?.buy_queue || []);
    renderSellQueue(plan?.sell_queue || []);
    renderWatchlists(plan?.watchlists || {});
    renderReadiness(plan, statusPayload);
  }

  function renderMetrics(summary, statusPayload) {
    const metrics = [
      ["NSE Pool", summary.scanned ?? statusPayload?.data_bank?.universe_count ?? 0, "Universe scanned"],
      ["Selected", summary.buy_queue ?? 0, "Paper buy queue"],
      ["Review", summary.candidates ? Math.max(0, summary.candidates - (summary.buy_queue || 0)) : 0, "Needs manual check"],
      ["Sell / Replace", summary.sell_queue ?? 0, "Rotation queue"],
      ["Data Gaps", summary.data_needed ?? 0, "Missing candles/feed"]
    ];
    const grid = $("#paperTraderMetrics");
    if (!grid) return;
    grid.innerHTML = metrics.map(([label, value, sub]) => `<article class="metric-card trade-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(sub)}</small></article>`).join("");
  }

  function renderThesis(plan) {
    const top = plan?.buy_queue?.[0];
    const thesis = $("#urrThesis");
    if (!thesis) return;
    thesis.innerHTML = top
      ? `<strong>${escapeHtml(top.symbol)}: ${escapeHtml(top.readiness || "READY")}</strong><p>${escapeHtml(top.thesis || "Ranked by momentum, liquidity, target room, event resilience and theme heat.")}</p><div class="thesis-row"><span>Entry ${money(top.close)}</span><span>Target ${money(top.target_price)}</span><span>Stop ${money(top.stop_price)}</span></div>`
      : `<strong>No selected stock yet</strong><p>Run Morning Engine to create paper buy, sell, hold and watchlist decisions.</p>`;
  }

  function renderFactors(plan) {
    const top = plan?.top_ranked?.[0] || plan?.buy_queue?.[0] || {};
    const rows = [
      ["Trend Strength", top.momentum_score || top.paper_score || 0],
      ["Relative Strength", top.score || 0],
      ["Volume / Liquidity", Math.min(100, Number(top.rupee_turnover_cr || 0) * 6)],
      ["Target Room", Number(top.target_pct || 0) * 1.2],
      ["Event Resilience", top.event_resilience || 0],
      ["Theme Heat", top.theme_heat || ((top.themes || []).length ? 70 : 35)],
      ["Risk Reward", top.paper_score || 0]
    ];
    const panel = $("#factorBars");
    const score = $("#rankingScore");
    if (score) score.textContent = `${number(top.paper_score || 0)} / 100`;
    if (!panel) return;
    panel.innerHTML = rows.map(([label, value]) => {
      const width = Math.max(4, Math.min(100, Number(value) || 0));
      return `<div class="factor-row"><span>${escapeHtml(label)}</span><div><i style="width:${width}%"></i></div><b>${number(width / 10)}</b></div>`;
    }).join("");
  }

  function renderBuyQueue(rows) {
    $("#buyQueueCount").textContent = String(rows.length);
    const body = $("#buyQueueBody");
    if (!body) return;
    body.innerHTML = rows.length
      ? rows.map((row) => `<tr><td>${row.rank}</td><td><strong>${escapeHtml(row.symbol)}</strong><span>${escapeHtml(row.name || "")}</span></td><td><span class="action-pill ${row.readiness === "READY" ? "ready" : "review"}">${escapeHtml(row.action)} ${escapeHtml(row.readiness || "")}</span></td><td>${number(row.paper_score)}</td><td>${money(row.close)}</td><td>${money(row.target_price)}<span>${pct(row.target_pct)}</span></td><td>${money(row.stop_price)}<span>${pct(-row.stop_loss_pct)}</span></td><td>${row.qty || 0}</td><td class="reason-cell">${escapeHtml(row.thesis || "")}</td></tr>`).join("")
      : '<tr><td colspan="9" class="empty-cell">No selected stocks yet. Run Morning Engine.</td></tr>';
  }

  function renderSellQueue(rows) {
    $("#sellQueueCount").textContent = String(rows.length);
    const body = $("#sellQueueBody");
    if (!body) return;
    body.innerHTML = rows.length
      ? rows.map((row) => `<div class="compact-row"><strong>${escapeHtml(row.symbol)}</strong><span>${escapeHtml(row.action)}</span><small>${escapeHtml(row.reason || "")}</small></div>`).join("")
      : '<div class="compact-row"><strong>No sell now</strong><span>Hold cash discipline</span><small>Targets and stops will appear here after positions exist.</small></div>';
  }

  function renderWatchlists(watchlists) {
    const grid = $("#watchlistGrid");
    if (!grid) return;
    const themeBuckets = watchlists.themes || {};
    const entries = Object.entries({ Selected: watchlists.selected_30 || watchlists.morning_top_50 || [], "Target Room": watchlists.target_room || [], "Event Resilient": watchlists.event_resilient || [], ...themeBuckets }).filter(([, rows]) => Array.isArray(rows));
    $("#watchlistCount").textContent = `${entries.length} buckets`;
    grid.innerHTML = entries.map(([name, rows]) => `<article class="watchlist-card"><strong>${escapeHtml(name)}</strong>${rows.slice(0, 6).map((row) => `<span>${escapeHtml(row.symbol)} <small>${number(row.paper_score)}</small></span>`).join("") || '<span class="subtle">Empty</span>'}</article>`).join("");
  }

  function renderReadiness(plan, statusPayload) {
    const el = $("#orderReadiness");
    if (!el) return;
    const upstox = statusPayload.upstox || {};
    const selected = plan?.summary?.buy_queue || 0;
    el.innerHTML = `<div class="ready-card"><strong>Mode</strong><span>Paper trading only</span></div><div class="ready-card"><strong>Upstox</strong><span>${upstox.token_visible ? "Token visible" : "Token missing"}</span></div><div class="ready-card"><strong>Selected</strong><span>${selected} stocks ready</span></div><div class="ready-card"><strong>Live Orders</strong><span>Locked</span></div>`;
  }

  function setBusy(busy, message) {
    const button = $("#paperTraderRunBtn");
    if (button) button.disabled = busy;
    if (message) setLine(message);
  }

  function setLine(message, tone = "") {
    const line = $("#messageLine");
    if (!line) return;
    line.textContent = message;
    line.className = `alert-line ${tone}`.trim();
  }

  function showError(error) {
    setLine(error.message || String(error), "negative");
  }

  function number(value) {
    return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "-";
  }

  function pct(value) {
    return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}%` : "-";
  }

  function money(value) {
    return Number.isFinite(Number(value)) ? `Rs ${Number(value).toFixed(2)}` : "-";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }

  window.addEventListener("DOMContentLoaded", () => {
    bootPaperTrader();
  });
})();
