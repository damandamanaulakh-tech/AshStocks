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
    if (url.includes("/api/paper-trader/status") || url.includes("/api/paper-trader/orders") || url.includes("/api/paper-trader/order")) captureJson(response, (payload) => {
      state.paperStatus = payload;
      refreshTicketActions();
    });
    return response;
  };

  window.addEventListener("DOMContentLoaded", () => {
    const observer = new MutationObserver(() => refreshTicketActions());
    observer.observe(document.body, { childList: true, subtree: true });
    refreshTicketActions();
  });

  function refreshTicketActions() {
    const ticket = document.querySelector("#uwOrderTicket");
    if (!ticket) return;
    const buttons = Array.from(ticket.querySelectorAll("button"));
    for (const button of buttons) {
      const label = (button.textContent || "").trim().toUpperCase();
      if (!label.includes("PAPER")) continue;
      const action = label.includes("SELL") ? "SELL" : label.includes("GTT") ? "GTT" : "BUY";
      button.disabled = false;
      button.dataset.paperAction = action;
      button.setAttribute("aria-label", ACTION_LABELS[action]);
      if (!button.dataset.paperLifecycleBound) {
        button.dataset.paperLifecycleBound = "1";
        button.addEventListener("click", () => submitPaperAction(action));
      }
    }
    writeTicketStatus(lastStatusText());
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
      await fetch("/api/paper-trader/status").catch(() => null);
    } catch (error) {
      writeTicketStatus("ERROR: " + error.message);
    }
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
        if (input && message) input.value = message;
      }
    }
    let note = ticket.querySelector("[data-paper-lifecycle-note]");
    if (!note) {
      note = document.createElement("small");
      note.dataset.paperLifecycleNote = "1";
      ticket.appendChild(note);
    }
    note.textContent = message || "Paper execution only. Broker write path remains locked.";
  }

  function lastStatusText() {
    const result = state.lastResult;
    if (!result) return "Paper execution only. Broker write path remains locked.";
    if (result.ok) return result.action || result.order?.status || result.gtt?.status || "PAPER_OK";
    return "REJECTED: " + (result.order?.rejection_reason || result.error || "paper order failed");
  }

  function numberFrom(value) {
    const n = Number(String(value || "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function captureJson(response, callback) {
    response.clone().json().then((payload) => {
      if (payload) callback(payload);
    }).catch(() => {});
  }
})();
