(() => {
  if (typeof API === "undefined" || typeof App === "undefined" || API.__helperRoutePatched) return;

  const normalizeUrl = value => String(value || "").trim().replace(/\/+$/, "");
  const originalSend = API.send.bind(API);

  API.send = async function(config, messages) {
    if (config?.__connectionTest) return originalSend(config, messages);
    let route = null;
    if (config?.__memoryTask) route = App.config?.memory?.summaryApi || null;
    if (config?.__stateTask) route = App.config?.cost?.stateApi || null;
    if (!route?.model || !route?.baseUrl) return originalSend(config, messages);

    const main = App.config?.api || config || {};
    const sameEndpoint = normalizeUrl(route.baseUrl) === normalizeUrl(main.baseUrl) &&
      String(route.protocol || main.protocol || 'openai') === String(main.protocol || 'openai');
    const mainKey = String(main.key || '');
    const routeKey = String(route.key || '');
    if (!sameEndpoint && (!routeKey || (mainKey && routeKey === mainKey))) {
      throw new Error('獨立狀態／記憶 API 尚未連接自己的 Key，請到故事 API 設定重新輸入。');
    }
    const effective = {
      ...config,
      ...route,
      key: routeKey || (sameEndpoint ? mainKey : ''),
      __auxiliaryTask: config.__auxiliaryTask,
      __memoryTask: config.__memoryTask,
      __stateTask: config.__stateTask,
      __connectionTest: config.__connectionTest,
      maxOutputTokens: config.maxOutputTokens
    };
    if (!effective.key) throw new Error('輔助模型缺少連線金鑰（API Key），請重新連接。');
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
