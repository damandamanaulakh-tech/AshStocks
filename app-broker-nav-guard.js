(() => {
  function loadMergedWorkspaceAssets() {
    if (!document.querySelector('link[href="./upstox-workspace.css"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "./upstox-workspace.css";
      document.head.appendChild(link);
    }
    if (!document.querySelector('script[src="./app-upstox-workspace.js"]')) {
      const script = document.createElement("script");
      script.src = "./app-upstox-workspace.js";
      script.async = false;
      document.head.appendChild(script);
    }
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
