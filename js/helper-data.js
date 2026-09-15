(() => {
  const object = value => value && typeof value === "object" && !Array.isArray(value);
  const safeKey = key => !["__proto__", "constructor", "prototype"].includes(key);
  const parse = text => {
    try { return JSON.parse(String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
    catch { return null; }
  };
  const categories = { events: "重要事件", knownFacts: "人物已知資訊", relationships: "已確認關係", openThreads: "未完成事件" };
  const memoryRules = '只輸出 JSON：{"events":["事實"],"knownFacts":["誰知道什麼"],"relationships":["明確關係"],"openThreads":["未完成目標"]}。每項是精簡事實，不寫小說、修辭、建議或下一幕安排；不確定與心理推測不寫入。合併既有記憶，保留仍有效的重要事實。每類最多 16 項，每項最多 160 字。';
  const memoryText = text => {
    const data = parse(text);
    if (!object(data)) return "";
    const blocks = [];
    for (const [key, label] of Object.entries(categories)) {
      if (!Array.isArray(data[key])) continue;
      const values = [...new Set(data[key].filter(v => typeof v === "string" && v.trim()).map(v => v.trim().slice(0, 160)))].slice(0, 16);
      if (values.length) blocks.push(`${label}：\n${values.map(v => `- ${v}`).join("\n")}`);
    }
    return blocks.join("\n\n");
  };
  const cleanValue = (field, value) => {
    if (["number", "meter"].includes(field.type)) {
      if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
      return Math.min(Number.isFinite(field.max) ? field.max : Infinity, Math.max(Number.isFinite(field.min) ? field.min : -Infinity, value));
    }
    if (field.type === "boolean") return typeof value === "boolean" ? value : undefined;
    if (field.type === "tags") return Array.isArray(value) && value.every(v => typeof v === "string") ? value.slice(0, 12).map(v => v.slice(0, 80)) : undefined;
    return typeof value === "string" ? value.slice(0, 800) : undefined;
  };
  const standardFields = {
    status: { condition: "text", hp: "number", mp: "number", stamina: "number" },
    economy: { currency: "text", balance: "number", gold: "number", money: "number" },
    cultivation: { realm: "text", level: "number", progress: "number" },
    magic: { element: "text", mana: "number", level: "number" },
    reputation: { name: "text", value: "number", level: "text" }
  };
  const collectionFields = { id: "text", name: "text", description: "text", quantity: "number", status: "text", level: "number", equipped: "boolean" };
  const fieldsFor = def => {
    if (def.fields?.length) return def.fields.filter(f => safeKey(f.key));
    // Legacy modules have no explicit fields. Infer only existing scalar fields,
    // plus a small documented vocabulary for empty built-in modules.
    const types = { ...(def.kind === "collection" ? collectionFields : standardFields[def.id] || {}) };
    const current = window.GameState?.current?.modules?.[def.id];
    const samples = def.kind === "collection" ? (Array.isArray(current) ? current.slice(0, 20) : []) : [current];
    samples.filter(object).forEach(sample => Object.entries(sample).forEach(([key, value]) => {
      if (safeKey(key) && ["string", "number", "boolean"].includes(typeof value)) types[key] = typeof value === "string" ? "text" : typeof value;
    }));
    return Object.entries(types).slice(0, 48).map(([key, type]) => ({ key, type }));
  };
  const pickFields = (data, fields) => {
    const result = {};
    if (!object(data)) return result;
    fields.forEach(field => {
      if (!safeKey(field.key) || !Object.hasOwn(data, field.key)) return;
      const value = cleanValue(field, data[field.key]);
      if (value !== undefined) result[field.key] = value;
    });
    return result;
  };
  const moduleSchemas = defs => Object.fromEntries(defs.filter(d => d.tracking !== "manual").map(d => [d.id, { kind: d.kind, fields: fieldsFor(d) }]));
  const stateUpdate = (data, defs = []) => {
    if (!object(data)) return null;
    const out = pickFields(data, ["time", "location"].map(key => ({ key, type: "text" })));
    if (Array.isArray(data.events)) out.events = data.events.filter(v => typeof v === "string").slice(0, 8).map(v => v.slice(0, 300));
    if (Array.isArray(data.npcs)) out.npcs = data.npcs.filter(object).slice(0, 30).map(n => {
      const clean = pickFields(n, ["name", "role", "mood", "location", "relationship"].map(key => ({ key, type: "text" })));
      if (typeof n.relationship === "number" && Number.isFinite(n.relationship)) clean.relationship = n.relationship;
      return clean;
    }).filter(n => n.name?.trim() && safeKey(n.name));
    const fields = window.BAOCharacterStatus?.configFor?.(window.App?.activeCharacter)?.fields?.filter(f => f.track) || [];
    const knownNames = new Set([window.App?.activeCharacter?.name, ...Object.keys(window.GameState?.current?.characterStatuses || {}), ...(out.npcs || []).map(n => n.name)]);
    if (object(data.character_statuses)) {
      out.character_statuses = {};
      Object.entries(data.character_statuses).slice(0, 20).forEach(([name, patch]) => {
        if (safeKey(name) && knownNames.has(name)) out.character_statuses[name] = pickFields(patch, fields);
      });
    }
    if (object(data.modules)) {
      out.modules = {};
      defs.filter(d => d.tracking !== "manual" && safeKey(d.id)).forEach(def => {
        const value = data.modules[def.id], schema = fieldsFor(def);
        if (def.kind === "collection" && Array.isArray(value)) {
          const items = value.filter(object).slice(0, 100).map(item => pickFields(item, schema)).filter(item => Object.keys(item).length);
          if (!value.length || items.length) out.modules[def.id] = items;
        } else if (def.kind === "object" && object(value)) {
          const clean = pickFields(value, schema);
          if (Object.keys(clean).length) out.modules[def.id] = { ...window.GameState?.current?.modules?.[def.id], ...clean };
        }
      });
    }
    return out;
  };
  window.BAOHelperData = { memoryRules, memoryText, stateUpdate, moduleSchemas };
})();
