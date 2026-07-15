(() => {
  const state = { rows: [], selectedSymbol: "" };
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const url = String(args[0] || "");
    if (url.includes("/api/scanner/run")) {
      response.clone().json().then((payload) => {
        if (Array.isArray(payload.rows)) {
          state.rows = payload.rows;
          state.selectedSymbol = pickSelectedSymbol(payload.rows, state.selectedSymbol);
          schedule();
        }
      }).catch(() => {});
    }
    return response;
  };

  document.addEventListener("click", (event) => {
    const rowButton = event.target.closest("button[data-select-symbol]");
    if (rowButton) state.selectedSymbol = rowButton.dataset.selectSymbol || state.selectedSymbol;

    const key = event.target.closest(".piano-key");
    if (!key) return;
    const param = Number(key.dataset.param || 0);
    if (param >= 681 && param <= 800) {
      window.requestAnimationFrame(() => renderCandleDetail(param, key.dataset.state || "idle"));
    }
  }, true);

  window.addEventListener("DOMContentLoaded", () => {
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    schedule();
  });

  function schedule() {
    window.requestAnimationFrame(() => {
      relabelPianoFamily();
      renderCandleDetailIfSelected();
    });
  }

  function relabelPianoFamily() {
    document.querySelectorAll(".piano-family-head strong").forEach((label) => {
      if (label.textContent.trim() === "Volume") label.textContent = "Candle Structure + Volume";
    });
  }

  function renderCandleDetailIfSelected() {
    const selected = document.querySelector(".piano-key[data-param].hit, .piano-key[data-param].warn, .piano-key[data-param].block");
    const param = Number(selected?.dataset?.param || 0);
    if (param >= 681 && param <= 800) renderCandleDetail(param, selected.dataset.state || "idle");
  }

  function renderCandleDetail(param, keyState) {
    const panel = document.querySelector("#parameterDetailPanel");
    if (!panel) return;
    const row = selectedRow();
    const hasServerCandle = row?.candle_engine || row?.candle_status || row?.candle_patterns || row?.candle_score !== undefined;
    if (!hasServerCandle) return;
    const patterns = Array.isArray(row.candle_patterns) && row.candle_patterns.length ? row.candle_patterns.join(", ") : row.candle_reason || "No pattern hit";
    panel.innerHTML = `
      <div class="parameter-detail-head"><span class="piano-key ${escapeAttr(keyState)}">${escapeHtml(param)}</span><strong>Candle Structure + Volume</strong><b>${escapeHtml(row.candle_status || "DATA_NEEDED")}</b></div>
      <div class="parameter-detail-grid">
        <span>Family</span><strong>Candle Structure 681-800</strong>
        <span>Source</span><strong>Server scanner candle engine: ${escapeHtml(row.candle_engine || "not reported")}</strong>
        <span>Current evidence</span><strong>${escapeHtml(row.symbol || "no stock")}: ${escapeHtml(row.candle_evidence || patterns)}</strong>
        <span>Pass line</span><strong>Engulfing, hammer rejection, wide body, near 252D breakout, inside bar, or volume confirmation.</strong>
        <span>Engine impact</span><strong>${escapeHtml(row.candle_status || "DATA_NEEDED")} / score ${number(row.candle_score)}; emitted on scanner row and consumed by Dashboard.</strong>
      </div>
    `;
  }

  function selectedRow() {
    return state.rows.find((row) => row.symbol === state.selectedSymbol) || state.rows[0] || null;
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

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
