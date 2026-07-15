(() => {
  const state = { rows: [], active: "ALL" };
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const url = String(args[0] || "");
    if (url.includes("/api/scanner/run")) {
      response.clone().json().then((payload) => {
        if (Array.isArray(payload.rows)) {
          state.rows = payload.rows;
          applyFilter();
        }
      }).catch(() => {});
    }
    return response;
  };

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-terminal-filter]");
    if (!button) return;
    state.active = button.dataset.terminalFilter || "ALL";
    applyFilter();
  }, true);

  window.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = `.abt-watch-filters button.active{border-color:#0f766e;background:#ecfdf5;color:#0f766e}.abt-filter-empty td{color:#64748b;font-weight:800}`;
    document.head.appendChild(style);
    setInterval(applyFilter, 3000);
  });

  function applyFilter() {
    const body = document.querySelector("#abtWatchBody");
    if (!body) return;
    document.querySelectorAll("button[data-terminal-filter]").forEach((button) => button.classList.toggle("active", button.dataset.terminalFilter === state.active));
    const trs = Array.from(body.querySelectorAll("tr")).filter((tr) => !tr.classList.contains("abt-filter-empty"));
    let shown = 0;
    for (const tr of trs) {
      const symbol = tr.querySelector("strong")?.textContent?.trim() || "";
      const row = state.rows.find((item) => String(item.symbol || "").toUpperCase() === symbol.toUpperCase()) || {};
      const show = matches(row, state.active);
      tr.style.display = show ? "" : "none";
      if (show) shown += 1;
    }
    let empty = body.querySelector("tr.abt-filter-empty");
    if (!empty) {
      empty = document.createElement("tr");
      empty.className = "abt-filter-empty";
      empty.innerHTML = `<td colspan="4">No rows match this real scanner filter.</td>`;
      body.appendChild(empty);
    }
    empty.style.display = trs.length && shown === 0 ? "" : "none";
  }

  function matches(row, filter) {
    if (filter === "ALL") return true;
    if (filter === "SELECT") return row.decision === "SELECT";
    if (filter === "WATCH") return row.decision === "WATCH";
    if (filter === "DATA_NEEDED") return row.decision === "DATA_NEEDED" || Boolean(row.fetch_error);
    if (filter === "CANDLE") return Boolean(row.candle_status || row.candle_patterns?.length || row.candle_engine || row.candles?.length);
    return true;
  }
})();