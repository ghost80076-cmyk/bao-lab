/* Local-only Character Card V2 PNG export for YoruBay. */
(() => {
  'use strict';
  const PNG_SIG = new Uint8Array([137,80,78,71,13,10,26,10]);
  const encoder = new TextEncoder();

  const bytes = value => value instanceof Uint8Array ? value : new Uint8Array(value);
  const concat = parts => {
    const size = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(size); let offset = 0;
    for (const part of parts) { out.set(part, offset); offset += part.length; }
    return out;
  };
  const u32 = value => new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); table[n] = c >>> 0; }
    return table;
  })();
  const crc32 = input => {
    let c = 0xffffffff;
    for (const b of input) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const typeBytes = encoder.encode(type), payload = bytes(data), body = concat([typeBytes, payload]);
    return concat([u32(payload.length), body, u32(crc32(body))]);
  };
  const base64Utf8 = value => {
    const data = encoder.encode(value); let binary = '';
    for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
    return btoa(binary);
  };
  const textChunk = (keyword, value) => chunk('tEXt', concat([encoder.encode(keyword), new Uint8Array([0]), encoder.encode(value)]));

  function embedChara(pngBytes, card) {
    const source = bytes(pngBytes);
    if (source.length < 20 || PNG_SIG.some((v, i) => source[i] !== v)) throw new Error('封面不是有效的 PNG。');
    const payload = base64Utf8(JSON.stringify(card));
    const out = [source.slice(0, 8)]; let offset = 8, inserted = false;
    while (offset + 12 <= source.length) {
      const length = ((source[offset] << 24) >>> 0) + (source[offset + 1] << 16) + (source[offset + 2] << 8) + source[offset + 3];
      const end = offset + 12 + length;
      if (end > source.length) throw new Error('PNG 區塊不完整。');
      const type = new TextDecoder('ascii').decode(source.slice(offset + 4, offset + 8));
      if (!inserted && type === 'IEND') { out.push(textChunk('chara', payload)); inserted = true; }
      out.push(source.slice(offset, end)); offset = end;
      if (type === 'IEND') break;
    }
    if (!inserted) throw new Error('PNG 缺少 IEND 區塊。');
    return concat(out);
  }

  function toV2(card, yoruExport) {
    const c = card || {}, profile = c.profile && typeof c.profile === 'object' ? Object.values(c.profile).filter(Boolean).join('\n\n') : String(c.profile || '');
    const description = [profile, c.system_prompt].filter(Boolean).join('\n\n');
    const bookEntries = String(c.lore || '').trim() ? [{ keys: [], content: String(c.lore), enabled: true, insertion_order: 0 }] : [];
    return {
      spec: 'chara_card_v2', spec_version: '2.0',
      data: {
        name: c.name || c.title || 'YoruBay Character', description, personality: '', scenario: String(c.world || ''), first_mes: String(c.greeting || ''),
        mes_example: '', creator_notes: String(c.creator_notes || ''), system_prompt: '', post_history_instructions: String(c.author_instructions || ''),
        alternate_greetings: [], tags: Array.isArray(c.tags) ? c.tags : [], creator: 'YoruBay', character_version: '1.0',
        character_book: { name: `${c.name || 'YoruBay'} Lorebook`, description: '', scan_depth: 50, token_budget: 500, recursive_scanning: false, extensions: {}, entries: bookEntries },
        extensions: { yorubay: { schema: 'yorubay-character-1.5', exported_at: new Date().toISOString(), character: yoruExport } }
      }
    };
  }

  async function coverBytes(card) {
    const src = String(card?.avatar || '').trim();
    if (!src) throw new Error('請先設定角色圖片；PNG 角色卡需要一張可讀取的 PNG 封面。');
    let response;
    try { response = await fetch(src); } catch (_) { throw new Error('無法讀取角色圖片。若是外部網址，可能被圖片來源的 CORS 限制；可改用本站 assets 圖片。'); }
    if (!response.ok) throw new Error(`角色圖片讀取失敗（HTTP ${response.status}）。`);
    const blob = await response.blob();
    if (blob.type && blob.type !== 'image/png') throw new Error('目前匯出角色卡 PNG 需要 PNG 格式封面。');
    const data = new Uint8Array(await blob.arrayBuffer());
    if (data.length > 10 * 1024 * 1024) throw new Error('角色圖片超過 10 MB，請先壓縮。');
    return data;
  }

  async function exportPng(card, yoruExport) {
    const v2 = toV2(card, yoruExport), cover = await coverBytes(card), output = embedChara(cover, v2);
    const url = URL.createObjectURL(new Blob([output], { type: 'image/png' }));
    const link = document.createElement('a'); link.href = url; link.download = `${card.id || 'yorubay-character'}.png`; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { bytes: output.length, card: v2 };
  }

  window.BAOCharacterPngExport = Object.freeze({ toV2, embedChara, exportPng });
})();
