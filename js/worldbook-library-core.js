/* Public/private lore packs: world facts, not WorldState tracker modules. */
(function(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.YoruWorldbookLibraryCore = api;
})(typeof window !== "undefined" ? window : null, function() {
  "use strict";
  const SCHEMA = "yorubay-worldbook-pack", VERSION = 1;
  const MAX_BYTES = 1600000, MAX_ENTRIES = 512, MAX_CONTENT = 12000;
  const idPattern = /^[a-z0-9][a-z0-9_-]{0,79}$/;
  const obj = value => value && typeof value === "object" && !Array.isArray(value);
  const text = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
  const unique = (items, max = 16) => [...new Set((Array.isArray(items) ? items : []).map(x => text(x, 80)).filter(Boolean))].slice(0, max);
  const fail = msg => { throw new Error(msg); };
  const safeId = (value, label) => idPattern.test(value) && !["__proto__", "constructor", "prototype"].includes(value) ? value : fail(label + " ID 無效");
  const serializedLength = value => JSON.stringify(value).length;
  function normalizePack(source) {
    if (!obj(source) || source.schema !== SCHEMA || source.version !== VERSION) fail("不支援的世界書格式");
    if (serializedLength(source) > MAX_BYTES) fail("世界書檔案超過 1.6 MB");
    const meta = obj(source.meta) ? source.meta : {};
    const id = safeId(meta.id, "世界包");
    const name = text(meta.name, 100);
    if (!name) fail("世界包沒有名稱");
    const world = text(meta.world, 60) || "general";
    const classification = ["world", "scenario", "reference"].includes(meta.classification) ? meta.classification : "reference";
    if (!Array.isArray(source.entries) || !source.entries.length || source.entries.length > MAX_ENTRIES) fail("世界書需包含 1～512 筆");
    const seen = new Set();
    const entries = source.entries.map((raw, index) => {
      if (!obj(raw)) fail("世界書第 " + (index+1) + " 筆格式錯誤");
      const entryId = safeId(raw.id, "條目");
      if (seen.has(entryId)) fail("世界書有重複條目 ID " + entryId);
      seen.add(entryId);
      const content = text(raw.content, MAX_CONTENT + 1);
      if (!content || content.length > MAX_CONTENT) fail("條目 " + entryId + " 空白或超過 12000 字");
      const mode = ["foundation", "constant"].includes(raw.mode) ? raw.mode : "keyword";
      const keywords = unique(raw.keywords || raw.triggers);
      if (mode === "keyword" && !keywords.length) fail("條目 " + entryId + " 缺少關鍵字");
      return {
        id: entryId, title: text(raw.title, 100) || "條目 " + (index+1),
        category: text(raw.category, 32), mode, keywords,
        content, requires: unique(raw.requires, 10),
        // "private" on pack.meta is publication privacy, NOT character knowledge.
        knowledge_scope: raw.knowledge_scope === "actors" ? "actors" : "shared",
        known_by: unique(raw.known_by, 30),
        review_required: raw.review_required === true,
        enabled: raw.enabled !== false,
        priority: Number.isFinite(raw.priority) ? Math.max(-10, Math.min(10, raw.priority)) : 0
      };
    });
    return {
      schema: SCHEMA, version: VERSION,
      meta: {
        id, name, world, classification, author: text(meta.author, 80),
        release: text(meta.release, 40) || "1.0.0",
        visibility: meta.visibility === "public" ? "public" : "private",
        selection_group: text(meta.selection_group, 60),
        legacy: meta.legacy === true,
        source: text(meta.source, 120)
      }, entries
    };
  }
  // A committed mystery is a private, story-local worldbook. The stored answer
  // is never selected for the model until the creator explicitly marks it public.
  // All gates use the existing worldbookFlags; there is no second truth database.
  function createMysteryCase(input = {}) {
    if (!obj(input)) fail("案件資料無效");
    const title = text(input.title, 80);
    const truth = typeof input.truth === "string" ? input.truth.trim() : "";
    const opening = typeof input.opening === "string" ? input.opening.trim() : "";
    const clues = Array.isArray(input.clues) ? input.clues.map(x => String(x || "").trim()).filter(Boolean) : [];
    if (!title || !truth) fail("請填寫案件名稱與已確立的核心真相");
    if (truth.length > MAX_CONTENT || opening.length > MAX_CONTENT ||
        clues.length > 8 || clues.some(clue => clue.length > MAX_CONTENT))
      fail("案件內容過長（線索最多 8 條，每條不超過 12000 字）");
    const id = safeId(String(input.id || ""), "案件");
    const truthFlag = id + "-truth-public";
    const entries = [
      ...(opening ? [{
        id:"starting-evidence", title:"玩家開局已知", mode:"foundation",
        content:opening
      }] : []),
      ...clues.map((content, index) => ({
        id:"clue-" + (index + 1), title:"案件線索 " + (index + 1),
        mode:"foundation", content,
        requires:[id + "-clue-" + (index + 1) + "-known"]
      })),
      {
        id:"sealed-truth", title:"已公開的案件真相", mode:"foundation",
        content:"【已確立的案件事實】" + truth +
          "。此資訊在本故事裡已標記公開；不代表每名 NPC 先前都知道，應依各自見聞與因果反應。",
        requires:[truthFlag]
      }
    ];
    return normalizePack({
      schema:SCHEMA, version:VERSION,
      meta:{ id, name:"懸疑案件｜" + title, world:"general",
        classification:"reference", visibility:"private",
        source:"yorubay-mystery-case" },
      entries
    });
  }
  const mysteryFlagLabel = (pack, flag) => {
    if (pack?.meta?.source !== "yorubay-mystery-case" || !String(flag).startsWith(pack.meta.id + "-")) return flag;
    if (flag === pack.meta.id + "-truth-public") return "真相已公開（解除模型保密鎖）";
    const match = String(flag).match(new RegExp("^" + pack.meta.id + "-clue-([1-8])-known$"));
    return match ? "玩家已取得線索 " + match[1] : flag;
  };
  function slug(value) {
    const name = String(value || "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
    let hash = 2166136261;
    for (const char of String(value || "")) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
    return (name || "legacy-worldbook") + "-" + (hash >>> 0).toString(36);
  }
  /* Import preserves original text. Rule-class entries require manual review and are NOT sent automatically. */
  function migrateLegacy(source, name = "LunaTalk 世界書") {
    if (!obj(source) || !Array.isArray(source.entries)) fail("不是含 entries 的外部世界書");
    if (source.entries.length > MAX_ENTRIES) fail("單份世界書不得超過 512 筆");
    const title = text(source.worldbook?.name || source.worldbook?.title || name, 100) || name;
    const entries = source.entries.map((entry, index) => {
      const keywords = unique(entry.keywords || entry.keys || entry.triggers || [], 16);
      const category = text(entry.category, 32);
      const title = text(entry.title, 100) || "原始條目 " + (index+1);
      const recallTerms = keywords.length ? keywords : (entry.title ? [title] : []);
      return {
        id: "entry-" + (index+1), title,
        category, mode: recallTerms.length ? "keyword" : "foundation",
        keywords: recallTerms, content: String(entry.content || "").trim(),
        review_required: !keywords.length || ["規則", "自訂"].includes(category)
      };
    });
    return normalizePack({
      schema: SCHEMA, version: VERSION,
      meta: { id: slug("legacy-" + title), name: title, world: "general",
        visibility: "private", classification: "reference", source: "LunaTalk entries" },
      entries
    });
  }
  const lower = value => String(value || "").toLocaleLowerCase();
  const canRead = (entry, context) => typeof context.canReadActors === 'function'
    ? context.canReadActors(entry,context.actors)
    : entry.knowledge_scope !== "actors" ||
    (Array.isArray(context.actors) && context.actors.length > 0 &&
      context.actors.every(actor => (entry.known_by || []).includes(actor)));
  // Opted-in rules stay complete and never compete with bounded lore retrieval.
  function constants(packs, enabledIds, context = {}, options = {}) {
    const report = options.onDecision || (() => {});
    const ids = new Set(Array.isArray(enabledIds) ? enabledIds : []);
    const flags = new Set(Array.isArray(context.flags) ? context.flags : []);
    const world = text(context.world, 60), found = [], seen = new Set();
    for (const pack of Array.isArray(packs) ? packs : []) {
      if (!ids.has(pack?.meta?.id) || (pack.meta.world !== "general" && world && world !== pack.meta.world)) continue;
      for (const entry of pack.entries || []) {
        if (entry.mode !== "constant") continue;
        const reason = entry.enabled === false ? 'disabled' : entry.review_required ? 'review' :
          (entry.requires || []).some(flag => !flags.has(flag)) ? 'condition' : !canRead(entry, context) ? 'knowledge' : null;
        if (reason) { report({id:pack.meta.id+':'+entry.id,title:entry.title,reason}); continue; }
        const key = lower(entry.content).replace(/\s+/g, " ");
        if (seen.has(key)) { report({id:pack.meta.id+':'+entry.id,title:entry.title,reason:'duplicate'}); continue; }
        report({id:pack.meta.id+':'+entry.id,title:entry.title,reason:'included'});
        seen.add(key);
        found.push({ identity: pack.meta.id + ":" + entry.id, title: entry.title, content: entry.content });
      }
    }
    found.sort((a, b) => a.identity.localeCompare(b.identity));
    const result = { entries: found.map(({ identity, title }) => ({ identity, title })),
      text: found.map(entry => "〔" + entry.title + "〕\n" + entry.content).join("\n\n") };
    if (result.text.length > 24000) fail("已啟用的固定世界書規則超過 24000 字，請先關閉部分章節或文風。");
    return result;
  }
  function select(packs, enabledIds, context = {}, options = {}) {
    const recallMode = ["auto", "scene", "off"].includes(options.recallMode) ? options.recallMode : "auto";
    const report = options.onDecision || (() => {});
    const ids = new Set(Array.isArray(enabledIds) ? enabledIds : []);
    const maxChars = Math.max(100, Math.min(10000, Number(options.maxChars) || 2200));
    const maxEntries = Math.max(1, Math.min(12, Number(options.maxEntries) || 4));
    const signals = [
      { text: recallMode === "auto" ? lower(context.latestUser) : "", score: 200 },
      { text: lower(context.location), score: 130 },
      { text: lower(context.presentNPCs), score: 100 },
      { text: recallMode === "auto" ? lower(context.recentAssistant) : "", score: 110 },
      { text: recallMode === "auto" ? lower(context.recentEvents) : "", score: 45 }
    ];
    const flags = new Set(Array.isArray(context.flags) ? context.flags : []);
    const chosen = [];
    const compatibleWorld = text(context.world, 60);
    for (const pack of (Array.isArray(packs) ? packs : [])) {
      if (!ids.has(pack?.meta?.id)) continue;
      if (pack.meta.world !== "general" && compatibleWorld && compatibleWorld !== pack.meta.world) continue;
      for (const entry of pack.entries || []) {
        if (entry.mode === "constant") continue;
        const reason = recallMode === 'off' && entry.mode !== 'foundation' ? 'disabled' :
          entry.enabled === false ? 'disabled' : entry.review_required ? 'review' :
          (entry.requires || []).some(flag => !flags.has(flag)) ? 'condition' : !canRead(entry, context) ? 'knowledge' : null;
        if (reason) { report({id:pack.meta.id+':'+entry.id,title:entry.title,reason}); continue; }
        let score = entry.mode === "foundation" ? 120 : 0;
        if (entry.mode !== "foundation") {
          for (const kw of entry.keywords || []) {
            if (kw.length < 2) continue;
            for (const signal of signals) if (signal.text.includes(lower(kw))) score = Math.max(score, signal.score + Math.min(kw.length,20));
          }
        }
        if (!score) report({id:pack.meta.id+':'+entry.id,title:entry.title,reason:'irrelevant'});
        if (score) chosen.push({ pack: pack.meta.id, title: entry.title, content: entry.content, keywords: entry.keywords || [],
          scenario: pack.meta.classification === "scenario", score: score + entry.priority, identity: pack.meta.id + ":" + entry.id });
      }
    }
    chosen.sort((a,b) => b.score - a.score || a.identity.localeCompare(b.identity));
    const found = [], dedupe = new Set();
    const format = entry => "〔" + (entry.scenario ? "劇情方向參考｜可能方向，尚未發生｜" : "") + entry.title + (entry.excerpted ? "｜節錄，原文完整保留" : "") + "〕\n" + entry.content;
    let used = 0;
    for (const entry of chosen) {
      const key = lower(entry.content).replace(/\s+/g, " ");
      const decide = reason => report({id:entry.identity,title:entry.title,score:entry.score,reason});
      if (dedupe.has(key)) { decide('duplicate'); continue; }
      if (found.length >= maxEntries) { decide('budget'); continue; }
      let selected = entry, formatted = format(entry);
      if (formatted.length > maxChars - used) {
        // Retrieve a bounded passage without rewriting or truncating stored lore.
        const room = maxChars - used - format({ ...entry, content: "", excerpted: true }).length - 4;
        if (room < 80) { decide('budget'); continue; }
        const body = lower(entry.content);
        const matched = entry.keywords.filter(kw => signals.some(signal => signal.text.includes(lower(kw))))
          .map(kw => body.indexOf(lower(kw))).filter(index => index >= 0);
        const focus = matched.length ? Math.min(...matched) : 0;
        const start = Math.max(0, focus - Math.floor(room / 4));
        const excerpt = (start ? "…" : "") + entry.content.slice(start, start + room) + (start + room < entry.content.length ? "…" : "");
        selected = { ...entry, content: excerpt, excerpted: true };
        formatted = format(selected);
      }
      if (formatted.length + (found.length ? 2 : 0) > maxChars - used) { decide('budget'); continue; }
      dedupe.add(key); found.push(selected); used += formatted.length + (found.length > 1 ? 2 : 0);
      decide('included');
    }
    return {
      entries: found.map(({pack,title,identity,excerpted}) => ({pack,title,identity,...(excerpted ? {excerpted:true} : {})})),
      text: found.map(format).join("\n\n")
    };
  }
  return { SCHEMA, VERSION, normalizePack, migrateLegacy, createMysteryCase, mysteryFlagLabel, select, constants };
});
