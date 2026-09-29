(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BAOStoryControlCore = api;
})(typeof window !== "undefined" ? window : null, function() {
  "use strict";

  const text = value => String(value ?? "").trim();
  const label = (value, fallback = "未設定") => text(value) || fallback;

  function storyStats(messages = [], refs = {}) {
    const list = Array.isArray(messages) ? messages : [];
    const userTurns = list.filter(item => item?.role === "user").length;
    const assistantTurns = list.filter(item => item?.role === "assistant").length;
    return {
      messages: list.length,
      turns: Math.max(userTurns, assistantTurns),
      chapter: label(refs.chapterLabel, "目前章節")
    };
  }

  function modelSummary(api = {}, route = "") {
    const model = label(api.model, "尚未選擇模型");
    let detail = label(route, "");
    if (!detail) {
      const base = text(api.baseUrl || api.base_url);
      if (/localhost|127\.0\.0\.1|\[?::1\]?/i.test(base)) detail = "本地 AI";
      else if (api.key) detail = "自備 API";
      else detail = label(api.provider || api.protocol, "目前故事");
    }
    return { title: model, detail };
  }

  function personaSummary(persona = {}) {
    const name = label(persona.name, "未設定玩家身份");
    const detail = [persona.identity, persona.relationship].map(text).filter(Boolean).join(" · ") || "使用目前故事的玩家資料";
    return { title: name, detail };
  }

  function memorySummary(diag = {}, noteCount = 0) {
    const total = Number(diag.totalRounds || 0);
    const covered = Number(diag.coveredRounds || 0);
    const pending = Number(diag.pendingRounds || 0);
    let title = "近期原文完整";
    if (diag.health?.phase === "running") title = "正在整理記憶";
    else if (diag.health?.phase === "failed") title = "記憶整理需要注意";
    else if (diag.hasSummary) title = "長期記憶已建立";
    else if (pending > 0) title = "等待整理";
    const detail = [`${total} 輪對話`, covered ? `${covered} 輪已整理` : "", noteCount ? `${noteCount} 條固定筆記` : ""].filter(Boolean).join(" · ");
    return { title, detail: detail || "尚未累積足夠內容" };
  }

  function statusSummary(config = {}, display = "native") {
    const displayLabels = { native: "夜灣原生面板", author: "作者狀態欄", hidden: "面板隱藏" };
    const tracked = config?.enabled !== false && Array.isArray(config?.fields) && config.fields.length > 0;
    return {
      title: tracked ? "狀態追蹤中" : "未啟用狀態追蹤",
      detail: `${tracked ? "追蹤：開" : "追蹤：關"} · 顯示：${displayLabels[display] || "依故事設定"}`
    };
  }

  function worldSummary(definitions = []) {
    const list = Array.isArray(definitions) ? definitions : [];
    return {
      title: list.length ? `${list.length} 個世界模組` : "未啟用世界模組",
      detail: list.length ? list.slice(0, 3).map(item => label(item?.label || item?.id, "模組")).join("、") + (list.length > 3 ? "…" : "") : "角色卡與目前故事皆未啟用模組"
    };
  }

  function narrativeSummary(status = {}) {
    const items = Array.isArray(status.items) ? status.items : [];
    return {
      title: items.length ? `${items.length} 項敘事偏好` : "完全依角色卡",
      detail: items.length ? items.slice(0, 4).join("、") + (items.length > 4 ? "…" : "") : "沒有額外疊加文風或描寫要求"
    };
  }

  function modSummary(state = {}) {
    const rules = Array.isArray(state.rules) ? state.rules : [];
    const activeRules = rules.filter(rule => rule?.enabled !== false && text(rule?.find)).length;
    return {
      title: state.active && activeRules ? `${activeRules} 條顯示替換` : "文字替換未啟用",
      detail: state.active ? "只改畫面顯示，不改故事原文" : "目前顯示故事原文"
    };
  }

  return Object.freeze({
    storyStats,
    modelSummary,
    personaSummary,
    memorySummary,
    statusSummary,
    worldSummary,
    narrativeSummary,
    modSummary
  });
});
