(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BAOCommentaryModsCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";

  const VERSION = 1;
  const MAX_OUTPUTS = 120;
  const text = value => String(value ?? "").trim();
  const unique = list => [...new Set((Array.isArray(list) ? list : []).map(text).filter(Boolean))];

  function normalizeState(input = {}) {
    const raw = input && typeof input === "object" ? input : {};
    const outputs = (Array.isArray(raw.outputs) ? raw.outputs : []).slice(-MAX_OUTPUTS).map(item => ({
      messageId: text(item?.messageId).slice(0, 120),
      content: text(item?.content).slice(0, 16000),
      modIds: unique(item?.modIds).slice(0, 8),
      createdAt: text(item?.createdAt).slice(0, 40)
    })).filter(item => item.messageId && item.content);
    return {
      version: VERSION,
      enabled: unique(raw.enabled).slice(0, 12),
      auto: raw.auto !== false,
      outputs
    };
  }

  function sanitizeCatalog(input = []) {
    const seen = new Set();
    return (Array.isArray(input) ? input : []).map(item => {
      const id = text(item?.id).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
      if (!id || seen.has(id)) return null;
      seen.add(id);
      return {
        id,
        label: text(item?.label || id).slice(0, 80),
        icon: text(item?.icon || "◈").slice(0, 8),
        description: text(item?.description).slice(0, 240),
        adult: item?.adult === true,
        prompt: text(item?.prompt).slice(0, 8000)
      };
    }).filter(Boolean);
  }

  function availableCatalog(catalog = [], options = {}) {
    const adultEnabled = options.adultEnabled === true;
    return sanitizeCatalog(catalog).filter(item => !item.adult || adultEnabled);
  }

  function activeMods(state = {}, catalog = [], options = {}) {
    const normalized = normalizeState(state);
    const enabled = new Set(normalized.enabled);
    return availableCatalog(catalog, options).filter(item => enabled.has(item.id));
  }

  function toggle(state = {}, id = "", enabled) {
    const normalized = normalizeState(state);
    const key = text(id);
    if (!key) return normalized;
    const set = new Set(normalized.enabled);
    const next = enabled === undefined ? !set.has(key) : enabled === true;
    if (next) set.add(key);
    else set.delete(key);
    return { ...normalized, enabled: [...set] };
  }

  function command(textValue, catalog = []) {
    const value = text(textValue);
    const ids = new Set(sanitizeCatalog(catalog).map(item => item.id));
    const monitor = ids.has("yinmo-monitor") ? "yinmo-monitor" : "";
    const bun = ids.has("succubus-bun") ? "succubus-bun" : "";
    if (!monitor && !bun) return null;
    if (value === "【召喚淫魔班長】" && monitor) return { enabled: [monitor], mode: "add" };
    if (value === "【召喚魅魔肉包】" && bun) return { enabled: [bun], mode: "add" };
    if ((value === "【召喚淫魔雙子】" || value === "【雙子全開】") && monitor && bun) return { enabled: [monitor, bun], mode: "replace" };
    if (value === "【遣回淫魔雙子】") return { enabled: [], mode: "replace" };
    if (value === "【只留淫魔班長】" && monitor) return { enabled: [monitor], mode: "replace" };
    if (value === "【只留魅魔肉包】" && bun) return { enabled: [bun], mode: "replace" };
    return null;
  }

  function applyCommand(state = {}, action = null) {
    const normalized = normalizeState(state);
    if (!action) return normalized;
    if (action.mode === "replace") return { ...normalized, enabled: unique(action.enabled) };
    const set = new Set(normalized.enabled);
    unique(action.enabled).forEach(id => set.add(id));
    return { ...normalized, enabled: [...set] };
  }

  function addOutput(state = {}, output = {}) {
    const normalized = normalizeState(state);
    const next = {
      messageId: text(output.messageId).slice(0, 120),
      content: text(output.content).slice(0, 16000),
      modIds: unique(output.modIds).slice(0, 8),
      createdAt: text(output.createdAt || new Date().toISOString()).slice(0, 40)
    };
    if (!next.messageId || !next.content) return normalized;
    const outputs = normalized.outputs.filter(item => item.messageId !== next.messageId);
    outputs.push(next);
    return { ...normalized, outputs: outputs.slice(-MAX_OUTPUTS) };
  }

  function outputFor(state = {}, messageId = "") {
    const key = text(messageId);
    if (!key) return null;
    return normalizeState(state).outputs.find(item => item.messageId === key) || null;
  }

  function buildMessages({ mods = [], sceneText = "", playerText = "" } = {}) {
    const active = sanitizeCatalog(mods);
    if (!active.length || !text(sceneText)) return [];
    const system = [
      "你是故事正文之外的「場外人格」評論層。你不是故事作者，也不是任何 NPC。",
      "只根據本輪玩家可見的正文做評論；不得把評論、猜測或幻想寫成故事事實。",
      "不得評論或性化玩家角色。只可針對文本中明確為成年人的 NPC；年齡未知、未滿 18 歲或可能未成年者一律略過。",
      "拒絕、退縮、不願、沉默、僵硬或其他缺乏明確同意的表現，不得被重新解讀成性同意。",
      "不要改寫正文、不要續寫事件、不要替 NPC 決定真實心理。所有慾望、經驗與偏好推測都必須明確標示為場外人格的主觀腦補。",
      "如果沒有可評論的成年 NPC，可只做簡短場景吐槽；不得憑空創造人物、年齡或隱藏資訊。",
      "保持精煉。若沒有任何合適內容，僅回覆 NO_COMMENTARY。",
      ...active.map(mod => `【${mod.label}】\n${mod.prompt}`)
    ].join("\n\n");
    const user = [
      playerText ? `【玩家本輪輸入（只作場景理解，不得評論玩家）】\n${text(playerText).slice(0, 1600)}` : "",
      `【本輪故事正文】\n${text(sceneText).slice(0, 12000)}`
    ].filter(Boolean).join("\n\n");
    return [{ role: "system", content: system }, { role: "user", content: user }];
  }

  return Object.freeze({
    VERSION,
    MAX_OUTPUTS,
    normalizeState,
    sanitizeCatalog,
    availableCatalog,
    activeMods,
    toggle,
    command,
    applyCommand,
    addOutput,
    outputFor,
    buildMessages
  });
});
