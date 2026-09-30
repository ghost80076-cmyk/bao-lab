(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BAOStoryExtensionsCore = api;
})(typeof window !== "undefined" ? window : null, function() {
  "use strict";

  const text = value => String(value ?? "").trim();
  const enabledRules = state => (Array.isArray(state?.rules) ? state.rules : [])
    .filter(rule => rule?.enabled !== false && (text(rule?.find) || text(rule?.pattern)));
  const availableRules = state => (Array.isArray(state?.rules) ? state.rules : [])
    .filter(rule => text(rule?.find) || text(rule?.pattern));

  const source = (id, label, count = 0, note = "") => ({
    id,
    label,
    count: Math.max(0, Number(count) || 0),
    note: text(note)
  });

  function ownership({ sources = [], storage = "", control = "", permissions = [] } = {}) {
    return {
      sources: (Array.isArray(sources) ? sources : []).filter(item => item?.label && (item.count > 0 || item.count === null)),
      storage: text(storage),
      control: text(control),
      permissions: (Array.isArray(permissions) ? permissions : []).map(text).filter(Boolean)
    };
  }

  function worldSummary(definitions = []) {
    const list = Array.isArray(definitions) ? definitions : [];
    const workCount = list.filter(item => item?.origin === "character" || !item?.origin).length;
    const platformCount = list.filter(item => item?.origin === "built_in").length;
    const playerCount = list.filter(item => item?.origin === "player").length;
    return {
      id: "world",
      eyebrow: "世界運作",
      title: list.length ? `${list.length} 個世界模組` : "未啟用世界模組",
      detail: list.length
        ? list.slice(0, 3).map(item => text(item?.label || item?.id) || "模組").join("、") + (list.length > 3 ? "…" : "")
        : "角色卡與目前故事沒有啟用世界模組",
      scopes: ["AI 上下文", "狀態追蹤", "故事內"],
      ownership: ownership({
        sources: [
          source("work", "作品提供", workCount),
          source("platform", "夜灣內建", platformCount),
          source("player", "玩家新增", playerCount)
        ],
        storage: "故事存檔",
        control: "玩家可啟用、停用或新增"
      }),
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
      scopes: ["AI 回覆格式", "閱讀顯示", "這台裝置"],
      ownership: ownership({
        sources: [source("platform", "夜灣內建", null)],
        storage: "這台裝置",
        control: "玩家決定閱讀模式與狀態顯示"
      }),
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
      ownership: ownership({
        sources: [source("player", "玩家建立", rules.length || null)],
        storage: "故事存檔",
        control: "玩家建立、排序與啟用"
      }),
      active
    };
  }

  function regexSummary(globalState = {}, authorState = {}) {
    const globalAvailable = availableRules(globalState).filter(rule => text(rule?.pattern));
    const authorAvailable = availableRules(authorState).filter(rule => text(rule?.pattern));
    const globalRules = enabledRules(globalState).filter(rule => text(rule?.pattern));
    const authorRules = enabledRules(authorState).filter(rule => text(rule?.pattern));
    const globalActive = globalState?.active === true && globalRules.length > 0;
    const authorActive = authorState?.enabled === true && authorRules.length > 0;
    const total = (globalActive ? globalRules.length : 0) + (authorActive ? authorRules.length : 0);
    const parts = [];
    if (globalActive) parts.push(`玩家 ${globalRules.length} 條`);
    if (authorActive) parts.push(`作品 ${authorRules.length} 條`);
    const permissions = [];
    if (authorAvailable.length) {
      permissions.push(authorState?.enabled === true ? "作品規則：玩家已啟用" : "作品規則：等待玩家啟用");
      permissions.push(authorState?.allowScripts === true ? "作者腳本：已允許（沙盒）" : "作者腳本：未允許");
      if (authorState?.allowStateSharing === true) permissions.push("受限狀態分享：已允許");
      if (authorState?.allowExternalAssets === true) permissions.push("外部素材：已允許");
      if (authorState?.allowUiPersistence === true) permissions.push("介面狀態保存：已允許");
    }
    return {
      id: "regex",
      eyebrow: "進階顯示規則",
      title: total ? `${total} 條 Regex 顯示規則` : "Regex 顯示未啟用",
      detail: total ? parts.join(" · ") : "進階比對與替換；作者規則預設不會自行啟用",
      scopes: ["顯示層", "不自動送 API", "進階"],
      ownership: ownership({
        sources: [
          source("player", "玩家規則", globalAvailable.length),
          source("work", "作品提供", authorAvailable.length)
        ],
        storage: "這台裝置",
        control: authorAvailable.length ? "作品規則也需要玩家明確啟用" : "玩家決定是否啟用",
        permissions
      }),
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
    ownership,
    worldSummary,
    sceneSummary,
    replaceSummary,
    regexSummary,
    overview
  });
});
