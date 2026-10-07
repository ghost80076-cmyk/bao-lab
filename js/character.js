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
    const rawRating = String(raw.rating || meta.rating || "general").toLowerCase();
    const audience = raw.audience || meta.audience || [];
    const categories = raw.categories || meta.categories || [];
    const tags = raw.tags || meta.tags || [];
    const audienceList = Array.isArray(audience) ? audience : [audience].filter(Boolean);
    const explicitCategory = String(raw.category || meta.category || "").toLowerCase();
    const legacyAudience = audienceList.map(x => String(x).toLowerCase());
    const category = ["general", "male", "female"].includes(explicitCategory)
      ? explicitCategory
      : legacyAudience.some(value => ["female", "女性", "女性向"].includes(value))
        ? "female"
        : legacyAudience.some(value => ["male", "男性", "男性向"].includes(value))
          ? "male"
          : "general";
    const rating = rawRating === "adult" || explicitCategory === "r18" ? "adult" : "general";
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
    const gameplayUI = raw.gameplay_ui || gameplay.ui_schema || gameplay.gameplay_ui || null;
    const playInfoSurface = raw.play_info_surface || presentation.play_info_surface || (gameplayUI ? "game-ui" : "reader-context");
    const openingRaw = raw.opening || presentation.opening || null;
    const opening = openingRaw && typeof openingRaw === "object" && !Array.isArray(openingRaw)
      ? {
          type: String(openingRaw.type || "basic").trim().slice(0, 40),
          label: String(openingRaw.label || "").trim().slice(0, 80),
          posts: (Array.isArray(openingRaw.posts) ? openingRaw.posts : []).slice(0, 8).map((post, index) => ({
            kind: ["player", "character", "system"].includes(String(post?.kind || "").toLowerCase())
              ? String(post.kind).toLowerCase()
              : index === 0 ? "player" : "character",
            meta: String(post?.meta || "").trim().slice(0, 180),
            transition: String(post?.transition || "").trim().slice(0, 120),
            content: String(post?.content || "").trim().slice(0, 12000)
          })).filter(post => post.content),
          choices: (Array.isArray(openingRaw.choices) ? openingRaw.choices : [])
            .map(value => String(value || "").trim())
            .filter(Boolean)
            .slice(0, 4),
          note: String(openingRaw.note || "").trim().slice(0, 500)
        }
      : null;
    const actorModeRaw = raw.actor_mode || gameplay.actor_mode || null;
    const actorMode = actorModeRaw && typeof actorModeRaw === "object" && !Array.isArray(actorModeRaw)
      ? {
          enabled: actorModeRaw.enabled === true,
          role_active: actorModeRaw.role_active === true,
          default_role: {
            label: String(actorModeRaw.default_role?.label || "").trim().slice(0, 120),
            identity: String(actorModeRaw.default_role?.identity || "").trim().slice(0, 1200),
            relationship: String(actorModeRaw.default_role?.relationship || "").trim().slice(0, 800),
            personality: String(actorModeRaw.default_role?.personality || "").trim().slice(0, 1200),
            voice: String(actorModeRaw.default_role?.voice || "").trim().slice(0, 1000),
            motive: String(actorModeRaw.default_role?.motive || "").trim().slice(0, 1000),
            knowledge: String(actorModeRaw.default_role?.knowledge || "").trim().slice(0, 1200)
          }
        }
      : null;

    return {
      id,
      name,
      title,
      avatar: raw.avatar || meta.avatar || "https://picsum.photos/seed/bao-character/800/1000",
      reading_background: raw.reading_background || presentation.reading_background || presentation.background || raw.background || "",
      rating,
      category,
      gender: raw.gender || meta.gender || "",
      audience: audienceList,
      categories: Array.isArray(categories) ? categories : [categories].filter(Boolean),
      tags: Array.isArray(tags) ? tags : [tags].filter(Boolean),
      description: raw.description || meta.description || "",
      quote: raw.quote || content.quote || "",
      greeting: raw.greeting || content.greeting || "",
      greeting_context: String(raw.greeting_context || content.greeting_context || "").trim(),
      opening,
      system_prompt: raw.system_prompt || content.system_prompt || "",
      profile: raw.profile || content.profile || {},
      lore: content.lore || raw.lore || "",
      world: content.world || raw.world || "",
      world_focus: worldFocus,
      world_modules: worldModules,
      dynamic_prompts: dynamicPrompts,
      actor_mode: actorMode,
      character_status: characterStatus,
      gameplay_ui: gameplayUI && typeof gameplayUI === "object" && !Array.isArray(gameplayUI) ? gameplayUI : null,
      play_info_surface: playInfoSurface === "game-ui" ? "game-ui" : "reader-context",
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
        character_statuses: initial.character_statuses && typeof initial.character_statuses === "object" && !Array.isArray(initial.character_statuses) ? initial.character_statuses : {},
        world_clock: initial.world_clock && typeof initial.world_clock === "object" && !Array.isArray(initial.world_clock)
          ? initial.world_clock
          : (initial.worldClock && typeof initial.worldClock === "object" && !Array.isArray(initial.worldClock) ? initial.worldClock : null)
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
    if (!["general", "male", "female"].includes(c.category)) errors.push("category 必須是 general、male 或 female");
    if (!["general", "adult"].includes(c.rating)) errors.push("rating 必須是 general 或 adult");
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

  mergeNPCs(base = [], runtime = []) {
    const merged = new Map();
    [...(Array.isArray(base) ? base : []), ...(Array.isArray(runtime) ? runtime : [])].forEach(npc => {
      const name = String(npc?.name || "").trim();
      if (!name) return;
      merged.set(name, { ...(merged.get(name) || {}), ...npc, name });
    });
    return [...merged.values()].slice(0, 50);
  },

  npcIndexPrompt(npcs = [], maxChars = 1200) {
    const lines = (Array.isArray(npcs) ? npcs : []).filter(npc => npc?.name).map(npc => {
      const name = String(npc.name).trim();
      const role = String(npc.role || "").trim();
      return role && role !== "NPC" ? `${name}｜${role}` : name;
    });
    const text = lines.join("\n");
    return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
  },

  relevantNPCs(npcs = [], context = {}, limit = 4) {
    const list = Array.isArray(npcs) ? npcs : [];
    if (list.length <= limit) return list.slice(0, limit);
    const hay = this.recentConversationText(context, 4);
    const currentLocation = String(context.currentLocation || "").trim();
    return list.map((npc, index) => {
      const name = String(npc?.name || "").trim();
      const role = String(npc?.role || "").trim();
      const location = String(npc?.location || "").trim();
      let score = 0;
      if (name && hay.includes(name.toLowerCase())) score += 10;
      if (role && role.length >= 2 && hay.includes(role.toLowerCase())) score += 2;
      if (npc?.presence === "present") score += 6;
      if (currentLocation && location && currentLocation === location) score += 4;
      return { npc, score, index };
    }).filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, Math.max(1, Math.min(4, Number(limit) || 4)))
      .map(item => item.npc);
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
      `作品／角色卡主體：${c.name}`,
      `玩家角色：${playerName}（controlled_by=user）`,
      `「${c.name}」代表目前作品／角色卡主體；它可能是一名 AI 主角色，也可能是一個多 NPC 世界，不能因此被視為玩家角色。`,
      `來自 user 的輸入一律視為「${playerName}」的台詞、行動或意圖；不得誤認為是「${c.name}」或其他 AI 人物的輸入。`,
      `AI 可以扮演 controlled_by=assistant 的角色與 NPC，但不能扮演或控制玩家「${playerName}」（controlled_by=user）。`,
      "controlled_by=user 的角色之台詞、心理、決定與行動只能由玩家提供；不得因其出現在「人物／角色／NPC」文字區塊中就改變控制權。",
      "除非忠實引用玩家已輸入的原話，不得生成玩家的新台詞。",
      "角色只能依已知資訊行動，不得無理由獲得玩家未公開的資訊。",
      "玩家資料、開局選項與結構化初始狀態若已提供，視為既定事實；不得要求玩家重新填寫、重新選擇或重演建立流程。",
      "作品名稱、世界名稱、狀態模組與介面標籤不是 NPC；除非作品明確把它設定成世界內人物。"
    ].join("\n"));

    if (c.system_prompt) blocks.push(`【角色核心】\n${c.system_prompt}`);
    if (options.include_profile) {
      const profileText = this.profilePrompt(c.profile);
      if (profileText) blocks.push(`【主要 AI 角色／作品主體設定】\n${profileText}`);
    }
    if (options.include_author_instructions && c.author_instructions) blocks.push(`【作者敘事指示】\n${c.author_instructions}`);
    if (options.include_creator_notes && c.creator_notes) blocks.push(`【作者備註】\n${c.creator_notes}`);
    blocks.push([
      "【玩家 Persona｜controlled_by=user】",
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
      const initialNPCs = Array.isArray(c.initial_state?.npcs) ? c.initial_state.npcs : [];
      const runtimeNPCs = Array.isArray(context.storyNPCs) ? context.storyNPCs : [];
      const mergedNPCs = this.mergeNPCs(initialNPCs, runtimeNPCs);
      const initialNames = new Set(initialNPCs.map(npc => String(npc?.name || "").trim()).filter(Boolean));
      const discoveredNPCs = mergedNPCs.filter(npc => !initialNames.has(String(npc?.name || "").trim()));

      if (initialNPCs.length > 0 && initialNPCs.length <= 4) {
        const npcText = this.npcPrompt(initialNPCs);
        if (npcText) blocks.push(`【重要 NPC｜controlled_by=assistant】\n${npcText}`);
      }

      const useRosterIndex = initialNPCs.length > 4 || discoveredNPCs.length > 0;
      if (useRosterIndex) {
        const roster = this.npcIndexPrompt(initialNPCs.length > 4 ? mergedNPCs : discoveredNPCs);
        if (roster) blocks.push(`【NPC 名冊索引】\n${roster}\n名冊只表示故事中已登記的人物與身分，不代表目前在場，也不改變玩家控制權。`);

        const relevantPool = initialNPCs.length > 4 ? mergedNPCs : discoveredNPCs;
        const relevantNPCs = this.relevantNPCs(relevantPool, context, 4);
        const relevantText = this.npcPrompt(relevantNPCs);
        if (relevantText) blocks.push(`【本輪相關 NPC】\n${relevantText}\n以上皆為 controlled_by=assistant；只在本輪情境相關時使用。`);
      }
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
