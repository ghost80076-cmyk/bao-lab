(() => {
  if (typeof API === "undefined" || typeof App === "undefined" || API.__helperRoutePatched) return;

  const normalizeUrl = value => String(value || "").trim().replace(/\/+$/, "");

  const helperRouteWrapper = async (next, config, messages, ...rest) => {
    // Request-local marker survives config copies, without changing App.config
    // or relying on a mutable global flag for previously captured send snapshots.
    config = { ...config, __helperRouteResolved: true };
    if (config?.__connectionTest) return next(config, messages, ...rest);
    let route = null;
    if (config?.__memoryTask && config.__memoryRouteResolved) return next(config, messages, ...rest);
    if (config?.__memoryTask && String(App.config?.memory?.summaryApiMode || '').trim() !== 'same')
      route = App.config?.memory?.summaryApi || null;
    if (config?.__stateTask && String(App.config?.cost?.stateApiMode || '').trim() !== 'same')
      route = App.config?.cost?.stateApi || null;
    if (!route?.model || !route?.baseUrl) return next(config, messages, ...rest);

    const main = App.config?.api || config || {};
    const sameEndpoint = normalizeUrl(route.baseUrl) === normalizeUrl(main.baseUrl) &&
      String(route.protocol || main.protocol || 'openai') === String(main.protocol || 'openai');
    const mainKey = String(main.key || '');
    const routeKey = String(route.key || '');
    if (!sameEndpoint && (!routeKey || (mainKey && routeKey === mainKey))) {
      throw new Error('獨立狀態／記憶 API 尚未連接自己的 Key，請到故事 API 設定重新輸入。');
    }
    const transport = sameEndpoint && !route.type && !route.route && route.local === undefined ? main : route;
    const local = transport.local === true || transport.type === 'lmstudio' || transport.route === 'local';
    const effective = {
      ...config,
      ...route,
      // A helper owns its transport. Do not inherit local/hosted markers from
      // the main model when switching to another connection.
      type: transport.type || (local ? 'lmstudio' : 'custom'),
      protocol: route.protocol || transport.protocol || (transport.type === 'gemini' ? 'gemini' : transport.type === 'anthropic' ? 'anthropic' : 'openai'),
      route: transport.route || (local ? 'local' : ''),
      local,
      key: routeKey || (sameEndpoint ? mainKey : ''),
      __auxiliaryTask: config.__auxiliaryTask,
      __memoryTask: config.__memoryTask,
      __stateTask: config.__stateTask,
      __connectionTest: config.__connectionTest,
      signal: config.signal,
      maxOutputTokens: config.maxOutputTokens
    };
    if (!effective.key) throw new Error('輔助模型缺少連線金鑰（API Key），請重新連接。');
    return next(effective, messages, ...rest);
  };

  if (typeof API.wrapSend === "function") {
    API.wrapSend("helper-api-routing:route", helperRouteWrapper);
  } else {
    // Compatibility fallback for a mixed-cache page where helper routing is newer than api.js.
    const originalSend = API.send.bind(API);
    API.send = (config, messages, ...rest) => helperRouteWrapper(originalSend, config, messages, ...rest);
  }
  API.__helperRoutePatched = true;
})();

// Load local and credential-reconnect support after the existing routing wrappers.
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
  load('js/story-helper-reconnect.js?v=3')
    .catch(error => console.warn('BAO/LAB story helper API reconnect did not load:', error));
  load('js/lm-studio-core.js?v=3').then(() => load('js/lm-studio.js?v=6'))
    .catch(error => console.warn('BAO/LAB LM Studio local provider did not load:', error));
})();
