(() => {
  function appendScript(src) {
    if (document.querySelector(`script[src="${src}"]`)) return;
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    document.head.appendChild(script);
  }

  function appendStylesheet(href) {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function loadMergedWorkspaceAssets() {
    appendStylesheet("./upstox-workspace.css");
    appendStylesheet("./upstox-symbol-workspace.css");
    appendStylesheet("./upstox-reasoning-dock.css");
    appendStylesheet("./upstox-parameter-keys.css");
    appendStylesheet("./upstox-trade-queue-bridge.css");
    appendStylesheet("./broker-scanner-hub.css");
    appendStylesheet("./candle-trigger-tape.css");
    appendScript("./app-upstox-workspace.js");
    appendScript("./app-upstox-symbol-workspace.js");
    appendScript("./app-candle-engine-bridge.js");
    appendScript("./app-parameter-piano-candle-bridge.js");
    appendScript("./app-paper-order-lifecycle.js");
    appendScript("./app-upstox-parameter-filter.js");
    appendScript("./app-upstox-parameter-keys.js");
    appendScript("./app-upstox-parameter-exact-sync.js");
    appendScript("./app-upstox-reasoning-dock.js");
    appendScript("./app-upstox-trade-queue-bridge.js");
    appendScript("./app-broker-scanner-hub.js");
    appendScript("./app-candle-trigger-tape.js");
    appendScript("./app-upstox-autostart.js");
  }

  function closeBrokerPanels() {
    document.querySelectorAll("[data-broker-panel]").forEach((panel) => panel.classList.remove("active"));
    document.querySelectorAll("[data-broker-view]").forEach((button) => button.classList.remove("active"));
    document.querySelectorAll("[data-ash-workspace-panel]").forEach((panel) => panel.classList.remove("active"));
    document.querySelectorAll("[data-ash-workspace]").forEach((button) => button.classList.remove("active"));
  }

  loadMergedWorkspaceAssets();

  document.addEventListener("click", (event) => {
    const brokerButton = event.target.closest("[data-broker-view]");
    const workspaceButton = event.target.closest("[data-ash-workspace]");
    if (brokerButton || workspaceButton) return;
    const nativeView = event.target.closest("[data-view]");
    if (nativeView) closeBrokerPanels();
  }, true);
})();
