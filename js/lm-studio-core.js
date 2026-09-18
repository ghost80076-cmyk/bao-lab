/* BAO/LAB: local-only LM Studio transport. No proxy or cloud fallback. */
(() => {
  'use strict';
  const NO_AUTH = 'BAO_LOCAL_NO_AUTH';
  const isLocal = config => config?.type === 'lmstudio' || config?.route === 'local' || config?.local === true;
  const endpoint = value => {
    let url;
    try { url = new URL(String(value || '').trim()); }
    catch { throw new Error('LM Studio 網址格式錯誤，請使用 http://localhost:1234/v1。'); }
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        url.username || url.password || url.search || url.hash ||
        !['/v1', '/v1/chat/completions'].includes(url.pathname.replace(/\/+$/, ''))) {
      throw new Error('LM Studio 只允許本機 HTTP 位址（localhost 或 127.0.0.1）的 /v1 API；不會向遠端網址傳送故事或金鑰。');
    }
    const baseUrl = `${url.origin}/v1`;
    return { baseUrl, chatUrl: `${baseUrl}/chat/completions`, modelsUrl: `${baseUrl}/models` };
  };
  const headers = config => {
    const result = { 'Content-Type': 'application/json' };
    const token = String(config?.key || '').trim();
    if (token && token !== NO_AUTH) result.Authorization = `Bearer ${token}`;
    return result;
  };
  const networkError = error => {
    if (error?.name === 'AbortError') {
      const canceled = new Error('已取消本次生成。');
      canceled.code = 'BAO_ABORTED';
      return canceled;
    }
    return new Error('無法連接 LM Studio。請確認：本機已啟動 Server、已開啟 Enable CORS，並允許瀏覽器的本機網路存取權限。請在運行模型的同一台電腦開啟 BAO/LAB。');
  };
  const send = async (config, messages, api, fetchImpl = fetch) => {
    if (!String(config?.model || '').trim()) throw new Error('請先選擇 LM Studio 已載入的 Model ID。');
    const target = endpoint(config?.baseUrl);
    const streaming = config.stream === true && typeof config.onDelta === 'function';
    const body = { model: config.model, messages };
    if (streaming) body.stream = true;
    const limit = Number(config.maxOutputTokens || 0);
    if (Number.isFinite(limit) && limit > 0) body.max_tokens = Math.floor(limit);
    let response;
    try {
      response = await fetchImpl(target.chatUrl, {
        method: 'POST', headers: headers(config), body: JSON.stringify(body),
        signal: config.signal || api?.activeSignal
      });
    } catch (error) { throw networkError(error); }
    if (streaming && response.ok && api.isEventStream(response)) return api.readOpenAIStream(response, config);
    const data = await api.readJSON(response);
    if (!response.ok) {
      const detail = String(data?.error?.message || data?.message || '').slice(0, 350);
      throw new Error(`LM Studio 回傳 ${response.status}。${detail || '請確認模型已載入、端點正確，以及本地伺服器的驗證設定。'}`);
    }
    return { text: api.contentToText(data?.choices?.[0]?.message?.content) || '模型沒有回傳內容。', usage: api.normalizeUsage(data?.usage || {}, 'openai') };
  };
  const listModels = async (config, fetchImpl = fetch) => {
    const target = endpoint(config?.baseUrl);
    let response;
    try { response = await fetchImpl(target.modelsUrl, { method: 'GET', headers: headers(config), signal: config?.signal }); }
    catch (error) { throw networkError(error); }
    if (!response.ok) throw new Error(`LM Studio 模型清單讀取失敗（HTTP ${response.status}）。請確認 Server 和驗證設定。`);
    const result = await response.json();
    return Array.isArray(result?.data) ? result.data.map(item => item?.id).filter(id => typeof id === 'string' && id.trim()) : [];
  };
  const core = Object.freeze({ NO_AUTH, isLocal, endpoint, headers, send, listModels });
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  if (typeof window !== 'undefined') window.BAOLMStudioCore = core;
})();
