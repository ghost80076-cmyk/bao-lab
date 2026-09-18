(() => {
  if (typeof API === "undefined" || typeof App === "undefined" || API.__helperRoutePatched) return;

  const normalizeUrl = value => String(value || "").trim().replace(/\/$/, "");
  const originalSend = API.send.bind(API);

  API.send = async function(config, messages) {
    if (config?.__connectionTest) return originalSend(config, messages);
    let route = null;
    if (config?.__memoryTask) route = App.config?.memory?.summaryApi || null;
    if (config?.__stateTask) route = App.config?.cost?.stateApi || null;
    if (!route?.model || !route?.baseUrl) return originalSend(config, messages);

    const sameEndpoint = normalizeUrl(route.baseUrl) === normalizeUrl(App.config?.api?.baseUrl || config?.baseUrl);
    const mainKey = String(App.config?.api?.key || "");
    const routeKey = String(route.key || "");
    if (!sameEndpoint && routeKey && mainKey && routeKey === mainKey) {
      throw new Error("輔助模型使用不同 API 服務。為避免把主模型 API Key 傳給另一個服務商，請在輔助模型設定中貼上該服務自己的 API Key。");
    }

    const effective = {
      ...config,
      ...route,
      __auxiliaryTask: config.__auxiliaryTask,
      __memoryTask: config.__memoryTask,
      __stateTask: config.__stateTask,
      __connectionTest: config.__connectionTest,
      maxOutputTokens: config.maxOutputTokens
    };
    return originalSend(effective, messages);
  };
  API.__helperRoutePatched = true;
})();

// Load local support after the existing routing wrappers; neither module starts a server.
(() => {
  const load = src => new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { resolve(); return; }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  load('js/lm-studio-core.js').then(() => load('js/lm-studio.js'))
    .catch(error => console.warn('BAO/LAB LM Studio local provider did not load:', error));
})();
