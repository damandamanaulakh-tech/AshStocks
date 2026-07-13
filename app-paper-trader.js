(() => {
  const traderState = { lastPlan: null, status: null };

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
    if ($('[data-view="paperTrader"]')) return;
    const nav = $(".nav-list");
    const q1 = nav?.querySelector('a[href="/q1"]');
    const button = document.createElement("button");
    button.className = "nav-item";
    button.type = "button";
    button.dataset.view = "paperTrader";
    button.innerHTML = '<i data-lucide="briefcase-business" aria-hidden="true"></i><span>Paper Trader</span>';
    nav?.insertBefore(button, q1 || null);

    const section = document.createElement("section");
    section.className = "view";
    section.id = "paperTraderView";
    section.dataset.viewPanel = "paperTrader";
    section.innerHTML = `
      <div class="paper-head">
        <div>
          <h3>Morning Paper Engine</h3>
          <span id="paperTraderStamp">Not run yet</span>
        </div>
        <div class="inline-actions">
          <button class="secondary-button" id="paperTraderStatusBtn" type="button">
            <i data-lucide="refresh-cw" aria-hidden="true"></i>
            <span>Status</span>
          </button>
          <button class="primary-button" id="paperTraderRunBtn" type="button">
            <i data-lucide="play" aria-hidden="true"></i>
            <span>Run Morning Engine</span>
          </button>
        </div>
      </div>
      <div class="metric-grid paper-metrics" id="paperTraderMetrics"></div>
      <div class="paper-layout">
        <section class="panel paper-panel">
          <div class="panel-header"><h3>Buy Queue</h3><span id="buyQueueCount">0</span></div>
          <div class="paper-table-wrap"><table><thead><tr><th>Rank</th><th>Symbol</th><th>Score</th><th>Target / Stop</th><th>Theme</th><th>Thesis</th></tr></thead><tbody id="buyQueueBody"></tbody></table></div>
        </section>
        <section class="panel paper-panel">
          <div class="panel-header"><h3>Sell / Replace</h3><span id="sellQueueCount">0</span></div>
          <div class="paper-table-wrap"><table><thead><tr><th>Symbol</th><th>Action</th><th>P&L</th><th>Target</th><th>Reason</th></tr></thead><tbody id="sellQueueBody"></tbody></table></div>
        </section>
      </div>
      <section class="panel paper-panel">
        <div class="panel-header"><h3>Watchlists</h3><span id="watchlistCount">0 buckets</span></div>
        <div class="watchlist-grid" id="watchlistGrid"></div>
      </section>
    `;
    $("#scannerView")?.after(section);

    button.addEventListener("click", () => switchPaperView());
    $("#paperTraderRunBtn")?.addEventListener("click", runPaperTrader);
    $("#paperTraderStatusBtn")?.addEventListener("click", loadPaperTraderStatus);
    window.lucide?.createIcons();
  }

  function switchPaperView() {
    $all("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === "paperTrader"));
    $all("[data-view-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.viewPanel === "paperTrader"));
    const title = $("#pageTitle");
    if (title) title.textContent = "Paper Trader";
    window.lucide?.createIcons();
    loadPaperTraderStatus().catch(showError);
  }

  async function loadPaperTraderStatus() {
    const payload = await api("/api/paper-trader/status");
    traderState.status = payload.status || null;
    traderState.lastPlan = payload.status?.last_plan || traderState.lastPlan;
    renderPaperTrader(traderState.lastPlan, payload);
  }

  async function runPaperTrader() {
    setBusy(true, "Running paper trader");
    try {
      const payload = await api("/api/paper-trader/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ useUpstox: true })
      });
      traderState.lastPlan = payload;
      renderPaperTrader(payload);
      setLine("Paper trader run complete", "positive");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  function renderPaperTrader(plan, statusPayload = {}) {
    const summary = plan?.summary || {};
    const stamp = $("#paperTraderStamp");
    if (stamp) stamp.textContent = plan?.asOf ? `Last run ${new Date(plan.asOf).toLocaleString()}` : statusPayload?.data_bank ? `${statusPayload.data_bank.universe_count || 0} NSE rows ready` : "Not run yet";
    renderMetrics(summary, statusPayload);
    renderBuyQueue(plan?.buy_queue || []);
    renderSellQueue(plan?.sell_queue || []);
    renderWatchlists(plan?.watchlists || {});
  }

  function renderMetrics(summary, statusPayload) {
    const metrics = [
      ["Scanned", summary.scanned ?? statusPayload?.data_bank?.universe_count ?? 0],
      ["Candidates", summary.candidates ?? 0],
      ["Buy Queue", summary.buy_queue ?? 0],
      ["Sell / Replace", summary.sell_queue ?? 0],
      ["Data Gaps", summary.data_needed ?? 0]
    ];
    const grid = $("#paperTraderMetrics");
    if (!grid) return;
    grid.innerHTML = metrics.map(([label, value]) => `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
  }

  function renderBuyQueue(rows) {
    $("#buyQueueCount").textContent = String(rows.length);
    const body = $("#buyQueueBody");
    if (!body) return;
    body.innerHTML = rows.length
      ? rows.map((row) => `
        <tr>
          <td>${row.rank}</td>
          <td><strong>${escapeHtml(row.symbol)}</strong><span>${escapeHtml(row.name || "")}</span></td>
          <td>${number(row.paper_score)}</td>
          <td>${money(row.target_price)} / ${money(row.stop_price)}</td>
          <td>${escapeHtml((row.themes || []).slice(0, 2).join(", ") || "Core")}</td>
          <td class="reason-cell">${escapeHtml(row.thesis || "")}</td>
        </tr>`).join("")
      : '<tr><td colspan="6" class="empty-cell">No paper buy queue yet.</td></tr>';
  }

  function renderSellQueue(rows) {
    $("#sellQueueCount").textContent = String(rows.length);
    const body = $("#sellQueueBody");
    if (!body) return;
    body.innerHTML = rows.length
      ? rows.map((row) => `
        <tr>
          <td><strong>${escapeHtml(row.symbol)}</strong><span>${escapeHtml(row.name || "")}</span></td>
          <td><span class="status-pill">${escapeHtml(row.action)}</span></td>
          <td>${pct(row.pnl_pct)}</td>
          <td>${pct(row.target_progress_pct)}</td>
          <td class="reason-cell">${escapeHtml(row.reason || "")}</td>
        </tr>`).join("")
      : '<tr><td colspan="5" class="empty-cell">No sells or replacements yet.</td></tr>';
  }

  function renderWatchlists(watchlists) {
    const grid = $("#watchlistGrid");
    if (!grid) return;
    const entries = Object.entries(watchlists).filter(([, value]) => Array.isArray(value) || value && typeof value === "object");
    $("#watchlistCount").textContent = `${entries.length} buckets`;
    grid.innerHTML = entries.map(([name, value]) => {
      const rows = Array.isArray(value) ? value : Object.entries(value).flatMap(([theme, items]) => (items || []).slice(0, 5).map((item) => ({ ...item, bucketTheme: theme })));
      return `<article class="watchlist-card"><strong>${labelize(name)}</strong>${rows.slice(0, 8).map((row) => `<span>${escapeHtml(row.symbol)} <small>${number(row.paper_score)}</small></span>`).join("") || '<span class="subtle">Empty</span>'}</article>`;
    }).join("");
  }

  function setBusy(busy, message) {
    ["#paperTraderRunBtn", "#paperTraderStatusBtn"].forEach((selector) => {
      const button = $(selector);
      if (button) button.disabled = busy;
    });
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
    return Number.isFinite(Number(value)) ? `₹${Number(value).toFixed(2)}` : "-";
  }

  function labelize(value) {
    return escapeHtml(String(value).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }

  window.addEventListener("DOMContentLoaded", () => {
    installPaperTraderView();
    setTimeout(() => loadPaperTraderStatus().catch(() => {}), 1500);
  });
})();
