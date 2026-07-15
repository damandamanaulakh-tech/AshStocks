(() => {
  const state = {
    scan: null,
    quoteCache: {},
    selectedSymbol: "",
    busy: false,
    lastRunAt: null,
    nextRunAt: null,
    backoffUntil: 0,
    intervalMs: 30000,
    message: "Waiting for scanner rows",
    booted: false
  };

  const MAX_KEYS_PER_PULSE = 12;
  const MIN_PULSE_MS = 30000;
  const RATE_LIMIT_BACKOFF_MS = 120000;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const url = String(args[0] || "");
    if (url.includes("/api/scanner/run")) captureJson(response, (payload) => {
      state.scan = payload;
      state.selectedSymbol = pickSelectedSymbol(payload.rows || [], state.selectedSymbol);
      state.message = `Market watch loaded ${(payload.rows || []).length} scanner rows`;
      renderMarketWatchPulse();
      schedulePulse(1200);
    });
    return response;
  };

  window.addEventListener("DOMContentLoaded", () => bootMarketWatchPulse().catch(() => {}));
  window.addEventListener("ashstocks:broker-select-symbol", (event) => {
    if (event.detail?.symbol) {
      state.selectedSymbol = event.detail.symbol;
      renderMarketWatchPulse();
    }
  });

  document.addEventListener("click", (event) => {
    const refresh = event.target.closest("button[data-upstox-pulse-refresh]");
    if (refresh) runQuotePulse(true).catch(() => {});

    const selected = event.target.closest("button[data-select-symbol], button[data-pulse-symbol]");
    if (selected) {
      state.selectedSymbol = selected.dataset.selectSymbol || selected.dataset.pulseSymbol || state.selectedSymbol;
      window.dispatchEvent(new CustomEvent("ashstocks:broker-select-symbol", { detail: { symbol: state.selectedSymbol } }));
      renderMarketWatchPulse();
    }
  }, true);

  async function bootMarketWatchPulse() {
    if (state.booted) return;
    state.booted = true;
    await waitForShell();
    installMarketWatchPulse();
    renderMarketWatchPulse();
    schedulePulse(5000);
    setInterval(() => runQuotePulse(false).catch(() => {}), MIN_PULSE_MS);
  }

  function waitForShell() {
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (document.querySelector("#upstoxWorkspaceView") || document.querySelector("#brokerMarketsView")) return resolve();
        if (Date.now() - started > 12000) return resolve();
        setTimeout(tick, 80);
      };
      tick();
    });
  }

  function installMarketWatchPulse() {
    installWorkspacePulse();
    installBrokerPulse();
  }

  function installWorkspacePulse() {
    const workspace = document.querySelector("#upstoxWorkspaceView");
    if (!workspace || document.querySelector("#uwMarketWatchPulse")) return;
    const anchor = document.querySelector("#uwSymbolWorkspace") || workspace.querySelector("#uwMarketStrip") || workspace.querySelector(".uw-market-strip");
    const html = `
      <section class="panel upstox-market-watch-pulse" id="uwMarketWatchPulse">
        <div class="panel-header">
          <div><span class="eyebrow">Upstox Market Watch</span><h3>Scanner Quote Pulse</h3></div>
          <button type="button" class="secondary-button" data-upstox-pulse-refresh><i data-lucide="refresh-cw" aria-hidden="true"></i><span>Pulse</span></button>
        </div>
        <div class="pulse-status" id="pulseStatus"></div>
        <div class="pulse-strip" id="pulseStrip"></div>
      </section>
    `;
    if (anchor) anchor.insertAdjacentHTML("afterend", html);
    else workspace.insertAdjacentHTML("afterbegin", html);
    window.lucide?.createIcons();
  }

  function installBrokerPulse() {
    const view = document.querySelector("#brokerMarketsView");
    if (!view || document.querySelector("#brokerMarketWatchPulse")) return;
    const anchor = document.querySelector("#brokerScannerSnapshot") || view.querySelector(".broker-page-head") || view.firstElementChild;
    const html = `
      <section class="panel upstox-market-watch-pulse" id="brokerMarketWatchPulse">
        <div class="panel-header"><div><span class="eyebrow">Broker Market Watch</span><h3>Upstox Quote Pulse</h3></div><span id="brokerPulseState">Waiting</span></div>
        <div class="pulse-table-wrap"><table><thead><tr><th>Stock</th><th>LTP</th><th>Change</th><th>Depth</th><th>Readiness</th></tr></thead><tbody id="brokerPulseBody"></tbody></table></div>
      </section>
    `;
    if (anchor) anchor.insertAdjacentHTML("afterend", html);
    else view.insertAdjacentHTML("afterbegin", html);
  }

  function schedulePulse(delayMs) {
    state.nextRunAt = Date.now() + delayMs;
    setTimeout(() => runQuotePulse(false).catch(() => {}), delayMs);
    renderMarketWatchPulse();
  }

  async function runQuotePulse(force) {
    const rows = pulseRows();
    if (!rows.length) {
      state.message = "DATA_NEEDED: scanner rows with instrument_key required";
      renderMarketWatchPulse();
      return;
    }
    const now = Date.now();
    if (!force && state.busy) return;
    if (!force && state.backoffUntil && now < state.backoffUntil) {
      state.message = `Backoff active until ${new Date(state.backoffUntil).toLocaleTimeString()}`;
      renderMarketWatchPulse();
      return;
    }
    if (!force && state.lastRunAt && now - state.lastRunAt < MIN_PULSE_MS) return;

    state.busy = true;
    state.message = `Fetching ${rows.length} Upstox quotes...`;
    renderMarketWatchPulse();
    try {
      const keys = rows.map((row) => instrumentKey(row)).filter(Boolean);
      const response = await fetch("/api/upstox/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instrument_keys: keys, source: "upstox-market-watch-pulse" })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(payload.error || `quote pulse failed ${response.status}`);
      const byKey = new Map((payload.quotes || []).map((quote) => [quote.instrument_key, quote]));
      rows.forEach((row) => {
        const key = instrumentKey(row);
        const quote = byKey.get(key) || (payload.quotes || []).find((item) => sameKey(item.instrument_key, key));
        const quoteState = { at: Date.now(), ok: Boolean(quote), payload, quote: quote || null, error: quote ? "" : "quote missing in payload" };
        state.quoteCache[key] = quoteState;
        publishQuote(row, quoteState);
      });
      state.lastRunAt = Date.now();
      state.nextRunAt = state.lastRunAt + MIN_PULSE_MS;
      state.message = `Pulse ok: ${(payload.quotes || []).length}/${rows.length} quotes`;
    } catch (error) {
      const text = error.message || String(error);
      state.message = text;
      if (/429|rate limit|1015/i.test(text)) state.backoffUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
      rows.forEach((row) => {
        const key = instrumentKey(row);
        const quoteState = { at: Date.now(), ok: false, payload: null, quote: null, error: text };
        state.quoteCache[key] = quoteState;
        publishQuote(row, quoteState);
      });
    } finally {
      state.busy = false;
      renderMarketWatchPulse();
    }
  }

  function renderMarketWatchPulse() {
    installMarketWatchPulse();
    const rows = pulseRows();
    renderPulseStatus(rows);
    renderPulseStrip(rows);
    renderBrokerTable(rows);
  }

  function renderPulseStatus(rows) {
    const host = document.querySelector("#pulseStatus");
    const brokerState = document.querySelector("#brokerPulseState");
    const ready = rows.filter((row) => quoteStateFor(row).quote).length;
    const status = state.busy ? "Fetching" : state.message;
    if (brokerState) brokerState.textContent = rows.length ? `${ready}/${rows.length} quote ready` : "DATA_NEEDED";
    if (!host) return;
    host.innerHTML = [
      ["Watched", rows.length || "DATA_NEEDED"],
      ["Quote Ready", ready],
      ["Interval", `${Math.round(MIN_PULSE_MS / 1000)}s`],
      ["Backoff", state.backoffUntil && Date.now() < state.backoffUntil ? "ACTIVE" : "off"],
      ["Last Pulse", state.lastRunAt ? new Date(state.lastRunAt).toLocaleTimeString() : "not run"],
      ["State", status]
    ].map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
  }

  function renderPulseStrip(rows) {
    const host = document.querySelector("#pulseStrip");
    if (!host) return;
    host.innerHTML = rows.length ? rows.map((row) => {
      const quoteState = quoteStateFor(row);
      const quote = quoteState.quote;
      const selected = row.symbol === state.selectedSymbol ? " selected" : "";
      return `<button type="button" class="pulse-card${selected}" data-pulse-symbol="${escapeAttr(row.symbol)}" data-select-symbol="${escapeAttr(row.symbol)}">
        <span>${escapeHtml(row.symbol)}</span>
        <strong>${escapeHtml(quote ? money(quote.last_price || quote.close) : "DATA_NEEDED")}</strong>
        <b class="${Number(quote?.change_pct || quote?.change || 0) >= 0 ? "positive" : "negative"}">${escapeHtml(changeText(quote))}</b>
        <small>${escapeHtml(quoteReadiness(row))}</small>
      </button>`;
    }).join("") : `<div class="pulse-empty"><strong>No market watch rows</strong><span>Run scanner first. This panel will not invent quotes.</span></div>`;
  }

  function renderBrokerTable(rows) {
    const body = document.querySelector("#brokerPulseBody");
    if (!body) return;
    body.innerHTML = rows.length ? rows.map((row) => {
      const quote = quoteStateFor(row).quote;
      return `<tr>
        <td><button type="button" data-pulse-symbol="${escapeAttr(row.symbol)}" data-select-symbol="${escapeAttr(row.symbol)}"><strong>${escapeHtml(row.symbol)}</strong><span>${escapeHtml(row.name || "")}</span></button></td>
        <td>${escapeHtml(quote ? money(quote.last_price || quote.close) : "DATA_NEEDED")}</td>
        <td class="${Number(quote?.change_pct || quote?.change || 0) >= 0 ? "positive" : "negative"}">${escapeHtml(changeText(quote))}</td>
        <td>${escapeHtml(quote?.depth_available ? "UPSTOX_DEPTH" : "DATA_NEEDED")}</td>
        <td>${escapeHtml(quoteReadiness(row))}</td>
      </tr>`;
    }).join("") : `<tr><td colspan="5" class="empty-cell">No scanner shortlist with instrument_key yet.</td></tr>`;
  }

  function pulseRows() {
    const rows = (state.scan?.rows || []).filter((row) => row.symbol && instrumentKey(row));
    return rows.sort((a, b) => {
      const rank = (row) => row.decision === "SELECT" ? 4 : row.decision === "WATCH" ? 3 : row.candle_status === "HIT" ? 2 : row.decision === "BLOCKED" ? 1 : 0;
      return rank(b) - rank(a) || Number(b.score || b.paper_score || 0) - Number(a.score || a.paper_score || 0);
    }).slice(0, MAX_KEYS_PER_PULSE);
  }

  function quoteStateFor(row) { return state.quoteCache[instrumentKey(row)] || window.__ashstocksUpstoxQuoteCache?.[instrumentKey(row)] || {}; }
  function quoteReadiness(row) {
    const quoteState = quoteStateFor(row);
    if (!instrumentKey(row)) return "instrument_key DATA_NEEDED";
    if (quoteState.quote?.depth_available) return "quote + depth ok";
    if (quoteState.quote) return "quote ok; depth missing";
    if (quoteState.error) return `quote failed: ${quoteState.error}`;
    if (state.backoffUntil && Date.now() < state.backoffUntil) return "rate-limit backoff";
    return "quote waiting";
  }

  function publishQuote(row, quoteState) {
    window.__ashstocksUpstoxQuoteCache = { ...(window.__ashstocksUpstoxQuoteCache || {}), ...state.quoteCache };
    window.dispatchEvent(new CustomEvent("ashstocks:upstox-quote", { detail: { symbol: row.symbol, instrument_key: instrumentKey(row), quoteState } }));
  }

  function pickSelectedSymbol(rows, current) {
    if (current && rows.some((row) => row.symbol === current)) return current;
    return rows.find((row) => row.decision === "SELECT")?.symbol || rows.find((row) => row.decision === "WATCH")?.symbol || rows[0]?.symbol || "";
  }

  function instrumentKey(row) { return row.instrument_key || row.instrumentKey || row.instrument_token || ""; }
  function sameKey(a, b) { return String(a || "").replace(":", "|") === String(b || "").replace(":", "|"); }
  function changeText(quote) {
    if (!quote) return "waiting";
    const pct = Number(quote.change_pct);
    const change = Number(quote.change);
    if (Number.isFinite(pct)) return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
    if (Number.isFinite(change)) return `${change >= 0 ? "+" : ""}${change.toFixed(2)}`;
    return "change DATA_NEEDED";
  }

  function captureJson(response, callback) { response.clone().json().then((payload) => { if (payload && payload.ok !== false) callback(payload); }).catch(() => {}); }
  function money(value) { return Number.isFinite(Number(value)) ? "Rs " + Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "DATA_NEEDED"; }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
  function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
})();
