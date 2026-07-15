(() => {
  function closeBrokerPanels() {
    document.querySelectorAll("[data-broker-panel]").forEach((panel) => panel.classList.remove("active"));
    document.querySelectorAll("[data-broker-view]").forEach((button) => button.classList.remove("active"));
  }

  document.addEventListener("click", (event) => {
    const brokerButton = event.target.closest("[data-broker-view]");
    if (brokerButton) return;
    const nativeView = event.target.closest("[data-view]");
    if (nativeView) closeBrokerPanels();
  }, true);
})();
