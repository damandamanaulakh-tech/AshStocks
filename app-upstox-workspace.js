(() => {
  const workspace = {
    scan: null,
    paperStatus: null,
    paperPlan: null,
    market: null,
    selectedSymbol: "",
    booted: false
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const url = String(args[0] || "");
    if (url.includes("/api/scanner/run")) captureJson(response, (payload) => {
      workspace.scan = payload;
      workspace.selectedSymbol = pickSelectedSymbol(payload.rows || [], workspace.selectedSymbol);
      renderWorkspace();
    });
    if (url.includes("/api/paper-trader/status") || url.includes("/api/paper-trader/run")) captureJson(response, (payload) => {
      workspace.paperStatus = url.includes("/api/paper-trader/status") ? payload : workspace.paperStatus;
      workspace.paperPlan = payload.status?.last_plan || (payload.ok === false ? workspace.paperPlan : payload) || workspace.paperPlan;
      renderWorkspace();
    });
    return response;
  };

  window.addEventListener("DOMContentLoaded", () => {
    bootMergedWorkspace().catch(() => {});
  });

  async function bootMergedWorkspace() {
    if (workspace.booted) return;
    workspace.booted = true;
    await waitForShell();
    installDashboardNav();
    installDashboardPanel();
    await refreshMergedData();
    setInterval(() => refreshMergedData().catch(() => {}), 120000);
  }

  function waitForShell() {
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (document.querySelector(".nav-list") && document.querySelector("#dataView")) return resolve();
        if (Date.now() - started > 10000) return resolve();
        setTimeout(tick, 80);
      };
      tick();
    });
  }

  function installDashboardNav() {
    const nav = document.querySelector(".nav-list");
    if (!nav || document.querySelector('[data-ash-workspace="dashboard"]')) return;
    const button = document.createElement("button");
    button.className = "nav-item";
    button.type = "button";
    button.dataset.ashWorkspace = "dashboard";
    button.innerHTML = '<i data-lucide="layout-dashboard" aria-hidden="true"></i><span>Dashboard</span>';
    button.addEventListener("click", () => switchWorkspaceDashboard());
    nav.insertBefore(button, nav.firstElementChild?.nextSibling || nav.firstElementChild || null);
    window.lucide?.createIcons();
  }

  function installDashboardPanel() {
    const anchor = document.querySelector("#dataView");
    if (!anchor || document.querySelector("#upstoxWorkspaceView")) return;
    anchor.insertAdjacentHTML("afterend", `
      <section class="view upstox-workspace" id="upstoxWorkspaceView" data-ash-workspace-panel="dashboard">
        <div class="uw-topline">
          <div><span class="eyebrow">AshStocks x Upstox Workflow</span><h3>Paper Trading Workspace</h3></div>
          <div class="uw-mode"><span>Paper</span><b>Live orders locked</b></div>
        </div>

        <div class="uw-commandbar">
          <label><span>Search</span><input id="uwSearch" placeholder="RELIANCE, bank, IT" /></label>
          <label><span>Segment</span><select id="uwSegment"><option>NSE Equity</option><option disabled>F&O feed not wired</option></select></label>
          <label><span>Product</span><select id="uwProduct"><option>Paper Swing</option><option>Paper Intraday</option><option>Paper Positional</option></select></label>
          <label><span>Order</span><select id="uwOrder"><option>Paper Buy</option><option>Paper Sell</option><option>Paper GTT</option><option>Replace</option></select></label>
          <label><span>Parameter</span><select id="uwParameterFamily"><option>All AshStocks</option><option>Candle Structure</option><option>Momentum</option><option>FII/DII</option><option>Risk</option><option>Entry Target Stop</option></select></label>
        </div>

        <div class="uw-market-strip" id="uwMarketStrip"></div>

        <div class="uw-main-grid">
          <section class="panel uw-chart-panel">
            <div class="panel-header"><h3 id="uwSelectedTitle">Selected Stock</h3><span id="uwSelectedState">Waiting</span></div>
            <div id="uwMiniChart" class="uw-mini-chart"></div>
            <div id="uwStockFacts" class="uw-facts"></div>
          </section>
          <section class="panel uw-brain-panel">
            <div class="panel-header"><h3>AshStocks Brain</h3><span id="uwBrainScore">0/100</span></div>
            <div id="uwBrainThesis" class="uw-copy"></div>
            <div id="uwLifecycle" class="uw-lifecycle"></div>
          </section>
          <section class="panel uw-ticket-panel">
            <div class="panel-header"><h3>Paper Order Ticket</h3><span>Upstox-style fields</span></div>
            <div id="uwOrderTicket" class="uw-ticket"></div>
          </section>
        </div>

        <div class="uw-lower-grid">
          <section class="panel">
            <div class="panel-header"><h3>Scanner to Trade Queue</h3><span id="uwQueueCount">0 rows</span></div>
            <div class="uw-table-wrap"><table><thead><tr><th>Stock</th><th>Decision</th><th>Score</th><th>6M/12M</th><th>Target</th><th>Action</th></tr></thead><tbody id="uwQueueBody"></tbody></table></div>
          </section>
          <section class="panel">
            <div class="panel-header"><h3>Parameter Piano Check</h3><span id="uwPianoState">Real hits only</span></div>
            <div id="uwPianoQuick" class="uw-piano-quick"></div>
            <div id="uwParameterDetail" class="uw-param-detail"><strong>Select a parameter key</strong><span>Shows source, evidence and engine impact.</span></div>
          </section>
        </div>

        <div class="uw-lower-grid compact">
          <section class="panel"><div class="panel-header"><h3>Candle Structure</h3><span id="uwCandleState">Waiting</span></div><div id="uwCandleBox" class="uw-copy"></div></section>
          <section class="panel"><div class="panel-header"><h3>Report Snapshot</h3><span id="uwReportStamp">Waiting</span></div><div id="uwReportBox" class="uw-report-grid"></div></section>
        </div>
      </section>
    `);
    document.querySelector("#uwSearch")?.addEventListener("input", renderWorkspace);
    document.querySelector("#uwParameterFamily")?.addEventListener("change", renderWorkspace);
    document.querySelector("#uwPianoQuick")?.addEventListener("click", (event) => {
      const key = event.target.closest("button[data-param]");
      if (key) showWorkspaceParameter(key.dataset.param, key.dataset.family);
    });
    window.lucide?.createIcons();
  }

  async function refreshMergedData() {
    const [paper, market] = await Promise.allSettled([
      fetchJson("/api/paper-trader/status"),
      fetchJson("/api/market-context")
    ]);
    if (paper.status === "fulfilled") {
      workspace.paperStatus = paper.value;
      workspace.paperPlan = paper.value.status?.last_plan || workspace.paperPlan;
    }
    if (market.status === "fulfilled") workspace.market = market.value;
    renderWorkspace();
  }

  function switchWorkspaceDashboard() {
    document.querySelectorAll("[data-view]").forEach((button) => button.classList.remove("active"));
    document.querySelectorAll("[data-broker-view]").forEach((button) => button.classList.remove("active"));
    document.querySelectorAll("[data-ash-workspace]").forEach((button) => button.classList.toggle("active", button.dataset.ashWorkspace === "dashboard"));
    document.querySelectorAll("[data-view-panel]").forEach((panel) => panel.classList.remove("active"));
    document.querySelectorAll("[data-broker-panel]").forEach((panel) => panel.classList.remove("active"));
    document.querySelectorAll("[data-ash-workspace-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.ashWorkspacePanel === "dashboard"));
    const title = document.querySelector("#pageTitle");
    if (title) title.textContent = "Dashboard";
    renderWorkspace();
  }

  function renderWorkspace() {
    const panel = document.querySelector("#upstoxWorkspaceView");
    if (!panel) return;
    const rows = scannerRows();
    const selected = selectedRow(rows);
    renderMarketStrip();
    renderSelectedStock(selected);
    renderBrain(selected, rows);
    renderTicket(selected);
    renderQueue(rows);
    renderPiano(selected);
    renderCandles(selected);
    renderReport(rows);
  }

  function scannerRows() {
    const rows = workspace.scan?.rows || [];
    const query = (document.querySelector("#uwSearch")?.value || "").trim().toLowerCase();
    const family = document.querySelector("#uwParameterFamily")?.value || "All AshStocks";
    return rows
      .filter((row) => !query || `${row.symbol} ${row.name} ${row.sector} ${row.reason}`.toLowerCase().includes(query))
      .filter((row) => family === "All AshStocks" || familyFilter(row, family))
      .sort((a, b) => Number(b.score || b.paper_score || 0) - Number(a.score || a.paper_score || 0));
  }

  function selectedRow(rows) {
    const all = workspace.scan?.rows || [];
    return all.find((row) => row.symbol === workspace.selectedSymbol) || rows[0] || all[0] || {};
  }

  function renderMarketStrip() {
    const host = document.querySelector("#uwMarketStrip");
    if (!host) return;
    const cards = workspace.market?.cards || [];
    const summary = workspace.scan?.summary || {};
    const fallback = [
      { label: "NSE Universe", price: summary.total ?? 0, change_pct: 0 },
      { label: "SELECT", price: summary.SELECT ?? 0, change_pct: 0 },
      { label: "WATCH", price: summary.WATCH ?? 0, change_pct: 0 },
      { label: "DATA_NEEDED", price: summary.DATA_NEEDED ?? 0, change_pct: 0 }
    ];
    const list = cards.length ? cards : fallback;
    host.innerHTML = list.slice(0, 6).map((card) => `<article><span>${escapeHtml(card.label)}</span><strong>${marketPrice(card.price)}</strong><b class="${Number(card.change_pct) >= 0 ? "positive" : "negative"}">${signed(card.change_pct)}%</b></article>`).join("");
  }

  function renderSelectedStock(row) {
    const title = document.querySelector("#uwSelectedTitle");
    const state = document.querySelector("#uwSelectedState");
    const chart = document.querySelector("#uwMiniChart");
    const facts = document.querySelector("#uwStockFacts");
    if (title) title.textContent = row.symbol ? `${row.symbol} ${row.name || ""}` : "Selected Stock";
    if (state) state.textContent = row.decision || row.scanner_decision || "No scanner row";
    if (chart) chart.innerHTML = metricBars([
      ["Score", row.score],
      ["Momentum", row.momentum_score],
      ["Quality", row.quality_score],
      ["6M", row.return_6m_pct],
      ["12M", row.return_12m_pct],
      ["Target", targetPct(row)]
    ]);
    if (facts) facts.innerHTML = [
      ["Close", money(row.close)],
      ["Liquidity", `${compact(row.adv20)} / ${number(row.rupee_turnover_cr)} cr`],
      ["Sector", row.sector || "Unmapped"],
      ["Candle Date", row.last_candle_date || "not attached"],
      ["Data", row.fetch_error ? "fetch gap" : row.candles?.length ? `${row.candles.length} candles` : "no candles attached"],
      ["Paper", row.paper_order?.status || "not created"]
    ].map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
  }

  function renderBrain(row, rows) {
    const score = document.querySelector("#uwBrainScore");
    const thesis = document.querySelector("#uwBrainThesis");
    const lifecycle = document.querySelector("#uwLifecycle");
    if (score) score.textContent = `${number(row.score || row.paper_score || 0)} / 100`;
    if (thesis) thesis.innerHTML = row.symbol ? `<strong>${escapeHtml(row.decision || "WATCH")} | ${escapeHtml(row.symbol)}</strong><p>${escapeHtml(row.reason || row.paper_reason || "No reason text returned by engine.")}</p><span>Universe ${workspace.scan?.summary?.total ?? rows.length}; data gaps ${workspace.scan?.summary?.DATA_NEEDED ?? 0}; source ${escapeHtml(row.data_source || workspace.scan?.source || "scanner")}</span>` : `<strong>No scanner result yet</strong><p>Run scanner or Upstox scan. No fake thesis is shown.</p>`;
    if (lifecycle) {
      const steps = [
        ["Scan", Boolean(workspace.scan?.rows?.length)],
        ["Signal", Boolean(row.symbol && row.decision !== "DATA_NEEDED")],
        ["Paper Ticket", Boolean(row.paper_order?.status === "READY" || row.paper_order?.status)],
        ["GTT Plan", Boolean(row.target_potential || row.paper_order?.target_price)],
        ["Position", Boolean((workspace.paperStatus?.status?.positions || []).find((p) => p.symbol === row.symbol))],
        ["Report", Boolean(workspace.scan?.summary)]
      ];
      lifecycle.innerHTML = steps.map(([label, ok]) => `<span class="${ok ? "hit" : "idle"}">${escapeHtml(label)}</span>`).join("");
    }
  }

  function renderTicket(row) {
    const host = document.querySelector("#uwOrderTicket");
    if (!host) return;
    const order = row.paper_order || {};
    host.innerHTML = `
      <label><span>Symbol</span><input readonly value="${escapeAttr(row.symbol || "")}" /></label>
      <label><span>Side</span><select><option>BUY</option><option>SELL</option></select></label>
      <label><span>Product</span><select><option>Paper Swing</option><option>Paper Intraday</option><option>Paper Positional</option></select></label>
      <label><span>Qty</span><input readonly value="${escapeAttr(order.qty || 0)}" /></label>
      <label><span>Entry</span><input readonly value="${escapeAttr(money(row.close || order.entry_price))}" /></label>
      <label><span>Target</span><input readonly value="${escapeAttr(targetLabel(row))}" /></label>
      <label><span>Stop</span><input readonly value="${escapeAttr(money(order.stop_price || row.stop_price))}" /></label>
      <label><span>Status</span><input readonly value="${escapeAttr(order.status || "not created")}" /></label>
      <button type="button" disabled>Paper BUY</button>
      <button type="button" disabled>Paper SELL</button>
      <button type="button" disabled>Paper GTT</button>
      <small>Live broker order path is locked. These fields are generated from AshStocks scanner evidence only.</small>
    `;
  }

  function renderQueue(rows) {
    const body = document.querySelector("#uwQueueBody");
    const count = document.querySelector("#uwQueueCount");
    if (count) count.textContent = `${rows.length} rows`;
    if (!body) return;
    body.innerHTML = rows.length ? rows.slice(0, 30).map((row) => `<tr data-symbol="${escapeAttr(row.symbol)}"><td><button type="button" data-select-symbol="${escapeAttr(row.symbol)}"><strong>${escapeHtml(row.symbol)}</strong><span>${escapeHtml(row.name || "")}</span></button></td><td><span class="decision ${escapeAttr(row.decision || "WATCH")}">${escapeHtml(row.decision || "WATCH")}</span></td><td>${number(row.score)}</td><td>${number(row.return_6m_pct)} / ${number(row.return_12m_pct)}</td><td>${escapeHtml(targetLabel(row))}</td><td>${escapeHtml(row.paper_order?.status || row.fetch_error || "watch")}</td></tr>`).join("") : `<tr><td colspan="6" class="empty-cell">No scanner rows available. Run scanner or Upstox scan.</td></tr>`;
    body.querySelectorAll("button[data-select-symbol]").forEach((button) => button.addEventListener("click", () => {
      workspace.selectedSymbol = button.dataset.selectSymbol;
      renderWorkspace();
    }));
  }

  function renderPiano(row) {
    const host = document.querySelector("#uwPianoQuick");
    if (!host) return;
    const groups = [
      { family: "Momentum", start: 261, count: 10, score: row.momentum_score || row.score || 0 },
      { family: "Candle Structure", start: 681, count: 20, score: candleScore(row) },
      { family: "Risk", start: 921, count: 10, score: Math.max(0, 100 - Number(row.regime_risk || 0)) },
      { family: "FII/DII", start: 1041, count: 10, score: row.flow_score || 0 },
      { family: "Entry Target Stop", start: 1521, count: 10, score: row.close && targetLabel(row) !== "not available" ? 100 : 0 }
    ];
    host.innerHTML = groups.map((group) => `<article><strong>${escapeHtml(group.family)}</strong><div>${Array.from({ length: group.count }, (_, index) => {
      const param = group.start + index;
      const state = index < Math.round(group.count * clamp(Number(group.score) || 0, 0, 100) / 100) ? "hit" : (group.score > 0 ? "warn" : "idle");
      return `<button type="button" class="uw-key ${state}" data-param="${param}" data-family="${escapeAttr(group.family)}">${param}</button>`;
    }).join("")}</div></article>`).join("");
  }

  function showWorkspaceParameter(param, family) {
    const row = selectedRow(scannerRows());
    const detail = document.querySelector("#uwParameterDetail");
    if (!detail) return;
    const candle = analyzeCandles(row);
    const source = family === "Candle Structure" ? "Upstox daily candles attached to scanner row" : "AshStocks scanner and paper workflow row";
    const evidence = family === "Candle Structure" ? candle.evidence : `${row.symbol || "no stock"}: score ${number(row.score)}, decision ${row.decision || "not available"}`;
    const impact = family === "Candle Structure" ? "Visible parameter hit now; core scoring wire-up is still pending until candle engine block is added." : "Feeds dashboard readiness and paper workflow display.";
    detail.innerHTML = `<strong>P${escapeHtml(param)} ${escapeHtml(family)}</strong><span>Source: ${escapeHtml(source)}</span><span>Evidence: ${escapeHtml(evidence)}</span><span>Impact: ${escapeHtml(impact)}</span>`;
  }

  function renderCandles(row) {
    const state = document.querySelector("#uwCandleState");
    const box = document.querySelector("#uwCandleBox");
    if (!box) return;
    const analysis = analyzeCandles(row);
    if (state) state.textContent = analysis.status;
    box.innerHTML = `<strong>${escapeHtml(analysis.title)}</strong><p>${escapeHtml(analysis.evidence)}</p><span>${escapeHtml(analysis.next)}</span>`;
  }

  function renderReport(rows) {
    const box = document.querySelector("#uwReportBox");
    const stamp = document.querySelector("#uwReportStamp");
    const summary = workspace.scan?.summary || {};
    if (stamp) stamp.textContent = workspace.scan?.asOf ? new Date(workspace.scan.asOf).toLocaleString() : "latest scanner payload";
    if (box) box.innerHTML = [
      ["Universe", summary.total ?? rows.length],
      ["SELECT", summary.SELECT ?? 0],
      ["WATCH", summary.WATCH ?? 0],
      ["Blocked", summary.BLOCKED ?? 0],
      ["Data Needed", summary.DATA_NEEDED ?? 0],
      ["Paper Plan", workspace.paperPlan ? "available" : "not run"]
    ].map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
  }

  function analyzeCandles(row) {
    const candles = normalizeCandles(row.candles || []);
    if (!row.symbol) return { status: "No stock", title: "No selected stock", evidence: "Select a scanner row first.", next: "Run scanner to populate rows." };
    if (!candles.length) return { status: "DATA_NEEDED", title: "No candle array attached", evidence: row.fetch_error || "Scanner row has close/return fields but not full candle bodies in the browser payload.", next: "Run Upstox historical scan; if Upstox returns 429, keep this parameter blocked until candles are available." };
    const last = candles.at(-1);
    const prev = candles.at(-2) || last;
    const body = Math.abs(last.close - last.open);
    const range = Math.max(0.0001, last.high - last.low);
    const upper = last.high - Math.max(last.open, last.close);
    const lower = Math.min(last.open, last.close) - last.low;
    const bullish = last.close > last.open;
    const engulf = bullish && last.open <= prev.close && last.close >= prev.open;
    const hammer = lower / range > 0.45 && upper / range < 0.25 && bullish;
    const wide = body / range > 0.65;
    const breakout = Number(row.high_252 || 0) && last.close >= Number(row.high_252) * 0.97;
    const hits = [engulf && "bullish engulfing", hammer && "hammer rejection", wide && "wide body", breakout && "near 252D breakout"].filter(Boolean);
    return { status: hits.length ? "HIT" : "WEAK", title: hits.length ? hits.join(", ") : "No proven candle pattern hit", evidence: `${row.symbol}: O ${number(last.open)} H ${number(last.high)} L ${number(last.low)} C ${number(last.close)}; body ${(body / range * 100).toFixed(1)}% of range`, next: hits.length ? "Candle family visible; next step is to add this score into server engine." : "Keep as watch-only until pattern threshold fires." };
  }

  function familyFilter(row, family) {
    if (family === "Candle Structure") return Boolean(row.candles?.length || row.fetch_error || row.last_candle_date);
    if (family === "Momentum") return Number(row.momentum_score || row.score || 0) > 0;
    if (family === "FII/DII") return Number(row.flow_score || 0) > 0;
    if (family === "Risk") return Number(row.regime_risk || 0) >= 0;
    if (family === "Entry Target Stop") return Boolean(row.close || row.paper_order);
    return true;
  }

  function pickSelectedSymbol(rows, current) {
    if (current && rows.some((row) => row.symbol === current)) return current;
    return rows.find((row) => row.decision === "SELECT")?.symbol || rows.find((row) => row.decision === "WATCH")?.symbol || rows[0]?.symbol || "";
  }

  function captureJson(response, callback) {
    response.clone().json().then((payload) => {
      if (payload && payload.ok !== false) callback(payload);
    }).catch(() => {});
  }

  async function fetchJson(path) {
    const response = await fetch(path);
    if (response.status === 401) return {};
    return response.json();
  }

  function normalizeCandles(candles) {
    return candles.map((candle) => Array.isArray(candle) ? {
      date: candle[0], open: Number(candle[1]), high: Number(candle[2]), low: Number(candle[3]), close: Number(candle[4]), volume: Number(candle[5])
    } : {
      date: candle.date, open: Number(candle.open), high: Number(candle.high), low: Number(candle.low), close: Number(candle.close), volume: Number(candle.volume)
    }).filter((candle) => [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite));
  }

  function metricBars(items) {
    return items.map(([label, value]) => {
      const pct = clamp(Math.abs(Number(value) || 0), 0, 100);
      return `<div><span>${escapeHtml(label)}</span><i><b style="width:${pct}%"></b></i><strong>${number(value)}</strong></div>`;
    }).join("");
  }

  function targetPct(row) {
    return Number(row.target_potential?.potential_left_pct ?? row.target_pct ?? 0);
  }

  function targetLabel(row) {
    const target = row.target_potential || {};
    if (target.label) return `${target.label} ${number(target.potential_left_pct)}%`;
    if (row.target_price || row.target2) return money(row.target_price || row.target2);
    return "not available";
  }

  function marketPrice(value) { return Number.isFinite(Number(value)) ? Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "not available"; }
  function money(value) { return Number.isFinite(Number(value)) ? `Rs ${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "not available"; }
  function number(value) { return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "not available"; }
  function signed(value) { return Number.isFinite(Number(value)) ? `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(2)}` : "not available"; }
  function compact(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "not available";
    if (n >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`;
    if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
    return String(Math.round(n));
  }
  function candleScore(row) { return analyzeCandles(row).status === "HIT" ? 100 : (row.candles?.length ? 35 : 0); }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
  function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
})();
