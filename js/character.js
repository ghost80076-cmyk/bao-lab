const CharacterEngine = {
  storageKey: "bao-lab:custom-characters",

  normalize(raw = {}) {
    const meta = raw.meta || {};
    const content = raw.content || {};
    const gameplay = raw.gameplay || {};
    const presentation = raw.presentation || {};
    const initial = gameplay.initial_state || raw.initial_state || {};
    const prompt = gameplay.prompt || raw.prompt || {};
    // Kept only for local provenance/export. Imported metadata never joins a
    // model request, because files from other platforms are untrusted input.
    const importMetadata = raw.import_metadata && typeof raw.import_metadata === "object" && !Array.isArray(raw.import_metadata)
      ? raw.import_metadata
      : null;

    const id = String(raw.id || meta.id || `custom-${Date.now()}`).trim();
    const name = String(raw.name || meta.name || "未命名角色").trim();
    const title = String(raw.title || meta.title || name).trim();
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
    const focusRaw = raw.world_focus || content.world_focus || gameplay.world_focus || [];
    const worldFocus = (Array.isArray(focusRaw) ? focusRaw : [focusRaw])
      .filter(Boolean)
      .map(x => String(x).trim())
      .filter(Boolean)
      .slice(0, 24);
    const modulesRaw = raw.world_modules || gameplay.world_modules || [];
    const worldModules = (Array.isArray(modulesRaw) ? modulesRaw : [])
      .filter(Boolean)
      .slice(0, 12);
    const dynamicRaw = raw.dynamic_prompts || content.dynamic_prompts || gameplay.dynamic_prompts || [];
    const dynamicPrompts = (Array.isArray(dynamicRaw) ? dynamicRaw : [])
      .map((item, index) => {
        if (!item || typeof item !== "object") return null;
        const triggers = (Array.isArray(item.triggers) ? item.triggers : [item.triggers])
          .filter(Boolean)
          .map(x => String(x).trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 40);
        const text = String(item.text || item.prompt || item.content || "").trim();
        if (!text) return null;
        return {
          id: String(item.id || `dynamic-${index + 1}`).trim().slice(0, 60),
          label: String(item.label || item.name || `情境指示 ${index + 1}`).trim().slice(0, 60),
          triggers,
          text: text.slice(0, 6000),
          always: item.always === true,
          recent_turns: Math.max(1, Math.min(8, Number(item.recent_turns || 3)))
        };
      })
      .filter(Boolean)
      .slice(0, 12);
    const characterStatus = raw.character_status || gameplay.character_status || {};

    return {
      id,
      name,
      title,
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
      profile: raw.profile || content.profile || {},
      lore: content.lore || raw.lore || "",
      world: content.world || raw.world || "",
      world_focus: worldFocus,
      world_modules: worldModules,
      dynamic_prompts: dynamicPrompts,
      character_status: characterStatus,
      npc_rules: content.npc_rules || raw.npc_rules || "",
      author_instructions: content.author_instructions || raw.author_instructions || "",
      creator_notes: content.creator_notes || raw.creator_notes || "",
      narrative_profile: raw.narrative_profile || presentation.narrative || {},
      prompt_options: {
        include_profile: prompt.include_profile !== false,
        include_lore: prompt.include_lore !== false,
        include_world: prompt.include_world !== false,
        include_world_focus: prompt.include_world_focus !== false,
        include_npcs: prompt.include_npcs !== false,
        include_author_instructions: prompt.include_author_instructions !== false,
        include_creator_notes: prompt.include_creator_notes === true,
        include_dynamic_prompts: prompt.include_dynamic_prompts !== false
      },
      supported_modes: raw.supported_modes || gameplay.supported_modes || { immersive: true, world: false },
      supported_display: raw.supported_display || presentation.supported_display || { text: true, ui: false },
      ui: raw.ui || presentation.ui || { type: "basic", panels: ["npc", "status", "events", "memory"] },
      initial_state: {
        time: initial.time || "未設定",
        location: initial.location || "未設定",
        events: Array.isArray(initial.events) ? initial.events : [],
        npcs: Array.isArray(initial.npcs) ? initial.npcs : [],
        modules: initial.modules && typeof initial.modules === "object" && !Array.isArray(initial.modules) ? initial.modules : {},
        character_statuses: initial.character_statuses && typeof initial.character_statuses === "object" && !Array.isArray(initial.character_statuses) ? initial.character_statuses : {}
      },
      import_metadata: importMetadata,
      schema_version: raw.schema_version || "1.5",
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

  profilePrompt(profile = {}) {
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) return "";
    return Object.entries(profile).slice(0, 24).map(([label, value]) => {
      let body = "";
      if (Array.isArray(value)) body = value.map(x => String(x || "").trim()).filter(Boolean).join("、");
      else if (value && typeof value === "object") {
        body = Object.entries(value).map(([key, item]) => `${key}：${String(item ?? "").trim()}`).join("；");
      } else body = String(value ?? "").trim();
      return body ? `${String(label).trim()}：${body.slice(0, 1600)}` : "";
    }).filter(Boolean).join("\n");
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

  recentConversationText(context = {}, turns = 3) {
    const messages = Array.isArray(context.recentMessages) ? context.recentMessages : [];
    if (messages.length) {
      return messages.slice(-Math.max(2, turns * 2)).map(m => String(m?.content || "")).join("\n").toLowerCase();
    }
    return String(context.latestUserText || "").toLowerCase();
  },

  relevantDynamicPrompts(character, context = {}) {
    const c = this.normalize(character || {});
    if (!c.prompt_options?.include_dynamic_prompts || !c.dynamic_prompts?.length) return [];
    return c.dynamic_prompts.filter(block => {
      if (block.always) return true;
      if (!block.triggers.length) return false;
      const hay = this.recentConversationText(context, block.recent_turns || 3);
      return block.triggers.some(trigger => trigger && hay.includes(trigger));
    }).slice(0, 2);
  },

  composeSystemPrompt(character, context = {}) {
    const c = this.normalize(character || {});
    const p = context.persona || {};
    const options = c.prompt_options || {};
    const blocks = [];
    const playerName = p.name || "未命名玩家";

    blocks.push([
      "【平台必要規則】",
      `AI 主要扮演角色：${c.name}`,
      `玩家角色：${playerName}`,
      `來自 user 的輸入一律視為「${playerName}」的台詞、行動或意圖；不得誤認為是「${c.name}」的輸入。`,
      `AI 可以扮演「${c.name}」與世界中的 NPC，但不能扮演玩家「${playerName}」。兩者的姓名、身份、記憶、台詞與行動不得互換。`,
      "不得替玩家決定台詞、心理或行動；除非忠實引用玩家已輸入的原話，不得生成玩家的新台詞。",
      "角色只能依已知資訊行動，不得無理由獲得玩家未公開的資訊。"
    ].join("\n"));

    if (c.system_prompt) blocks.push(`【角色核心】\n${c.system_prompt}`);
    if (options.include_profile) {
      const profileText = this.profilePrompt(c.profile);
      if (profileText) blocks.push(`【角色完整設定】\n${profileText}`);
    }
    if (options.include_author_instructions && c.author_instructions) blocks.push(`【作者敘事指示】\n${c.author_instructions}`);
    if (options.include_creator_notes && c.creator_notes) blocks.push(`【作者備註】\n${c.creator_notes}`);
    blocks.push([
      "【玩家 Persona】",
      `名稱：${p.name || "未命名玩家"}`,
      `性別：${p.gender || "未指定"}`,
      `身分：${p.identity || "未指定"}`,
      `個性：${p.personality || "未指定"}`,
      `與角色的初始關係：${p.relationship || "未指定"}`,
      `其他設定：${p.extra || "無"}`
    ].join("\n"));

    if (options.include_world && c.world) blocks.push(`【世界設定】\n${c.world}`);
    if (options.include_world_focus && c.world_focus?.length) {
      blocks.push(`【世界觀焦點】\n${c.world_focus.join("、")}\n只在情境相關時自然帶入，不要為了塞設定而硬寫。`);
    }
    if (options.include_lore && c.lore) blocks.push(`【背景與 Lore】\n${c.lore}`);

    if (options.include_npcs) {
      const npcText = this.npcPrompt(c.initial_state?.npcs || []);
      if (npcText) blocks.push(`【重要 NPC】\n${npcText}`);
      if (c.npc_rules) blocks.push(`【NPC 運作規則】\n${c.npc_rules}`);
    }

    if (context.modePrompt) blocks.push(`【敘事模式】\n${context.modePrompt}`);
    blocks.push(context.displayMode === "ui"
      ? "【固定 Schema】\n目前使用互動 UI。不要每輪重新輸出完整 UI HTML，敘事正常輸出即可。"
      : "【固定 Schema】\n目前使用純文本模式。不要輸出 RPG 狀態面板。");

    const dynamic = this.relevantDynamicPrompts(c, context).map(block => `【${block.label}】\n${block.text}`).join("\n\n");
    if (dynamic) blocks.push(`【本輪動態角色規則】\n${dynamic}`);

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
