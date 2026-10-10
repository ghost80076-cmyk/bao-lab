(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BAOStoryActorPackCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";

  const text = (value, max = 12000) => String(value ?? "").trim().slice(0, max);
  const ACTOR_FIELDS = Object.freeze([
    "name", "gender", "identity", "appearance", "personality",
    "background", "voice", "relationship", "extra"
  ]);

  function sanitizeEntry(input = {}) {
    const raw = input && typeof input === "object" ? input : {};
    const defaults = raw.defaults && typeof raw.defaults === "object" ? raw.defaults : {};
    const id = text(raw.id, 100);
    const name = text(raw.name, 120);
    if (!id || !name) return null;
    return {
      id,
      name,
      label: text(raw.label || name, 160),
      rating: raw.rating === "adult" ? "adult" : "general",
      category: ["general", "female", "male"].includes(raw.category) ? raw.category : "general",
      description: text(raw.description, 600),
      core: text(raw.core, 16000),
      actorMode: raw.actorMode === true,
      defaults: Object.fromEntries(ACTOR_FIELDS.map(key => [key, text(defaults[key], 6000)]))
    };
  }

  function sanitizeCatalog(list = []) {
    return (Array.isArray(list) ? list : []).map(sanitizeEntry).filter(Boolean);
  }

  function availableCatalog(general = [], adult = [], options = {}) {
    const safeGeneral = sanitizeCatalog(general).filter(item => item.rating !== "adult");
    const safeAdult = options.adultEnabled === true
      ? sanitizeCatalog(adult).filter(item => item.rating === "adult")
      : [];
    const seen = new Set();
    return [...safeGeneral, ...safeAdult].filter(item => !seen.has(item.id) && seen.add(item.id));
  }

  function normalizePortableMeta(input = {}) {
    const raw = input && typeof input === "object" ? input : {};
    const packId = text(raw.packId, 100);
    if (!packId) return null;
    return {
      packId,
      label: text(raw.label, 160),
      rating: raw.rating === "adult" ? "adult" : "general",
      core: text(raw.core, 16000),
      actorMode: raw.actorMode === true
    };
  }

  function instantiate(entry, overrides = {}, options = {}) {
    const pack = sanitizeEntry(entry);
    if (!pack) return null;
    const actor = {};
    for (const key of ACTOR_FIELDS) {
      const supplied = Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : pack.defaults[key];
      actor[key] = text(supplied, 6000);
    }
    actor.name = text(overrides.name || pack.defaults.name || pack.name, 120) || pack.name;
    actor.id = text(options.id || overrides.id, 100);
    actor.role = overrides.role === "primary" ? "primary" : "additional";
    actor.portable = {
      packId: pack.id,
      label: pack.label,
      rating: pack.rating,
      core: pack.core,
      actorMode: pack.actorMode
    };
    return actor;
  }

  function portablePrompt(actor = {}) {
    const meta = normalizePortableMeta(actor.portable);
    if (!meta?.core) return "";
    const archetype = meta.packId.startsWith("three-realms-archetype-");
    return [
      archetype ? "【官方可攜角色｜三界原創人物範本】" : `【官方可攜角色｜${meta.label || meta.packId}】`,
      ...(archetype ? [`本場人物：${text(actor.name, 120) || "未指定"}。這份性格核心屬於此人物；以本場姓名識別，不另建立範本人物。`] : []),
      archetype ? meta.core.replace(/^【原創人物｜[^】]*】/, "【本場人物核心】") : meta.core,
      "這是被插入目前故事的獨立 AI 人物。原作品、原 NPC 與世界規則繼續存在；不要因為可攜角色加入就覆蓋原作人物。",
      "可攜角色的核心人格位於本場身份之下；本場身份、與玩家關係、當前演法與已發生事件可以改變表現，但不能憑空改寫其核心人格。",
      "可攜角色彼此之間、與原作品 NPC 之間都可自然建立關係、衝突、合作或疏遠；不能只和玩家互動。",
      meta.actorMode
        ? "此角色具有演員層：角色本體知道的場外資訊，不等於戲中身份知道；戲中身份只能使用自己合理取得的資訊。"
        : "此角色不是演員容器；本場身份只是她／他在這個世界中的具體位置，核心人格連續存在。"
    ].join("\n");
  }

  return Object.freeze({
    ACTOR_FIELDS,
    sanitizeEntry,
    sanitizeCatalog,
    availableCatalog,
    normalizePortableMeta,
    instantiate,
    portablePrompt
  });
});
