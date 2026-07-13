(() => {
  const state = { payload: null, booted: false };

  function $(selector) {
    return document.querySelector(selector);
  }

  function $all(selector) {
    return Array.from(document.querySelectorAll(selector));
  }

  async function api(path) {
    const response = await fetch(path);
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.location.href = "/login";
      throw new Error("Login required");
    }
    if (!response.ok || payload.ok === false) throw new Error(payload.error || `Request failed: ${response.status}`);
    return payload;
  }

  function installDataIntelligenceView() {
    const nav = $(".nav-list");
    let button = $('[data-view="data-intelligence"]');
    if (!button) {
      button = document.createElement("button");
      button.className = "nav-item";
      button.type = "button";
      button.dataset.view = "data-intelligence";
      button.innerHTML = '<i data-lucide="network" aria-hidden="true"></i><span>Data Intel</span>';
      const q1 = $('.nav-list a[href="/q1"]');
      nav?.insertBefore(button, q1 || null);
    }

    if (!$("#dataIntelligenceView")) {
      const section = document.createElement("section");
      section.className = "view data-intel-view";
      section.id = "dataIntelligenceView";
      section.dataset.viewPanel = "data-intelligence";
      section.innerHTML = `
        <div class="data-intel-hero">
          <div>
            <span class="eyebrow">Drive + Upstox Data Framework</span>
            <h3>No Blank Engine Inputs</h3>
            <p id="dataIntelStamp">Loading data intelligence</p>
          </div>
          <button class="secondary-button" id="refreshDataIntelBtn" type="button"><i data-lucide="refresh-cw" aria-hidden="true"></i><span>Refresh</span></button>
        </div>
        <div class="data-intel-summary" id="dataIntelSummary"></div>
        <section class="panel data-intel-panel">
          <div class="panel-header"><h3>Data Sources Read</h3><span id="dataSourceCount">Loading</span></div>
          <div class="data-source-grid" id="dataSourceGrid"></div>
        </section>
        <section class="panel data-intel-panel">
          <div class="panel-header"><h3>Parameter Blocks</h3><span id="dataBlockCount">Loading</span></div>
          <div class="block-grid" id="parameterBlockGrid"></div>
        </section>
        <section class="panel data-intel-panel">
          <div class="panel-header"><h3>Early Warning Layer</h3><span id="warningSignalCount">Loading</span></div>
          <div class="warning-chip-grid" id="warningSignalGrid"></div>
        </section>
        <section class="panel data-intel-panel">
          <div class="panel-header"><h3>Validated Trigger Lift</h3><span id="triggerLiftCount">Loading</span></div>
          <div class="intel-table-wrap"><table><thead><tr><th>Trigger</th><th>Fires</th><th>Precision</th><th>Recall</th><th>Lift</th></tr></thead><tbody id="triggerLiftBody"></tbody></table></div>
        </section>
        <section class="panel data-intel-panel">
          <div class="panel-header"><h3>Required Feeds</h3><span id="requiredFeedCount">Loading</span></div>
          <div class="intel-table-wrap"><table><thead><tr><th>Feed</th><th>Status</th><th>Priority</th><th>Unlocks</th></tr></thead><tbody id="requiredFeedBody"></tbody></table></div>
        </section>
      `;
      $("#dataView")?.after(section);
    }

    button.addEventListener("click", () => switchDataIntelView());
    $("#refreshDataIntelBtn")?.addEventListener("click", () => loadDataIntel(true));
    window.lucide?.createIcons();
  }

  function switchDataIntelView() {
    $all("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === "data-intelligence"));
    $all("[data-view-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.viewPanel === "data-intelligence"));
    const title = $("#pageTitle");
    if (title) title.textContent = "Data Intel";
    window.lucide?.createIcons();
  }

  async function loadDataIntel(force = false) {
    setStatus("Loading Drive and suspended-instrument intelligence");
    try {
      const payload = await api(`/api/data-intelligence${force ? "?refresh=1" : ""}`);
      state.payload = payload;
      renderDataIntel(payload);
      setStatus("Data intelligence loaded", "positive");
    } catch (error) {
      setStatus(error.message || String(error), "negative");
    }
  }

  function renderDataIntel(payload) {
    const stamp = $("#dataIntelStamp");
    if (stamp) stamp.textContent = `${payload.engine || "data-intelligence"} | ${new Date(payload.asOf || Date.now()).toLocaleString()}`;
    renderSummary(payload);
    renderSources(payload.drive_catalog?.direct_inputs || []);
    renderBlocks(payload.parameter_framework?.blocks || []);
    renderWarnings(payload.early_warning?.signals || []);
    renderTriggers(payload.validated_triggers?.rows || []);
    renderFeeds(payload.required_feeds || []);
  }

  function renderSummary(payload) {
    const suspended = payload.suspended_guard || {};
    const items = [
      ["Drive Files", payload.drive_catalog?.total_files_seen || 0, "Drive handoff files inventoried"],
      ["Parameters", payload.parameter_framework?.total_parameters || 0, `${payload.parameter_framework?.block_count || 0} blocks`],
      ["Warning Signals", payload.early_warning?.signal_count || 0, "regime-risk candidates"],
      ["Suspended Filter", suspended.unique_symbols || 0, suspended.filter_active ? "active" : suspended.error || "not active"],
      ["Trigger Lift", payload.validated_triggers?.average_lift || 0, "average from validation rows"],
      ["FII Net", payload.fii_dii_snapshot?.fii_fpi_net_cr || 0, `DII ${payload.fii_dii_snapshot?.dii_net_cr || 0} cr`]
    ];
    const host = $("#dataIntelSummary");
    if (!host) return;
    host.innerHTML = items.map(([label, value, note]) => `<article class="data-intel-tile"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`).join("");
  }

  function renderSources(rows) {
    const host = $("#dataSourceGrid");
    const count = $("#dataSourceCount");
    if (count) count.textContent = `${rows.length} inputs`;
    if (!host) return;
    host.innerHTML = rows.map((row) => `<article class="data-source-card"><strong>${escapeHtml(row.name)}</strong><span>${escapeHtml(row.scope)}</span><p>${escapeHtml(row.engine_use)}</p></article>`).join("");
  }

  function renderBlocks(rows) {
    const host = $("#parameterBlockGrid");
    const count = $("#dataBlockCount");
    if (count) count.textContent = `${rows.length} blocks`;
    if (!host) return;
    host.innerHTML = rows.map((row) => `<article class="block-card"><span>${escapeHtml(row.id)}</span><strong>${escapeHtml(row.name)}</strong><p>${escapeHtml(row.use)}</p></article>`).join("");
  }

  function renderWarnings(rows) {
    const host = $("#warningSignalGrid");
    const count = $("#warningSignalCount");
    if (count) count.textContent = `${rows.length} signals`;
    if (!host) return;
    host.innerHTML = rows.map((row) => `<span class="warning-chip">${escapeHtml(row)}</span>`).join("");
  }

  function renderTriggers(rows) {
    const body = $("#triggerLiftBody");
    const count = $("#triggerLiftCount");
    if (count) count.textContent = `${rows.length} rows`;
    if (!body) return;
    body.innerHTML = rows.map((row) => `<tr><td>${escapeHtml(row.trigger)}</td><td>${escapeHtml(row.fires)}</td><td>${pct(row.precision)}</td><td>${pct(row.recall)}</td><td>${escapeHtml(row.lift)}</td></tr>`).join("");
  }

  function renderFeeds(rows) {
    const body = $("#requiredFeedBody");
    const count = $("#requiredFeedCount");
    if (count) count.textContent = `${rows.length} feeds`;
    if (!body) return;
    body.innerHTML = rows.map((row) => `<tr><td>${escapeHtml(row.feed)}</td><td><span class="feed-status">${escapeHtml(row.status)}</span></td><td>${escapeHtml(row.priority)}</td><td>${escapeHtml(row.unlocks)}</td></tr>`).join("");
  }

  function pct(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `${(number * 100).toFixed(1)}%` : "-";
  }

  function setStatus(message, tone = "") {
    const line = $("#messageLine");
    if (!line) return;
    line.textContent = message;
    line.className = `alert-line ${tone}`.trim();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }

  window.addEventListener("DOMContentLoaded", () => {
    if (state.booted) return;
    state.booted = true;
    installDataIntelligenceView();
    loadDataIntel(false).catch((error) => setStatus(error.message || String(error), "negative"));
  });
})();
