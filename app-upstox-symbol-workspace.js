(() => {
  const state = {
    scan: null,
    ledger: null,
    selectedSymbol: "",
    booted: false,
    busy: false,
    message: ""
  };

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const url = String(args[0] || "");
    if (url.includes("/api/scanner/run")) captureJson(response, (payload) => {
      state.scan = payload;
      state.selectedSymbol = pickSelectedSymbol(payload.rows || [], state.selectedSymbol);
      renderSymbolWorkspace();
    });
    if (url.includes("/api/paper-trader/orders")) captureJson(response, (payload) => {
      state.ledger = payload;
      renderSymbolWorkspace();
    });
    return response;
  };

  window.addEventListener("DOMContentLoaded", () => boot().catch(() => {}));

  document.addEventListener("click", (event) => {
    const selected = event.target.closest("button[data-select-symbol]");
    if (selected?.dataset?.selectSymbol) {
      state.selectedSymbol = selected.dataset.selectSymbol;
      setTimeout(renderSymbolWorkspace, 0);
    }
  }, true);

  async function boot() {
    if (state.booted) return;
    state.booted = true;
    await waitForWorkspace();
    installSymbolWorkspace();
    await refreshLedger();
    renderSymbolWorkspace();
    setInterval(() => refreshLedger().catch(() => {}), 60000);
  }

  function waitForWorkspace() {
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (document.querySelector("#upstoxWorkspaceView")) return resolve();
        if (Date.now() - started > 12000) return resolve();
        setTimeout(tick, 80);
      };
      tick();
    });
  }

  function installSymbolWorkspace() {
    const workspace = document.querySelector("#upstoxWorkspaceView");
    if (!workspace || document.querySelector("#uwSymbolWorkspace")) return;
    const anchor = workspace.querySelector(".uw-market-strip") || workspace.querySelector(".uw-commandbar");
    const html = `
      <section class="uw-symbol-workspace" id="uwSymbolWorkspace">
        <div class="panel-header">
          <div><span class="eyebrow">Upstox-Style Symbol Workspace</span><h3 id="uwSymbolName">No stock selected</h3></div>
          <span id="uwSymbolMode">Paper only | Live orders locked</span>
        </div>
        <div class="uw-symbol-layout">
          <section class="uw-symbol-chart-card">
            <div class="uw-symbol-toolbar">
              <div id="uwSymbolQuote" class="uw-symbol-quote"></div>
              <div class="uw-symbol-tabs"><button type="button" class="active">1D</button><button type="button">Swing</button><button type="button">Position</button><button type="button">Portfolio</button></div>
            </div>
            <div id="uwSymbolChart" class="uw-symbol-chart"></div>
          </section>
          <section class="uw-symbol-side-card">
            <div class="panel-header"><h3>Depth / Readiness</h3><span id="uwDepthState">DATA_NEEDED</span></div>
            <div id="uwDepthBox" class="uw-depth-box"></div>
            <div class="panel-header compact"><h3>Paper Actions</h3><span id="uwPaperActionState">Waiting</span></div>
            <div id="uwPaperActionBox" class="uw-paper-actions"></div>
          </section>
        </div>
        <div class="uw-symbol-bottom">
          <section><div class="panel-header"><h3>Selected Stock Ledger</h3><span id="uwSymbolLedgerCount">0</span></div><div id="uwSymbolLedger" class="uw-symbol-ledger"></div></section>
          <section><div class="panel-header"><h3>Trade Plan</h3><span id="uwSymbolPlanState">Waiting</span></div><div id="uwSymbolPlan" class="uw-symbol-plan"></div></section>
        </div>
      </section>
    `;
    if (anchor) anchor.insertAdjacentHTML("afterend", html);
    else workspace.insertAdjacentHTML("beforeend", html);
    document.querySelector("#uwPaperActionBox")?.addEventListener("click", (event) => {
      const action = event.target.closest("button[data-uw-symbol-action]");
      if (action) submitPaperAction(action.dataset.uwSymbolAction).catch(() => {});
    });
  }

  async function refreshLedger() {
    try {
      const response = await fetch("/api/paper-trader/orders");
      if (response.status !== 401) {
        const payload = await response.json();
        if (payload && payload.ok !== false) state.ledger = payload;
      }
    } catch (_) {}
  }

  function renderSymbolWorkspace() {
    installSymbolWorkspace();
    const host = document.querySelector("#uwSymbolWorkspace");
    if (!host) return;
    const rows = state.scan?.rows || [];
    const row = rows.find((item) => item.symbol === state.selectedSymbol) || pickActionableRow(rows) || {};
    const selectedName = document.querySelector("#uwSymbolName");
    if (selectedName) selectedName.textContent = row.symbol ? `${row.symbol} ${row.name || ""}` : "No stock selected";
    renderQuote(row);
    renderChart(row);
    renderDepth(row);
    renderActions(row);
    renderLedger(row.symbol);
    renderPlan(row);
  }

  function renderQuote(row) {
    const host = document.querySelector("#uwSymbolQuote");
    if (!host) return;
    if (!row.symbol) {
      host.innerHTML = `<strong>Run scanner</strong><span>No selected stock row yet.</span>`;
      return;
    }
    host.innerHTML = `
      <strong>${money(row.close)}</strong>
      <span>${escapeHtml(row.decision || "DATA_NEEDED")} | Score ${number(row.score || row.paper_score)} | 6M ${number(row.return_6m_pct)}% | 12M ${number(row.return_12m_pct)}%</span>
    `;
  }

  function renderChart(row) {
    const host = document.querySelector("#uwSymbolChart");
    if (!host) return;
    const candles = normalizeCandles(row.candles || []);
    if (!row.symbol) {
      host.innerHTML = emptyChart("No scanner row selected", "Run scanner/Upstox scan to draw a stock chart.");
      return;
    }
    if (!candles.length) {
      const missing = row.fetch_error || "Need Upstox daily candles array in scanner row: open/high/low/close/volume/date.";
      host.innerHTML = emptyChart("DATA_NEEDED: candle chart not available", missing);
      return;
    }
    host.innerHTML = candleSvg(candles.slice(-80), row);
  }

  function renderDepth(row) {
    const stateNode = document.querySelector("#uwDepthState");
    const host = document.querySelector("#uwDepthBox");
    if (!host) return;
    const hasExchangeDepth = Array.isArray(row.depth?.bids) && Array.isArray(row.depth?.asks);
    if (stateNode) stateNode.textContent = hasExchangeDepth ? "LIVE_DEPTH" : "DATA_NEEDED";
    if (!row.symbol) {
      host.innerHTML = `<article><strong>No stock selected</strong><span>Depth waits for selected scanner row.</span></article>`;
      return;
    }
    if (!hasExchangeDepth) {
      host.innerHTML = `
        <article><strong>Exchange depth not wired</strong><span>DATA_NEEDED: Upstox market depth/websocket feed is not present in this app yet.</span></article>
        <article><strong>Paper risk preview</strong><span>LTP ${money(row.close)} | Stop ${money(row.stop_price || row.advisor?.stop)} | Target ${targetText(row)}</span></article>
        <article><strong>Tradability</strong><span>Turnover ${number(row.rupee_turnover_cr)} cr | ADV ${compact(row.adv20)} | Liquidity parameter remains evidence-based.</span></article>
      `;
      return;
    }
    host.innerHTML = `<div class="uw-depth-ladder"><section><b>Bids</b>${row.depth.bids.slice(0, 5).map(depthRow).join("")}</section><section><b>Asks</b>${row.depth.asks.slice(0, 5).map(depthRow).join("")}</section></div>`;
  }

  function renderActions(row) {
    const host = document.querySelector("#uwPaperActionBox");
    const stateNode = document.querySelector("#uwPaperActionState");
    if (!host) return;
    if (stateNode) stateNode.textContent = state.busy ? "Working" : (state.message || "Paper only");
    if (!row.symbol) {
      host.innerHTML = `<span>No stock selected.</span>`;
      return;
    }
    const qty = row.paper_order?.qty || row.advisor?.qty || estimatedQty(row);
    host.innerHTML = `
      <div class="uw-paper-action-grid">
        <label><span>Qty</span><input id="uwSymbolQty" value="${escapeAttr(qty)}" /></label>
        <label><span>Price</span><input id="uwSymbolPrice" value="${escapeAttr(numberValue(row.close || row.paper_order?.entry_price))}" /></label>
        <label><span>Target</span><input id="uwSymbolTarget" value="${escapeAttr(numberValue(row.target_price || row.target2 || row.advisor?.target2 || row.advisor?.target1))}" /></label>
        <label><span>Stop</span><input id="uwSymbolStop" value="${escapeAttr(numberValue(row.stop_price || row.advisor?.stop || row.paper_order?.stop_price))}" /></label>
      </div>
      <div class="uw-paper-action-row">
        <button type="button" data-uw-symbol-action="BUY">Paper BUY</button>
        <button type="button" data-uw-symbol-action="SELL">Paper SELL</button>
        <button type="button" data-uw-symbol-action="GTT">Paper GTT</button>
      </div>
      <small>These post only to /api/paper-trader/order. broker_write_enabled stays false.</small>
    `;
  }

  function renderLedger(symbol) {
    const count = document.querySelector("#uwSymbolLedgerCount");
    const host = document.querySelector("#uwSymbolLedger");
    if (!host) return;
    const ledger = state.ledger || {};
    const match = (item) => String(item?.symbol || "").toUpperCase() === String(symbol || "").toUpperCase();
    const rows = [
      ...(ledger.orders || []).filter(match).map((item) => ({ type: "Order", text: `${item.side} ${item.qty} @ ${money(item.price)} | ${item.status}` })),
      ...(ledger.trades || []).filter(match).map((item) => ({ type: "Trade", text: `${item.side} ${item.qty} @ ${money(item.price)} | value ${money(item.value)}` })),
      ...(ledger.gtt || []).filter(match).map((item) => ({ type: "GTT", text: `target ${money(item.target_price)} / stop ${money(item.stop_price)} | ${item.status}` })),
      ...(ledger.positions || []).filter(match).map((item) => ({ type: "Position", text: `${item.qty} qty | avg ${money(item.entry_price || item.avg_price)} | pnl ${number(item.pnl_pct)}%` }))
    ];
    if (count) count.textContent = String(rows.length);
    host.innerHTML = rows.length ? rows.slice(-12).reverse().map((item) => `<article><strong>${escapeHtml(item.type)}</strong><span>${escapeHtml(item.text)}</span></article>`).join("") : `<article><strong>No selected-stock ledger yet</strong><span>Paper BUY/SELL/GTT will appear here after action.</span></article>`;
  }

  function renderPlan(row) {
    const stateNode = document.querySelector("#uwSymbolPlanState");
    const host = document.querySelector("#uwSymbolPlan");
    if (!host) return;
    if (!row.symbol) {
      if (stateNode) stateNode.textContent = "Waiting";
      host.innerHTML = `<article><strong>No plan</strong><span>Run scanner and select a stock.</span></article>`;
      return;
    }
    if (stateNode) stateNode.textContent = row.paper_order?.status || row.decision || "WATCH";
    const advisor = row.advisor || {};
    const lines = [
      ["Thesis", advisor.why || row.reason || row.paper_reason || "No thesis returned by engine."],
      ["Entry", entryText(row)],
      ["Target", targetText(row)],
      ["Stop", money(row.stop_price || advisor.stop || row.paper_order?.stop_price)],
      ["Candle", candleText(row)],
      ["Risk", `regime ${number(row.regime_risk)} | flow ${number(row.flow_score)} | target room ${number(row.target_potential?.potential_left_pct || row.target_pct)}%`]
    ];
    host.innerHTML = lines.map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
  }

  async function submitPaperAction(action) {
    if (state.busy) return;
    const row = selectedRow();
    if (!row.symbol) return;
    state.busy = true;
    state.message = `Sending ${action}...`;
    renderSymbolWorkspace();
    try {
      const payload = {
        symbol: row.symbol,
        name: row.name || row.symbol,
        sector: row.sector || "Unmapped",
        side: action === "SELL" ? "SELL" : "BUY",
        product: document.querySelector("#uwProduct")?.value || "Paper Swing",
        order_type: action === "GTT" ? "GTT" : "MARKET",
        qty: Math.max(0, Math.floor(Number(inputValue("#uwSymbolQty")) || estimatedQty(row))),
        price: Number(inputValue("#uwSymbolPrice")) || Number(row.close || 0),
        target_price: Number(inputValue("#uwSymbolTarget")) || Number(row.target_price || row.target2 || row.advisor?.target2 || 0) || null,
        stop_price: Number(inputValue("#uwSymbolStop")) || Number(row.stop_price || row.advisor?.stop || 0) || null,
        thesis: row.advisor?.why || row.paper_reason || row.reason || "AshStocks symbol workspace paper action",
        source: "upstox-symbol-workspace",
        gtt: action === "GTT"
      };
      const response = await fetch("/api/paper-trader/order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false) throw new Error(result.error || result.order?.rejection_reason || `paper action failed ${response.status}`);
      state.message = `${result.action || action} ${result.order?.id || result.gtt?.id || "done"}`;
      await refreshLedger();
    } catch (error) {
      state.message = error.message || String(error);
    } finally {
      state.busy = false;
      renderSymbolWorkspace();
    }
  }

  function selectedRow() {
    const rows = state.scan?.rows || [];
    return rows.find((row) => row.symbol === state.selectedSymbol) || pickActionableRow(rows) || {};
  }

  function candleSvg(candles, row) {
    const width = 760;
    const height = 260;
    const pad = 28;
    const lows = candles.map((candle) => candle.low);
    const highs = candles.map((candle) => candle.high);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const span = Math.max(0.0001, max - min);
    const step = (width - pad * 2) / Math.max(1, candles.length - 1);
    const y = (value) => height - pad - ((value - min) / span) * (height - pad * 2);
    const bodyWidth = Math.max(3, Math.min(8, step * 0.55));
    const nodes = candles.map((candle, index) => {
      const x = pad + index * step;
      const openY = y(candle.open);
      const closeY = y(candle.close);
      const highY = y(candle.high);
      const lowY = y(candle.low);
      const up = candle.close >= candle.open;
      const top = Math.min(openY, closeY);
      const bodyHeight = Math.max(2, Math.abs(closeY - openY));
      return `<g><line x1="${x.toFixed(1)}" y1="${highY.toFixed(1)}" x2="${x.toFixed(1)}" y2="${lowY.toFixed(1)}" class="${up ? "up" : "down"}"/><rect x="${(x - bodyWidth / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bodyWidth.toFixed(1)}" height="${bodyHeight.toFixed(1)}" class="${up ? "up" : "down"}"/></g>`;
    }).join("");
    const last = candles.at(-1);
    return `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(row.symbol)} daily candle chart">
        <rect x="0" y="0" width="${width}" height="${height}" rx="8" class="bg"/>
        <line x1="${pad}" y1="${y(last.close).toFixed(1)}" x2="${width - pad}" y2="${y(last.close).toFixed(1)}" class="last"/>
        ${nodes}
        <text x="${pad}" y="20">${escapeHtml(row.symbol)} daily candles (${candles.length})</text>
        <text x="${width - pad - 150}" y="20">Last ${money(last.close)}</text>
      </svg>
    `;
  }

  function emptyChart(title, text) {
    return `<div class="uw-symbol-empty"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div>`;
  }

  function normalizeCandles(candles) {
    return candles.map((candle) => Array.isArray(candle) ? {
      date: candle[0], open: Number(candle[1]), high: Number(candle[2]), low: Number(candle[3]), close: Number(candle[4]), volume: Number(candle[5])
    } : {
      date: candle.date, open: Number(candle.open), high: Number(candle.high), low: Number(candle.low), close: Number(candle.close), volume: Number(candle.volume)
    }).filter((candle) => [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite));
  }

  function pickSelectedSymbol(rows, current) {
    if (current && rows.some((row) => row.symbol === current)) return current;
    return pickActionableRow(rows)?.symbol || "";
  }

  function pickActionableRow(rows) {
    return rows.find((row) => row.decision === "SELECT") || rows.find((row) => row.decision === "WATCH") || rows[0];
  }

  function depthRow(row) {
    return `<span><b>${money(row.price)}</b><em>${escapeHtml(row.qty || row.quantity || 0)}</em></span>`;
  }

  function candleText(row) {
    const patterns = row.candle_patterns || row.candle_engine?.patterns || [];
    return row.candle_status || row.candle_engine?.status || (patterns.length ? patterns.join(", ") : "DATA_NEEDED");
  }

  function entryText(row) {
    const zone = row.advisor?.entry_zone || row.entry_zone;
    if (zone?.low && zone?.high) return `${money(zone.low)} - ${money(zone.high)}`;
    return money(row.close || row.entry_price || row.paper_order?.entry_price);
  }

  function targetText(row) {
    const target = row.target_potential || {};
    if (target.label) return `${target.label} ${number(target.potential_left_pct)}%`;
    return money(row.target_price || row.target2 || row.advisor?.target2 || row.advisor?.target1);
  }

  function estimatedQty(row) {
    const price = Number(row.close || row.entry_price || 0);
    return price ? Math.max(1, Math.floor(100000 / price)) : 0;
  }

  function inputValue(selector) { return document.querySelector(selector)?.value || ""; }
  function numberValue(value) { return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : ""; }
  function money(value) { return Number.isFinite(Number(value)) ? "Rs " + Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "not available"; }
  function number(value) { return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "0.00"; }
  function compact(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "not available";
    if (n >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`;
    if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
    return String(Math.round(n));
  }
  function captureJson(response, callback) { response.clone().json().then((payload) => { if (payload && payload.ok !== false) callback(payload); }).catch(() => {}); }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
  function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
})();
