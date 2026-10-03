(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BAOActorModeCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";

  const VERSION = 1;
  const text = value => String(value ?? "").trim();
  const clamp = (value, max) => text(value).slice(0, max);
  const EMPTY_ROLE = Object.freeze({
    label: "",
    identity: "",
    relationship: "",
    personality: "",
    voice: "",
    motive: "",
    knowledge: ""
  });

  function normalizeRole(input = {}) {
    const raw = input && typeof input === "object" ? input : {};
    return {
      label: clamp(raw.label, 120),
      identity: clamp(raw.identity, 1200),
      relationship: clamp(raw.relationship, 800),
      personality: clamp(raw.personality, 1200),
      voice: clamp(raw.voice, 1000),
      motive: clamp(raw.motive, 1000),
      knowledge: clamp(raw.knowledge, 1200)
    };
  }

  function defaultState(defaults = {}) {
    const raw = defaults && typeof defaults === "object" ? defaults : {};
    const role = normalizeRole(raw.default_role || raw.role || {});
    return {
      version: VERSION,
      enabled: raw.enabled === true,
      roleActive: raw.role_active === true,
      role
    };
  }

  function normalizeState(input = {}, defaults = {}) {
    const base = defaultState(defaults);
    const raw = input && typeof input === "object" ? input : {};
    const present = Object.keys(raw).length > 0;
    if (!present) return base;
    return {
      version: VERSION,
      enabled: raw.enabled === true,
      roleActive: raw.roleActive === true,
      role: normalizeRole(raw.role || base.role)
    };
  }

  function hasRole(role = {}) {
    const clean = normalizeRole(role);
    return Boolean(clean.label || clean.identity || clean.relationship || clean.personality || clean.voice || clean.motive || clean.knowledge);
  }

  function roleLines(role = {}) {
    const clean = normalizeRole(role);
    return [
      clean.label ? "戲中身份：" + clean.label : "",
      clean.identity ? "身份設定：" + clean.identity : "",
      clean.relationship ? "與玩家的戲中關係：" + clean.relationship : "",
      clean.personality ? "角色人格：" + clean.personality : "",
      clean.voice ? "角色語氣：" + clean.voice : "",
      clean.motive ? "角色目前動機：" + clean.motive : "",
      clean.knowledge ? "角色可知資訊／資訊邊界：" + clean.knowledge : ""
    ].filter(Boolean);
  }

  function buildPrompt({ state = {}, defaults = {}, actorName = "" } = {}) {
    const current = normalizeState(state, defaults);
    if (!current.enabled) return "";

    const actor = clamp(actorName || "目前主要 AI 角色", 120);
    const lines = [
      "【演員模式 MOD｜角色層】",
      "此 MOD 只改變主要 AI 角色如何進入、維持與退出戲中身份；它不取代世界引擎、不改寫既有世界事實，也不授予任何額外資訊。",
      "演員本體：" + actor + "。",
      "請嚴格區分「演員層」與「戲中角色層」：演員可知道玩家給的劇本方向，但戲中角色只能使用自己合理取得的資訊。Meta Knowledge 不等於 Character Knowledge。",
      "進入角色後，輸出優先以戲中角色身份成立；不要每輪顯示第二層意識，也不要為了證明有元角色機制而出戲。",
      "角色具有慣性：已經成立的性格、價值觀、關係、承諾與決定，不得因演員本人的偏好或玩家臨時期待直接覆寫。改變必須由故事事件產生。",
      "玩家可以提出身份、關係、性格方向與劇情提案；既已成立的世界事實與玩家明確邊界必須遵守。對尚未成立的演繹方向，角色可以在不破壞既有設定的前提下自然詮釋。",
      "玩家明確要求停止扮演時，立即退出戲中身份，不拖延、不包裝成劇情，也不把停止本身變成新的角色扮演。"
    ];

    if (current.roleActive && hasRole(current.role)) {
      lines.push("【目前戲中角色】");
      lines.push(...roleLines(current.role));
      lines.push("目前戲中身份已成立；除非玩家明確停止、角色自然失去成立條件，或故事內有足夠事件造成改變，否則延續此身份。");
    } else if (current.roleActive) {
      lines.push("【目前戲中角色】");
      lines.push("玩家已開啟本輪扮演，但沒有填寫固定角色資料。請依當前世界、既有劇情與玩家已明示方向自然補足角色；一旦角色成立，後續維持其慣性與資訊邊界。");
    } else {
      lines.push("【目前狀態】");
      lines.push("目前沒有進入戲中角色。以演員本體身份互動；若玩家提出新角色提案，可以討論、接受、調整後進入，或在設定無法成立時說明原因。");
    }

    return lines.join("\n");
  }

  function command(value = "") {
    const raw = text(value);
    if (["【啟用演員模式】", "【開啟演員模式】"].includes(raw)) return { type: "enabled", value: true };
    if (["【停用演員模式】", "【關閉演員模式】"].includes(raw)) return { type: "enabled", value: false };
    if (["【開始扮演】", "【進入角色】"].includes(raw)) return { type: "roleActive", value: true };
    if (["【停止扮演】", "【退出角色】"].includes(raw)) return { type: "roleActive", value: false };
    if (["【清除戲中角色】", "【重設戲中角色】"].includes(raw)) return { type: "clearRole" };
    return null;
  }

  function applyCommand(state = {}, action = null, defaults = {}) {
    const current = normalizeState(state, defaults);
    if (!action) return current;
    if (action.type === "enabled") return { ...current, enabled: action.value === true };
    if (action.type === "roleActive") return { ...current, roleActive: action.value === true };
    if (action.type === "clearRole") return { ...current, roleActive: false, role: { ...EMPTY_ROLE } };
    return current;
  }

  return Object.freeze({
    VERSION,
    EMPTY_ROLE,
    normalizeRole,
    defaultState,
    normalizeState,
    hasRole,
    roleLines,
    buildPrompt,
    command,
    applyCommand
  });
});
