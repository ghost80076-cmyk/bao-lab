(() => {
  if (typeof API === "undefined" || typeof App === "undefined" || API.__helperRoutePatched) return;

  const originalSend = API.send.bind(API);
  API.send = async function(config, messages) {
    let route = null;
    if (config?.__memoryTask) route = App.config?.memory?.summaryApi || null;
    if (config?.__stateTask) route = App.config?.cost?.stateApi || null;

    if (!route?.model || !route?.baseUrl) return originalSend(config, messages);

    const effective = {
      ...config,
      ...route,
      // Keep task flags so usage/cost wrappers still know this is an auxiliary call.
      __auxiliaryTask: config.__auxiliaryTask,
      __memoryTask: config.__memoryTask,
      __stateTask: config.__stateTask,
      maxOutputTokens: config.maxOutputTokens
    };
    return originalSend(effective, messages);
  };
  API.__helperRoutePatched = true;
})();
