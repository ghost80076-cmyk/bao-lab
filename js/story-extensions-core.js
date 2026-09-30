(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BAOStoryExtensionsCore = api;
})(typeof window !== "undefined" ? window : null, function() {
  "use strict";

  const text = value => String(value ?? "").trim();
  const enabledRules = state => (Array.isArray(state?.rules) ? state.rules : [])
    .filter(rule => rule?.enabled !== false && (text(rule?.find) || text(rule?.pattern)));

  function worldSummary(definitions = []) {
    const list = Array.isArray(definitions) ? definitions : [];
    return {
      id: "world",
      eyebrow: "世界運作",
      title: list.length ? `${list.length} 個世界模組` : "未啟用世界模組",
      detail: list.length
        ? list.slice(0, 3).map(item => text(item?.label || item?.id) || "模組").join("、") + (list.length > 3 ? "…" : "")
        : "角色卡與目前故事沒有啟用世界模組",
      scopes: ["AI 上下文", "狀態追蹤", "故事內"],
      active: list.length > 0
    };
  }

  function sceneSummary(prefs = {}) {
    const mode = ["native", "efficient", "free"].includes(prefs?.mode) ? prefs.mode : "native";
    const status = ["native", "author", "hidden"].includes(prefs?.status) ? prefs.status : "native";
    const modeLabels = {
      native: "原生閱讀",
      efficient: "節省 Token 場景排版",
      free: "自由安全 HTML"
    };
    const statusLabels = {
      native: "夜灣原生狀態",
      author: "作者狀態欄",
      hidden: "狀態欄隱藏"
    };
    return {
      id: "scene",
      eyebrow: "閱讀排版",
      title: modeLabels[mode],
      detail: `狀態顯示：${statusLabels[status]}`,
      scopes: ["AI 回覆格式", "閱讀顯示", "故事內"],
      active: mode !== "native" || status !== "native"
    };
  }

  function replaceSummary(state = {}) {
    const rules = enabledRules(state).filter(rule => text(rule?.find));
    const active = state?.active === true && rules.length > 0;
    const scopes = state?.scope || {};
    const targets = [
      scopes.chat !== false ? "故事文字" : "",
      scopes.status === true ? "狀態顯示" : ""
    ].filter(Boolean);
    return {
      id: "replace",
      eyebrow: "玩家顯示 MOD",
      title: active ? `${rules.length} 條文字替換` : "文字替換未啟用",
      detail: active ? `${targets.join("＋") || "故事文字"} · 依序套用` : "用一般文字尋找／替換，不需要 Regex",
      scopes: ["只改畫面", "不改原文", "故事內"],
      active
    };
  }

  function regexSummary(globalState = {}, authorState = {}) {
    const globalRules = enabledRules(globalState).filter(rule => text(rule?.pattern));
    const authorRules = enabledRules(authorState).filter(rule => text(rule?.pattern));
    const globalActive = globalState?.active === true && globalRules.length > 0;
    const authorActive = authorState?.enabled === true && authorRules.length > 0;
    const total = (globalActive ? globalRules.length : 0) + (authorActive ? authorRules.length : 0);
    const parts = [];
    if (globalActive) parts.push(`玩家 ${globalRules.length} 條`);
    if (authorActive) parts.push(`作品 ${authorRules.length} 條`);
    return {
      id: "regex",
      eyebrow: "進階顯示規則",
      title: total ? `${total} 條 Regex 顯示規則` : "Regex 顯示未啟用",
      detail: total ? parts.join(" · ") : "進階比對與替換；作者規則預設不會自行啟用",
      scopes: ["只改畫面", "不改 API", "進階"],
      active: total > 0
    };
  }

  function overview(input = {}) {
    const cards = [
      worldSummary(input.world),
      sceneSummary(input.scene),
      replaceSummary(input.replace),
      regexSummary(input.regex, input.authorRegex)
    ];
    const active = cards.filter(card => card.active);
    return {
      cards,
      activeCount: active.length,
      title: active.length ? `${active.length} 類故事擴充正在運作` : "使用作品原始設定",
      detail: active.length
        ? active.map(card => card.eyebrow).join(" · ")
        : "世界模組、閱讀排版與顯示規則都維持預設"
    };
  }

  return Object.freeze({
    worldSummary,
    sceneSummary,
    replaceSummary,
    regexSummary,
    overview
  });
});
