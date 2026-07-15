(() => {
  const state = {
    scan: null,
    ledger: null,
    quoteCache: {},
    selectedSymbol: "",
    busy: false,
    message: "",
    booted: false
  };

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const url = String(args[0] || "");
    if (url.includes("/api/scanner/run")) captureJson(response, (payload) => {
      state.scan = payload;
      state.selectedSymbol = pickSelectedSymbol(payload.rows || [], state.selectedSymbol);
      renderTradeQueueBridge();
    });
    if (url.includes("/api/paper-trader/orders")) captureJson(response, (payload) => {
      state.ledger = payload;
      renderTradeQueueBridge();
    });
    return response;
  };

  window.addEventListener("DOMContentLoaded", () => bootTradeQueueBridge().catch(() => {}));
  window.addEventListener("ashstocks:upstox-quote", (event) => {
    const detail = event.detail || {};
    if (detail.instrument_key && detail.quoteState) state.quoteCache[detail.instrument_key] = detail.quoteState;
    if (detail.symbol) state.selectedSymbol = detail.symbol;
    renderTradeQueueBridge();
  });

  document.addEventListener("click", (event) => {
    const selected = event.target.closest("button[data-select-symbol]");
    if (selected?.dataset?.selectSymbol) {
      state.selectedSymbol = selected.dataset.selectSymbol;
      setTimeout(renderTradeQueueBridge, 0);
    }
    const action = event.target.closest("button[data-uw-trade-action]");
    if (action) {
      const symbol = action.dataset.symbol || "";
      const row = scannerRows().find((item) => item.symbol === symbol) || {};
      state.selectedSymbol = symbol;
      submitQueuePaperAction(row, action.dataset.uwTradeAction).catch(() => {});
    }
  }, true);

  async function bootTradeQueueBridge() {
    if (state.booted) return;
    state.booted = true;
    await waitForWorkspace();
    installTradeQueueBridge();
    await refreshLedger();
    renderTradeQueueBridge();
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

  function installTradeQueueBridge() {
    const workspace = document.querySelector("#upstoxWorkspaceView");
    if (!workspace || document.querySelector("#uwTradeQueueBridge")) return;
    const anchor = document.querySelector("#uwSymbolWorkspace") || document.querySelector("#uwReasoningDock") || workspace.querySelector(".uw-lower-grid");
    const html = `
      <section class="panel uw-trade-queue-bridge" id="uwTradeQueueBridge">
        <div class="panel-header">
          <div><span class="eyebrow">Scanner To Execution</span><h3>Broker Trade Queue</h3></div>
          <span id="uwTradeQueueState">Waiting</span>
        </div>
        <div class="uw-trade-queue-summary" id="uwTradeQueueSummary"></div>
        <div class="uw-table-wrap uw-trade-queue-table">
          <table>
            <thead><tr><th>Rank</th><th>Stock</th><th>Decision</th><th>Score</th><th>Parameters</th><th>Quote</th><th>Risk</th><th>Paper Action</th></tr></thead>
            <tbody id="uwTradeQueueBody"></tbody>
          </table>
        </div>
      </section>
    `;
    if (anchor) anchor.insertAdjacentHTML("afterend", html);
    else workspace.insertAdjacentHTML("beforeend", html);
  }

  async function refreshLedger() {
    try {
      const response = await fetch("/api/paper-trader/orders");
      if (response.status === 401) return;
      const payload = await response.json();
      if (payload && payload.ok !== false) state.ledger = payload;
    } catch (_) {}
  }

  function renderTradeQueueBridge() {
    installTradeQueueBridge();
    const host = document.querySelector("#uwTradeQueueBody");
    const summary = document.querySelector("#uwTradeQueueSummary");
    const status = document.querySelector("#uwTradeQueueState");
    if (!host) return;
    const rows = scannerRows();
    const queue = actionableRows(rows);
    const selected = queue.find((row) => row.symbol === state.selectedSymbol) || queue[0] || {};
    if (status) status.textContent = state.busy ? "Working" : (state.message || `${queue.length} actionable`);
    if (summary) summary.innerHTML = renderSummary(rows, queue, selected);
    host.innerHTML = queue.length ? queue.slice(0, 40).map((row, index) => renderQueueRow(row, index)).join("") : `<tr><td colspan="8" class="empty-cell">No actionable scanner rows. Run Upstox scan; rows with DATA_NEEDED remain blocked until real data is available.</td></tr>`;
  }

  function renderSummary(rows, queue, selected) {
    const selectCount = rows.filter((row) => row.decision === "SELECT").length;
    const watchCount = rows.filter((row) => row.decision === "WATCH").length;
    const quoteReady = queue.filter((row) => quoteStateFor(row).quote).length;
    const paperOpen = queue.filter((row) => ledgerFor(row.symbol).orders.length || ledgerFor(row.symbol).position).length;
    return [
      ["Rows", rows.length],
      ["SELECT", selectCount],
      ["WATCH", watchCount],
      ["Quote Ready", quoteReady],
      ["Paper Linked", paperOpen],
      ["Selected", selected.symbol || "none"]
    ].map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
  }

  function renderQueueRow(row, index) {
    const quoteState = quoteStateFor(row);
    const ledger = ledgerFor(row.symbol);
    const params = parameterHits(row, quoteState);
    const quote = quoteState.quote;
    const decision = row.decision || row.scanner_decision || "DATA_NEEDED";
    const selected = row.symbol === state.selectedSymbol ? " selected" : "";
    return `
      <tr class="${selected}">
        <td>${index + 1}</td>
        <td><button type="button" data-select-symbol="${escapeAttr(row.symbol)}"><strong>${escapeHtml(row.symbol)}</strong><span>${escapeHtml(row.name || row.sector || "")}</span></button></td>
        <td><span class="decision ${escapeAttr(decision)}">${escapeHtml(decision)}</span><small>${escapeHtml(row.paper_order?.status || ledger.position ? "paper linked" : "not in paper")}</small></td>
        <td>${number(row.score || row.paper_score)}<small>mom ${number(row.momentum_score)}</small></td>
        <td>${renderParamChips(params)}</td>
        <td><strong>${escapeHtml(quote ? money(quote.last_price || quote.close) : "DATA_NEEDED")}</strong><small>${escapeHtml(quoteStatus(row, quoteState))}</small></td>
        <td>${escapeHtml(riskText(row, params))}<small>${escapeHtml(targetText(row))}</small></td>
        <td><div class="uw-trade-actions"><button type="button" data-select-symbol="${escapeAttr(row.symbol)}">Open</button><button type="button" data-uw-trade-action="BUY" data-symbol="${escapeAttr(row.symbol)}">BUY</button><button type="button" data-uw-trade-action="GTT" data-symbol="${escapeAttr(row.symbol)}">GTT</button></div></td>
      </tr>
    `;
  }

  function scannerRows() {
    return (state.scan?.rows || []).slice().sort((a, b) => {
      const rank = (row) => row.decision === "SELECT" ? 3 : row.decision === "WATCH" ? 2 : row.decision === "BLOCKED" ? 1 : 0;
      return rank(b) - rank(a) || Number(b.score || b.paper_score || 0) - Number(a.score || a.paper_score || 0);
    });
  }

  function actionableRows(rows) {
    return rows.filter((row) => row.symbol && !["REJECT"].includes(row.decision)).slice(0, 80);
  }

  function parameterHits(row, quoteState) {
    const candleStatus = row.candle_status || row.candle_engine?.status || (row.candles?.length ? "PASS" : "DATA_NEEDED");
    return [
      ["Momentum", Number(row.score || row.paper_score || 0) >= 60 || Number(row.return_6m_pct || 0) >= 8],
      ["Candle", candleStatus === "HIT" || candleStatus === "PASS"],
      ["Liquidity", Number(row.rupee_turnover_cr || 0) > 0 || Number(row.adv20 || 0) > 0],
      ["Target", targetPotential(row) >= 8 || row.target_price || row.target2],
      ["Risk", Number(row.regime_risk || 0) < 50 || !row.regime_risk],
      ["Quote", Boolean(quoteState.quote)]
    ];
  }

  function renderParamChips(items) {
    return `<div class="uw-trade-param-chips">${items.map(([label, ok]) => `<span class="${ok ? "hit" : "wait"}">${escapeHtml(label)}</span>`).join("")}</div>`;
  }

  async function submitQueuePaperAction(row, action) {
    if (state.busy || !row.symbol) return;
    state.busy = true;
    state.message = `Sending ${row.symbol} ${action}...`;
    renderTradeQueueBridge();
    try {
      const quote = quoteStateFor(row).quote || {};
      const price = firstFinite(quote.last_price, quote.close, row.close, row.entry_price, 0);
      const payload = {
        symbol: row.symbol,
        name: row.name || row.symbol,
        sector: row.sector || "Unmapped",
        instrument_key: instrumentKey(row) || null,
        side: "BUY",
        product: "Paper Swing",
        order_type: action === "GTT" ? "GTT" : "MARKET",
        validity: action === "GTT" ? "GTT" : "DAY",
        qty: estimatedQty(row, price),
        price,
        trigger_price: action === "GTT" && price ? Number((price * 1.002).toFixed(2)) : null,
        target_price: firstFinite(row.target_price, row.target2, row.advisor?.target2, row.advisor?.target1, null),
        stop_price: firstFinite(row.stop_price, row.advisor?.stop, null),
        risk_pct: 0.75,
        capital: 100000,
        thesis: row.advisor?.why || row.paper_reason || row.reason || "AshStocks broker trade queue paper action",
        source: "upstox-trade-queue-bridge",
        quote_source: quote.last_price || quote.close ? "Upstox Market Quote API" : "scanner-fallback",
        gtt: action === "GTT"
      };
      const response = await fetch("/api/paper-trader/order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false) throw new Error(result.error || result.order?.rejection_reason || `paper action failed ${response.status}`);
      state.message = `${row.symbol} ${result.action || action} ${result.order?.id || result.gtt?.id || "done"}`;
      await refreshLedger();
    } catch (error) {
      state.message = error.message || String(error);
    } finally {
      state.busy = false;
      renderTradeQueueBridge();
    }
  }

  function ledgerFor(symbol) {
    const ledger = state.ledger || {};
    const match = (item) => String(item?.symbol || "").toUpperCase() === String(symbol || "").toUpperCase();
    return {
      orders: (ledger.orders || []).filter(match),
      gtt: (ledger.gtt || ledger.gtts || []).filter(match),
      position: (ledger.positions || []).find(match) || null
    };
  }

  function instrumentKey(row) { return row.instrument_key || row.instrumentKey || row.instrument_token || ""; }
  function quoteStateFor(row) { return state.quoteCache[instrumentKey(row)] || window.__ashstocksUpstoxQuoteCache?.[instrumentKey(row)] || {}; }
  function quoteStatus(row, quoteState) {
    if (!instrumentKey(row)) return "instrument_key DATA_NEEDED";
    if (quoteState.loading) return "quote loading";
    if (quoteState.quote?.depth_available) return "quote + depth ok";
    if (quoteState.quote) return "quote ok; depth missing";
    if (quoteState.error) return `quote failed: ${quoteState.error}`;
    return "quote not requested yet";
  }

  function riskText(row, params) {
    const failed = params.filter(([, ok]) => !ok).map(([label]) => label);
    if (failed.length) return `Needs ${failed.slice(0, 3).join(", ")}`;
    return "Ready for paper";
  }

  function targetText(row) {
    const target = row.target_potential || {};
    if (target.label) return `${target.label} ${number(target.potential_left_pct)}%`;
    const targetPrice = firstFinite(row.target_price, row.target2, row.advisor?.target2, row.advisor?.target1, null);
    return targetPrice ? `Target ${money(targetPrice)}` : "target DATA_NEEDED";
  }

  function targetPotential(row) { return Number(row.target_potential?.potential_left_pct ?? row.target_pct ?? 0); }
  function estimatedQty(row, price) {
    const capital = 100000;
    const value = Number(price || row.close || 0);
    return value ? Math.max(1, Math.floor(capital / value)) : 0;
  }

  function pickSelectedSymbol(rows, current) {
    if (current && rows.some((row) => row.symbol === current)) return current;
    return rows.find((row) => row.decision === "SELECT")?.symbol || rows.find((row) => row.decision === "WATCH")?.symbol || rows[0]?.symbol || "";
  }

  function captureJson(response, callback) { response.clone().json().then((payload) => { if (payload && payload.ok !== false) callback(payload); }).catch(() => {}); }
  function firstFinite(...values) {
    for (const value of values) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }
  function money(value) { return Number.isFinite(Number(value)) ? "Rs " + Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "not available"; }
  function number(value) { return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "0.00"; }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
  function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
})();
