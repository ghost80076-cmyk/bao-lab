/* Local-only, read-only estimates for the final story request. No provider calls or persistence. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BAOContextEfficiencyCore = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";
  const TYPES = [
    { id: "platform", label: "角色卡與平台規則" },
    { id: "world", label: "世界、NPC 與狀態" },
    { id: "memory", label: "記憶、Canon 與前情" },
    { id: "worldbook", label: "世界書" },
    { id: "history", label: "近期對話原文" },
    { id: "turn", label: "本輪輸入與動態規則" }
  ];
  const typeForHeading = heading => {
    const h = String(heading || "").trim();
    if (/世界書|Lorebook/i.test(h)) return "worldbook";
    if (/Canon|Context Pack|長期記憶|玩家手動記憶|已確認的前情|回憶框架|事件回憶|記憶摘要/i.test(h)) return "memory";
    if (/NPC|世界狀態|世界設定|世界資料|核心狀態|人物狀態|世界時鐘|世界模組|人物覆寫|人物個別經歷|世界觀焦點|本輪相關角色/.test(h)) return "world";
    if (/玩家最新輸入|本輪動態角色規則|玩家敘事偏好|^本輪$/.test(h)) return "turn";
    if (/平台|角色核心|作者敘事指示|作者備註|玩家 Persona|主要 AI|敘事模式|固定 Schema|玩家自主權|場景參與|人物對話真實性|狀態時序|模型補丁/.test(h)) return "platform";
    return null;
  };
  const contentOf = message => typeof message?.content === "string"
    ? message.content : JSON.stringify(message?.content ?? "");
  const numeric = value => value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;

  function analyze(messages = [], previous = null) {
    const list = Array.isArray(messages) ? messages : [];
    const totals = Object.fromEntries(TYPES.map(type => [type.id, 0]));
    const lastUser = list.reduce((index, message, i) => message?.role === "user" ? i : index, -1);
    const seen = new Set();
    let duplicateCount = 0, duplicateChars = 0, inspectedBlocks = 0;
    let totalChars = 0;

    for (let i = 0; i < list.length; i++) {
      const message = list[i] || {};
      const value = contentOf(message);
      totalChars += value.length;
      let category = message.role === "system" ? "platform"
        : i === lastUser && message.role === "user" ? "turn" : "history";
      let cursor = 0;
      const headings = /^【([^】\r\n]{1,70})】/gm;
      let match;
      while ((match = headings.exec(value))) {
        const next = typeForHeading(match[1]);
        if (!next) continue;
        totals[category] += match.index - cursor;
        category = next;
        cursor = match.index;
      }
      totals[category] += value.length - cursor;

      // Exact repeated long paragraphs only; no fuzzy deletion or inspection of old dialogue.
      if (message.role !== "system" && i !== lastUser) continue;
      const parts = value.split(/\n\s*\n/);
      for (const part of parts) {
        if (++inspectedBlocks > 2500) break;
        const normalized = part.replace(/\s+/g, " ").trim();
        if (normalized.length < 100) continue;
        if (seen.has(normalized)) {
          duplicateCount++;
          duplicateChars += part.length;
        } else seen.add(normalized);
      }
    }
    const knownPrevious = numeric(previous?.totalChars);
    return {
      totalChars,
      layers: TYPES.map(type => ({
        id: type.id, label: type.label, chars: totals[type.id],
        percent: totalChars ? Number((totals[type.id] * 100 / totalChars).toFixed(1)) : 0
      })),
      duplicates: { count: duplicateCount, chars: duplicateChars },
      previousChars: knownPrevious,
      deltaChars: knownPrevious === null ? null : totalChars - knownPrevious,
      basis: "utf16-chars",
      note: "依已知段落標題與訊息位置分類；字元佔比不是模型 Token 佔比，疑似重複只比對相同長段落。"
    };
  }

  return Object.freeze({ analyze, typeForHeading, TYPES });
});
