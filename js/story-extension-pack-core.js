(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BAOStoryExtensionPackCore = api;
})(typeof window !== "undefined" ? window : null, function() {
  "use strict";

  const SCHEMA = "yorubay-story-extension-pack";
  const VERSION = 1;
  const MAX_TEXT_RULES = 40;
  const MAX_REGEX_RULES = 40;
  const MAX_CUSTOM_MODULES = 12;
  const BUILT_INS = new Set([
    "three_realms_events", "status", "inventory", "skills", "quests", "factions",
    "economy", "cultivation", "magic", "equipment", "reputation"
  ]);
  const FORBIDDEN_EXPORT_KEYS = new Set([
    "api", "apikey", "api_key", "token", "authorization", "auth",
    "messages", "story", "storyid", "characterid", "charactername",
    "state", "modules", "characterstatuses", "npcs", "events",
    "authorregex", "allowscripts", "allowexternalassets", "allowstatesharing",
    "allowuipersistence", "authorui"
  ]);
  const text = value => String(value ?? "");
  const object = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const unique = list => [...new Set((Array.isArray(list) ? list : []).map(value => text(value).trim()).filter(Boolean))];
  const validIso = value => {
    const raw = text(value).trim();
    return raw && Number.isFinite(Date.parse(raw)) ? new Date(raw).toISOString() : "";
  };

  function normalizeModule(input = {}) {
    const raw = object(input);
    const id = text(raw.id).trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
    if (!id || BUILT_INS.has(id)) return null;
    const tracking = ["high", "medium", "low", "manual"].includes(raw.tracking) ? raw.tracking : "medium";
    const context = ["core", "relevant", "ui_only"].includes(raw.context) ? raw.context : "relevant";
    const kind = ["object", "collection"].includes(raw.kind) ? raw.kind : "object";
    const triggers = unique(raw.triggers).map(value => value.toLowerCase().slice(0, 80)).slice(0, 40);
    const fields = (Array.isArray(raw.fields) ? raw.fields : []).slice(0, 24).map(field => {
      const source = object(field);
      const key = text(source.key).trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
      if (!key) return null;
      const type = ["text", "number", "meter", "boolean"].includes(source.type) ? source.type : "text";
      const result = {
        key,
        label: text(source.label || key).trim().slice(0, 40),
        type
      };
      if (Number.isFinite(Number(source.min))) result.min = Number(source.min);
      if (Number.isFinite(Number(source.max))) result.max = Number(source.max);
      return result;
    }).filter(Boolean);
    return {
      id,
      label: text(raw.label || id).trim().slice(0, 40),
      icon: text(raw.icon || "•").slice(0, 4),
      description: text(raw.description).slice(0, 500),
      tracking,
      context,
      kind,
      enabled: true,
      triggers,
      fields,
      origin: "player"
    };
  }

  function sanitizeWorld(input = {}) {
    const raw = object(input);
    const enabledBuiltIns = unique(raw.enabledBuiltIns).filter(id => BUILT_INS.has(id)).slice(0, BUILT_INS.size);
    const used = new Set(enabledBuiltIns);
    const customModules = [];
    for (const item of (Array.isArray(raw.customModules) ? raw.customModules : []).slice(0, MAX_CUSTOM_MODULES)) {
      const module = normalizeModule(item);
      if (!module || used.has(module.id)) continue;
      used.add(module.id);
      customModules.push(module);
    }
    const portableIds = new Set([...enabledBuiltIns, ...customModules.map(item => item.id)]);
    const disabled = unique(raw.disabled).filter(id => portableIds.has(id));
    const requestedOrder = unique(raw.order).filter(id => portableIds.has(id));
    const order = [...requestedOrder, ...[...portableIds].filter(id => !requestedOrder.includes(id))];
    return { version: 1, enabledBuiltIns, disabled, customModules, order };
  }

  function sanitizeTextReplace(input = {}) {
    const raw = object(input);
    const scope = object(raw.scope);
    const rules = (Array.isArray(raw.rules) ? raw.rules : []).slice(0, MAX_TEXT_RULES).map((rule, index) => {
      const source = object(rule);
      return {
        id: text(source.id || `text-replace-${index + 1}`).slice(0, 80),
        find: text(source.find).slice(0, 200),
        replace: text(source.replace).slice(0, 2000),
        enabled: source.enabled !== false
      };
    });
    return {
      active: raw.active === true,
      scope: { chat: scope.chat !== false, status: scope.status === true },
      rules
    };
  }

  function validateRegexRule(input = {}, index = 0) {
    const raw = object(input);
    const name = text(raw.name || raw.scriptName || raw.comment || `規則 ${index + 1}`).trim().slice(0, 80);
    const pattern = text(raw.pattern ?? raw.findRegex).slice(0, 200);
    const sourceReplacement = text(raw.replacement ?? raw.replaceString);
    const flags = text(raw.flags || "g");
    const requested = raw.enabled !== false && raw.disabled !== true && raw.disable !== true;
    const forbiddenMarkup = /<\s*\/?\s*[a-z][^>]*>/i;
    const dangerousCode = /(?:javascript\s*:|\bon\w+\s*=|\b(?:eval|Function|document|window|globalThis|localStorage|sessionStorage|fetch)\s*\()/i;
    let reason = "";
    if (!pattern) reason = "比對式不可空白";
    else if (sourceReplacement.length > 2000) reason = "替換文字過長";
    else if (forbiddenMarkup.test(sourceReplacement) || dangerousCode.test(sourceReplacement)) reason = "包含不可攜的 HTML／CSS／JavaScript";
    else if (!/^[gimsu]*$/.test(flags) || new Set(flags).size !== flags.length) reason = "正則旗標不相容";
    else if (/\\[1-9]/.test(pattern) || /\(\?/.test(pattern) || /\)[+*?{]/.test(pattern) || (pattern.match(/(?<!\\)[+*{]/g) || []).length > 4) reason = "比對式過於複雜";
    else {
      try { new RegExp(pattern, flags.includes("g") ? flags : flags + "g"); }
      catch (_) { reason = "正則語法錯誤"; }
    }
    return {
      name,
      pattern,
      replacement: reason ? "" : sourceReplacement,
      flags,
      enabled: requested && !reason,
      reason: reason || (requested ? "" : text(raw.reason || "原規則已停用").slice(0, 120))
    };
  }

  function sanitizeRegex(input = {}) {
    const raw = object(input);
    return {
      active: raw.active === true,
      rules: (Array.isArray(raw.rules) ? raw.rules : []).slice(0, MAX_REGEX_RULES).map(validateRegexRule)
    };
  }

  function sectionCounts(sections = {}) {
    const world = object(sections.world);
    const textReplace = object(sections.textReplace);
    const regex = object(sections.regex);
    return {
      worldBuiltIns: Array.isArray(world.enabledBuiltIns) ? world.enabledBuiltIns.length : 0,
      worldCustom: Array.isArray(world.customModules) ? world.customModules.length : 0,
      textReplace: Array.isArray(textReplace.rules) ? textReplace.rules.length : 0,
      regex: Array.isArray(regex.rules) ? regex.rules.length : 0,
      invalidRegex: Array.isArray(regex.rules) ? regex.rules.filter(rule => rule?.reason && rule.reason !== "原規則已停用").length : 0
    };
  }

  function sanitizePack(input = {}, now = new Date().toISOString()) {
    const raw = object(input);
    if (raw.schema !== SCHEMA) throw new Error("這不是夜灣故事擴充設定包。");
    const version = Number(raw.version || 0);
    if (!Number.isInteger(version) || version < 1 || version > VERSION) throw new Error("這份故事擴充設定包版本尚不支援。");
    const source = object(raw.sections);
    const sections = {};
    if (source.world && typeof source.world === "object") sections.world = sanitizeWorld(source.world);
    if (source.textReplace && typeof source.textReplace === "object") sections.textReplace = sanitizeTextReplace(source.textReplace);
    if (source.regex && typeof source.regex === "object") sections.regex = sanitizeRegex(source.regex);
    if (!Object.keys(sections).length) throw new Error("設定包沒有可匯入的故事擴充設定。");
    return {
      schema: SCHEMA,
      version: VERSION,
      exportedAt: validIso(raw.exportedAt) || validIso(now) || new Date().toISOString(),
      sections
    };
  }

  function buildPack(input = {}, now = new Date().toISOString()) {
    const source = object(input);
    const sections = {};
    if (source.world) sections.world = sanitizeWorld(source.world);
    if (source.textReplace) sections.textReplace = sanitizeTextReplace(source.textReplace);
    if (source.regex) sections.regex = sanitizeRegex(source.regex);
    return sanitizePack({ schema: SCHEMA, version: VERSION, exportedAt: now, sections }, now);
  }

  function describePack(input) {
    const pack = sanitizePack(input);
    const counts = sectionCounts(pack.sections);
    const sections = [];
    if (pack.sections.world) sections.push({
      id: "world",
      label: "世界模組設定",
      count: counts.worldBuiltIns + counts.worldCustom,
      detail: `夜灣內建 ${counts.worldBuiltIns} · 玩家模組 ${counts.worldCustom}`,
      impact: "套用到目前故事；不包含目前世界狀態值。"
    });
    if (pack.sections.textReplace) sections.push({
      id: "textReplace",
      label: "文字替換 MOD",
      count: counts.textReplace,
      detail: `${counts.textReplace} 條文字替換`,
      impact: "套用到目前故事；會取代目前故事的文字替換設定。"
    });
    if (pack.sections.regex) sections.push({
      id: "regex",
      label: "玩家 Regex",
      count: counts.regex,
      detail: counts.invalidRegex ? `${counts.regex} 條 · ${counts.invalidRegex} 條需修正` : `${counts.regex} 條規則`,
      impact: "套用到這台裝置所有故事；會取代目前玩家 Regex。"
    });
    return {
      pack,
      counts,
      sections,
      excluded: ["故事內容", "世界狀態值", "角色／作品識別", "API Key", "作品 Regex", "作者腳本與授權"]
    };
  }

  function hasForbiddenKeys(value) {
    if (!value || typeof value !== "object") return false;
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_EXPORT_KEYS.has(String(key).replace(/[^a-zA-Z0-9_]/g, "").toLowerCase())) return true;
      if (item && typeof item === "object" && hasForbiddenKeys(item)) return true;
    }
    return false;
  }

  return Object.freeze({
    SCHEMA,
    VERSION,
    MAX_TEXT_RULES,
    MAX_REGEX_RULES,
    MAX_CUSTOM_MODULES,
    normalizeModule,
    sanitizeWorld,
    sanitizeTextReplace,
    validateRegexRule,
    sanitizeRegex,
    sanitizePack,
    buildPack,
    describePack,
    sectionCounts,
    hasForbiddenKeys
  });
});
