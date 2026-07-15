(() => {
  const state = {
    active: null,
    selectedSymbol: "",
    booted: false
  };

  window.addEventListener("DOMContentLoaded", () => boot());

  window.addEventListener("ashstocks:upstox-parameter-trade-filter", (event) => {
    state.active = normalizeDetail(event.detail || {});
    renderAll();
  });

  document.addEventListener("input", (event) => {
    if (event.target.closest("#uwParameterFilterPanel")) {
      state.active = readActiveParameterFromDom(true);
      setTimeout(renderAll, 0);
    }
  }, true);

  document.addEventListener("change", (event) => {
    if (event.target.closest("#uwParameterFilterPanel")) {
      state.active = readActiveParameterFromDom(true);
      setTimeout(renderAll, 0);
    }
  }, true);

  document.addEventListener("click", (event) => {
    const symbolButton = event.target.closest("button[data-select-symbol]");
    if (symbolButton && symbolButton.dataset && symbolButton.dataset.selectSymbol) {
      state.selectedSymbol = symbolButton.dataset.selectSymbol;
      setTimeout(renderAll, 0);
    }
    if (event.target.closest("button[data-clear-uw-param-trade-filter]")) {
      state.active = normalizeDetail({ enabled: false, parameter: 0, family: "", matched_symbols: [], visible_rows: 0 });
      setTimeout(renderAll, 0);
    }
    if (event.target.closest("#uwParameterFilterPanel button, #uwParameterFilterPanel input, #uwParameterFilterPanel select")) {
      state.active = readActiveParameterFromDom(true);
      setTimeout(renderAll, 0);
    }
  }, true);

  function boot() {
    if (state.booted) return;
    state.booted = true;
    state.active = readActiveParameterFromDom(false);
    const observer = new MutationObserver(() => renderAll());
    observer.observe(document.body, { childList: true, subtree: true });
    renderAll();
    setInterval(() => renderAll(), 4000);
  }

  function renderAll() {
    renderReasoningBridge();
    renderTicketNote();
  }

  function renderReasoningBridge() {
    const dock = document.querySelector("#uwReasoningDock");
    if (!dock) return;
    const node = ensureReasoningNode(dock);
    const active = state.active || readActiveParameterFromDom(false);
    const symbol = currentSymbol();
    const decision = parameterDecision(active, symbol);
    node.className = "uw-parameter-reasoning-bridge " + decision.status.toLowerCase();
    node.innerHTML = "<div><span>Active AshStocks parameter</span><strong>" + escapeHtml(parameterLabel(active)) + "</strong></div>" +
      "<article><span>Selected symbol</span><strong>" + escapeHtml(symbol || "No stock selected") + "</strong></article>" +
      "<article><span>Trade impact</span><strong>" + escapeHtml(decision.status) + "</strong></article>" +
      "<article><span>Evidence</span><strong>" + escapeHtml(decision.evidence) + "</strong></article>";
  }

  function renderTicketNote() {
    const ticket = document.querySelector("#uwOrderTicket");
    if (!ticket) return;
    let note = ticket.querySelector("[data-uw-active-parameter-ticket]");
    if (!note) {
      note = document.createElement("div");
      note.setAttribute("data-uw-active-parameter-ticket", "true");
      note.className = "uw-parameter-ticket-note";
      ticket.appendChild(note);
    }
    const active = state.active || readActiveParameterFromDom(false);
    const symbol = currentSymbol();
    const decision = parameterDecision(active, symbol);
    note.dataset.status = decision.status;
    note.innerHTML = "<span>Parameter gate</span><strong>" + escapeHtml(parameterLabel(active)) + "</strong><b>" + escapeHtml(decision.status) + "</b><small>" + escapeHtml(decision.evidence) + "</small>";
  }

  function ensureReasoningNode(dock) {
    let node = dock.querySelector("#uwParameterReasoningBridge");
    if (node) return node;
    node = document.createElement("section");
    node.id = "uwParameterReasoningBridge";
    const head = dock.querySelector(".uw-reason-head");
    if (head) head.insertAdjacentElement("afterend", node);
    else dock.prepend(node);
    return node;
  }

  function readActiveParameterFromDom(forceEnabled) {
    const parameter = Number(document.querySelector("#uwParamNumber")?.value || 0);
    const familySelect = document.querySelector("#uwFamilyFilter")?.value || "";
    const bridgeText = document.querySelector("#uwParameterTradeBridge strong")?.textContent || "";
    const match = bridgeText.match(/P(\d+)\s+([^:]+):\s+(\d+)/i);
    const fromBridge = match ? { parameter: Number(match[1]), family: match[2].trim(), visible_rows: Number(match[3]) } : null;
    return normalizeDetail({
      enabled: Boolean(forceEnabled || fromBridge || parameter),
      parameter: fromBridge?.parameter || parameter || 0,
      family: fromBridge?.family || (familySelect && familySelect !== "ALL" ? familySelect : familyForParam(parameter)),
      matched_symbols: state.active?.matched_symbols || [],
      visible_rows: fromBridge?.visible_rows ?? state.active?.visible_rows ?? 0,
      source: fromBridge ? "trade-bridge-dom" : "parameter-panel-dom"
    });
  }

  function normalizeDetail(detail) {
    const symbols = Array.isArray(detail.matched_symbols) ? detail.matched_symbols.filter(Boolean) : [];
    return {
      enabled: Boolean(detail.enabled),
      parameter: Number(detail.parameter || 0),
      family: String(detail.family || ""),
      matched_symbols: symbols,
      visible_rows: Number(detail.visible_rows || 0),
      source: detail.source || "parameter-reasoning-bridge"
    };
  }

  function parameterDecision(active, symbol) {
    if (!active?.enabled || !active.parameter) return { status: "WAITING", evidence: "No parameter gate is active. Click a parameter number or apply the parameter filter." };
    if (!symbol) return { status: "WAITING", evidence: "Parameter is active but no stock is selected in the trade queue or ticket." };
    const matched = new Set(active.matched_symbols || []);
    if (matched.size && matched.has(symbol)) return { status: "PASS", evidence: symbol + " is inside the active parameter trade queue; " + active.visible_rows + " rows remain visible." };
    if (matched.size) return { status: "BLOCKED", evidence: symbol + " is not in the active parameter result; pick a visible queue row or clear the gate." };
    return { status: "WATCH", evidence: (active.family || "Parameter") + " is active; waiting for scanner rows to publish matched symbols." };
  }

  function parameterLabel(active) {
    if (!active?.enabled || !active.parameter) return "No active parameter";
    return "P" + active.parameter + " " + (active.family || familyForParam(active.parameter)) + " (" + (active.visible_rows || 0) + " queue rows)";
  }

  function currentSymbol() {
    const ticketSymbol = document.querySelector("#uwOrderTicket label:first-child input")?.value?.trim();
    if (ticketSymbol) return ticketSymbol;
    const title = document.querySelector("#uwSelectedTitle")?.textContent?.trim() || "";
    const titleSymbol = title.split(/\s+/)[0];
    if (titleSymbol && titleSymbol !== "Selected") return titleSymbol;
    const visibleButton = Array.from(document.querySelectorAll("#uwTradeQueueBody tr:not([hidden]) button[data-select-symbol], #uwQueueBody tr:not([hidden]) button[data-select-symbol]")).find(Boolean);
    return state.selectedSymbol || visibleButton?.dataset?.selectSymbol || "";
  }

  function familyForParam(number) {
    const n = Number(number || 0);
    if (n >= 681 && n <= 800) return "Candle Structure + Volume";
    if (n >= 1041 && n <= 1160) return "FII/DII Flow";
    if (n >= 1521 && n <= 1640) return "Entry Target Stop";
    if (n >= 1881 && n <= 2000) return "Paper Safety";
    if (n >= 921 && n <= 1040) return "Risk Safety";
    if (n >= 541 && n <= 680) return "Liquidity";
    if (n >= 401 && n <= 540) return "Relative Strength";
    if (n >= 261 && n <= 400) return "Price Trend";
    if (n >= 121 && n <= 260) return "Data Coverage";
    if (n >= 1 && n <= 120) return "Universe";
    return "AshStocks Parameter";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char]));
  }
})();