/* Portable, bounded message media. No network, credentials, DOM or storage. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BAOStoryImagesCore = api;
})(typeof window !== 'undefined' ? window : null, function() {
  'use strict';
  const MAX_DATA = 270000, MAX_TOTAL = 2700000, MAX_COUNT = 20, MAX_EDGE = 1280;
  const checkedImages = new WeakMap();
  const failure = text => Object.assign(new Error(text), { code: 'BAO_IMAGE_INVALID' });
  function dimensions(buffer, mime) {
    const bytes = new Uint8Array(buffer), view = new DataView(buffer);
    const ascii = (at, size) => String.fromCharCode(...bytes.slice(at, at + size));
    let width = 0, height = 0;
    if (mime === 'image/png' && bytes.length >= 24 && bytes[0] === 137 && ascii(1, 3) === 'PNG' && ascii(12, 4) === 'IHDR') {
      width = view.getUint32(16); height = view.getUint32(20);
    } else if (mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216) {
      for (let at = 2; at + 4 <= bytes.length;) {
        if (bytes[at++] !== 255) break;
        while (bytes[at] === 255) at++;
        const marker = bytes[at++];
        if (marker === 217 || marker === 218 || at + 2 > bytes.length) break;
        if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
        const size = view.getUint16(at);
        if (size < 2 || at + size > bytes.length) break;
        if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && size >= 7) {
          height = view.getUint16(at + 3); width = view.getUint16(at + 5); break;
        }
        at += size;
      }
    } else if (mime === 'image/webp' && bytes.length >= 30 && ascii(0,4) === 'RIFF' && ascii(8,4) === 'WEBP') {
      const kind = ascii(12,4), u24 = at => bytes[at] + (bytes[at+1] << 8) + (bytes[at+2] << 16);
      if (kind === 'VP8X') { width = 1 + u24(24); height = 1 + u24(27); }
      else if (kind === 'VP8 ' && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) {
        width = view.getUint16(26,true) & 16383; height = view.getUint16(28,true) & 16383;
      } else if (kind === 'VP8L' && bytes[20] === 47) {
        const bits = view.getUint32(21,true); width = (bits & 16383) + 1; height = ((bits >>> 14) & 16383) + 1;
      }
    }
    if (!width || !height) throw failure('無法解碼這張圖片，檔案可能損壞或格式不符。');
    if (width * height > 32000000) throw failure('圖片超過 3,200 萬像素，請先縮小圖片。');
    return {width,height};
  }
  function validate(image) {
    const checked = image && typeof image === 'object' && checkedImages.get(image);
    if (checked && image.version === checked.version && image.data === checked.data
        && image.width === checked.width && image.height === checked.height) return { ...checked };
    if (!image || image.version !== 1 || typeof image.data !== 'string' || image.data.length > MAX_DATA
        || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image.data)
        || !Number.isInteger(image.width) || !Number.isInteger(image.height)
        || image.width < 1 || image.height < 1 || image.width > MAX_EDGE || image.height > MAX_EDGE)
      throw failure('圖片附件格式或大小不符；請重新選擇圖片，原有故事未被替換。');
    // Portable imports must not disguise a huge encoded image with tiny metadata.
    try {
      const [header, encoded] = image.data.split(',');
      const decoded = atob(encoded), bytes = Uint8Array.from(decoded, c => c.charCodeAt(0));
      const actual = dimensions(bytes.buffer, header.slice(5, header.indexOf(';')));
      if (actual.width !== image.width || actual.height !== image.height) throw new Error('dimension mismatch');
    } catch { throw failure('圖片附件內容或尺寸不符；請重新選擇圖片，原有故事未被替換。'); }
    const valid = { version: 1, data: image.data, width: image.width, height: image.height };
    checkedImages.set(image, valid);
    return { ...valid };
  }
  function validateMessages(messages) {
    let total = 0, count = 0;
    for (const message of messages || []) {
      if (message.storyImage == null) continue;
      if (message.role !== 'user') throw failure('圖片附件只能屬於玩家訊息。');
      total += validate(message.storyImage).data.length;
      if (++count > MAX_COUNT || total > MAX_TOTAL)
        throw failure('本段故事圖片已達上限（20 張／約 2 MB）；請保留完整備份後開啟新章節。');
    }
    return { count, total };
  }
  const routeKey = config => JSON.stringify([config?.type || '', config?.protocol || 'openai', config?.baseUrl || '', config?.model || '']);
  // A failed phone upload may be retried from the story composer. Do not
  // silently repurpose that reviewed attachment for a new recipient or route.
  function assertPhoneDraft(binding,text,scope,config) {
    if(!binding || typeof binding.text!=='string' || !binding.text.trim() ||
       String(text || '').trim()!==binding.text ||
       !binding.storyId || !binding.chapterId ||
       binding.storyId!==scope?.storyId || binding.chapterId!==scope?.chapterId ||
       binding.route!==routeKey(config))
      throw failure('手機照片的原訊息、章節或 Vision 路徑已改變。請移除照片，回到原手機對話重新選圖。');
  }
  function capability(config = {}) {
    const model = String(config.model || '').toLowerCase();
    const protocol = config.protocol || (config.type === 'gemini' ? 'gemini' : config.type === 'anthropic' ? 'anthropic' : 'openai');
    if (config.type === 'bao-credits' || ['hosted', 'bao-credits'].includes(config.route)) return 'hosted';
    if (!['openai', 'gemini'].includes(protocol)) return 'protocol';
    const leaf = model.replace(/^[^/]+\//, '');
    if (/^(?:deepseek-chat|deepseek-reasoner|gpt-4-turbo-preview|o1-mini|o3-mini|o4-mini-deep-research)(?:$|:|-\d{4})/.test(leaf)
        || /^gpt-3\.5(?:-|$)/.test(leaf)) return 'unsupported';
    let host = '';
    try { host = new URL(config.baseUrl).hostname; } catch {}
    if (host === 'api.openai.com' && /^(gpt-4o(?:-mini)?|gpt-4\.1(?:-mini|-nano)?|gpt-5(?:\.\d+)?(?:-mini|-nano)?|gpt-6\.2-astra)(?:$|-\d{4}-\d{2}-\d{2}$)/.test(model)) return 'supported';
    if (host === 'generativelanguage.googleapis.com' && /^gemini-(?:2\.5-(?:pro|flash|flash-lite)|3\.1-(?:pro-preview|flash-lite(?:-preview)?)|3-flash-preview)$/.test(model)) return 'supported';
    return config.visionConfirmedRoute === routeKey(config) ? 'confirmed' : 'unknown';
  }
  function assertCapability(config) {
    const state = capability(config);
    if (['supported', 'confirmed'].includes(state)) return;
    throw failure(state === 'hosted' ? '燈火目前只支援文字；請改用自己的 Vision API 或移除圖片。'
      : state === 'protocol' ? '此 API 協議尚未支援圖片；請改用 OpenAI-compatible 或 Gemini Vision 連線。'
      : state === 'unsupported' ? '目前模型不支援圖片；請更換 Vision 模型或移除圖片。'
      : '尚未確認此模型的 Vision 能力。請查閱所選供應商規格並確認，或更換模型／移除圖片。');
  }
  function attach(messages, image) {
    const valid = validate(image);
    const index = messages.findLastIndex(m => m.role === 'user');
    if (index < 0 || typeof messages[index].content !== 'string') throw failure('無法將圖片對應到本輪玩家訊息。');
    return messages.map((m, i) => i !== index ? m : { ...m, content: [
      { type: 'text', text: m.content }, { type: 'image_url', image_url: { url: valid.data } }
    ] });
  }
  function geminiParts(content) {
    if (!Array.isArray(content)) return [{ text: String(content || '') }];
    return content.map(part => {
      if (part.type === 'text') return { text: String(part.text || '') };
      const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(part.image_url?.url || '');
      if (part.type !== 'image_url' || !match) throw failure('Gemini 圖片資料格式不正確。');
      return { inlineData: { mimeType: match[1], data: match[2] } };
    });
  }
  return Object.freeze({ MAX_DATA, MAX_TOTAL, MAX_COUNT, MAX_EDGE, dimensions, validate, validateMessages, routeKey, assertPhoneDraft, capability, assertCapability, attach, geminiParts });
});
