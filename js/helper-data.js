(() => {
  const object = value => value && typeof value === "object" && !Array.isArray(value);
  const safeKey = key => !["__proto__", "constructor", "prototype"].includes(key);
  const parse = text => {
    const raw = String(text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    if (!raw) return null;
    const candidates = [raw];
    const first = raw.indexOf("{"), last = raw.lastIndexOf("}");
    if (first >= 0 && last > first) candidates.push(raw.slice(first, last + 1));
    for (const candidate of [...new Set(candidates)]) {
      try { return JSON.parse(candidate); }
      catch {}
    }
    return null;
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
  const cleanTextList = (value, maxItems = 8, maxChars = 80) => Array.isArray(value)
    ? [...new Set(value.filter(item => typeof item === "string").map(item => item.trim().slice(0, maxChars)).filter(Boolean))].slice(0, maxItems)
    : [];
  const worldClockPatch = raw => {
    if (!object(raw)) return {};
    const out = {};
    const boundedMinutes = value => {
      const number = Number(value);
      if (!Number.isFinite(number) || number < 0) return null;
      return Math.min(52560000, Math.floor(number));
    };
    const advance = boundedMinutes(raw.advance_minutes ?? raw.advanceMinutes);
    if (advance !== null && advance > 0) out.advance_minutes = advance;
    if (Array.isArray(raw.schedule)) {
      const schedule = raw.schedule.slice(0, 12).map(item => {
        if (!object(item)) return null;
        const label = String(item.label || "").trim().slice(0, 160);
        const minutes = boundedMinutes(item.in_minutes ?? item.inMinutes);
        return label && minutes !== null ? { label, in_minutes: minutes } : null;
      }).filter(Boolean);
      if (schedule.length) out.schedule = schedule;
    }
    for (const key of ["resolve", "cancel"]) {
      if (!Array.isArray(raw[key])) continue;
      const ids = [...new Set(raw[key].map(String).filter(id => /^wc-\d+$/.test(id)))].slice(0, 20);
      if (ids.length) out[key] = ids;
    }
    return out;
  };
  const moduleSchemas = defs => Object.fromEntries(defs.filter(d => d.tracking !== "manual").map(d => [d.id, { kind: d.kind, fields: fieldsFor(d) }]));
  const mergeCollection = (current, patch) => {
    const items = (Array.isArray(current) ? current : []).map(item => object(item) ? { ...item } : item);
    for (const item of patch) {
      // Without an identity, a partial collection entry cannot safely merge.
      if (!item.id && !item.name) {
        if (!items.some(old => JSON.stringify(old) === JSON.stringify(item))) items.push(item);
        continue;
      }
      const exact = item.id ? items.flatMap((old, index) => object(old) && old.id === item.id ? [index] : []) : [];
      const matches = exact.length ? exact : items.flatMap((old, index) => object(old) && item.name && old.name === item.name && (!item.id || !old.id) ? [index] : []);
      if (matches.length > 1) continue;
      const index = matches[0] ?? -1;
      if (index >= 0) items[index] = { ...items[index], ...item };
      else if (!items.some(old => JSON.stringify(old) === JSON.stringify(item))) items.push(item);
    }
    return items;
  };
  // A valid JSON object is not proof that every page was checked. Scalar
  // fields need a valid returned value or explicit unchanged acknowledgement.
  // Collections require an explicit whole-collection review, even when empty.
  const rejectedRemovals = new WeakMap();
  const moduleCoverage = (raw, clean, defs = []) => defs.filter(def => def.tracking !== 'manual').flatMap(def => {
    const check = raw?.module_checks?.[def.id];
    if (def.kind === 'collection') {
      const malformed = raw?.modules && Object.hasOwn(raw.modules, def.id) && !Array.isArray(raw.modules[def.id]);
      const invalidItems = Array.isArray(raw?.modules?.[def.id]) && (raw.modules[def.id].length > 100 || raw.modules[def.id].some(item =>
        !object(item) || (!item.id && !item.name) || fieldsFor(def).some(field => Object.hasOwn(item, field.key) && cleanValue(field, item[field.key]) === undefined)));
      const invalidRemoval = Array.isArray(raw?.module_removals?.[def.id]) && raw.module_removals[def.id].some(item =>
        !object(item) || !clean?.modules?.[def.id] || clean.modules[def.id].some(old => item.id ? old?.id === item.id : old?.name === item.name));
      return check === true && !malformed && !invalidItems && !invalidRemoval && !rejectedRemovals.get(clean)?.has(def.id) ? [] : [def.id];
    }
    const current = window.GameState?.current?.modules?.[def.id] || {};
    const fields = fieldsFor(def);
    const missing = fields.filter(field => {
      if (object(raw?.modules?.[def.id]) && Object.hasOwn(raw.modules[def.id], field.key))
        return cleanValue(field, raw.modules[def.id][field.key]) === undefined || !Object.hasOwn(clean?.modules?.[def.id] || {}, field.key);
      return !(Array.isArray(check) && check.includes(field.key) && Object.hasOwn(current, field.key));
    });
    return missing.length || !fields.length ? [def.id] : [];
  });
  const sceneCoverage = (raw, explicit = {}) => ['time', 'location'].filter(key => {
    if (explicit[key]) return false;
    if (raw && Object.hasOwn(raw, key)) return !(typeof raw[key] === 'string' && raw[key].trim() && !/^(未確認|未知|未設定)$/.test(raw[key].trim()));
    return !(Array.isArray(raw?.scene_checks) && raw.scene_checks.includes(key));
  });
  const moduleProtocol = [
    '時間與地點也須核對：有變化回傳 time、location；已確認未變動的欄位列在 scene_checks，例如 ["time","location"]。不能只更新分頁而漏檢場景。',
    '所有允許的作品模組都屬於狀態追蹤，包括各分頁的時間、地點、關係、契約、金錢、物品與任務；不得只檢查一般狀態。',
    'module_checks 記錄已核對且沒有變化的物件欄位，例如 {"economy":["gold"]}；缺乏證據不能冒充已確認。已變動欄位放 modules，數值是變動後絕對值（含 0），不是加減量；不重複計算已入帳的事件。',
    '集合 modules 只回傳有證據的新增或更新項目，沿用 id（沒有 id 才用 name），系統合併而非整份取代。quantity 是變動後數量，未提及項目不代表刪除。若已核對整份集合的現況（包含確定空集合），module_checks 對應 module_id 填 true；局部更新或證據不足不可填 true。',
    '已全部消耗、交付、丟棄的集合項目，使用 module_removals：{"inventory":[{"id":"既有 id","evidence":"故事中明確完成移除且含物品名稱的逐字原句"}]}；沒有 id 可填 name。只在實際完成時移除，願望、否定、假設、引用、失敗嘗試都不能移除。',
    '較新的已發生劇情優先於舊快照與待補輪次；不得恢復舊時間地點、重播已完成劇情、退回舊餘額或復活已消耗物品。'
  ].join('\n');
  const stateUpdate = (data, defs = [], sourceText = "", options = {}) => {
    if (!object(data)) return null;
    const out = pickFields(data, ["time", "location"].map(key => ({ key, type: "text" })));
    if (Array.isArray(data.events)) out.events = data.events.filter(v => typeof v === "string").slice(0, 8).map(v => v.slice(0, 300));
    if (object(data.world_clock)) {
      const clock = worldClockPatch(data.world_clock);
      if (Object.keys(clock).length) out.world_clock = clock;
    }
    if (Array.isArray(data.npcs)) out.npcs = data.npcs.filter(object).slice(0, 30).map(n => {
      const clean = pickFields(n, ["name", "role", "mood", "location", "relationship", "appearance", "outfit"].map(key => ({ key, type: "text" })));
      if (/^npc-\d+$/.test(String(n.npc_id || ""))) clean.npc_id = String(n.npc_id);
      if (typeof n.relationship === "number" && Number.isFinite(n.relationship)) clean.relationship = n.relationship;
      const aliases = cleanTextList(n.aliases);
      if (aliases.length) clean.aliases = aliases;
      if (n.appearance_change === true) clean.appearance_change = true;
      if (["present", "away", "unknown"].includes(n.presence)) clean.presence = n.presence;
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
    const rejected = new Set();
    rejectedRemovals.set(out, rejected);
    if (object(data.modules) || object(data.module_removals)) {
      out.modules = {};
      defs.filter(d => d.tracking !== "manual" && safeKey(d.id)).forEach(def => {
        const value = data.modules?.[def.id], schema = fieldsFor(def);
        if (def.kind === "collection" && Array.isArray(value)) {
          const items = value.filter(object).slice(0, 100).map(item => pickFields(item, schema)).filter(item => Object.keys(item).length);
          if (!value.length || items.length) out.modules[def.id] = options.collectionMode === 'merge'
            ? mergeCollection(window.GameState?.current?.modules?.[def.id], items) : items;
        } else if (def.kind === "object" && object(value)) {
          if (def.id === window.BAOThreeRealmsCultivation?.id) {
            const checked = window.BAOThreeRealmsCultivation.validatePatch(window.GameState?.current?.modules?.[def.id], value, sourceText);
            if (checked.ok) out.modules[def.id] = checked.value;
            if (window.GameState?.current) window.GameState.current.cultivationUpdateWarning = checked.ok ? "" : checked.reason;
            return;
          }
          const clean = pickFields(value, schema);
          if (Object.keys(clean).length) out.modules[def.id] = { ...window.GameState?.current?.modules?.[def.id], ...clean };
        }
        // Deletion requires an existing, uniquely identified item plus a
        // verbatim story quote naming it. Never infer deletion from omission.
        if (def.kind === 'collection' && Array.isArray(data.module_removals?.[def.id])) {
          let items = out.modules[def.id] || mergeCollection(window.GameState?.current?.modules?.[def.id], []);
          for (const removal of data.module_removals[def.id].slice(0, 100)) {
            const evidence = String(options.removalEvidence ?? sourceText);
            if (!object(removal) || typeof removal.evidence !== 'string' || !removal.evidence.trim() || !evidence.includes(removal.evidence)) { rejected.add(def.id); continue; }
            const original = window.GameState?.current?.modules?.[def.id];
            const matches = (Array.isArray(original) ? original : []).filter(item => object(item) &&
              (removal.id ? item.id === removal.id : removal.name && item.name === removal.name));
            if (matches.length !== 1 || !matches[0].name || !removal.evidence.includes(matches[0].name)) { rejected.add(def.id); continue; }
            const target = matches[0];
            // A later mention may record reacquisition. Do not let an older
            // removal quote silently override it; leave the page unconfirmed.
            if (evidence.lastIndexOf(target.name) >= evidence.lastIndexOf(removal.evidence) + removal.evidence.length) { rejected.add(def.id); continue; }
            items = items.filter(item => target.id ? item.id !== target.id : item.name !== target.name);
            out.modules[def.id] = items;
          }
        }
      });
    }
    return out;
  };
  window.BAOHelperData = { parse, memoryRules, memoryText, stateUpdate, moduleSchemas, worldClockPatch, moduleCoverage, sceneCoverage, moduleProtocol };
})();
