/* Explicit image-only BYOK contracts. No story state, billing, retry or text-model routing. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BAOImageGenerationCore = api;
})(typeof window !== 'undefined' ? window : null, function() {
  'use strict';
  const MAX_BYTES = 16 * 1024 * 1024;
  const MAX_JSON = 24 * 1024 * 1024;
  const OPENAI = ['gpt-image-2.6-flare','gpt-image-2.6-sunburst','gpt-image-2.5-flare','gpt-image-2.5-sunburst','gpt-image-2','gpt-image-1.5','gpt-image-1-mini'];
  const GEMINI = ['gemini-3.1-flash-image','gemini-3-pro-image','gemini-3.1-flash-lite-image'];
  class ImageError extends Error {}
  const fail = text => { throw new ImageError(text); };
  const txt = (v, n = 160) => typeof v === 'string' ? v.slice(0,n).trim() : '';
  function endpoint(value) {
    let url; try { url = new URL(value); } catch { fail('請填寫完整 HTTPS 生圖端點。'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || /(^|\.)(yorubay\.com|workers\.dev|amazonaws\.com)$/.test(url.hostname)
      || !url.pathname.endsWith('/images/generations')) fail('自訂端點必須是獨立 HTTPS /images/generations，不接受夜灣代理或網址憑證。');
    return url.href;
  }
  function capability(config) {
    const {provider, model} = config;
    if (provider === 'openai' && OPENAI.includes(model)) return {ratios:['1:1','3:2','2:3'], qualities:['low','medium','high',...(/2\.[56]/.test(model)?['xhigh','max']:[])], reference:true};
    if (provider === 'gemini' && GEMINI.includes(model)) return {ratios:['1:1','16:9','9:16','4:3','3:4'], qualities:model==='gemini-3.1-flash-lite-image'?['1K']:['1K','2K','4K'], reference:true};
    if (provider === 'openrouter') {
      const record = config.catalog?.find(item => item.id === model && item.architecture?.output_modalities?.includes('image'));
      if (!record) fail('請先載入 OpenRouter 生圖目錄，再選擇支援圖片輸出的模型。');
      const params = record.supported_parameters || {};
      const values = (key, allowed) => (Array.isArray(params[key]?.values) ? params[key].values : []).filter(v => allowed.includes(v));
      if (Number(params.input_references?.min || 0) > 1) fail('這個模型需要多張參考圖，本階段不支援。');
      return {ratios:['',...values('aspect_ratio',['1:1','16:9','9:16','4:3','3:4','3:2','2:3'])],
        qualities:['',...values('quality',['low','medium','high'])], reference:!!params.input_references,
        requiresReference:Number(params.input_references?.min || 0)>0};
    }
    if (provider === 'custom') {
      const url = endpoint(config.endpoint);
      if (!/^[a-zA-Z0-9._:/-]{1,120}$/.test(model || '') || config.confirmedRoute !== url+'|'+model)
        fail('請依中轉官方文件確認此端點與模型支援 OpenAI Images 協議；更換設定需重新確認。');
      return {ratios:[''],qualities:[''],reference:false};
    }
    fail('此供應商或模型沒有已確認的生圖能力。');
  }
  function request(config, prompt, reference) {
    const caps = capability(config);
    if (!config.key || typeof config.key !== 'string' || /[\r\n]/.test(config.key)) fail('請輸入自己的圖片 API Key。');
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 24000) fail('圖片提示詞需為 1–24,000 字元。');
    if (!caps.ratios.includes(config.ratio) || !caps.qualities.includes(config.quality)) fail('模型不支援所選比例或品質，請重新選擇。');
    if (reference && (!caps.reference || !config.referenceAuthorized)) fail('請確認參考圖片授權及模型支援。');
    if (caps.requiresReference && !reference) fail('此模型需要參考圖片。');
    let ref;
    if (reference) {
      const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]*={0,2})$/.exec(reference);
      if (!match || reference.length > 300000) fail('參考圖片格式或容量不符。');
      ref = {mimeType:match[1],data:match[2]};
    }
    const headers = {'Content-Type':'application/json'};
    let url, body;
    if (config.provider === 'gemini') {
      url = 'https://generativelanguage.googleapis.com/v1beta/models/'+config.model+':generateContent';
      headers['x-goog-api-key'] = config.key;
      body = {contents:[{role:'user',parts:[{text:prompt},...(ref?[{inlineData:ref}]:[])]}],
        generationConfig:{responseModalities:['TEXT','IMAGE'],imageConfig:{aspectRatio:config.ratio,imageSize:config.quality}}};
    } else {
      headers.Authorization = 'Bearer '+config.key;
      body = {model:config.model,prompt,n:1};
      if (config.provider === 'openrouter') {
        url = 'https://openrouter.ai/api/v1/images';
        body.response_format = 'b64_json';
        body.provider = {allow_fallbacks:false};
        if (config.ratio) body.aspect_ratio = config.ratio;
        if (config.quality) body.quality = config.quality;
        if (ref) body.input_references = [{type:'image_url',image_url:{url:reference}}];
      } else {
        url = config.provider === 'openai' ? 'https://api.openai.com/v1/images/generations' : endpoint(config.endpoint);
        if (config.provider === 'openai') {
          body.size = {'1:1':'1024x1024','3:2':'1536x1024','2:3':'1024x1536'}[config.ratio];
          body.quality = config.quality; body.output_format = 'png';
          if(ref) {
            url='https://api.openai.com/v1/images/edits';
            const form=new FormData();
            for(const [name,value] of Object.entries(body))form.append(name,String(value));
            form.append('image[]',base64(ref.data,ref.mimeType),'reference.'+ref.mimeType.split('/')[1]);
            body=form;delete headers['Content-Type'];
          }
        } else body.response_format = 'b64_json';
      }
    }
    return {url,init:{method:'POST',headers,body:body instanceof FormData?body:JSON.stringify(body),credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'}};
  }
  async function readBounded(response, limit) {
    if (Number(response.headers.get('content-length')) > limit) fail('回應超過圖片容量限制。');
    const reader = response.body?.getReader();
    if (!reader) fail('瀏覽器無法安全讀取圖片回應。');
    const parts = []; let size = 0;
    try { for (;;) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) { await reader.cancel(); fail('回應超過圖片容量限制。'); }
      parts.push(next.value);
    }} finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const part of parts) { bytes.set(part,offset); offset += part.length; }
    return bytes;
  }
  function imageType(bytes) {
    if (bytes[0]===137 && bytes[1]===80 && bytes[2]===78 && bytes[3]===71 && bytes[4]===13 && bytes[5]===10 && bytes[6]===26 && bytes[7]===10) return 'image/png';
    if (bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return 'image/jpeg';
    if (String.fromCharCode(...bytes.slice(0,4))==='RIFF' && String.fromCharCode(...bytes.slice(8,12))==='WEBP') return 'image/webp';
    fail('只接受可驗證的 PNG、JPEG 或 WebP 圖片。');
  }
  function base64(data, mime) {
    if (typeof data !== 'string' || !data.length || data.length > Math.ceil(MAX_BYTES/3)*4 || data.length%4
      || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) fail('圖片 Base64 格式或容量不符。');
    const raw = atob(data), bytes = Uint8Array.from(raw,c=>c.charCodeAt(0));
    const type = imageType(bytes);
    if (bytes.length > MAX_BYTES || (mime && mime !== type)) fail('圖片內容類型或容量不符。');
    return new Blob([bytes],{type});
  }
  async function result(payload, provider, fetcher, signal) {
    const records = provider==='gemini'
      ? (payload.candidates || []).flatMap(c=>(c.content?.parts || []).filter(p=>!p.thought && p.inlineData).map(p=>({b64_json:p.inlineData.data,media_type:p.inlineData.mimeType})))
      : payload.data;
    if (!Array.isArray(records) || records.length !== 1) fail('供應商未回傳單張圖片；可能拒絕請求或格式不符。請勿直接重試，先核對帳單。');
    const item = records[0];
    if (item.b64_json) return base64(item.b64_json,item.media_type);
    let url; try { url = new URL(item.url); } catch { fail('供應商圖片回應無效。'); }
    if (url.protocol!=='https:' || url.username || url.password || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/i.test(url.hostname)) fail('圖片下載網址不安全。');
    const res = await fetcher(url.href,{signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});
    if (!res.ok) fail('圖片已生成，但下載失敗；不會重新生成或再次扣費。');
    const mime = res.headers.get('content-type')?.split(';')[0];
    if (!['image/png','image/jpeg','image/webp'].includes(mime)) fail('下載的圖片內容類型不符。');
    const bytes = await readBounded(res,MAX_BYTES);
    if (imageType(bytes)!==mime) fail('下載的圖片內容與類型不符。');
    return new Blob([bytes],{type:mime});
  }
  function createClient(fetcher = fetch) {
    let busy = false;
    return Object.freeze({
      async generate(config,prompt,{reference,signal,timeoutMs=180000}={}) {
        if (busy) fail('圖片仍在生成，請勿重複送出。');
        const spec = request(config,prompt,reference);
        if (signal?.aborted) fail('已取消，未送出圖片請求。');
        busy = true;
        const controller = new AbortController();
        const abort = () => controller.abort(); signal?.addEventListener('abort',abort,{once:true});
        const timer = setTimeout(abort,timeoutMs);
        try {
          const res = await fetcher(spec.url,{...spec.init,signal:controller.signal});
          if (!res.ok) fail('圖片 API 請求失敗（HTTP '+res.status+'）。請核對金鑰權限、額度及模型，不會自動重試。');
          if (!/application\/json/i.test(res.headers.get('content-type') || '')) fail('圖片 API 未回傳 JSON。');
          const bytes = await readBounded(res,MAX_JSON);
          let payload; try { payload = JSON.parse(new TextDecoder().decode(bytes)); } catch { fail('圖片 API 回傳無效 JSON。'); }
          const blob = await result(payload,config.provider,fetcher,controller.signal);
          if (controller.signal.aborted) fail('圖片請求已取消或逾時；供應商仍可能完成並收費，請先核對帳單。');
          return blob;
        } catch (error) {
          // Never display upstream errors, response text, URLs, key or image bytes.
          if (controller.signal.aborted) fail('圖片請求已取消或逾時；供應商仍可能完成並收費，請先核對帳單。');
          if (error instanceof TypeError || error instanceof SyntaxError) fail('圖片連線或下載失敗，可能受 CORS 限制；請核對供應商帳單後再操作。');
          if(error instanceof ImageError)throw error;
          fail('圖片連線或下載失敗，請先核對供應商帳單後再操作；不會自動重試。');
        } finally { clearTimeout(timer); signal?.removeEventListener('abort',abort); busy = false; }
      }
    });
  }
  return Object.freeze({MAX_BYTES,MAX_JSON,OPENAI,GEMINI,txt,capability,request,readBounded,imageType,base64,createClient});
});
