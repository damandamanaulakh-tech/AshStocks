(() => {
  document.addEventListener("click", (event) => {
    const key = event.target.closest("button[data-uw-param-key]");
    if (!key) return;
    const parameterNumber = Number(key.dataset.uwParamKey);
    if (!Number.isFinite(parameterNumber)) return;
    setTimeout(() => syncExactParameter(parameterNumber), 0);
  }, false);

  function syncExactParameter(parameterNumber) {
    const input = document.querySelector("#uwParamNumber");
    if (!input) return;
    if (Number(input.value) !== parameterNumber) {
      input.value = String(parameterNumber);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const detail = document.querySelector("#uwParameterKeyDetail");
    if (detail) detail.dataset.exactParameter = String(parameterNumber);
  }
})();
