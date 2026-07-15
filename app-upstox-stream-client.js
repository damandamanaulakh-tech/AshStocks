(() => {
  const state = {
    rows: [],
    selectedSymbol: "",
    source: null,
    lastEventAt: 0,
    status: "SSE_WAITING_FOR_SCANNER",
    failures: [],
    reconnectTimer: null
  };

  const MAX_STREAM_KEYS = 8;
  const RECONNECT_MS = 20000;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const url = String(args[0] || "");
    if (url.includes("/api/scanner/run")) {
      response.clone().json().then((payload) => {
        if (Array.isArray(payload.rows)) {
          state.rows = payload.rows;
          state.selectedSymbol = chooseSymbol(payload.rows, state.selectedSymbol);
          restartStream("scanner-run");
          renderStreamStatus();
        }
      }).catch(() => {});
    }
    return response;
  };

  window.addEventListener("DOMContentLoaded", () => {
    installStreamStatus();
    renderStreamStatus();
  });

  window.addEventListener("ashstocks:broker-select-symbol", (event) => {
    if (event.detail?.symbol) {
      state.selectedSymbol = event.detail.symbol;
      restartStream("selected-symbol");
    }
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-stream-reconnect]");
    if (button) restartStream("manual");
  }, true);

  function restartStream(reason) {
    closeStream();
    const keys = streamKeys();
    if (!keys.length) {
      state.status = "SSE_DATA_NEEDED_INSTRUMENT_KEYS";
      renderStreamStatus();
      return;
    }
    const params = new URLSearchParams();
    keys.forEach((key) => params.append("instrument_key", key));
    params.set("source", "upstox-stream-client");
    params.set("reason", reason || "auto");
    state.status = "SSE_CONNECTING";
    renderStreamStatus();
    try {
      const source = new EventSource(`/api/upstox/quote-stream?${params.toString()}`);
      state.source = source;
      source.addEventListener("status", (event) => {
        const payload = parseEvent(event);
        state.status = payload.transport || "SSE_CONNECTED";
        state.lastEventAt = Date.now();
        renderStreamStatus();
      });
      source.addEventListener("quote", (event) => {
        const payload = parseEvent(event);
        state.status = "SSE_QUOTE_ACTIVE";
        state.lastEventAt = Date.now();
        state.failures = payload.failures || [];
        publishQuotes(payload);
        renderStreamStatus();
      });
      source.addEventListener("error", (event) => {
        const payload = parseEvent(event);
        state.status = payload.error ? `SSE_ERROR: ${payload.error}` : "SSE_ERROR_OR_LOGIN_REQUIRED";
        state.failures = payload.failures || state.failures;
        renderStreamStatus();
        scheduleReconnect();
      });
      source.onerror = () => {
        state.status = "SSE_DISCONNECTED_RETRYING";
        renderStreamStatus();
        scheduleReconnect();
      };
    } catch (error) {
      state.status = `SSE_FAILED: ${error.message}`;
      scheduleReconnect();
      renderStreamStatus();
    }
  }

  function closeStream() {
    if (state.source) state.source.close();
    state.source = null;
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }

  function scheduleReconnect() {
    if (state.reconnectTimer) return;
    closeStream();
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      restartStream("reconnect");
    }, RECONNECT_MS);
  }

  function publishQuotes(payload) {
    const quotes = payload.quotes || [];
    for (const quote of quotes) {
      const row = state.rows.find((item) => sameKey(instrumentKey(item), quote.instrument_key)) || {};
      const quoteState = { at: Date.now(), ok: true, quote, payload, error: "", transport: "SSE" };
      window.__ashstocksUpstoxQuoteCache = { ...(window.__ashstocksUpstoxQuoteCache || {}), [quote.instrument_key]: quoteState };
      window.dispatchEvent(new CustomEvent("ashstocks:upstox-quote", { detail: { symbol: row.symbol || quote.trading_symbol, instrument_key: quote.instrument_key, quoteState } }));
      window.dispatchEvent(new CustomEvent("ashstocks:upstox-realtime-tick", { detail: { symbol: row.symbol || quote.trading_symbol, instrument_key: quote.instrument_key, quote, transport: "SSE" } }));
    }
  }

  function installStreamStatus() {
    const terminal = document.querySelector("#upstoxRealtimeMonitor") || document.querySelector("#ashBrokerTerminal") || document.querySelector("#upstoxWorkspaceView") || document.querySelector("#brokerMarketsView");
    if (!terminal || document.querySelector("#upstoxStreamStatus")) return;
    const html = `<section class="upstox-stream-status" id="upstoxStreamStatus"><div><span class="eyebrow">Stream Transport</span><strong>Upstox SSE Quote Stream</strong></div><div id="upstoxStreamState">SSE_WAITING</div><button type="button" data-stream-reconnect>Reconnect</button></section>`;
    const anchor = document.querySelector("#upstoxRealtimeMonitor") || terminal.firstElementChild;
    if (anchor) anchor.insertAdjacentHTML("afterend", html);
    else terminal.insertAdjacentHTML("afterbegin", html);
  }

  function renderStreamStatus() {
    installStreamStatus();
    const node = document.querySelector("#upstoxStreamState");
    if (!node) return;
    const keys = streamKeys();
    node.textContent = `${state.status} | keys ${keys.length} | last ${state.lastEventAt ? new Date(state.lastEventAt).toLocaleTimeString() : "not yet"}`;
  }

  function streamKeys() {
    const rows = state.rows.filter((row) => row.symbol && instrumentKey(row));
    const selected = rows.find((row) => row.symbol === state.selectedSymbol);
    const ranked = rows.sort((a, b) => rank(b) - rank(a) || Number(b.score || b.paper_score || 0) - Number(a.score || a.paper_score || 0));
    const chosen = selected ? [selected, ...ranked.filter((row) => row !== selected)] : ranked;
    return chosen.map(instrumentKey).filter(Boolean).filter((key, index, all) => all.indexOf(key) === index).slice(0, MAX_STREAM_KEYS);
  }

  function chooseSymbol(rows, current) {
    if (current && rows.some((row) => row.symbol === current)) return current;
    return rows.find((row) => row.decision === "SELECT")?.symbol || rows.find((row) => row.decision === "WATCH")?.symbol || rows[0]?.symbol || "";
  }

  function rank(row) { return row.decision === "SELECT" ? 4 : row.decision === "WATCH" ? 3 : row.candle_status === "HIT" ? 2 : row.decision === "BLOCKED" ? 1 : 0; }
  function instrumentKey(row) { return row.instrument_key || row.instrumentKey || row.instrument_token || ""; }
  function sameKey(a, b) { return String(a || "").replace(":", "|") === String(b || "").replace(":", "|"); }
  function parseEvent(event) { try { return JSON.parse(event.data || "{}"); } catch (_) { return {}; } }
})();