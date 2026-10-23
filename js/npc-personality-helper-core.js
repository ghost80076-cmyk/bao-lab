/* Optional author-side NPC personality drafting. No model, storage or system prompt hooks. */
(function(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BAONPCPersonalityCore = api;
})(typeof window !== "undefined" ? window : null, function() {
  "use strict";
  const AXES = Object.freeze([
    ["cause", "成因"],
    ["behavior", "外顯行為"],
    ["trigger", "失控條件"],
    ["cost", "代價"]
  ]);
  const trim = value => String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  const safeText = value => trim(value).replace(/【\/?(?:世界書|人物四軸)[^\n】]*】/g, "（原文標記）");
  const safeName = value => safeText(value).replace(/[【】｜,，、;]/g, " ").trim().slice(0, 40);
  const unique = values => [...new Set(values.filter(Boolean))];

  function normalize(input = {}) {
    const name = safeName(input.name);
    if (!name) throw new Error("請填寫主角色或 NPC 的姓名。");
    const rawAliases = String(input.aliases || "").split(/[,，、;\n]+/);
    const aliases = unique(rawAliases.map(safeName).filter(v => v && v !== name)).slice(0, 5);
    const axes = {};
    for (const [key, label] of AXES) {
      const original = safeText(input[key]);
      if (!original) throw new Error("請填寫「" + label + "」，不會替你推測人物設定。");
      if (original.length > 360) throw new Error("「" + label + "」最多 360 字。");
      axes[key] = original;
    }
    const keywords = unique([name, ...aliases]);
    return { name, aliases, keywords, ...axes };
  }

  function personalityBlock(raw) {
    const data = normalize(raw);
    return ["【人物四軸：" + data.name + "】",
      "成因：" + data.cause,
      "外顯行為：" + data.behavior,
      "失控條件：" + data.trigger,
      "代價：" + data.cost,
      "【/人物四軸】"].join("\n");
  }

  function build(raw, destination = "lore") {
    const data = normalize(raw);
    const inner = personalityBlock(data);
    if (destination === "profile") return inner;
    if (destination !== "lore") throw new Error("不支援的輸出欄位。");
    const title = "人格四軸·" + data.name;
    return "【世界書：" + title + "｜" + data.keywords.join(",") + "】\n" +
      inner + "\n【/世界書】";
  }

  // Replace only the block this helper previously generated, never any
  // author-written NPC lore with a similar display name.
  function insert(existing, raw, destination = "lore") {
    const data = normalize(raw);
    const block = build(data, destination);
    const previous = String(existing || "");
    const start = destination === "profile"
      ? "【人物四軸：" + data.name + "】"
      : "【世界書：人格四軸·" + data.name + "｜";
    const end = destination === "profile" ? "【/人物四軸】" : "【/世界書】";
    const index = previous.indexOf(start);
    let replaced = false;
    let next;
    if (index >= 0) {
      const after = previous.indexOf(end, index + start.length);
      if (after < 0) throw new Error("舊人物四軸尚未完整結束，請先手動修正。");
      replaced = true;
      next = previous.slice(0, index) + block + previous.slice(after + end.length);
    } else {
      next = previous.trimEnd() + (previous.trim() ? "\n\n" : "") + block;
    }
    return { value: next, text: block, destination, replaced, changed: next !== previous };
  }

  return Object.freeze({ AXES, normalize, personalityBlock, build, insert });
});