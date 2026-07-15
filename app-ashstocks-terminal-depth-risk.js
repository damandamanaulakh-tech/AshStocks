(() => {
  const state = {
    rows: [],
    selectedSymbol: "",
    quotes: {},
    ledger: null,
    status: null
  };

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const url = String(args[0] || "");
    if (url.includes("/api/scanner/run")) captureJson(response, (payload) => {
      if (Array.isArray(payload.rows)) {
        state.rows = payload.rows;
        state.selectedSymbol = chooseSymbol(payload.rows, state.selectedSymbol);
        renderDepthRisk();
      }
    });
    if (url.includes("/api/paper-trader/orders")) captureJson(response, (payload) => {
      state.ledger = payload;
      renderDepthRisk();
    });
    if (url.includes("/api/paper-trader/status")) captureJson(response, (payload) => {
      state.status = payload;
      renderDepthRisk();
    });
    return response;
  };

  window.addEventListener("DOMContentLoaded", () => bootDepthRisk());
  window.addEventListener("ashstocks:broker-select-symbol", (event) => {
    if (event.detail?.symbol) {
      state.selectedSymbol = event.detail.symbol;
      renderDepthRisk();
    }
  });
  window.addEventListener("ashstocks:upstox-quote", (event) => {
    const detail = event.detail || {};
    const key = detail.instrument_key || detail.quoteState?.quote?.instrument_key || "";
    if (key) state.quotes[key] = detail.quoteState || { quote: detail.quote, ok: true };
    renderDepthRisk();
  });

  document.addEventListener("click", (event) => {
    const rowButton = event.target.closest("button[data-terminal-symbol]");
    if (rowButton?.dataset?.terminalSymbol) {
      state.selectedSymbol = rowButton.dataset.terminalSymbol;
      renderDepthRisk();
    }
    const refresh = event.target.closest("button[data-depth-risk-refresh]");
    if (refresh) refreshStatus().catch(() => {});
  }, true);

  const observer = new MutationObserver(() => installDepthRisk());

  function bootDepthRisk() {
    observer.observe(document.documentElement, { childList: true, subtree: true });
    installDepthRisk();
    refreshStatus().catch(() => {});
  }

  async function refreshStatus() {
    const [orders, status] = await Promise.allSettled([
      nativeFetch("/api/paper-trader/orders").then((r) => r.status === 401 ? null : r.json()),
      nativeFetch("/api/paper-trader/status").then((r) => r.status === 401 ? null : r.json())
    ]);
    if (orders.status === "fulfilled" && orders.value) state.ledger = orders.value;
    if (status.status === "fulfilled" && status.value) state.status = status.value;
    renderDepthRisk();
  }

  function installDepthRisk() {
    const ticket = document.querySelector("#terminalTicketBody");
    if (!ticket || document.querySelector("#terminalDepthRisk")) return;
    ticket.insertAdjacentHTML("afterend", `
      <section class="terminal-depth-risk" id="terminalDepthRisk">
        <div class="panel-header compact"><h3>Depth, Funds & Risk</h3><button type="button" data-depth-risk-refresh>Refresh</button></div>
        <div class="terminal-depth-risk-grid">
          <section><div class="depth-risk-title">Market Depth</div><div id="terminalDepthBook"></div></section>
          <section><div class="depth-risk-title">Funds & Exposure</div><div id="terminalFundsRisk"></div></section>
          <section><div class="depth-risk-title">Position Sizing</div><div id="terminalPositionSizing"></div></section>
        </div>
      </section>
    `);
    renderDepthRisk();
  }

  function renderDepthRisk() {
    installDepthRisk();
    const row = selectedRow();
    renderDepth(row);
    renderFunds(row);
    renderSizing(row);
  }

  function renderDepth(row) {
    const host = document.querySelector("#terminalDepthBook");
    if (!host) return;
    const quote = quoteState(row).quote;
    const bids = quote?.depth?.bids || [];
    const asks = quote?.depth?.asks || [];
    if (!row.symbol) {
      host.innerHTML = dataNeeded("Selected stock", "Select a scanner row to request market depth.");
      return;
    }
    if (!bids.length && !asks.length) {
      host.innerHTML = dataNeeded("UPSTOX_DEPTH", "Depth not returned by /api/upstox/quote yet. Quote LTP may still be available.");
      return;
    }
    host.innerHTML = `
      <div class="terminal-depth-ladder">
        <article><strong>Bids</strong>${bids.slice(0, 5).map(depthRow).join("") || `<span>DATA_NEEDED</span>`}</article>
        <article><strong>Asks</strong>${asks.slice(0, 5).map(depthRow).join("") || `<span>DATA_NEEDED</span>`}</article>
      </div>
      <div class="depth-risk-note">Source: Upstox Market Quote API depth fields.</div>
    `;
  }

  function renderFunds(row) {
    const host = document.querySelector("#terminalFundsRisk");
    if (!host) return;
    const funds = state.status?.status?.funds || state.status?.funds || {};
    const orders = state.ledger?.orders || [];
    const positions = state.ledger?.positions || [];
    const virtualCapital = numberValue(funds.capital || funds.virtual_capital || funds.cash || 100000);
    const used = sumExposure(positions, orders);
    const available = Math.max(0, virtualCapital - used);
    host.innerHTML = `
      <div class="terminal-risk-metrics">
        ${metric("Virtual capital", money(virtualCapital), funds.capital || funds.cash ? "paper ledger/status" : "default paper account")}
        ${metric("Exposure", money(used), `${positions.length} positions / ${orders.length} orders`)}
        ${metric("Buying power", money(available), "virtual only")}
        ${metric("Mode", "PAPER ONLY", "broker_write_enabled false")}
      </div>
    `;
  }

  function renderSizing(row) {
    const host = document.querySelector("#terminalPositionSizing");
    if (!host) return;
    if (!row.symbol) {
      host.innerHTML = dataNeeded("Position sizing", "Select stock before sizing.");
      return;
    }
    const price = quotePrice(row);
    const stop = Number(row.stop_price || row.advisor?.stop || row.paper_order?.stop_price || 0);
    const target = Number(row.target_price || row.target2 || row.advisor?.target2 || 0);
    const capital = 100000;
    const riskPct = 0.75;
    const riskRupees = capital * riskPct / 100;
    const riskPerShare = price > 0 && stop > 0 ? Math.max(0, price - stop) : 0;
    const qty = riskPerShare > 0 ? Math.max(1, Math.floor(riskRupees / riskPerShare)) : estimatedQty(price, capital);
    const reward = price > 0 && target > 0 ? target - price : 0;
    const rr = riskPerShare > 0 && reward > 0 ? reward / riskPerShare : null;
    host.innerHTML = `
      <div class="terminal-risk-metrics">
        ${metric("Entry", money(price), quoteState(row).quote ? "Upstox quote" : "scanner fallback")}
        ${metric("Stop", stop > 0 ? money(stop) : "DATA_NEEDED", "from engine/advisor")}
        ${metric("Target", target > 0 ? money(target) : "DATA_NEEDED", "from target room")}
        ${metric("Risk", `${riskPct.toFixed(2)}% / ${money(riskRupees)}`, "virtual capital")}
        ${metric("Qty", String(qty), riskPerShare > 0 ? `risk/share ${money(riskPerShare)}` : "fallback 10% capital")}
        ${metric("R:R", rr ? rr.toFixed(2) : "DATA_NEEDED", "target-stop required")}
      </div>
    `;
  }

  function depthRow(row) {
    return `<span><b>${money(row.price)}</b><em>${compact(row.quantity)} qty ${row.orders ? `| ${row.orders} orders` : ""}</em></span>`;
  }

  function metric(label, value, note) {
    return `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`;
  }

  function dataNeeded(label, text) {
    return `<div class="terminal-depth-needed"><strong>${escapeHtml(label)} DATA_NEEDED</strong><span>${escapeHtml(text)}</span></div>`;
  }

  function sumExposure(positions, orders) {
    const posValue = positions.reduce((sum, item) => sum + Math.abs(Number(item.qty || 0) * Number(item.entry_price || item.avg_price || item.price || 0)), 0);
    const pendingValue = orders.filter((item) => !/CANCEL|REJECT/i.test(String(item.status || ""))).reduce((sum, item) => sum + Math.abs(Number(item.qty || 0) * Number(item.price || item.entry_price || 0)), 0);
    return posValue + pendingValue;
  }

  function selectedRow() { return state.rows.find((row) => row.symbol === state.selectedSymbol) || rankedRows()[0] || {}; }
  function rankedRows() { return [...state.rows].sort((a, b) => rank(b) - rank(a) || Number(b.score || b.paper_score || 0) - Number(a.score || a.paper_score || 0)); }
  function rank(row) { return row.decision === "SELECT" ? 5 : row.decision === "WATCH" ? 4 : row.candle_status === "HIT" ? 3 : row.decision === "BLOCKED" ? 2 : 1; }
  function chooseSymbol(rows, current) { return current && rows.some((row) => row.symbol === current) ? current : rows.find((row) => row.decision === "SELECT")?.symbol || rows.find((row) => row.decision === "WATCH")?.symbol || rows[0]?.symbol || ""; }
  function instrumentKey(row) { return row?.instrument_key || row?.instrumentKey || row?.instrument_token || ""; }
  function quoteState(row) { return state.quotes[instrumentKey(row)] || window.__ashstocksUpstoxQuoteCache?.[instrumentKey(row)] || {}; }
  function quotePrice(row) { return Number(quoteState(row).quote?.last_price ?? row.close ?? row.paper_order?.entry_price ?? row.entry_price ?? 0); }
  function estimatedQty(price, capital) { return price > 0 ? Math.max(1, Math.floor((capital * 0.1) / price)) : 1; }
  function captureJson(response, callback) { response.clone().json().then(callback).catch(() => {}); }
  function numberValue(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : 0; }
  function money(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? `Rs ${n.toFixed(2)}` : "DATA_NEEDED"; }
  function compact(value) { const n = Number(value); if (!Number.isFinite(n)) return "DATA_NEEDED"; if (n >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`; if (n >= 100000) return `${(n / 100000).toFixed(1)}L`; return String(Math.round(n)); }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch])); }
})();
