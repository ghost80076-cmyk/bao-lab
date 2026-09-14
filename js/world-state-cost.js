(() => {
  if (typeof WorldStateEngine === "undefined") return;

  let turnCounter = 0;
  const originalUpdate = WorldStateEngine.update.bind(WorldStateEngine);

  WorldStateEngine.interval = config => {
    const n = Number(config?.cost?.stateInterval || 0);
    if (n > 0) return Math.max(1, n);
    return config?.narrativeMode === "world" ? 2 : 3;
  };

  WorldStateEngine.shouldUpdate = config => {
    if (!WorldStateEngine.enabled(config)) return false;
    turnCounter += 1;
    return turnCounter % WorldStateEngine.interval(config) === 0;
  };

  WorldStateEngine.update = async function(config, playerText, assistantText) {
    if (!this.shouldUpdate(config)) return null;
    const mainApi = config?.api;
    if (!mainApi) return null;

    const independent = config?.cost?.stateApi;
    const helperModel = config?.cost?.stateModel || "";
    const hasIndependentKey = Boolean(independent?.key && independent?.model && independent?.baseUrl);
    const selectedApi = hasIndependentKey ? independent : mainApi;
    const patched = {
      ...config,
      api: {
        ...selectedApi,
        ...(!hasIndependentKey && helperModel ? { model: helperModel } : {}),
        __auxiliaryTask: true,
        __stateTask: true
      }
    };
    return originalUpdate(patched, playerText, assistantText);
  };

  window.WorldStateEngine = WorldStateEngine;
})();
