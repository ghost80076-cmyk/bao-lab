(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BAOContextHealthCore = api;
})(typeof window !== "undefined" ? window : null, function() {
  "use strict";

  const num = value => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
  const text = value => String(value ?? "").trim();

  function pressure(inputTokens, budget, guard = {}) {
    const input = num(inputTokens);
    const limit = num(budget);
    const ratio = input !== null && limit && limit > 0 ? input / limit : num(guard.ratio);
    const level = text(guard.level) || (ratio === null ? "unknown" : ratio >= .92 ? "critical" : ratio >= .82 ? "high" : ratio >= .70 ? "watch" : "normal");
    const labels = {
      normal: "充足",
      watch: "開始整理",
      high: "偏高",
      critical: "接近管理上限",
      manual: "完整上下文",
      unknown: "尚無資料"
    };
    return {
      input,
      budget: limit,
      ratio,
      level,
      label: labels[level] || labels.unknown,
      percent: ratio === null ? null : Math.max(0, ratio * 100)
    };
  }

  function cacheSummary(entry = {}) {
    const input = num(entry.input);
    const cached = num(entry.cached);
    if (cached === null) return { title: "快取資料未知", detail: "目前 Provider 沒有回報可判讀的快取 Token。" };
    const pct = input && input > 0 ? Math.max(0, Math.min(100, cached / input * 100)) : null;
    return {
      title: cached > 0 ? `命中 ${cached.toLocaleString()} tok` : "本輪沒有快取命中",
      detail: pct === null ? "Provider 已回報快取資料。" : `約占本輪輸入 ${pct.toFixed(0)}%`
    };
  }

  function memorySummary(diag = {}, noteCount = 0) {
    const total = Number(diag.totalRounds || 0);
    const covered = Number(diag.coveredRounds || 0);
    const pending = Number(diag.pendingRounds || 0);
    let title = "近期原文完整";
    if (diag.health?.phase === "running") title = "正在整理舊劇情";
    else if (diag.health?.phase === "failed") title = "整理需要注意";
    else if (diag.hasSummary) title = "長期摘要已接手";
    else if (pending > 0) title = "已有舊內容待整理";
    return {
      title,
      detail: [`${total} 輪對話`, covered ? `${covered} 輪已摘要` : "", noteCount ? `${noteCount} 條必記事項` : ""].filter(Boolean).join(" · ")
    };
  }

  function layers(input = {}) {
    const rows = [];
    const add = (id, label, active, detail) => rows.push({ id, label, active: Boolean(active), detail: text(detail) });

    add("character", "角色／世界設定", input.hasCharacter !== false, input.characterDetail || "依目前作品設定");
    add("recent", "近期對話", Number(input.recentRounds || 0) > 0, input.recentRounds ? `保留約 ${Number(input.recentRounds)} 輪` : "尚無近期對話");
    add("summary", "長期摘要", Boolean(input.hasSummary), input.hasSummary ? `已覆蓋 ${Number(input.coveredRounds || 0)} 輪` : "尚未建立");
    add("notes", "玩家必記事項", Number(input.noteCount || 0) > 0, input.noteCount ? `${Number(input.noteCount)} 條` : "沒有固定筆記");
    add("persona", "玩家身份", Boolean(text(input.personaName)), text(input.personaName) || "未設定");
    add("world", "世界模組", Number(input.worldCount || 0) > 0, input.worldCount ? `${Number(input.worldCount)} 個啟用` : "未啟用");
    add("status", "人物／世界狀態", Boolean(input.statusTracked), input.statusTracked ? "狀態追蹤中" : "未啟用追蹤");
    add("narrative", "敘事偏好", Number(input.narrativeCount || 0) > 0, input.narrativeCount ? `${Number(input.narrativeCount)} 項啟用` : "完全依角色卡");
    add("context-pack", "Context Pack", Boolean(input.contextPackConfirmed), input.contextPackConfirmed ? "已確認前情會參與故事" : "未套用確認前情");
    return rows;
  }

  function summary(input = {}) {
    const p = pressure(input.lastInputTokens, input.budget, input.guard || {});
    const memory = memorySummary(input.memoryDiag || {}, input.noteCount || 0);
    return {
      pressure: p,
      memory,
      cache: cacheSummary(input.lastStoryUsage || {}),
      recentRounds: Number(input.guard?.recentRounds || input.memoryDiag?.recentRounds || 0),
      layers: layers(input)
    };
  }

  return Object.freeze({ pressure, cacheSummary, memorySummary, layers, summary });
});
