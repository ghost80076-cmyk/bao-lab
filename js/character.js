const CharacterEngine = {
  storageKey: "bao-lab:custom-characters",

  normalize(raw = {}) {
    const meta = raw.meta || {};
    const content = raw.content || {};
    const gameplay = raw.gameplay || {};
    const presentation = raw.presentation || {};
    const initial = gameplay.initial_state || raw.initial_state || {};
    const prompt = gameplay.prompt || raw.prompt || {};

    const id = String(raw.id || meta.id || `custom-${Date.now()}`).trim();
    const name = String(raw.name || meta.name || "未命名角色").trim();
    const rating = raw.rating || meta.rating || "general";
    const audience = raw.audience || meta.audience || [];
    const categories = raw.categories || meta.categories || [];
    const tags = raw.tags || meta.tags || [];
    const audienceList = Array.isArray(audience) ? audience : [audience].filter(Boolean);
    const explicitCategory = String(raw.category || meta.category || "").toLowerCase();
    const legacyAudience = audienceList.map(x => String(x).toLowerCase());
    const category = ["male", "female", "r18"].includes(explicitCategory)
      ? explicitCategory
      : rating === "adult"
        ? "r18"
        : legacyAudience.includes("female") ? "female" : "male";

    return {
      id,
      name,
      avatar: raw.avatar || meta.avatar || "https://picsum.photos/seed/bao-character/800/1000",
      rating: category === "r18" ? "adult" : "general",
      category,
      gender: raw.gender || meta.gender || "",
      audience: audienceList,
      categories: Array.isArray(categories) ? categories : [categories].filter(Boolean),
      tags: Array.isArray(tags) ? tags : [tags].filter(Boolean),
      description: raw.description || meta.description || "",
      quote: raw.quote || content.quote || "",
      greeting: raw.greeting || content.greeting || "",
      system_prompt: raw.system_prompt || content.system_prompt || "",
      lore: content.lore || raw.lore || "",
      world: content.world || raw.world || "",
      npc_rules: content.npc_rules || raw.npc_rules || "",
      author_instructions: content.author_instructions || raw.author_instructions || "",
      creator_notes: content.creator_notes || raw.creator_notes || "",
      prompt_options: {
        include_lore: prompt.include_lore !== false,
        include_world: prompt.include_world !== false,
        include_npcs: prompt.include_npcs !== false,
        include_author_instructions: prompt.include_author_instructions !== false,
        include_creator_notes: prompt.include_creator_notes === true
      },
      supported_modes: raw.supported_modes || gameplay.supported_modes || { immersive: true, world: false },
      supported_display: raw.supported_display || presentation.supported_display || { text: true, ui: false },
      ui: raw.ui || presentation.ui || { type: "basic", panels: ["npc", "status", "events", "memory"] },
      initial_state: {
        time: initial.time || "未設定",
        location: initial.location || "未設定",
        events: Array.isArray(initial.events) ? initial.events : [],
        npcs: Array.isArray(initial.npcs) ? initial.npcs : []
      },
      schema_version: raw.schema_version || "1.2",
      source: raw.source || "custom"
    };
  },

  validate(raw = {}) {
    const errors = [];
    const c = this.normalize(raw);
    if (!c.id) errors.push("缺少 id");
    if (!c.name) errors.push("缺少 name");
    if (!c.system_prompt) errors.push("缺少 system_prompt / content.system_prompt");
    if (!c.greeting) errors.push("缺少 greeting / content.greeting");
    if (!["male", "female", "r18"].includes(c.category)) errors.push("category 必須是 male、female 或 r18");
    return { ok: errors.length === 0, errors, character: c };
  },

  npcPrompt(npcs = []) {
    if (!Array.isArray(npcs) || !npcs.length) return "";
    return npcs.map((npc, i) => {
      const parts = [
        npc.name ? `名稱：${npc.name}` : `NPC ${i + 1}`,
        npc.role ? `身分：${npc.role}` : "",
        npc.personality ? `個性：${npc.personality}` : "",
        npc.relationship ? `關係：${npc.relationship}` : "",
        npc.mood ? `初始情緒：${npc.mood}` : "",
        npc.location ? `初始位置：${npc.location}` : "",
        npc.notes ? `補充：${npc.notes}` : ""
      ].filter(Boolean);
      return parts.join("；");
    }).join("\n");
  },

  composeSystemPrompt(character, context = {}) {
    const c = this.normalize(character || {});
    const p = context.persona || {};
    const options = c.prompt_options || {};
    const blocks = [];

    if (c.system_prompt) blocks.push(`【角色核心】\n${c.system_prompt}`);
    if (options.include_world && c.world) blocks.push(`【世界設定】\n${c.world}`);
    if (options.include_lore && c.lore) blocks.push(`【背景與 Lore】\n${c.lore}`);

    if (options.include_npcs) {
      const npcText = this.npcPrompt(c.initial_state?.npcs || []);
      if (npcText) blocks.push(`【重要 NPC】\n${npcText}`);
      if (c.npc_rules) blocks.push(`【NPC 運作規則】\n${c.npc_rules}`);
    }

    if (options.include_author_instructions && c.author_instructions) blocks.push(`【作者敘事指示】\n${c.author_instructions}`);
    if (options.include_creator_notes && c.creator_notes) blocks.push(`【作者備註】\n${c.creator_notes}`);
    if (context.modePrompt) blocks.push(`【敘事模式】\n${context.modePrompt}`);

    blocks.push([
      "【玩家 Persona】",
      `名稱：${p.name || "未命名玩家"}`,
      `性別：${p.gender || "未指定"}`,
      `身分：${p.identity || "未指定"}`,
      `個性：${p.personality || "未指定"}`,
      `與角色的初始關係：${p.relationship || "未指定"}`,
      `其他設定：${p.extra || "無"}`
    ].join("\n"));

    blocks.push("【共同規則】\n不得替玩家決定台詞、心理或行動。角色只能依已知資訊行動，不得無理由獲得玩家未公開的資訊。");
    blocks.push(context.displayMode === "ui"
      ? "【輸出模式】\n目前使用互動 UI。不要每輪重新輸出完整 UI HTML，敘事正常輸出即可。"
      : "【輸出模式】\n目前使用純文本模式。不要輸出 RPG 狀態面板。");

    return blocks.filter(Boolean).join("\n\n");
  },

  loadCustom() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.map(x => this.normalize(x)) : [];
    } catch { return []; }
  },

  saveCustom(character) {
    const list = this.loadCustom().filter(x => x.id !== character.id);
    list.unshift(this.normalize(character));
    localStorage.setItem(this.storageKey, JSON.stringify(list.slice(0, 100)));
    return character;
  },

  removeCustom(id) {
    const list = this.loadCustom().filter(x => x.id !== id);
    localStorage.setItem(this.storageKey, JSON.stringify(list));
  },

  async importFile(file) {
    const text = await file.text();
    const raw = JSON.parse(text);
    const result = this.validate(raw);
    if (!result.ok) throw new Error(result.errors.join("；"));
    result.character.source = "local-import";
    this.saveCustom(result.character);
    return result.character;
  }
};
