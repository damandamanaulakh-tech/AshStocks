(() => {
  const CANDLE_HIT_ANCHORS = Object.freeze(["P681", "P686", "P688"]);
  const PATTERN_PARAMS = Object.freeze({
    bullish_engulfing: { parameter: 681, label: "Bullish engulfing" },
    bearish_engulfing: { parameter: 698, label: "Bearish engulfing" },
    hammer_rejection: { parameter: 683, label: "Hammer rejection" },
    morning_star: { parameter: 684, label: "Morning star reversal" },
    piercing_line: { parameter: 685, label: "Piercing line recovery" },
    near_252d_breakout: { parameter: 686, label: "Near 252D breakout" },
    breakout_retest: { parameter: 687, label: "Breakout retest hold" },
    volume_confirmation: { parameter: 688, label: "Volume confirmation" },
    higher_high_higher_low: { parameter: 689, label: "Higher high higher low" },
    bullish_marubozu: { parameter: 690, label: "Bullish wide body" },
    three_candle_continuation_watch: { parameter: 691, label: "Three candle continuation" },
    tight_range_expansion: { parameter: 692, label: "Tight range expansion" },
    doji_exhaustion_watch: { parameter: 696, label: "Doji exhaustion watch" },
    supply_rejection_watch: { parameter: 697, label: "Supply rejection watch" },
    gap_down_recovery: { parameter: 699, label: "Gap down recovery" }
  });

  const state = { scan: null, selectedSymbol: "", booted: false };
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const patchedArgs = patchPaperOrderPayload(args);
    const response = await nativeFetch(...patchedArgs);
    const url = String(patchedArgs[0] || "");
    if (url.includes("/api/scanner/run")) captureJson(response, (payload) => {
      state.scan = payload;
      state.selectedSymbol = pickSelectedSymbol(payload.rows || [], state.selectedSymbol);
      renderCandleHitFlow();
    });
    return response;
  };

  window.addEventListener("DOMContentLoaded", () => boot());
  window.addEventListener("ashstocks:upstox-parameter-trade-filter", () => setTimeout(renderCandleHitFlow, 0));
  window.addEventListener("ashstocks:upstox-quote", (event) => {
    if (event.detail?.symbol) state.selectedSymbol = event.detail.symbol;
    renderCandleHitFlow();
  });

  document.addEventListener("click", (event) => {
    const selected = event.target.closest("button[data-select-symbol]");
    if (selected?.dataset?.selectSymbol) {
      state.selectedSymbol = selected.dataset.selectSymbol;
      setTimeout(renderCandleHitFlow, 0);
    }
  }, true);

  function boot() {
    if (state.booted) return;
    state.booted = true;
    const observer = new MutationObserver(() => renderCandleHitFlow());
    observer.observe(document.body, { childList: true, subtree: true });
    renderCandleHitFlow();
    setInterval(renderCandleHitFlow, 5000);
  }

  function renderCandleHitFlow() {
    const row = selectedRow();
    renderReasoningCandlePanel(row);
    renderTicketCandlePanel(row);
    renderSymbolActionCandlePanel(row);
    decorateTradeQueueRows();
    publish(row);
  }

  function renderReasoningCandlePanel(row) {
    const dock = document.querySelector("#uwReasoningDock");
    if (!dock) return;
    const node = ensureNode(dock, "uwCandleHitFlow", "section", "uw-candle-hit-flow");
    const head = dock.querySelector("#uwParameterReasoningBridge") || dock.querySelector(".uw-reason-head");
    if (head && node.previousElementSibling !== head) head.insertAdjacentElement("afterend", node);
    node.innerHTML = renderPanel(row, "Reasoning candle gate");
  }

  function renderTicketCandlePanel(row) {
    const ticket = document.querySelector("#uwOrderTicket");
    if (!ticket) return;
    const node = ensureNode(ticket, "uwCandleHitTicket", "div", "uw-candle-hit-ticket");
    node.setAttribute("data-uw-candle-hit-ticket", "true");
    node.innerHTML = renderPanel(row, "Order ticket candle proof");
  }

  function renderSymbolActionCandlePanel(row) {
    const actions = document.querySelector("#uwPaperActionBox");
    if (!actions) return;
    const node = ensureNode(actions, "uwSymbolCandleHitProof", "div", "uw-symbol-candle-hit-proof");
    actions.prepend(node);
    node.innerHTML = renderPanel(row, "Paper action candle proof");
  }

  function decorateTradeQueueRows() {
    document.querySelectorAll("#uwTradeQueueBody tr").forEach((tr) => {
      const symbol = tr.querySelector("button[data-select-symbol]")?.dataset?.selectSymbol || "";
      const row = rowForSymbol(symbol);
      const cells = tr.querySelectorAll("td");
      const paramCell = cells[4];
      if (!paramCell) return;
      paramCell.querySelector(".uw-candle-hit-mini")?.remove();
      const mini = document.createElement("div");
      mini.className = "uw-candle-hit-mini";
      mini.innerHTML = renderHitChips(candleHits(row), true);
      paramCell.appendChild(mini);
    });
  }

  function renderPanel(row, title) {
    const hits = candleHits(row);
    const status = row?.candle_status || (hits.some((hit) => hit.ok) ? "HIT" : row?.symbol ? "DATA_NEEDED" : "WAITING");
    const score = Number(row?.candle_score || 0);
    const reason = row?.candle_reason || (row?.symbol ? "No candle parameter hit returned by scanner" : "Run scanner and select a stock");
    return `
      <div class="uw-candle-hit-title">
        <span>${escapeHtml(title)}</span>
        <strong>${escapeHtml(row?.symbol || "No stock selected")}</strong>
      </div>
      <article><span>Status</span><strong>${escapeHtml(status)} / ${number(score)}</strong><small>${escapeHtml(reason)}</small></article>
      <article><span>Parameter hits</span>${renderHitChips(hits, false)}</article>
      <article><span>Evidence</span><strong>${escapeHtml(row?.candle_evidence || row?.fetch_error || "DATA_NEEDED: OHLC candles required")}</strong></article>
    `;
  }

  function renderHitChips(hits, compact) {
    if (!hits.length) return `<div class="uw-candle-hit-chips"><b class="need">DATA_NEEDED<span>OHLC candles</span></b></div>`;
    return `<div class="uw-candle-hit-chips ${compact ? "compact" : ""}">${hits.slice(0, compact ? 4 : 10).map((hit) => `<b class="${hit.ok ? "hit" : "need"}" title="${escapeAttr(hit.evidence || hit.label)}">P${escapeHtml(hit.parameter)}<span>${escapeHtml(hit.label || hit.pattern)}</span></b>`).join("")}</div>`;
  }

  function candleHits(row = {}) {
    if (!row?.symbol) return [];
    if (Array.isArray(row.candle_parameter_hits) && row.candle_parameter_hits.length) {
      return row.candle_parameter_hits.map((hit) => ({
        parameter: hit.parameter,
        pattern: hit.pattern,
        label: hit.label || hit.pattern,
        evidence: hit.evidence || row.candle_evidence || "server candle parameter hit",
        ok: hit.direction !== "caution" && row.candle_status !== "DATA_NEEDED"
      }));
    }
    const patterns = Array.isArray(row.candle_patterns) ? row.candle_patterns : [];
    return patterns.map((pattern) => {
      const mapped = PATTERN_PARAMS[pattern] || { parameter: 700, label: pattern };
      return { parameter: mapped.parameter, pattern, label: mapped.label, evidence: row.candle_evidence || "legacy candle pattern", ok: row.candle_status === "HIT" || row.candle_status === "PASS" };
    });
  }

  function patchPaperOrderPayload(args) {
    const url = String(args[0] || "");
    const init = args[1];
    if (!url.includes("/api/paper-trader/order") || !init || String(init.method || "GET").toUpperCase() !== "POST" || typeof init.body !== "string") return args;
    try {
      const payload = JSON.parse(init.body);
      const row = rowForSymbol(payload.symbol) || selectedRow();
      if (!row?.symbol) return args;
      const enriched = {
        ...payload,
        candle_status: payload.candle_status || row.candle_status || "DATA_NEEDED",
        candle_score: payload.candle_score ?? row.candle_score ?? 0,
        candle_patterns: payload.candle_patterns || row.candle_patterns || [],
        candle_parameter_hits: payload.candle_parameter_hits || row.candle_parameter_hits || [],
        candle_reason: payload.candle_reason || row.candle_reason || "No candle reason returned",
        candle_evidence: payload.candle_evidence || row.candle_evidence || row.fetch_error || "DATA_NEEDED: OHLC candles required"
      };
      return [args[0], { ...init, body: JSON.stringify(enriched) }, ...args.slice(2)];
    } catch (_) {
      return args;
    }
  }

  function ensureNode(parent, id, tag, className) {
    let node = document.querySelector("#" + id);
    if (node) return node;
    node = document.createElement(tag);
    node.id = id;
    node.className = className;
    parent.appendChild(node);
    return node;
  }

  function selectedRow() {
    const rows = state.scan?.rows || [];
    const symbol = state.selectedSymbol || selectedSymbolFromDom();
    return rowForSymbol(symbol) || rows.find((row) => row.decision === "SELECT") || rows.find((row) => row.decision === "WATCH") || rows[0] || {};
  }

  function rowForSymbol(symbol) {
    if (!symbol) return null;
    return (state.scan?.rows || []).find((row) => String(row.symbol || "").toUpperCase() === String(symbol).toUpperCase()) || null;
  }

  function selectedSymbolFromDom() {
    const ticketSymbol = document.querySelector("#uwOrderTicket label:first-child input")?.value?.trim();
    if (ticketSymbol) return ticketSymbol;
    const title = document.querySelector("#uwSelectedTitle, #uwSymbolName")?.textContent?.trim() || "";
    const symbol = title.split(/\s+/)[0];
    return symbol && !/^Selected|No$/i.test(symbol) ? symbol : "";
  }

  function pickSelectedSymbol(rows, current) {
    if (current && rows.some((row) => row.symbol === current)) return current;
    return rows.find((row) => row.candle_status === "HIT")?.symbol || rows.find((row) => row.decision === "SELECT")?.symbol || rows.find((row) => row.decision === "WATCH")?.symbol || rows[0]?.symbol || "";
  }

  function publish(row) {
    window.dispatchEvent(new CustomEvent("ashstocks:upstox-candle-hit-flow", {
      detail: {
        symbol: row?.symbol || "",
        candle_status: row?.candle_status || "DATA_NEEDED",
        candle_score: row?.candle_score || 0,
        candle_parameter_hits: candleHits(row),
        anchors: CANDLE_HIT_ANCHORS,
        source: "app-upstox-candle-hit-flow"
      }
    }));
  }

  function captureJson(response, callback) { response.clone().json().then((payload) => { if (payload && payload.ok !== false) callback(payload); }).catch(() => {}); }
  function number(value) { return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "0.00"; }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
  function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
})();