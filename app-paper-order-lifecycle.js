(() => {
  const state = {
    rows: [],
    paperStatus: null,
    lastResult: null
  };
  const ACTION_LABELS = { BUY: "Paper BUY", SELL: "Paper SELL", GTT: "Paper GTT" };

  const previousFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await previousFetch(...args);
    const url = String(args[0] || "");
    if (url.includes("/api/scanner/run")) captureJson(response, (payload) => {
      if (Array.isArray(payload.rows)) state.rows = payload.rows;
      refreshTicketActions();
    });
    if (url.includes("/api/paper-trader/status") || url.includes("/api/paper-trader/orders") || url.includes("/api/paper-trader/order") || url.includes("/api/paper-trader/monitor")) captureJson(response, (payload) => {
      state.paperStatus = payload;
      state.lastResult = payload.action ? payload : state.lastResult;
      refreshTicketActions();
    });
    return response;
  };

  window.addEventListener("DOMContentLoaded", () => {
    const observer = new MutationObserver(() => refreshTicketActions());
    observer.observe(document.body, { childList: true, subtree: true });
    refreshTicketActions();
    setTimeout(fetchPaperLedger, 800);
    setInterval(fetchPaperLedger, 60000);
  });

  document.addEventListener("click", (event) => {
    const monitor = event.target.closest("button[data-paper-monitor]");
    if (monitor) runPaperMonitor().catch((error) => writeTicketStatus("MONITOR ERROR: " + error.message));
  }, true);

  function refreshTicketActions() {
    const ticket = document.querySelector("#uwOrderTicket");
    if (ticket) {
      const buttons = Array.from(ticket.querySelectorAll("button"));
      for (const button of buttons) {
        const label = (button.textContent || "").trim().toUpperCase();
        if (!label.includes("PAPER")) continue;
        const action = label.includes("SELL") ? "SELL" : label.includes("GTT") ? "GTT" : "BUY";
        if (button.disabled) button.disabled = false;
        if (button.dataset.paperAction !== action) button.dataset.paperAction = action;
        if (button.getAttribute("aria-label") !== ACTION_LABELS[action]) button.setAttribute("aria-label", ACTION_LABELS[action]);
        if (!button.dataset.paperLifecycleBound) {
          button.dataset.paperLifecycleBound = "1";
          button.addEventListener("click", () => submitPaperAction(action));
        }
      }
      writeTicketStatus(lastStatusText());
    }
    renderPaperLedger();
  }

  async function submitPaperAction(action) {
    const ticket = document.querySelector("#uwOrderTicket");
    const symbol = ticketValue(ticket, "Symbol");
    const row = selectedRow(symbol);
    const qty = Number(ticketValue(ticket, "Qty")) || Number(row.paper_order?.qty) || estimatedQty(row);
    const entry = numberFrom(ticketValue(ticket, "Entry")) || Number(row.close || row.paper_order?.entry_price || 0);
    const payload = {
      symbol,
      name: row.name || symbol,
      sector: row.sector || "Unmapped",
      side: action === "SELL" ? "SELL" : "BUY",
      product: selectedText("#uwProduct") || "Paper Swing",
      order_type: action === "GTT" ? "GTT" : "MARKET",
      qty,
      price: entry,
      target_price: Number(row.target_price || row.paper_order?.target_price || numberFrom(ticketValue(ticket, "Target")) || 0) || null,
      stop_price: Number(row.stop_price || row.paper_order?.stop_price || numberFrom(ticketValue(ticket, "Stop")) || 0) || null,
      thesis: row.reason || row.paper_reason || "AshStocks paper order from Upstox-style ticket",
      source: "upstox-workspace-paper-ticket",
      gtt: action === "GTT"
    };

    writeTicketStatus("Sending " + action + " paper order...");
    try {
      const response = await fetch("/api/paper-trader/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      state.lastResult = result;
      state.paperStatus = result;
      const message = result.ok
        ? (result.action || "PAPER_ORDER_DONE") + " " + (result.order?.id || result.gtt?.id || "")
        : "REJECTED: " + (result.order?.rejection_reason || result.error || "paper order failed");
      writeTicketStatus(message);
      await fetchPaperLedger();
      await fetch("/api/paper-trader/status").catch(() => null);
    } catch (error) {
      writeTicketStatus("ERROR: " + error.message);
    }
  }

  async function runPaperMonitor() {
    writeTicketStatus("Monitoring paper targets, stops and GTT using latest scanner/Upstox prices...");
    const response = await fetch("/api/paper-trader/monitor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ useUpstox: true, source: "upstox-workspace-monitor-button" })
    });
    const result = await response.json();
    state.lastResult = result;
    state.paperStatus = result;
    const events = Array.isArray(result.events) ? result.events.length : 0;
    const gaps = Array.isArray(result.data_needed) ? result.data_needed.length : 0;
    writeTicketStatus(`${result.action || "MONITOR_DONE"}: ${events} events, ${gaps} DATA_NEEDED`);
    await fetchPaperLedger();
  }

  async function fetchPaperLedger() {
    if (!document.querySelector("#upstoxWorkspaceView")) return;
    try {
      const response = await fetch("/api/paper-trader/orders");
      const payload = await response.json();
      state.paperStatus = payload;
      renderPaperLedger();
    } catch {
      renderPaperLedger();
    }
  }

  function renderPaperLedger() {
    const panel = document.querySelector("#upstoxWorkspaceView");
    const anchor = panel?.querySelector(".uw-main-grid");
    if (!panel || !anchor) return;
    let ledger = panel.querySelector("#uwPaperLedgerPanel");
    if (!ledger) {
      ledger = document.createElement("section");
      ledger.id = "uwPaperLedgerPanel";
      ledger.className = "panel uw-paper-ledger";
      anchor.insertAdjacentElement("afterend", ledger);
    }
    const status = state.paperStatus || {};
    const orders = status.orders || status.paperTrader?.orders || status.status?.orders || [];
    const positions = status.positions || status.paperTrader?.positions || status.status?.positions || [];
    const gtt = status.gtt || status.paperTrader?.gtt || status.status?.gtt || [];
    const funds = status.funds || status.paperTrader?.funds || status.status?.funds || {};
    const lastMonitor = status.last_monitor || status.paperTrader?.last_monitor || status.status?.last_monitor || null;
    const html = `
      <div class="panel-header"><h3>Paper Order Book</h3><span>${escapeHtml(fundsText(funds))}</span></div>
      <div class="uw-paper-toolbar">
        <button class="secondary-button" type="button" data-paper-monitor>Monitor Targets / Stops / GTT</button>
        <small>${escapeHtml(monitorText(lastMonitor))}</small>
      </div>
      <div class="uw-table-wrap"><table><thead><tr><th>Order</th><th>Side</th><th>Qty</th><th>Price</th><th>Status</th><th>Reason</th></tr></thead><tbody>${orderRows(orders)}</tbody></table></div>
      <div class="uw-report-grid">
        <article><span>Positions</span><strong>${positions.length}</strong></article>
        <article><span>Orders</span><strong>${orders.length}</strong></article>
        <article><span>GTT</span><strong>${gtt.length}</strong></article>
        <article><span>Mode</span><strong>Paper only</strong></article>
      </div>
      <div class="uw-table-wrap"><table><thead><tr><th>Position</th><th>Qty</th><th>Entry</th><th>Current</th><th>Target</th><th>Stop</th></tr></thead><tbody>${positionRows(positions)}</tbody></table></div>
      <div class="uw-table-wrap"><table><thead><tr><th>GTT</th><th>Side</th><th>Entry</th><th>Target</th><th>Stop</th><th>Status</th></tr></thead><tbody>${gttRows(gtt)}</tbody></table></div>
    `;
    if (ledger.innerHTML !== html) ledger.innerHTML = html;
  }

  function orderRows(orders) {
    if (!orders.length) return '<tr><td colspan="6" class="empty-cell">No paper orders yet. Click Paper BUY, SELL, or GTT from the ticket.</td></tr>';
    return orders.slice(0, 8).map((order) => `<tr><td><strong>${escapeHtml(order.symbol)}</strong><span>${escapeHtml(shortId(order.id))}</span></td><td>${escapeHtml(order.side)}</td><td>${escapeHtml(order.qty)}</td><td>${money(order.price)}</td><td>${escapeHtml(order.status)}</td><td>${escapeHtml(order.rejection_reason || order.thesis || "paper fill")}</td></tr>`).join("");
  }

  function positionRows(positions) {
    if (!positions.length) return '<tr><td colspan="6" class="empty-cell">No open paper positions.</td></tr>';
    return positions.slice(0, 8).map((position) => `<tr><td><strong>${escapeHtml(position.symbol)}</strong><span>${escapeHtml(position.name || "")}</span></td><td>${escapeHtml(position.qty)}</td><td>${money(position.entry_price)}</td><td>${money(position.current_price)}</td><td>${money(position.target_price)}</td><td>${money(position.stop_price)}</td></tr>`).join("");
  }

  function gttRows(gtt) {
    if (!gtt.length) return '<tr><td colspan="6" class="empty-cell">No active paper GTT plans.</td></tr>';
    return gtt.slice(0, 8).map((plan) => `<tr><td><strong>${escapeHtml(plan.symbol)}</strong><span>${escapeHtml(shortId(plan.id))}</span></td><td>${escapeHtml(plan.side)}</td><td>${money(plan.entry_price)}</td><td>${money(plan.target_price)}</td><td>${money(plan.stop_price)}</td><td>${escapeHtml(plan.status)}</td></tr>`).join("");
  }

  function selectedRow(symbol) {
    const normalized = String(symbol || "").trim().toUpperCase();
    return state.rows.find((row) => String(row.symbol || "").toUpperCase() === normalized) || {};
  }

  function estimatedQty(row) {
    const price = Number(row.close || row.paper_order?.entry_price || 0);
    if (!price) return 0;
    return Math.max(1, Math.floor(100000 / price));
  }

  function ticketValue(ticket, name) {
    if (!ticket) return "";
    for (const label of ticket.querySelectorAll("label")) {
      const text = (label.querySelector("span")?.textContent || "").trim().toLowerCase();
      if (text === name.toLowerCase()) return label.querySelector("input, select")?.value || "";
    }
    return "";
  }

  function selectedText(selector) {
    const select = document.querySelector(selector);
    return select?.selectedOptions?.[0]?.textContent?.trim() || select?.value || "";
  }

  function writeTicketStatus(message) {
    const ticket = document.querySelector("#uwOrderTicket");
    if (!ticket) return;
    for (const label of ticket.querySelectorAll("label")) {
      const text = (label.querySelector("span")?.textContent || "").trim().toLowerCase();
      if (text === "status") {
        const input = label.querySelector("input");
        if (input && message && input.value !== message) input.value = message;
      }
    }
    let note = ticket.querySelector("[data-paper-lifecycle-note]");
    if (!note) {
      note = document.createElement("small");
      note.dataset.paperLifecycleNote = "1";
      ticket.appendChild(note);
    }
    const text = message || "Paper execution only. Broker write path remains locked.";
    if (note.textContent !== text) note.textContent = text;
  }

  function lastStatusText() {
    const result = state.lastResult;
    if (!result) return "Paper execution only. Broker write path remains locked.";
    if (result.action === "PAPER_LIFECYCLE_MONITORED") return `PAPER_LIFECYCLE_MONITORED: ${(result.events || []).length} events, ${(result.data_needed || []).length} DATA_NEEDED`;
    if (result.ok) return result.action || result.order?.status || result.gtt?.status || "PAPER_OK";
    return "REJECTED: " + (result.order?.rejection_reason || result.error || "paper order failed");
  }

  function fundsText(funds) {
    const buyingPower = funds.buying_power ?? funds.starting_capital;
    return Number.isFinite(Number(buyingPower)) ? "Buying power Rs " + Number(buyingPower).toLocaleString("en-IN", { maximumFractionDigits: 0 }) : "Paper funds";
  }

  function monitorText(lastMonitor) {
    if (!lastMonitor) return "Monitor has not run yet.";
    return `Last monitor ${lastMonitor.at || ""}: ${lastMonitor.events || 0} events, ${lastMonitor.data_needed || 0} DATA_NEEDED`;
  }

  function shortId(id) {
    return String(id || "").slice(-12);
  }

  function money(value) {
    const n = Number(value);
    return Number.isFinite(n) ? "Rs " + n.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "not available";
  }

  function numberFrom(value) {
    const n = Number(String(value || "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }

  function captureJson(response, callback) {
    response.clone().json().then((payload) => {
      if (payload) callback(payload);
    }).catch(() => {});
  }
})();