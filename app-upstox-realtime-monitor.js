(() => {
  const state = {
    scan: null,
    ledger: null,
    selectedSymbol: "",
    quotes: {},
    ticks: {},
    busy: false,
    backoffUntil: 0,
    lastPollAt: 0,
    message: "Realtime monitor waiting for scanner rows",
    booted: false
  };

  const POLL_MS = 15000;
  const BACKOFF_MS = 120000;
  const MAX_KEYS = 8;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const url = String(args[0] || "");
    if (url.includes("/api/scanner/run")) captureJson(response, (payload) => {
      if (Array.isArray(payload.rows)) {
        state.scan = payload;
        state.selectedSymbol = chooseSymbol(payload.rows, state.selectedSymbol);
        state.message = `Realtime monitor loaded ${payload.rows.length} scanner rows`;
        renderRealtimeMonitor();
        runRealtimePoll(true).catch(() => {});
      }
    });
    if (url.includes("/api/paper-trader/orders") || url.includes("/api/paper-trader/order")) captureJson(response, (payload) => {
      if (payload && payload.ok !== false) state.ledger = payload;
      renderRealtimeMonitor();
    });
    if (url.includes("/api/upstox/quote")) captureJson(response, (payload) => {
      ingestQuotes(payload);
      renderRealtimeMonitor();
    });
    return response;
  };

  window.addEventListener("DOMContentLoaded", () => bootRealtimeMonitor().catch(() => {}));
  window.addEventListener("ashstocks:broker-select-symbol", (event) => {
    if (event.detail?.symbol) {
      state.selectedSymbol = event.detail.symbol;
      renderRealtimeMonitor();
      runRealtimePoll(true).catch(() => {});
    }
  });
  window.addEventListener("ashstocks:upstox-quote", (event) => {
    const detail = event.detail || {};
    if (detail.instrument_key && detail.quoteState) {
      const quote = detail.quoteState.quote;
      if (quote) recordTick(detail.instrument_key, quote, detail.symbol);
      state.quotes[detail.instrument_key] = detail.quoteState;
      renderRealtimeMonitor();
    }
  });

  document.addEventListener("click", (event) => {
    const refresh = event.target.closest("button[data-realtime-refresh]");
    if (refresh) runRealtimePoll(true).catch(() => {});
  }, true);

  async function bootRealtimeMonitor() {
    if (state.booted) return;
    state.booted = true;
    await waitForTerminal();
    installRealtimeMonitor();
    await refreshLedger();
    renderRealtimeMonitor();
    setInterval(() => runRealtimePoll(false).catch(() => {}), POLL_MS);
  }

  function waitForTerminal() {
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (document.querySelector("#ashBrokerTerminal") || document.querySelector("#upstoxWorkspaceView") || document.querySelector("#brokerMarketsView")) return resolve();
        if (Date.now() - started > 12000) return resolve();
        setTimeout(tick, 80);
      };
      tick();
    });
  }

  function installRealtimeMonitor() {
    const terminal = document.querySelector("#ashBrokerTerminal") || document.querySelector("#upstoxWorkspaceView") || document.querySelector("#brokerMarketsView");
    if (!terminal || document.querySelector("#upstoxRealtimeMonitor")) return;
    const anchor = terminal.querySelector(".abt-market-strip") || terminal.querySelector("#uwMarketWatchPulse") || terminal.firstElementChild;
    const html = `
      <section class="upstox-realtime-monitor" id="upstoxRealtimeMonitor">
        <div class="urt-head">
          <div><span class="eyebrow">Realtime Layer</span><h3>Upstox Quote Monitor</h3></div>
          <div class="urt-actions"><span id="urtMode">POLLING_FALLBACK</span><button type="button" data-realtime-refresh><i data-lucide="refresh-cw" aria-hidden="true"></i><b>Refresh Ticks</b></button></div>
        </div>
        <div class="urt-summary" id="urtSummary"></div>
        <div class="urt-grid">
          <section><div class="urt-section-head"><strong>Selected Tick</strong><span id="urtSelectedState">DATA_NEEDED</span></div><div id="urtSelected" class="urt-selected"></div></section>
          <section><div class="urt-section-head"><strong>Trigger Watch</strong><span id="urtTriggerCount">0</span></div><div id="urtTriggers" class="urt-triggers"></div></section>
          <section><div class="urt-section-head"><strong>Tick Stream</strong><span id="urtTickCount">0</span></div><div id="urtStream" class="urt-stream"></div></section>
        </div>
      </section>
    `;
    if (anchor) anchor.insertAdjacentHTML("afterend", html);
    else terminal.insertAdjacentHTML("afterbegin", html);
    window.lucide?.createIcons();
  }

  async function refreshLedger() {
    try {
      const response = await fetch("/api/paper-trader/orders");
      if (response.status !== 401) {
        const payload = await response.json().catch(() => ({}));
        if (payload && payload.ok !== false) state.ledger = payload;
      }
    } catch (_) {}
  }

  async function runRealtimePoll(force) {
    const rows = monitoredRows();
    if (!rows.length) {
      state.message = "DATA_NEEDED: scanner rows with instrument_key required";
      renderRealtimeMonitor();
      return;
    }
    const now = Date.now();
    if (!force && state.busy) return;
    if (!force && state.backoffUntil && now < state.backoffUntil) {
      state.message = `Rate-limit backoff until ${new Date(state.backoffUntil).toLocaleTimeString()}`;
      renderRealtimeMonitor();
      return;
    }
    if (!force && state.lastPollAt && now - state.lastPollAt < POLL_MS - 500) return;

    state.busy = true;
    state.message = `Polling ${rows.length} Upstox quote keys...`;
    renderRealtimeMonitor();
    try {
      const keys = rows.map(instrumentKey).filter(Boolean);
      const response = await fetch("/api/upstox/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instrument_keys: keys, source: "upstox-realtime-monitor", interval_ms: POLL_MS })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(payload.error || `Upstox realtime poll ${response.status}`);
      ingestQuotes(payload);
      state.lastPollAt = Date.now();
      state.message = `Realtime poll ok: ${(payload.quotes || []).length}/${keys.length}`;
    } catch (error) {
      const text = error.message || String(error);
      state.message = text;
      if (/429|rate limit|1015/i.test(text)) state.backoffUntil = Date.now() + BACKOFF_MS;
    } finally {
      state.busy = false;
      renderRealtimeMonitor();
    }
  }

  function ingestQuotes(payload) {
    if (!payload || payload.ok === false) return;
    for (const quote of payload.quotes || []) {
      const key = quote.instrument_key || quote.instrumentKey || quote.key;
      if (!key) continue;
      const row = scannerRows().find((item) => sameKey(instrumentKey(item), key)) || {};
      recordTick(key, quote, row.symbol || quote.trading_symbol);
      state.quotes[key] = { at: Date.now(), ok: true, quote, payload, error: "" };
      window.__ashstocksUpstoxQuoteCache = { ...(window.__ashstocksUpstoxQuoteCache || {}), [key]: state.quotes[key] };
      window.dispatchEvent(new CustomEvent("ashstocks:upstox-realtime-tick", { detail: { symbol: row.symbol || quote.trading_symbol, instrument_key: key, quote, tick: state.ticks[key] } }));
    }
  }

  function recordTick(key, quote, symbol) {
    const previous = state.ticks[key]?.last || null;
    const ltp = firstFinite(quote.last_price, quote.close, null);
    const prevPrice = previous ? firstFinite(previous.last_price, previous.close, null) : null;
    const change = ltp !== null && prevPrice !== null ? ltp - prevPrice : null;
    state.ticks[key] = {
      symbol: symbol || quote.trading_symbol || key,
      previous,
      last: quote,
      at: Date.now(),
      ltp,
      change,
      direction: change === null ? "FLAT" : change > 0 ? "UP" : change < 0 ? "DOWN" : "FLAT"
    };
  }

  function renderRealtimeMonitor() {
    installRealtimeMonitor();
    const host = document.querySelector("#upstoxRealtimeMonitor");
    if (!host) return;
    const rows = monitoredRows();
    const ticks = Object.values(state.ticks);
    renderSummary(rows, ticks);
    renderSelected(rows);
    renderTriggers(rows);
    renderStream(ticks);
  }

  function renderSummary(rows, ticks) {
    const summary = document.querySelector("#urtSummary");
    const mode = document.querySelector("#urtMode");
    if (mode) mode.textContent = state.busy ? "POLLING" : "POLLING_FALLBACK_NO_WEBSOCKET";
    if (!summary) return;
    const fresh = ticks.filter((tick) => Date.now() - tick.at < POLL_MS * 2).length;
    summary.innerHTML = [
      ["Rows", rows.length || "DATA_NEEDED"],
      ["Fresh Ticks", fresh],
      ["Interval", `${POLL_MS / 1000}s`],
      ["Backoff", state.backoffUntil && Date.now() < state.backoffUntil ? "ACTIVE" : "off"],
      ["Last Poll", state.lastPollAt ? new Date(state.lastPollAt).toLocaleTimeString() : "not run"],
      ["State", state.message]
    ].map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
  }

  function renderSelected(rows) {
    const host = document.querySelector("#urtSelected");
    const stateNode = document.querySelector("#urtSelectedState");
    if (!host) return;
    const row = selectedRow(rows);
    const key = instrumentKey(row);
    const tick = state.ticks[key];
    if (stateNode) stateNode.textContent = tick ? tick.direction : "DATA_NEEDED";
    if (!row.symbol) {
      host.innerHTML = `<article><strong>No stock selected</strong><span>Run scanner and select a symbol.</span></article>`;
      return;
    }
    if (!tick) {
      host.innerHTML = `<article><strong>${escapeHtml(row.symbol)}</strong><span>Quote tick DATA_NEEDED. ${escapeHtml(state.message)}</span></article>`;
      return;
    }
    host.innerHTML = `<article class="${tick.direction}"><strong>${escapeHtml(row.symbol)} ${money(tick.ltp)}</strong><span>${escapeHtml(tick.direction)} ${number(tick.change)} | ${new Date(tick.at).toLocaleTimeString()}</span><b>${escapeHtml(triggerText(row, tick))}</b></article>`;
  }

  function renderTriggers(rows) {
    const host = document.querySelector("#urtTriggers");
    const count = document.querySelector("#urtTriggerCount");
    if (!host) return;
    const triggers = rows.map((row) => ({ row, tick: state.ticks[instrumentKey(row)], text: triggerText(row, state.ticks[instrumentKey(row)]) })).filter((item) => item.tick && item.text !== "WATCHING");
    if (count) count.textContent = String(triggers.length);
    host.innerHTML = triggers.length ? triggers.slice(0, 10).map(({ row, tick, text }) => `<article class="${tick.direction}"><strong>${escapeHtml(row.symbol)} ${escapeHtml(text)}</strong><span>LTP ${money(tick.ltp)} | Target ${money(targetPrice(row))} | Stop ${money(stopPrice(row))}</span></article>`).join("") : `<article><strong>No realtime trigger fired</strong><span>Monitor is watching selected scanner rows. No fake trigger shown.</span></article>`;
  }

  function renderStream(ticks) {
    const host = document.querySelector("#urtStream");
    const count = document.querySelector("#urtTickCount");
    if (count) count.textContent = String(ticks.length);
    if (!host) return;
    const sorted = ticks.slice().sort((a, b) => b.at - a.at).slice(0, 16);
    host.innerHTML = sorted.length ? sorted.map((tick) => `<article class="${tick.direction}"><strong>${escapeHtml(tick.symbol)}</strong><span>${money(tick.ltp)} | ${escapeHtml(tick.direction)} ${number(tick.change)}</span><small>${new Date(tick.at).toLocaleTimeString()}</small></article>`).join("") : `<article><strong>No ticks yet</strong><span>Run engine or press Refresh Ticks.</span></article>`;
  }

  function monitoredRows() {
    const rows = scannerRows().filter((row) => row.symbol && instrumentKey(row));
    const selected = rows.find((row) => row.symbol === state.selectedSymbol);
    const ranked = rows.filter((row) => row !== selected).slice(0, selected ? MAX_KEYS - 1 : MAX_KEYS);
    return selected ? [selected, ...ranked] : ranked;
  }

  function scannerRows() {
    return (state.scan?.rows || []).slice().sort((a, b) => rank(b) - rank(a) || Number(b.score || b.paper_score || 0) - Number(a.score || a.paper_score || 0));
  }

  function selectedRow(rows = monitoredRows()) {
    return rows.find((row) => row.symbol === state.selectedSymbol) || rows.find((row) => row.decision === "SELECT") || rows.find((row) => row.decision === "WATCH") || rows[0] || {};
  }

  function chooseSymbol(rows, current) {
    if (current && rows.some((row) => row.symbol === current)) return current;
    return rows.find((row) => row.decision === "SELECT")?.symbol || rows.find((row) => row.decision === "WATCH")?.symbol || rows[0]?.symbol || "";
  }

  function triggerText(row, tick) {
    if (!tick || tick.ltp === null) return "WATCHING";
    const target = targetPrice(row);
    const stop = stopPrice(row);
    if (target && tick.ltp >= target) return "TARGET_TOUCH";
    if (stop && tick.ltp <= stop) return "STOP_TOUCH";
    if (target && tick.ltp >= target * 0.98) return "TARGET_NEAR";
    if (stop && tick.ltp <= stop * 1.02) return "STOP_NEAR";
    if (row.candle_status === "HIT" && tick.direction === "UP") return "CANDLE_CONTINUATION";
    return "WATCHING";
  }

  function ledgerArray(name) {
    const ledger = state.ledger || {};
    return [ledger[name], ledger.paperTrader?.[name], ledger.status?.[name]].find(Array.isArray) || [];
  }

  function rank(row) { return row.decision === "SELECT" ? 4 : row.decision === "WATCH" ? 3 : row.candle_status === "HIT" ? 2 : row.decision === "BLOCKED" ? 1 : 0; }
  function targetPrice(row) { return firstFinite(row.target_price, row.target2, row.advisor?.target2, row.advisor?.target1, null); }
  function stopPrice(row) { return firstFinite(row.stop_price, row.advisor?.stop, row.paper_order?.stop_price, null); }
  function instrumentKey(row) { return row.instrument_key || row.instrumentKey || row.instrument_token || ""; }
  function sameKey(a, b) { return String(a || "").replace(":", "|") === String(b || "").replace(":", "|"); }
  function firstFinite(...values) { for (const value of values) { const n = Number(value); if (Number.isFinite(n)) return n; } return null; }
  function money(value) { return Number.isFinite(Number(value)) ? "Rs " + Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "DATA_NEEDED"; }
  function number(value) { return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "0.00"; }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
  function captureJson(response, callback) { response.clone().json().then((payload) => callback(payload)).catch(() => {}); }
})();