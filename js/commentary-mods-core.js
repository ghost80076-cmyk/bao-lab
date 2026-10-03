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
        badge: text(item?.badge).slice(0, 40),
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
    const director = ids.has("director-commentary") ? "director-commentary" : "";
    const monitor = ids.has("yinmo-monitor") ? "yinmo-monitor" : "";
    const bun = ids.has("succubus-bun") ? "succubus-bun" : "";

    if ((value === "【召喚導演旁白】" || value === "【召喚導演】") && director) {
      return { enabled: [director], mode: "add" };
    }
    if ((value === "【遣回導演旁白】" || value === "【遣回導演】") && director) {
      return { enabled: [director], mode: "remove" };
    }

    const adultGroup = [monitor, bun].filter(Boolean);
    if (value === "【召喚淫魔班長】" && monitor) return { enabled: [monitor], mode: "add" };
    if (value === "【召喚魅魔肉包】" && bun) return { enabled: [bun], mode: "add" };
    if ((value === "【召喚淫魔雙子】" || value === "【雙子全開】") && monitor && bun) {
      return { enabled: [monitor, bun], group: adultGroup, mode: "replace-group" };
    }
    if (value === "【遣回淫魔雙子】" && adultGroup.length) {
      return { enabled: [], group: adultGroup, mode: "replace-group" };
    }
    if (value === "【只留淫魔班長】" && monitor) {
      return { enabled: [monitor], group: adultGroup, mode: "replace-group" };
    }
    if (value === "【只留魅魔肉包】" && bun) {
      return { enabled: [bun], group: adultGroup, mode: "replace-group" };
    }
    return null;
  }

  function applyCommand(state = {}, action = null) {
    const normalized = normalizeState(state);
    if (!action) return normalized;
    const set = new Set(normalized.enabled);

    if (action.mode === "replace") return { ...normalized, enabled: unique(action.enabled) };
    if (action.mode === "remove") {
      unique(action.enabled).forEach(id => set.delete(id));
      return { ...normalized, enabled: [...set] };
    }
    if (action.mode === "replace-group") {
      unique(action.group).forEach(id => set.delete(id));
      unique(action.enabled).forEach(id => set.add(id));
      return { ...normalized, enabled: [...set] };
    }

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
    const hasAdult = active.some(mod => mod.adult === true);
    const system = [
      "你是故事正文之外的「場外人格／旁白 MOD」評論層。你不是故事作者，也不是任何 NPC。",
      "只根據本輪玩家可見的正文做評論；不得偷讀隱藏狀態，也不得把評論、猜測或幻想寫成故事事實。",
      "不要改寫正文、不要續寫事件、不要替角色決定沒有明示的真實心理，也不要替玩家決定台詞、心理或下一步行動。",
      "各 MOD 的輸出屬於非正史（non-canon）場外內容，不得要求主故事採納。",
      ...(hasAdult ? [
        "成人向 MOD 不得評論或性化玩家角色；只可針對文本中明確為成年人的 NPC。年齡未知、未滿 18 歲或可能未成年者一律略過成人評論。",
        "拒絕、退縮、不願、沉默、僵硬或其他缺乏明確同意的表現，不得被重新解讀成性同意。",
        "成人向 MOD 對慾望、經驗、身體與偏好的推測都必須明確維持為場外人格的主觀腦補，不得宣稱是 NPC 真實設定。"
      ] : []),
      "保持精煉。若所有啟用中的 MOD 都沒有合適內容可說，僅回覆 NO_COMMENTARY。",
      ...active.map(mod => `【${mod.label}】\n${mod.prompt}`)
    ].join("\n\n");
    const user = [
      playerText ? `【玩家本輪輸入（只作場景理解，不得替玩家補心理）】\n${text(playerText).slice(0, 1600)}` : "",
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
