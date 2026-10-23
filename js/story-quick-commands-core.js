(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BAOStoryQuickCommandsCore = api;
})(typeof window !== "undefined" ? window : null, function() {
  "use strict";

  const MAX_CUSTOM = 12;
  const MAX_LABEL = 40;
  const MAX_TEXT = 600;
  const clean = value => String(value ?? "").replace(/\s+/g, " ").trim();

  const BUILT_INS = Object.freeze([
    { id: "continue", label: "繼續描寫", text: "繼續目前情境，保持既有角色行為與世界狀態，不替我做決定。" },
    { id: "advance", label: "推進時間", text: "讓時間自然往前推進一小段，交代合理變化，並停在可以讓我回應的位置。" },
    { id: "recap", label: "回顧最近事件", text: "先簡短回顧最近發生的重要事件與未解決事項，再停在可以讓我回應的位置。" },
    { id: "clarify", label: "釐清目前局勢", text: "【本輪故事內釐清】我對當前局勢有點困惑。請依玩家角色此刻能看到、聽到或已被告知的資訊，先透過在場人物合乎其知情範圍的自然對話、可觀察線索或簡短場景敘述，說清楚目前位置、在場者、已知前因及眼前可選擇的方向。不能知道的就保留未知，不讀取或洩露幕後真相、導演筆記、未公開記憶，不讓 NPC 突然全知，不改寫既有事實，也不為了釐清而製造新危機；不替我做決定，釐清後停在可回應的位置。僅限本輪。" },
    { id: "npc", label: "NPC 自主行動", text: "讓目前場景中的 NPC 依自己的目標與已知資訊自然行動，不替我決定。" },
    { id: "atmosphere", label: "加強環境描寫", text: "這一輪加強場景、動作與感官細節，但不要拖慢事件本身。" },
    { id: "concise", label: "縮短回覆", text: "接下來一輪請縮短回覆，只保留關鍵事件、必要對話與可供我回應的部分。" }
  ]);

  function normalizeCommand(input, index = 0, source = "player") {
    const raw = typeof input === "string" ? { label: input, text: input } : (input && typeof input === "object" ? input : {});
    const text = clean(raw.text ?? raw.prompt ?? raw.content).slice(0, MAX_TEXT);
    if (!text) return null;
    const label = clean(raw.label ?? raw.title ?? raw.name ?? text).slice(0, MAX_LABEL) || "快捷指令";
    const id = clean(raw.id || `${source}-${index + 1}`).replace(/[^a-z0-9_-]/gi, "-").slice(0, 80) || `${source}-${index + 1}`;
    return { id, label, text, source };
  }

  function authorCommands(character = {}) {
    const groups = [
      character.quick_commands,
      character.quickCommands,
      character.gameplay?.quick_commands,
      character.gameplay?.quickCommands,
      character.meta?.quick_commands
    ];
    const list = groups.flatMap(value => Array.isArray(value) ? value : []);
    return list.map((item, index) => normalizeCommand(item, index, "author")).filter(Boolean).slice(0, 12);
  }

  function customCommands(value) {
    const list = Array.isArray(value) ? value : [];
    return list.map((item, index) => normalizeCommand(item, index, "player")).filter(Boolean).slice(0, MAX_CUSTOM);
  }

  function allCommands(character = {}, custom = []) {
    const groups = [
      BUILT_INS.map(item => ({ ...item, source: "built_in" })),
      authorCommands(character),
      customCommands(custom)
    ];
    const seen = new Set();
    return groups.flat().filter(item => {
      const key = clean(item.text).toLocaleLowerCase("zh-Hant");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function grouped(character = {}, custom = []) {
    const all = allCommands(character, custom);
    return {
      builtIn: all.filter(item => item.source === "built_in"),
      author: all.filter(item => item.source === "author"),
      player: all.filter(item => item.source === "player")
    };
  }

  function summary(character = {}, custom = []) {
    const groups = grouped(character, custom);
    return {
      title: `${groups.builtIn.length + groups.author.length + groups.player.length} 個快捷指令`,
      detail: [
        groups.author.length ? `作品 ${groups.author.length}` : "",
        groups.player.length ? `我的 ${groups.player.length}` : "",
        "點一下填入，不會自動送出"
      ].filter(Boolean).join(" · "),
      groups
    };
  }

  return Object.freeze({
    MAX_CUSTOM,
    MAX_LABEL,
    MAX_TEXT,
    BUILT_INS,
    normalizeCommand,
    authorCommands,
    customCommands,
    allCommands,
    grouped,
    summary
  });
});
