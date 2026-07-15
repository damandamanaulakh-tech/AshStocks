(() => {
  const candleState = { rows: [], selectedSymbol: "" };
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const url = String(args[0] || "");
    if (url.includes("/api/scanner/run")) {
      response.clone().json().then((payload) => {
        if (Array.isArray(payload.rows)) {
          candleState.rows = payload.rows;
          candleState.selectedSymbol = pickSelectedSymbol(payload.rows, candleState.selectedSymbol);
          scheduleCandleRender();
        }
      }).catch(() => {});
    }
    return response;
  };

  document.addEventListener("click", (event) => {
    const selected = event.target.closest("button[data-select-symbol]");
    if (selected) {
      candleState.selectedSymbol = selected.dataset.selectSymbol || candleState.selectedSymbol;
      scheduleCandleRender();
    }
    const key = event.target.closest("button[data-family='Candle Structure']");
    if (key) scheduleCandleRender(true, key.dataset.param);
  }, true);

  window.addEventListener("DOMContentLoaded", () => {
    const observer = new MutationObserver(() => scheduleCandleRender());
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleCandleRender();
  });

  function scheduleCandleRender(forceDetail = false, param = "681") {
    window.requestAnimationFrame(() => renderServerCandle(forceDetail, param));
  }

  function renderServerCandle(forceDetail = false, param = "681") {
    const row = selectedRow();
    if (!row?.symbol) return;
    const hasServerCandle = row.candle_engine || row.candle_status || row.candle_patterns || row.candle_score !== undefined;
    if (!hasServerCandle) return;

    const state = document.querySelector("#uwCandleState");
    const box = document.querySelector("#uwCandleBox");
    if (state) state.textContent = row.candle_status || "DATA_NEEDED";
    if (box) {
      const patterns = Array.isArray(row.candle_patterns) && row.candle_patterns.length ? row.candle_patterns.join(", ") : row.candle_reason || "No candle pattern hit";
      box.innerHTML = `
        <strong>${escapeHtml(row.symbol)} | ${escapeHtml(patterns)}</strong>
        <p>${escapeHtml(row.candle_evidence || row.fetch_error || "No server candle evidence available")}</p>
        <span>Server candle engine: ${escapeHtml(row.candle_engine || "not reported")} | score ${number(row.candle_score)} | status ${escapeHtml(row.candle_status || "not reported")}</span>
      `;
    }

    const detail = document.querySelector("#uwParameterDetail");
    if (forceDetail && detail) {
      detail.innerHTML = `
        <strong>P${escapeHtml(param)} Candle Structure</strong>
        <span>Source: server scanner candle engine, using Upstox/manual OHLC candle bodies when attached.</span>
        <span>Evidence: ${escapeHtml(row.candle_evidence || row.candle_reason || "DATA_NEEDED")}</span>
        <span>Impact: ${escapeHtml(row.candle_status || "DATA_NEEDED")} with score ${number(row.candle_score)}; visible in scanner row, dashboard, and piano.</span>
      `;
    }

    const facts = document.querySelector("#uwStockFacts");
    if (facts && !facts.querySelector("[data-candle-engine-fact]")) {
      facts.insertAdjacentHTML("beforeend", `<article data-candle-engine-fact><span>Candle Engine</span><strong>${escapeHtml(row.candle_status || "DATA_NEEDED")} / ${number(row.candle_score)}</strong></article>`);
    } else if (facts) {
      const fact = facts.querySelector("[data-candle-engine-fact] strong");
      if (fact) fact.textContent = `${row.candle_status || "DATA_NEEDED"} / ${number(row.candle_score)}`;
    }
  }

  function selectedRow() {
    return candleState.rows.find((row) => row.symbol === candleState.selectedSymbol) || candleState.rows[0] || null;
  }

  function pickSelectedSymbol(rows, current) {
    if (current && rows.some((row) => row.symbol === current)) return current;
    return rows.find((row) => row.decision === "SELECT")?.symbol || rows.find((row) => row.decision === "WATCH")?.symbol || rows[0]?.symbol || "";
  }

  function number(value) {
    return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "not available";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }
})();
