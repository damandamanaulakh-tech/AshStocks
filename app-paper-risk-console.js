(() => {
  const state = {
    scan: null,
    ledger: null,
    quoteCache: {},
    selectedSymbol: "",
    busy: false,
    message: "Waiting for paper ledger",
    booted: false
  };

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const url = String(args[0] || "");
    if (url.includes("/api/scanner/run")) captureJson(response, (payload) => {
      state.scan = payload;
      state.selectedSymbol = pickSelectedSymbol(payload.rows || [], state.selectedSymbol);
      renderRiskConsole();
    });
    if (url.includes("/api/paper-trader/orders") || url.includes("/api/paper-trader/order")) captureJson(response, (payload) => {
      if (payload.orders || payload.positions || payload.gtt || payload.trades || payload.funds) state.ledger = payload;
      renderRiskConsole();
    });
    return response;
  };

  window.addEventListener("DOMContentLoaded", () => bootRiskConsole().catch(() => {}));
  window.addEventListener("ashstocks:upstox-quote", (event) => {
    const detail = event.detail || {};
    if (detail.instrument_key && detail.quoteState) state.quoteCache[detail.instrument_key] = detail.quoteState;
    if (detail.symbol) state.selectedSymbol = detail.symbol;
    renderRiskConsole();
  });
  window.addEventListener("ashstocks:broker-select-symbol", (event) => {
    if (event.detail?.symbol) {
      state.selectedSymbol = event.detail.symbol;
      renderRiskConsole();
    }
  });

  document.addEventListener("click", (event) => {
    const refresh = event.target.closest("button[data-risk-refresh]");
    if (refresh) refreshLedger().catch(() => {});

    const symbol = event.target.closest("button[data-risk-symbol]");
    if (symbol?.dataset?.riskSymbol) {
      state.selectedSymbol = symbol.dataset.riskSymbol;
      window.dispatchEvent(new CustomEvent("ashstocks:broker-select-symbol", { detail: { symbol: state.selectedSymbol } }));
      renderRiskConsole();
    }

    const action = event.target.closest("button[data-risk-action]");
    if (action) submitRiskAction(action.dataset.riskAction, action.dataset.symbol).catch(() => {});
  }, true);

  async function bootRiskConsole() {
    if (state.booted) return;
    state.booted = true;
    await waitForShell();
    installRiskConsole();
    await refreshLedger();
    renderRiskConsole();
    setInterval(() => refreshLedger().catch(() => {}), 45000);
  }

  function waitForShell() {
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (document.querySelector("#brokerOrdersView") || document.querySelector("#upstoxWorkspaceView")) return resolve();
        if (Date.now() - started > 12000) return resolve();
        setTimeout(tick, 80);
      };
      tick();
    });
  }

  function installRiskConsole() {
    installWorkspaceRiskConsole();
    installOrdersRiskConsole();
    installPositionsRiskConsole();
    installGttRiskConsole();
  }

  function installWorkspaceRiskConsole() {
    const workspace = document.querySelector("#upstoxWorkspaceView");
    if (!workspace || document.querySelector("#paperRiskConsole")) return;
    const anchor = document.querySelector("#uwMarketWatchPulse") || document.querySelector("#uwTradeQueueBridge") || workspace.querySelector(".uw-main-grid");
    const html = `
      <section class="panel paper-risk-console" id="paperRiskConsole">
        <div class="panel-header">
          <div><span class="eyebrow">Paper Broker Risk</span><h3>Account, Positions, GTT</h3></div>
          <button type="button" class="secondary-button" data-risk-refresh><i data-lucide="refresh-cw" aria-hidden="true"></i><span>Refresh</span></button>
        </div>
        <div class="risk-summary" id="riskSummary"></div>
        <div class="risk-selected" id="riskSelected"></div>
      </section>
    `;
    if (anchor) anchor.insertAdjacentHTML("afterend", html);
    else workspace.insertAdjacentHTML("beforeend", html);
    window.lucide?.createIcons();
  }

  function installOrdersRiskConsole() {
    const view = document.querySelector("#brokerOrdersView");
    if (!view || document.querySelector("#riskOrdersPanel")) return;
    const anchor = view.querySelector("#brokerOrderTicket") || view.querySelector(".broker-order-tabs") || view.firstElementChild;
    const html = `
      <section class="panel paper-risk-console" id="riskOrdersPanel">
        <div class="panel-header"><div><span class="eyebrow">Order Book Control</span><h3>Paper Orders & Trades</h3></div><span id="riskOrderState">Waiting</span></div>
        <div class="risk-table-wrap"><table><thead><tr><th>Order</th><th>Side</th><th>Qty</th><th>Price</th><th>Status</th><th>Paper Action</th></tr></thead><tbody id="riskOrderBody"></tbody></table></div>
        <div class="risk-table-wrap"><table><thead><tr><th>Trade</th><th>Side</th><th>Qty</th><th>Price</th><th>Value</th><th>Realized</th></tr></thead><tbody id="riskTradeBody"></tbody></table></div>
      </section>
    `;
    if (anchor) anchor.insertAdjacentHTML("beforebegin", html);
    else view.insertAdjacentHTML("afterbegin", html);
  }

  function installPositionsRiskConsole() {
    const view = document.querySelector("#brokerPositionsView");
    if (!view || document.querySelector("#riskPositionsPanel")) return;
    const anchor = view.querySelector(".broker-page-head") || view.firstElementChild;
    const html = `
      <section class="panel paper-risk-console" id="riskPositionsPanel">
        <div class="panel-header"><div><span class="eyebrow">Position Manager</span><h3>Paper Holdings & Exits</h3></div><span id="riskPositionState">Waiting</span></div>
        <div class="risk-table-wrap"><table><thead><tr><th>Stock</th><th>Qty</th><th>Entry</th><th>LTP</th><th>P&L</th><th>Exit / Protect</th></tr></thead><tbody id="riskPositionBody"></tbody></table></div>
      </section>
    `;
    if (anchor) anchor.insertAdjacentHTML("afterend", html);
    else view.insertAdjacentHTML("afterbegin", html);
  }

  function installGttRiskConsole() {
    const view = document.querySelector("#brokerGttView");
    if (!view || document.querySelector("#riskGttPanel")) return;
    const anchor = view.querySelector(".broker-page-head") || view.firstElementChild;
    const html = `
      <section class="panel paper-risk-console" id="riskGttPanel">
        <div class="panel-header"><div><span class="eyebrow">GTT Risk Book</span><h3>Target / Stop Plans</h3></div><span id="riskGttState">Waiting</span></div>
        <div class="risk-table-wrap"><table><thead><tr><th>Stock</th><th>Entry</th><th>Target</th><th>Stop</th><th>Status</th><th>Action</th></tr></thead><tbody id="riskGttBody"></tbody></table></div>
      </section>
    `;
    if (anchor) anchor.insertAdjacentHTML("afterend", html);
    else view.insertAdjacentHTML("afterbegin", html);
  }

  async function refreshLedger() {
    try {
      const response = await fetch("/api/paper-trader/orders");
      if (response.status === 401) return;
      const payload = await response.json();
      if (payload && payload.ok !== false) {
        state.ledger = payload;
        state.message = `Ledger synced: ${(payload.orders || []).length} orders`;
      }
    } catch (error) {
      state.message = error.message || String(error);
    }
    renderRiskConsole();
  }

  function renderRiskConsole() {
    installRiskConsole();
    const ledger = state.ledger || {};
    const rows = scannerRows();
    const selected = selectedRow(rows, ledger);
    renderSummary(ledger);
    renderSelected(selected, ledger);
    renderOrders(ledger);
    renderTrades(ledger);
    renderPositions(ledger);
    renderGtt(ledger);
  }

  function renderSummary(ledger) {
    const host = document.querySelector("#riskSummary");
    if (!host) return;
    const funds = ledger.funds || {};
    const exposure = exposurePct(funds);
    host.innerHTML = [
      ["Capital", money(funds.starting_capital)],
      ["Buying Power", money(funds.buying_power)],
      ["Invested", money(funds.invested_value)],
      ["Exposure", `${number(exposure)}%`],
      ["Realized P&L", money(funds.realized_pnl)],
      ["Risk State", exposure > 80 ? "THROTTLE" : "OK"]
    ].map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
  }

  function renderSelected(row, ledger) {
    const host = document.querySelector("#riskSelected");
    if (!host) return;
    if (!row.symbol) {
      host.innerHTML = `<div class="risk-empty"><strong>No selected symbol</strong><span>Run scanner or create paper order. No fake position is shown.</span></div>`;
      return;
    }
    const position = positionFor(row.symbol, ledger);
    const quote = quoteStateFor(row).quote;
    host.innerHTML = `
      <article><span>Selected</span><strong>${escapeHtml(row.symbol)}</strong><b>${escapeHtml(row.name || row.sector || "")}</b></article>
      <article><span>Quote</span><strong>${escapeHtml(quote ? money(quote.last_price || quote.close) : "DATA_NEEDED")}</strong><b>${escapeHtml(quoteStatus(row))}</b></article>
      <article><span>Position</span><strong>${escapeHtml(position ? `${position.qty || 0} qty` : "NONE")}</strong><b>${escapeHtml(position ? `entry ${money(position.entry_price)}` : "paper position not open")}</b></article>
      <article><span>Risk</span><strong>${escapeHtml(riskLine(row, position))}</strong><b>${escapeHtml(row.reason || row.paper_reason || "scanner reason not selected")}</b></article>
    `;
  }

  function renderOrders(ledger) {
    const body = document.querySelector("#riskOrderBody");
    const stateNode = document.querySelector("#riskOrderState");
    const orders = ledger.orders || [];
    if (stateNode) stateNode.textContent = state.busy ? "Working" : `${orders.length} orders`;
    if (!body) return;
    body.innerHTML = orders.length ? orders.slice(0, 40).map((order) => `<tr>
      <td><button type="button" data-risk-symbol="${escapeAttr(order.symbol)}"><strong>${escapeHtml(order.symbol)}</strong><span>${escapeHtml(shortId(order.id))}</span></button></td>
      <td>${escapeHtml(order.side)}</td>
      <td>${escapeHtml(order.qty || 0)}</td>
      <td>${money(order.price)}</td>
      <td><span class="risk-status ${escapeAttr(order.status)}">${escapeHtml(order.status)}</span><small>${escapeHtml(order.rejection_reason || order.source || "paper order")}</small></td>
      <td><div class="risk-actions">${order.side === "BUY" ? `<button type="button" data-risk-action="SELL_ORDER" data-symbol="${escapeAttr(order.symbol)}">Exit</button>` : ""}<button type="button" data-risk-action="GTT_FROM_ORDER" data-symbol="${escapeAttr(order.symbol)}">GTT</button></div></td>
    </tr>`).join("") : `<tr><td colspan="6" class="empty-cell">No paper orders yet.</td></tr>`;
  }

  function renderTrades(ledger) {
    const body = document.querySelector("#riskTradeBody");
    if (!body) return;
    const trades = ledger.trades || [];
    body.innerHTML = trades.length ? trades.slice(0, 40).map((trade) => `<tr>
      <td><button type="button" data-risk-symbol="${escapeAttr(trade.symbol)}"><strong>${escapeHtml(trade.symbol)}</strong><span>${escapeHtml(shortId(trade.id))}</span></button></td>
      <td>${escapeHtml(trade.side)}</td><td>${escapeHtml(trade.qty || 0)}</td><td>${money(trade.price)}</td><td>${money(trade.value)}</td><td>${money(trade.realized_pnl)}</td>
    </tr>`).join("") : `<tr><td colspan="6" class="empty-cell">No paper trades yet.</td></tr>`;
  }

  function renderPositions(ledger) {
    const body = document.querySelector("#riskPositionBody");
    const stateNode = document.querySelector("#riskPositionState");
    const positions = ledger.positions || [];
    if (stateNode) stateNode.textContent = `${positions.length} positions`;
    if (!body) return;
    body.innerHTML = positions.length ? positions.map((position) => {
      const quote = quoteForSymbol(position.symbol);
      const ltp = firstFinite(quote?.last_price, quote?.close, position.current_price, position.entry_price, 0);
      const pnlPct = position.entry_price ? ((ltp - Number(position.entry_price)) / Number(position.entry_price)) * 100 : Number(position.pnl_pct || 0);
      return `<tr>
        <td><button type="button" data-risk-symbol="${escapeAttr(position.symbol)}"><strong>${escapeHtml(position.symbol)}</strong><span>${escapeHtml(position.name || position.status || "OPEN")}</span></button></td>
        <td>${escapeHtml(position.qty || 0)}</td>
        <td>${money(position.entry_price)}</td>
        <td>${money(ltp)}</td>
        <td class="${pnlPct >= 0 ? "positive" : "negative"}">${number(pnlPct)}%</td>
        <td><div class="risk-actions"><button type="button" data-risk-action="EXIT_POSITION" data-symbol="${escapeAttr(position.symbol)}">Exit</button><button type="button" data-risk-action="PROTECT_POSITION" data-symbol="${escapeAttr(position.symbol)}">GTT</button></div></td>
      </tr>`;
    }).join("") : `<tr><td colspan="6" class="empty-cell">No open paper positions.</td></tr>`;
  }

  function renderGtt(ledger) {
    const body = document.querySelector("#riskGttBody");
    const stateNode = document.querySelector("#riskGttState");
    const plans = ledger.gtt || ledger.gtts || [];
    if (stateNode) stateNode.textContent = `${plans.length} plans`;
    if (!body) return;
    body.innerHTML = plans.length ? plans.slice(0, 60).map((plan) => `<tr>
      <td><button type="button" data-risk-symbol="${escapeAttr(plan.symbol)}"><strong>${escapeHtml(plan.symbol)}</strong><span>${escapeHtml(shortId(plan.id))}</span></button></td>
      <td>${money(plan.entry_price)}</td><td>${money(plan.target_price)}</td><td>${money(plan.stop_price)}</td><td>${escapeHtml(plan.status || "ACTIVE")}</td>
      <td><div class="risk-actions"><button type="button" data-risk-action="SELL_ORDER" data-symbol="${escapeAttr(plan.symbol)}">Exit</button></div></td>
    </tr>`).join("") : `<tr><td colspan="6" class="empty-cell">No paper GTT plans.</td></tr>`;
  }

  async function submitRiskAction(action, symbol) {
    if (state.busy || !symbol) return;
    state.busy = true;
    state.message = `Sending ${symbol} ${action}...`;
    renderRiskConsole();
    try {
      const ledger = state.ledger || {};
      const row = scannerRows().find((item) => item.symbol === symbol) || { symbol };
      const position = positionFor(symbol, ledger);
      const quote = quoteForSymbol(symbol) || quoteStateFor(row).quote || {};
      const price = firstFinite(quote.last_price, quote.close, position?.current_price, position?.entry_price, row.close, row.entry_price, 0);
      const qty = action === "EXIT_POSITION" || action === "SELL_ORDER" ? Math.max(1, Math.floor(Number(position?.qty || row.qty || 1))) : Math.max(1, Math.floor(Number(position?.qty || row.paper_order?.qty || 1)));
      const payload = {
        symbol,
        name: row.name || position?.name || symbol,
        sector: row.sector || position?.sector || "Unmapped",
        side: action === "EXIT_POSITION" || action === "SELL_ORDER" ? "SELL" : "BUY",
        product: "Paper Swing",
        order_type: action === "PROTECT_POSITION" || action === "GTT_FROM_ORDER" ? "GTT" : "MARKET",
        qty,
        price,
        target_price: firstFinite(row.target_price, row.target2, position?.target_price, price ? price * 1.08 : null),
        stop_price: firstFinite(row.stop_price, position?.stop_price, price ? price * 0.94 : null),
        thesis: `Paper risk console ${action}; live broker disabled`,
        source: "paper-risk-console",
        quote_source: quote.last_price || quote.close ? "Upstox Market Quote API" : "ledger/scanner fallback",
        paper_only: true,
        broker_write_enabled: false,
        gtt: action === "PROTECT_POSITION" || action === "GTT_FROM_ORDER"
      };
      const response = await fetch("/api/paper-trader/order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false) throw new Error(result.error || result.order?.rejection_reason || `paper action failed ${response.status}`);
      state.message = `${symbol} ${result.action || action} ${result.order?.id || result.gtt?.id || "done"}`;
      await refreshLedger();
    } catch (error) {
      state.message = error.message || String(error);
      renderRiskConsole();
    } finally {
      state.busy = false;
    }
  }

  function scannerRows() { return state.scan?.rows || []; }
  function selectedRow(rows, ledger) {
    return rows.find((row) => row.symbol === state.selectedSymbol) || (ledger.positions || []).find((row) => row.symbol === state.selectedSymbol) || rows[0] || (ledger.positions || [])[0] || {};
  }
  function pickSelectedSymbol(rows, current) {
    if (current && rows.some((row) => row.symbol === current)) return current;
    return rows.find((row) => row.decision === "SELECT")?.symbol || rows.find((row) => row.decision === "WATCH")?.symbol || rows[0]?.symbol || "";
  }
  function positionFor(symbol, ledger) { return (ledger.positions || []).find((position) => String(position.symbol).toUpperCase() === String(symbol).toUpperCase()) || null; }
  function quoteForSymbol(symbol) {
    const rows = scannerRows();
    const row = rows.find((item) => item.symbol === symbol) || {};
    return quoteStateFor(row).quote;
  }
  function quoteStateFor(row) { return state.quoteCache[instrumentKey(row)] || window.__ashstocksUpstoxQuoteCache?.[instrumentKey(row)] || {}; }
  function instrumentKey(row) { return row.instrument_key || row.instrumentKey || row.instrument_token || ""; }
  function quoteStatus(row) {
    const quoteState = quoteStateFor(row);
    if (!instrumentKey(row)) return "instrument_key DATA_NEEDED";
    if (quoteState.quote?.depth_available) return "quote + depth ok";
    if (quoteState.quote) return "quote ok; depth missing";
    if (quoteState.error) return `quote failed: ${quoteState.error}`;
    return "quote waiting";
  }
  function riskLine(row, position) {
    if (!position) return row.decision || "NO_POSITION";
    const quote = quoteForSymbol(position.symbol) || {};
    const ltp = firstFinite(quote.last_price, quote.close, position.current_price, position.entry_price, 0);
    const stop = firstFinite(position.stop_price, row.stop_price, null);
    const target = firstFinite(position.target_price, row.target_price, row.target2, null);
    return `LTP ${money(ltp)} | stop ${money(stop)} | target ${money(target)}`;
  }
  function exposurePct(funds) {
    const capital = Number(funds.starting_capital || 0);
    const invested = Number(funds.invested_value || 0);
    return capital ? (invested / capital) * 100 : 0;
  }
  function captureJson(response, callback) { response.clone().json().then((payload) => { if (payload && payload.ok !== false) callback(payload); }).catch(() => {}); }
  function firstFinite(...values) { for (const value of values) { const n = Number(value); if (Number.isFinite(n)) return n; } return null; }
  function shortId(id) { return String(id || "").slice(-10); }
  function money(value) { return Number.isFinite(Number(value)) ? "Rs " + Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "DATA_NEEDED"; }
  function number(value) { return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "0.00"; }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
  function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
})();
