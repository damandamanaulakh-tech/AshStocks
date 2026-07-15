(() => {
  const state = { plan: null, ledger: null, busy: false, lastMessage: "" };

  window.addEventListener("DOMContentLoaded", () => {
    const observer = new MutationObserver(() => renderBrokerLedger());
    observer.observe(document.body, { childList: true, subtree: true });
    refreshBrokerLedger();
    setInterval(refreshBrokerLedger, 60000);
  });

  async function refreshBrokerLedger() {
    try {
      const [status, ledger] = await Promise.allSettled([
        api("/api/paper-trader/status"),
        api("/api/paper-trader/orders")
      ]);
      if (status.status === "fulfilled") state.plan = status.value.status?.last_plan || state.plan;
      if (ledger.status === "fulfilled") state.ledger = ledger.value;
    } catch (error) {
      state.lastMessage = error.message || String(error);
    }
    renderBrokerLedger();
  }

  async function api(path, options = {}) {
    const response = await fetch(path, options);
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.location.href = "/login";
      throw new Error("Login required");
    }
    if (!response.ok || payload.ok === false) throw new Error(payload.error || payload.order?.rejection_reason || `Request failed: ${response.status}`);
    return payload;
  }

  function renderBrokerLedger() {
    const ordersView = document.querySelector("#brokerOrdersView");
    const positionsView = document.querySelector("#brokerPositionsView");
    const gttView = document.querySelector("#brokerGttView");
    if (!ordersView && !positionsView && !gttView) return;
    if (ordersView) renderOrdersView(ordersView);
    if (positionsView) renderPositionsView(positionsView);
    if (gttView) renderGttView(gttView);
  }

  function renderOrdersView(view) {
    const host = view.querySelector("#brokerOrderTicket");
    if (!host) return;
    const plan = state.plan || {};
    const ledger = state.ledger || {};
    const orders = ledger.orders || [];
    const trades = ledger.trades || [];
    const buyQueue = plan.buy_queue || [];
    const first = buyQueue[0] || {};
    const html = `
      <section class="panel broker-ticket-main"><div class="panel-header"><h3>Paper Order Ticket</h3><span>${escapeHtml(first.symbol || "No stock selected")}</span></div>
        <div class="broker-ticket-grid">
          <label><span>Symbol</span><input id="brokerLedgerSymbol" value="${escapeAttr(first.symbol || "")}" readonly /></label>
          <label><span>Side</span><select id="brokerLedgerSide"><option>BUY</option><option>SELL</option></select></label>
          <label><span>Product</span><select id="brokerLedgerProduct"><option>Paper Swing</option><option>Paper Intraday</option><option>Paper Positional</option></select></label>
          <label><span>Order Type</span><select id="brokerLedgerOrderType"><option>MARKET</option><option>GTT</option></select></label>
          <label><span>Qty</span><input id="brokerLedgerQty" value="${escapeAttr(first.qty || estimatedQty(first))}" /></label>
          <label><span>Entry</span><input id="brokerLedgerPrice" value="${escapeAttr(numberValue(first.close || first.entry_price))}" /></label>
          <label><span>Target</span><input id="brokerLedgerTarget" value="${escapeAttr(numberValue(first.target2 || first.target_price))}" /></label>
          <label><span>Stop</span><input id="brokerLedgerStop" value="${escapeAttr(numberValue(first.stop_price))}" /></label>
        </div>
        <div class="broker-action-row"><button class="primary-button" type="button" data-broker-paper-action="BUY">Paper BUY</button><button class="secondary-button" type="button" data-broker-paper-action="SELL">Paper SELL</button><button class="secondary-button" type="button" data-broker-paper-action="GTT">Paper GTT</button></div>
        <small>${escapeHtml(state.lastMessage || "Paper execution only. Live broker order path remains locked.")}</small>
      </section>
      <section class="panel"><div class="panel-header"><h3>Order Book</h3><span>${orders.length} orders / ${trades.length} trades</span></div><div class="broker-table-wrap"><table><thead><tr><th>Order</th><th>Side</th><th>Qty</th><th>Price</th><th>Status</th><th>Reason</th></tr></thead><tbody>${orderRows(orders)}</tbody></table></div></section>
      <section class="panel"><div class="panel-header"><h3>Trade Book</h3><span>${trades.length}</span></div><div class="broker-table-wrap"><table><thead><tr><th>Trade</th><th>Side</th><th>Qty</th><th>Price</th><th>Value</th><th>P&L</th></tr></thead><tbody>${tradeRows(trades)}</tbody></table></div></section>
    `;
    if (host.dataset.ledgerHtml !== html) {
      host.dataset.ledgerHtml = html;
      host.innerHTML = html;
      host.querySelectorAll("[data-broker-paper-action]").forEach((button) => button.addEventListener("click", () => submitBrokerPaperOrder(button.dataset.brokerPaperAction)));
    }
  }

  function renderPositionsView(view) {
    const ledger = state.ledger || {};
    const positions = ledger.positions || [];
    const body = view.querySelector("#brokerPositionBody");
    const count = view.querySelector("#brokerPositionCount");
    const funds = view.querySelector("#brokerFunds");
    if (count) count.textContent = String(positions.length);
    if (body) {
      const html = positions.length ? positions.map((row) => `<tr><td><strong>${escapeHtml(row.symbol)}</strong><span>${escapeHtml(row.name || "")}</span></td><td>${escapeHtml(row.qty || 0)}</td><td>${money(row.entry_price)}</td><td>${money(row.current_price)}</td><td>${number(row.pnl_pct)}%</td><td>${escapeHtml(row.action || row.status || "OPEN")}</td></tr>`).join("") : `<tr><td colspan="6" class="empty-cell">No open paper positions. Paper BUY creates a real position here.</td></tr>`;
      if (body.innerHTML !== html) body.innerHTML = html;
    }
    if (funds) {
      const html = fundsCards(ledger.funds || {});
      if (funds.innerHTML !== html) funds.innerHTML = html;
    }
  }

  function renderGttView(view) {
    const body = view.querySelector("#brokerGttBody");
    const gtt = state.ledger?.gtt || [];
    if (!body) return;
    const html = gtt.length ? gtt.map((row) => `<tr><td><strong>${escapeHtml(row.symbol)}</strong><span>${escapeHtml(row.name || shortId(row.id))}</span></td><td>${money(row.entry_price)}</td><td>${money(row.target_price)}</td><td>${money(row.stop_price)}</td><td>${escapeHtml(row.qty || 0)}</td><td>${escapeHtml(row.status || "ACTIVE")}</td></tr>`).join("") : `<tr><td colspan="6" class="empty-cell">No paper GTT plans. Paper GTT creates a real trigger plan here.</td></tr>`;
    if (body.innerHTML !== html) body.innerHTML = html;
  }

  async function submitBrokerPaperOrder(action) {
    if (state.busy) return;
    state.busy = true;
    state.lastMessage = "Sending " + action + " paper order...";
    renderBrokerLedger();
    const payload = buildPayload(action);
    try {
      const result = await api("/api/paper-trader/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      state.lastMessage = result.ok ? `${result.action || "PAPER_ORDER_DONE"} ${result.order?.id || result.gtt?.id || ""}` : (result.error || "paper order failed");
      await refreshBrokerLedger();
    } catch (error) {
      state.lastMessage = error.message || String(error);
      renderBrokerLedger();
    } finally {
      state.busy = false;
    }
  }

  function buildPayload(action) {
    const plan = state.plan || {};
    const first = (plan.buy_queue || [])[0] || {};
    const symbol = inputValue("#brokerLedgerSymbol") || first.symbol || "";
    return {
      symbol,
      name: first.name || symbol,
      sector: first.sector || "Unmapped",
      side: action === "SELL" ? "SELL" : "BUY",
      product: inputValue("#brokerLedgerProduct") || "Paper Swing",
      order_type: action === "GTT" ? "GTT" : inputValue("#brokerLedgerOrderType") || "MARKET",
      qty: Math.max(0, Math.floor(Number(inputValue("#brokerLedgerQty")) || first.qty || estimatedQty(first))),
      price: Number(inputValue("#brokerLedgerPrice")) || Number(first.close || first.entry_price || 0),
      target_price: Number(inputValue("#brokerLedgerTarget")) || Number(first.target2 || first.target_price || 0) || null,
      stop_price: Number(inputValue("#brokerLedgerStop")) || Number(first.stop_price || 0) || null,
      thesis: first.thesis || first.paper_reason || "AshStocks broker tab paper order",
      source: "broker-shell-paper-ledger",
      gtt: action === "GTT"
    };
  }

  function orderRows(orders) {
    if (!orders.length) return '<tr><td colspan="6" class="empty-cell">No paper orders yet. Use Paper BUY, SELL, or GTT above.</td></tr>';
    return orders.slice(0, 20).map((order) => `<tr><td><strong>${escapeHtml(order.symbol)}</strong><span>${escapeHtml(shortId(order.id))}</span></td><td>${escapeHtml(order.side)}</td><td>${escapeHtml(order.qty)}</td><td>${money(order.price)}</td><td>${escapeHtml(order.status)}</td><td>${escapeHtml(order.rejection_reason || order.thesis || "paper fill")}</td></tr>`).join("");
  }

  function tradeRows(trades) {
    if (!trades.length) return '<tr><td colspan="6" class="empty-cell">No paper trades yet.</td></tr>';
    return trades.slice(0, 20).map((trade) => `<tr><td><strong>${escapeHtml(trade.symbol)}</strong><span>${escapeHtml(shortId(trade.id))}</span></td><td>${escapeHtml(trade.side)}</td><td>${escapeHtml(trade.qty)}</td><td>${money(trade.price)}</td><td>${money(trade.value)}</td><td>${money(trade.realized_pnl)}</td></tr>`).join("");
  }

  function fundsCards(funds) {
    return [
      ["Starting Capital", money(funds.starting_capital)],
      ["Buying Power", money(funds.buying_power)],
      ["Invested", money(funds.invested_value)],
      ["Realized P&L", money(funds.realized_pnl)],
      ["Open Positions", funds.open_positions ?? 0],
      ["Mode", "Paper only"]
    ].map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? "not available")}</strong></article>`).join("");
  }

  function estimatedQty(row) {
    const price = Number(row.close || row.entry_price || 0);
    return price ? Math.max(1, Math.floor(100000 / price)) : 0;
  }

  function inputValue(selector) { return document.querySelector(selector)?.value || ""; }
  function numberValue(value) { return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : ""; }
  function shortId(id) { return String(id || "").slice(-12); }
  function money(value) { return Number.isFinite(Number(value)) ? "Rs " + Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "not available"; }
  function number(value) { return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "not available"; }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
  function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
})();
