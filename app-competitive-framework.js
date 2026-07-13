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

  function installBenchmarkView() {
    const nav = $(".nav-list");
    let button = $('[data-view="benchmark"]');
    if (!button) {
      button = document.createElement("button");
      button.className = "nav-item";
      button.type = "button";
      button.dataset.view = "benchmark";
      button.innerHTML = '<i data-lucide="table-2" aria-hidden="true"></i><span>Benchmark</span>';
      const dataButton = $('[data-view="data"]');
      nav?.insertBefore(button, dataButton || null);
    }

    if ($("#benchmarkView")) return;
    const section = document.createElement("section");
    section.className = "view benchmark-view";
    section.id = "benchmarkView";
    section.dataset.viewPanel = "benchmark";
    section.innerHTML = `
      <div class="benchmark-hero">
        <div>
          <span class="eyebrow">Competitive Parameter Map</span>
          <h3>AshStocks vs Univest, AlgoTest, Streak, Tradetron</h3>
          <p id="benchmarkStamp">Loading framework</p>
        </div>
        <button class="secondary-button" id="refreshBenchmarkBtn" type="button"><i data-lucide="refresh-cw" aria-hidden="true"></i><span>Refresh</span></button>
      </div>
      <div class="benchmark-summary" id="benchmarkSummary"></div>
      <div class="competitor-grid" id="competitorGrid"></div>
      <section class="panel benchmark-panel">
        <div class="panel-header"><h3>Feature Comparison</h3><span id="comparisonCount">Loading</span></div>
        <div class="comparison-table-wrap"><table><thead><tr><th>Area</th><th>Univest</th><th>AlgoTest</th><th>Streak</th><th>Tradetron</th><th>AshStocks</th><th>Action</th></tr></thead><tbody id="comparisonBody"></tbody></table></div>
      </section>
      <section class="panel benchmark-panel">
        <div class="panel-header"><h3>Parameter Groups</h3><span id="parameterMapCount">Loading</span></div>
        <div class="parameter-map-grid" id="parameterMapGrid"></div>
      </section>
      <section class="panel benchmark-panel">
        <div class="panel-header"><h3>Build Order</h3><span>Next execution</span></div>
        <div class="build-order" id="buildOrder"></div>
      </section>
    `;
    $("#frameworkView")?.after(section);

    button.addEventListener("click", () => switchBenchmarkView());
    $("#refreshBenchmarkBtn")?.addEventListener("click", loadBenchmark);
    window.lucide?.createIcons();
  }

  function switchBenchmarkView() {
    $all("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === "benchmark"));
    $all("[data-view-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.viewPanel === "benchmark"));
    const title = $("#pageTitle");
    if (title) title.textContent = "Benchmark";
    window.lucide?.createIcons();
  }

  async function loadBenchmark() {
    setStatus("Loading competitor parameter map");
    try {
      const payload = await api(`/api/competitive-framework?ts=${Date.now()}`);
      state.payload = payload;
      renderBenchmark(payload);
      setStatus("Competitive framework loaded", "positive");
    } catch (error) {
      setStatus(error.message || String(error), "negative");
    }
  }

  function renderBenchmark(payload) {
    const stamp = $("#benchmarkStamp");
    if (stamp) stamp.textContent = `${payload.engine || "framework"} | ${new Date(payload.asOf || Date.now()).toLocaleString()}`;
    renderSummary(payload.summary || {});
    renderCompetitors(payload.competitors || []);
    renderComparison(payload.rows || []);
    renderParameterMap(payload.parameter_map || []);
    renderBuildOrder(payload.next_build_order || []);
  }

  function renderSummary(summary) {
    const items = [
      ["Built", summary.built || 0, "built"],
      ["Partial", summary.partial || 0, "partial"],
      ["Gap", summary.gap || 0, "gap"],
      ["Later", summary.later || 0, "later"],
      ["Intentional", summary.intentional || 0, "intentional"]
    ];
    const host = $("#benchmarkSummary");
    if (!host) return;
    host.innerHTML = items.map(([label, value, tone]) => `<article class="benchmark-tile ${tone}"><span>${escapeHtml(label)}</span><strong>${value}</strong></article>`).join("");
  }

  function renderCompetitors(rows) {
    const host = $("#competitorGrid");
    if (!host) return;
    host.innerHTML = rows.length
      ? rows.map((row) => `<article class="competitor-card"><strong>${escapeHtml(row.name)}</strong><span>${escapeHtml(row.role || "Role documented")}</span><p>${escapeHtml(row.edge || "Edge documented")}</p></article>`).join("")
      : '<article class="competitor-card"><strong>Competitors pending</strong><span>No blank data</span><p>Refresh framework to reload comparison.</p></article>';
  }

  function renderComparison(rows) {
    const body = $("#comparisonBody");
    const count = $("#comparisonCount");
    if (count) count.textContent = `${rows.length} rows`;
    if (!body) return;
    body.innerHTML = rows.length
      ? rows.map((row) => `<tr><td><strong>${escapeHtml(row.area)}</strong><span class="status-chip ${escapeHtml(row.status || "partial")}">${escapeHtml(row.status || "partial")}</span></td><td>${cell(row.univest)}</td><td>${cell(row.algotest)}</td><td>${cell(row.streak)}</td><td>${cell(row.tradetron)}</td><td>${cell(row.ashstocks)}</td><td>${cell(row.action)}</td></tr>`).join("")
      : '<tr><td colspan="7" class="empty-cell">Comparison rows are loading, no blank framework accepted.</td></tr>';
  }

  function renderParameterMap(rows) {
    const host = $("#parameterMapGrid");
    const count = $("#parameterMapCount");
    if (count) count.textContent = `${rows.length} groups`;
    if (!host) return;
    host.innerHTML = rows.length
      ? rows.map((row) => `<article class="parameter-map-card ${escapeHtml(row.ashstocks || "gap")}"><div><strong>${escapeHtml(row.group)}</strong><span>${escapeHtml(row.ashstocks || "gap")}</span></div><p>${escapeHtml((row.parameters || []).join(", "))}</p><small>${escapeHtml(row.next || "Build action required")}</small></article>`).join("")
      : '<article class="parameter-map-card gap"><div><strong>Parameter map pending</strong><span>gap</span></div><p>No blank parameter map.</p><small>Refresh required.</small></article>';
  }

  function renderBuildOrder(rows) {
    const host = $("#buildOrder");
    if (!host) return;
    host.innerHTML = rows.length
      ? rows.map((item, index) => `<div class="build-step"><b>${index + 1}</b><span>${escapeHtml(item)}</span></div>`).join("")
      : '<div class="build-step"><b>1</b><span>Build order loading</span></div>';
  }

  function cell(value) {
    return escapeHtml(value || "Not present / needs build");
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
    installBenchmarkView();
    loadBenchmark().catch((error) => setStatus(error.message || String(error), "negative"));
  });
})();
