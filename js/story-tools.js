(() => {
  if (typeof App === "undefined" || typeof Chat === "undefined" || typeof Storage === "undefined") return;

  const SCHEMA = "bao-lab-context-pack";
  let draft = null;
  let sourceMessages = [];
  const clone = value => Storage.clone(value);
  const uid = () => "pack-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
  const lineList = value => String(value || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const close = () => document.querySelector(".story-tools-backdrop")?.remove();
  const tell = message => alert(message);
  const latestUserText = () => {
    for (let i = Chat.messages.length - 1; i >= 0; i -= 1) {
      if (Chat.messages[i]?.role === "user") return String(Chat.messages[i].content || "");
    }
    return "";
  };

  const ensureStyles = () => {
    if (document.querySelector('link[href="css/story-tools.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/story-tools.css";
    document.head.appendChild(link);
  };

  const message = input => {
    if (!input || typeof input !== "object") return null;
    const raw = String(input.role || input.sender || input.author || "").toLowerCase();
    const role = /assistant|model|ai|bot|character|角色/.test(raw) ? "assistant" : /user|human|player|玩家|使用者/.test(raw) ? "user" : "";
    const content = String(input.content ?? input.text ?? input.message ?? "").trim();
    return role && content ? { role, content } : null;
  };

  const normalizePack = input => {
    const raw = input && typeof input === "object" ? input : {};
    return {
      schema: SCHEMA,
      version: 1,
      id: String(raw.id || uid()),
      createdAt: String(raw.createdAt || new Date().toISOString()),
      title: String(raw.title || ((App.activeCharacter?.name || "故事") + " · Context Pack")),
      source: Object.assign({
        type: "current-story",
        platform: "BAO/LAB",
        characterId: App.activeCharacter?.id || "",
        characterName: App.activeCharacter?.name || "",
        messageCount: 0
      }, raw.source || {}),
      summary: String(raw.summary || ""),
      importantEvents: Array.isArray(raw.importantEvents) ? raw.importantEvents.map(String).filter(Boolean) : [],
      relationships: Array.isArray(raw.relationships) ? raw.relationships.map(String).filter(Boolean) : [],
      characterStatuses: raw.characterStatuses && typeof raw.characterStatuses === "object" ? clone(raw.characterStatuses) : {},
      worldState: raw.worldState && typeof raw.worldState === "object" ? clone(raw.worldState) : {},
      modules: raw.modules && typeof raw.modules === "object" ? clone(raw.modules) : {},
      openThreads: Array.isArray(raw.openThreads) ? raw.openThreads.map(String).filter(Boolean) : [],
      recentDialogue: Array.isArray(raw.recentDialogue) ? raw.recentDialogue.map(message).filter(Boolean).slice(-12) : [],
      playerConfirmed: Boolean(raw.playerConfirmed)
    };
  };

  const confirmationSignature = input => {
    const pack = normalizePack(input);
    return JSON.stringify({
      title: pack.title,
      summary: pack.summary,
      importantEvents: pack.importantEvents,
      relationships: pack.relationships,
      characterStatuses: pack.characterStatuses,
      worldState: pack.worldState,
      modules: pack.modules,
      openThreads: pack.openThreads,
      recentDialogue: pack.recentDialogue
    });
  };

  const createPack = (inputMessages = Chat.messages, source = {}) => {
    const state = GameState.current || {};
    const messages = (Array.isArray(inputMessages) ? inputMessages : []).map(message).filter(Boolean);
    const external = source.type === "external";
    return normalizePack({
      title: (App.activeCharacter?.name || "故事") + (external ? " · 外部紀錄續寫" : " · 新篇章"),
      source: Object.assign({
        type: "current-story",
        platform: "BAO/LAB",
        characterId: App.activeCharacter?.id || "",
        characterName: App.activeCharacter?.name || "",
        messageCount: messages.length
      }, source),
      summary: external ? "已匯入 " + messages.length + " 則外部訊息。請補寫或使用記憶模型整理前情摘要。" : String(Chat.summary || ""),
      importantEvents: clone(state.events || []).slice(-20),
      relationships: (state.npcs || []).filter(x => x?.name && x.relationship != null).map(x => x.name + "：" + x.relationship),
      characterStatuses: clone(state.characterStatuses || {}),
      worldState: {
        time: state.time || "未設定",
        location: state.location || "未設定",
        events: clone(state.events || []),
        npcs: clone(state.npcs || [])
      },
      modules: clone(state.modules || {}),
      openThreads: [],
      recentDialogue: messages.slice(-12),
      playerConfirmed: false
    });
  };

  const packPrompt = input => {
    const pack = normalizePack(input);
    return [
      "【Context Pack · 玩家已確認的前情】",
      pack.summary ? "前情摘要：\n" + pack.summary : "",
      pack.importantEvents.length ? "重要事件：\n- " + pack.importantEvents.join("\n- ") : "",
      pack.relationships.length ? "人物關係：\n- " + pack.relationships.join("\n- ") : "",
      Object.keys(pack.characterStatuses).length ? "人物狀態：\n" + JSON.stringify(pack.characterStatuses) : "",
      Object.keys(pack.worldState).length ? "世界狀態：\n" + JSON.stringify(pack.worldState) : "",
      Object.keys(pack.modules).length ? "背包／技能／任務等世界模組：\n" + JSON.stringify(pack.modules) : "",
      pack.openThreads.length ? "未完成伏筆／目標：\n- " + pack.openThreads.join("\n- ") : "",
      pack.recentDialogue.length ? "最近必要對話：\n" + pack.recentDialogue.map(x => (x.role === "user" ? "玩家" : "AI 角色") + "：" + x.content).join("\n") : "",
      "只把玩家已確認的內容當作既有事實。不得從紀錄永久推斷玩家心理、喜惡、人格、意圖或未說出口的決定。"
    ].filter(Boolean).join("\n\n");
  };

  const parseExternalText = input => {
    const text = String(input || "").trim();
    if (!text) throw new Error("檔案沒有可讀內容。");
    try {
      const json = JSON.parse(text);
      if (json?.schema === SCHEMA) {
        const pack = normalizePack(json);
        pack.playerConfirmed = false;
        return { pack, messages: [] };
      }
      const list = Array.isArray(json) ? json : json?.messages || json?.chat?.messages || json?.conversation || json?.data?.messages;
      if (Array.isArray(list)) {
        const messages = list.map(message).filter(Boolean);
        if (!messages.length) throw new Error("JSON 內找不到 user / assistant 訊息。");
        return { messages };
      }
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      const messages = [];
      let current = null;
      text.split(/\r?\n/).forEach(row => {
        const found = row.match(/^\s*(玩家|使用者|user|human|player|角色|assistant|ai|bot)\s*[:：]\s*(.*)$/i);
        if (found) {
          current = { role: /玩家|使用者|user|human|player/i.test(found[1]) ? "user" : "assistant", content: found[2].trim() };
          if (current.content) messages.push(current);
        } else if (current && row.trim()) {
          current.content += "\n" + row.trim();
        }
      });
      if (messages.length) return { messages };
    }
    throw new Error("無法辨識格式。支援 BAO/LAB JSON、messages JSON，以及「玩家：／角色：」純文字。");
  };

  const parseObject = (value, label) => {
    try {
      const result = JSON.parse(String(value || "{}"));
      if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error();
      return result;
    } catch {
      throw new Error(label + " 必須是合法 JSON 物件。");
    }
  };

  const readEditor = root => {
    const next = normalizePack(draft || {});
    next.title = root.querySelector("[data-title]").value.trim() || "未命名 Context Pack";
    next.summary = root.querySelector("[data-summary]").value.trim();
    next.importantEvents = lineList(root.querySelector("[data-events]").value);
    next.relationships = lineList(root.querySelector("[data-relations]").value);
    next.openThreads = lineList(root.querySelector("[data-threads]").value);
    next.characterStatuses = parseObject(root.querySelector("[data-statuses]").value, "人物狀態");
    next.worldState = parseObject(root.querySelector("[data-world]").value, "世界狀態");
    next.modules = parseObject(root.querySelector("[data-modules]").value, "世界模組");
    return next;
  };

  const download = (value, filename) => {
    const safe = Storage.scrubSecrets(clone(value));
    const blob = new Blob([JSON.stringify(safe, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const parseAIJSON = input => {
    const text = String(input || "").replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("整理模型沒有回傳可讀 JSON。");
    return JSON.parse(text.slice(start, end + 1));
  };

  const tokenEstimate = value => {
    const text = String(value || "");
    const cjk = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
    return Math.max(1, Math.ceil(cjk + (text.length - cjk) / 4));
  };

  const uniqueLines = values => {
    const seen = new Set();
    return (values || []).map(String).map(x => x.trim()).filter(value => {
      if (!value) return false;
      const key = value.replace(/\s+/g, " ").toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const splitMessageText = (value, maxTokens) => {
    let remaining = String(value || "").trim();
    if (!remaining) return [];
    const parts = [];
    while (tokenEstimate(remaining) > maxTokens) {
      let low = 1;
      let high = remaining.length;
      let best = 1;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        if (tokenEstimate(remaining.slice(0, middle)) <= maxTokens) {
          best = middle;
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }
      const candidate = remaining.slice(0, best);
      const floor = Math.floor(best * 0.55);
      const boundary = Math.max(
        candidate.lastIndexOf("\n\n"),
        candidate.lastIndexOf("\n"),
        candidate.lastIndexOf("。"),
        candidate.lastIndexOf("！"),
        candidate.lastIndexOf("？"),
        candidate.lastIndexOf(". ")
      );
      const cut = boundary >= floor ? boundary + 1 : best;
      parts.push(remaining.slice(0, cut).trim());
      remaining = remaining.slice(cut).trim();
    }
    if (remaining) parts.push(remaining);
    return parts;
  };

  const chunkMessages = (inputMessages, options = {}) => {
    const configuredContext = Number(App.config?.memory?.maxContext || 64000);
    const automaticBudget = Math.max(1800, Math.min(24000, Math.floor((Number.isFinite(configuredContext) ? configuredContext : 64000) * 0.35)));
    const explicitBudget = Number(options.maxTokens);
    const maxTokens = Number.isFinite(explicitBudget) && explicitBudget > 0 ? Math.max(32, Math.floor(explicitBudget)) : automaticBudget;
    const messages = (Array.isArray(inputMessages) ? inputMessages : []).map(message).filter(Boolean);
    if (!messages.length) return [];

    const turns = [];
    let turn = [];
    messages.forEach(item => {
      if (item.role === "user" && turn.length) {
        turns.push(turn);
        turn = [];
      }
      turn.push(item);
    });
    if (turn.length) turns.push(turn);

    const chunks = [];
    let current = [];
    let currentTokens = 0;
    const flush = () => {
      if (!current.length) return;
      chunks.push(current);
      current = [];
      currentTokens = 0;
    };
    const append = items => {
      const cost = items.reduce((sum, item) => sum + tokenEstimate(item.content) + 8, 0);
      if (current.length && currentTokens + cost > maxTokens) flush();
      current.push(...items);
      currentTokens += cost;
    };

    turns.forEach(items => {
      const turnCost = items.reduce((sum, item) => sum + tokenEstimate(item.content) + 8, 0);
      if (turnCost <= maxTokens) {
        append(items);
        return;
      }
      items.forEach(item => {
        splitMessageText(item.content, Math.max(32, maxTokens - 8)).forEach(part => append([{ role: item.role, content: part }]));
      });
    });
    flush();
    return chunks;
  };

  const mergeCallCount = (chunkCount, batchSize = 6) => {
    const size = Math.max(2, Math.floor(Number(batchSize || 6)));
    let remaining = Math.max(0, Number(chunkCount || 0));
    let calls = 0;
    while (remaining > 1) {
      const full = Math.floor(remaining / size);
      const tail = remaining % size;
      const levelCalls = full + (tail > 1 ? 1 : 0);
      calls += levelCalls;
      remaining = levelCalls + (tail === 1 ? 1 : 0);
    }
    return calls;
  };

  const organizationPlan = (messages, options = {}) => {
    const chunks = chunkMessages(messages, options);
    const mergeCalls = mergeCallCount(chunks.length);
    return {
      chunks,
      chunkCount: chunks.length,
      mergeCalls,
      totalCalls: chunks.length + mergeCalls,
      estimatedInputTokens: chunks.reduce((sum, chunk) => sum + chunk.reduce((inner, item) => inner + tokenEstimate(item.content), 0), 0)
    };
  };

  const normalizeFragment = input => {
    const raw = input && typeof input === "object" ? input : {};
    return {
      summary: String(raw.summary || ""),
      importantEvents: Array.isArray(raw.importantEvents) ? raw.importantEvents.map(String).filter(Boolean) : [],
      relationships: Array.isArray(raw.relationships) ? raw.relationships.map(String).filter(Boolean) : [],
      characterStatuses: raw.characterStatuses && typeof raw.characterStatuses === "object" && !Array.isArray(raw.characterStatuses) ? clone(raw.characterStatuses) : {},
      worldState: raw.worldState && typeof raw.worldState === "object" && !Array.isArray(raw.worldState) ? clone(raw.worldState) : {},
      modules: raw.modules && typeof raw.modules === "object" && !Array.isArray(raw.modules) ? clone(raw.modules) : {},
      openThreads: Array.isArray(raw.openThreads) ? raw.openThreads.map(String).filter(Boolean) : []
    };
  };

  const combineFragmentsLocally = fragments => normalizeFragment({
    summary: fragments.map(item => item.summary).filter(Boolean).join("\n\n").slice(-50000),
    importantEvents: uniqueLines(fragments.flatMap(item => item.importantEvents || [])),
    relationships: uniqueLines(fragments.flatMap(item => item.relationships || [])),
    characterStatuses: Object.assign({}, ...fragments.map(item => item.characterStatuses || {})),
    worldState: Object.assign({}, ...fragments.map(item => item.worldState || {})),
    modules: Object.assign({}, ...fragments.map(item => item.modules || {})),
    openThreads: uniqueLines(fragments.flatMap(item => item.openThreads || []))
  });

  const packFromFragment = (inputPack, fragment, messages) => {
    const pack = normalizePack(inputPack);
    const data = normalizeFragment(fragment);
    const external = pack.source?.type === "external";
    return normalizePack(Object.assign({}, pack, {
      summary: data.summary || pack.summary,
      importantEvents: uniqueLines([...(pack.importantEvents || []), ...data.importantEvents]),
      relationships: uniqueLines([...(pack.relationships || []), ...data.relationships]),
      characterStatuses: external
        ? Object.assign({}, pack.characterStatuses || {}, data.characterStatuses)
        : Object.assign({}, data.characterStatuses, pack.characterStatuses || {}),
      worldState: external
        ? Object.assign({}, pack.worldState || {}, data.worldState)
        : Object.assign({}, data.worldState, pack.worldState || {}),
      modules: external
        ? Object.assign({}, pack.modules || {}, data.modules)
        : Object.assign({}, data.modules, pack.modules || {}),
      openThreads: uniqueLines([...(pack.openThreads || []), ...data.openThreads]),
      recentDialogue: (messages || []).slice(-12),
      playerConfirmed: false
    }));
  };

  const saveDraftCheckpoint = (pack, fragment, messages, progress) => {
    if (!GameState.current) return;
    GameState.current.contextPackDraft = packFromFragment(pack, fragment, messages);
    GameState.current.contextPackDraftProgress = Object.assign({
      updatedAt: new Date().toISOString()
    }, progress || {});
    App.saveStory(false);
  };

  const fragmentPrompt = (chunk, index, total) => [
    "把這一段角色扮演紀錄整理成 Context Pack 的局部草稿。這是第 " + index + "／" + total + " 段，必須只提取原文明確存在的事實。",
    "不得推斷玩家心理、喜惡、人格、意圖或未說出口的決定。不確定、互相矛盾或尚未證實的內容放入 openThreads，不可擅自裁決。",
    "事件保留時間順序；人物狀態、世界狀態、背包、技能與任務只記錄此段明確出現的變化。",
    "只輸出合法 JSON，欄位必須是：summary 字串、importantEvents 字串陣列、relationships 字串陣列、characterStatuses 物件、worldState 物件、modules 物件、openThreads 字串陣列。",
    "【本段紀錄】\n" + chunk.map(item => (item.role === "user" ? "玩家" : "AI 角色") + "：" + item.content).join("\n\n")
  ].join("\n\n");

  const mergePrompt = fragments => [
    "將以下依時間排序的 Context Pack 局部草稿合併成一份較精簡的草稿。",
    "去除重複事件但保留因果與時間順序；狀態衝突時只在原文能判斷先後的情況下採用較新的明確狀態，否則寫入 openThreads。",
    "不得新增原文沒有的事實，不得推斷玩家心理、喜惡、人格、意圖或未說出口的決定。",
    "只輸出合法 JSON，欄位必須是：summary 字串、importantEvents 字串陣列、relationships 字串陣列、characterStatuses 物件、worldState 物件、modules 物件、openThreads 字串陣列。",
    "【待合併草稿】\n" + JSON.stringify(fragments)
  ].join("\n\n");

  const requestFragment = async (config, prompt) => {
    const result = await API.send(config, [
      { role: "system", content: "只整理可驗證的劇情事實，輸出合法 JSON，不續寫故事。" },
      { role: "user", content: prompt }
    ]);
    return normalizeFragment(parseAIJSON(result?.text || ""));
  };

  const organize = async (pack, messages, onProgress = () => {}) => {
    const api = App.config?.api || {};
    if (!api.key) throw new Error("尚未設定 API Key；你仍可手動編輯並確認。");
    const plan = organizationPlan(messages);
    if (!plan.chunkCount) throw new Error("目前沒有可整理的對話。");
    const accepted = confirm(
      "將 " + messages.length + " 則訊息分成 " + plan.chunkCount + " 段整理，" +
      (plan.mergeCalls ? "再進行 " + plan.mergeCalls + " 次分層合併，" : "") +
      "預計呼叫記憶模型 " + plan.totalCalls + " 次。這會產生 Token 用量，要繼續嗎？"
    );
    if (!accepted) return null;

    const config = Object.assign({}, api, { __memoryTask: true, maxOutputTokens: 2200 });
    if (App.config?.memory?.summaryModel) config.model = App.config.memory.summaryModel;
    onProgress({ phase: "plan", chunkCount: plan.chunkCount, mergeCalls: plan.mergeCalls, totalCalls: plan.totalCalls });

    const fragments = [];
    for (let index = 0; index < plan.chunks.length; index += 1) {
      onProgress({ phase: "chunk", current: index + 1, total: plan.chunkCount, totalCalls: plan.totalCalls });
      fragments.push(await requestFragment(config, fragmentPrompt(plan.chunks[index], index + 1, plan.chunkCount)));
      saveDraftCheckpoint(pack, combineFragmentsLocally(fragments), messages, {
        phase: "chunk",
        completed: index + 1,
        total: plan.chunkCount
      });
    }

    let level = fragments;
    let mergeCompleted = 0;
    let mergeLevel = 0;
    while (level.length > 1) {
      mergeLevel += 1;
      const next = [];
      for (let index = 0; index < level.length; index += 6) {
        const batch = level.slice(index, index + 6);
        if (batch.length === 1) {
          next.push(batch[0]);
          continue;
        }
        mergeCompleted += 1;
        onProgress({ phase: "merge", current: mergeCompleted, total: plan.mergeCalls, level: mergeLevel, totalCalls: plan.totalCalls });
        next.push(await requestFragment(config, mergePrompt(batch)));
        saveDraftCheckpoint(pack, combineFragmentsLocally(next.concat(level.slice(index + batch.length))), messages, {
          phase: "merge",
          completed: mergeCompleted,
          total: plan.mergeCalls,
          level: mergeLevel
        });
      }
      level = next;
    }

    const finalPack = packFromFragment(pack, level[0] || combineFragmentsLocally(fragments), messages);
    if (GameState.current) {
      GameState.current.contextPackDraft = clone(finalPack);
      delete GameState.current.contextPackDraftProgress;
      App.saveStory(false);
    }
    onProgress({ phase: "done", chunkCount: plan.chunkCount, mergeCalls: plan.mergeCalls, totalCalls: plan.totalCalls });
    return finalPack;
  };

  const startSequel = input => {
    const pack = normalizePack(input);
    if (!pack.playerConfirmed) return tell("請先確認 Context Pack，再建立續篇。");
    if (!confirm("會先建立「續篇前備份」，再清空目前對話並開啟新篇章。要繼續嗎？")) return;
    Storage.saveSlot((App.activeCharacter?.name || "故事") + " · 續篇前備份");
    const previous = clone(GameState.current || {});
    const config = App.config;
    Chat.reset();
    GameState.create(App.activeCharacter, config);
    const state = GameState.current;
    state.contextPack = clone(pack);
    state.characterStatusCustomization = clone(previous.characterStatusCustomization || null);
    state.worldModuleCustomization = clone(previous.worldModuleCustomization || null);
    window.BAOCharacterStatus?.ensureState?.(App.activeCharacter);
    window.BAOWorldModules?.ensureState?.(App.activeCharacter);
    const world = pack.worldState || {};
    if (world.time != null) state.time = world.time;
    if (world.location != null) state.location = world.location;
    if (Array.isArray(world.events)) state.events = clone(world.events);
    if (Array.isArray(world.npcs)) state.npcs = clone(world.npcs);
    if (Object.keys(pack.characterStatuses).length) state.characterStatuses = clone(pack.characterStatuses);
    if (Object.keys(pack.modules).length) state.modules = Object.assign({}, state.modules || {}, clone(pack.modules));
    Chat.summary = "";
    Chat.summarizedUntil = 0;
    App.renderChatShell(true);
    App.showView("chat");
    App.saveStory(false);
    close();
    tell("新篇章已建立；舊故事已放進手動存檔，Context Pack 已成為續篇前情。");
  };

  const preview = () => {
    const state = GameState.current || {};
    const viewedCharacter = state.uiContextCharacter;
    const viewedModule = state.uiContextModule;
    const lastRelevant = clone(state.lastRelevantModules || []);
    let systemPrompt = "";
    try { systemPrompt = App.buildSystemPrompt(); }
    finally {
      state.uiContextCharacter = viewedCharacter;
      state.uiContextModule = viewedModule;
      state.lastRelevantModules = lastRelevant;
    }
    const mode = App.config?.memory?.mode || "rounds";
    const configured = Math.max(1, Number(App.config?.memory?.maxRounds || 20));
    let rounds = Number(Chat.contextGuard?.recentRounds || configured);
    if (!Number.isFinite(rounds) || rounds < 1) rounds = configured;
    const memoryMessages = [];
    if (mode === "smart" && Chat.summary) memoryMessages.push({ role: "system", content: "【長期記憶摘要】\n" + Chat.summary });
    memoryMessages.push(...(mode === "full" ? clone(Chat.messages) : clone(Chat.messages.slice(-rounds * 2))));
    const manualMemory = (window.BAOMemoryWorkbench?.readSlots?.() || []).filter(x => x.enabled && String(x.text || "").trim());
    const status = window.BAOCharacterStatus?.compactForPrompt?.(latestUserText(), { maxCharacters: 2, maxChars: 1400, consumeViewed: false }) || { text: "", names: [] };
    const core = window.BAOWorldModules?.compactForPrompt?.() || "";
    const relevant = window.BAOWorldModules?.compactRelevantForPrompt?.(latestUserText(), { maxModules: 3, maxChars: 2200, consumeViewed: false }) || { text: "", ids: [] };
    const sections = {
      "角色卡": Storage.scrubSecrets(clone(App.activeCharacter || {})),
      "手動記憶": manualMemory,
      "Character Status": status,
      "Relevant Modules": { core, relevant },
      "世界狀態": {
        time: state.time,
        location: state.location,
        events: clone(state.events || []),
        npcs: clone(state.npcs || [])
      },
      "Persona": Storage.scrubSecrets(clone(App.config?.persona || {})),
      "敘事偏好": clone(App.config?.narrative || window.BAONarrativeSettings?.get?.() || {}),
      "Context Pack": clone(state.contextPack || null)
    };
    return {
      systemPrompt,
      memoryMessages,
      sections,
      mode,
      rounds,
      estimatedTokens: tokenEstimate(systemPrompt + JSON.stringify(memoryMessages))
    };
  };

  const editor = host => {
    const pack = normalizePack(draft || createPack());
    draft = pack;
    host.innerHTML = '<div class="story-tools-toolbar"><button class="secondary" type="button" data-back>← 返回</button><span class="story-tools-pill">' + (pack.playerConfirmed ? "已確認" : "待玩家確認") + '</span></div>' +
      '<section class="story-tools-card"><h3>Context Pack 編輯與確認</h3><p>未確認草稿不會成為續篇事實。人物心理、喜惡與意圖必須由玩家明確確認。</p>' +
      '<label>標題<input data-title maxlength="120"></label><label>前情摘要<textarea data-summary rows="7"></textarea></label>' +
      '<div class="story-tools-grid"><label>重要事件（每行一項）<textarea data-events rows="7"></textarea></label><label>人物關係（每行一項）<textarea data-relations rows="7"></textarea></label></div>' +
      '<label>未完成伏筆／目標（每行一項）<textarea data-threads rows="5"></textarea></label>' +
      '<details><summary>人物狀態 JSON</summary><textarea class="story-json" data-statuses rows="8"></textarea></details>' +
      '<details><summary>世界狀態 JSON</summary><textarea class="story-json" data-world rows="8"></textarea></details>' +
      '<details><summary>背包／技能／任務等世界模組 JSON</summary><textarea class="story-json" data-modules rows="10"></textarea></details>' +
      '<details open><summary>最近必要對話（最多 12 則）</summary><div class="story-dialogue" data-dialogue></div></details>' +
      '<div class="story-tools-actions"><button class="secondary" type="button" data-ai>用記憶模型整理草稿</button><button class="secondary" type="button" data-download>匯出 Pack</button><button class="secondary" type="button" data-save>保存草稿</button><button class="primary" type="button" data-confirm>確認並套用</button><button class="primary" type="button" data-sequel>建立續篇</button></div><div class="story-organize-status" data-organize-status aria-live="polite"></div></section>';
    host.querySelector("[data-title]").value = pack.title;
    host.querySelector("[data-summary]").value = pack.summary;
    host.querySelector("[data-events]").value = pack.importantEvents.join("\n");
    host.querySelector("[data-relations]").value = pack.relationships.join("\n");
    host.querySelector("[data-threads]").value = pack.openThreads.join("\n");
    host.querySelector("[data-statuses]").value = JSON.stringify(pack.characterStatuses, null, 2);
    host.querySelector("[data-world]").value = JSON.stringify(pack.worldState, null, 2);
    host.querySelector("[data-modules]").value = JSON.stringify(pack.modules, null, 2);
    pack.recentDialogue.forEach(item => {
      const row = document.createElement("div");
      const name = document.createElement("b");
      const body = document.createElement("span");
      name.textContent = item.role === "user" ? (App.config?.persona?.name || "玩家") : (App.activeCharacter?.name || "AI 角色");
      body.textContent = item.content;
      row.append(name, body);
      host.querySelector("[data-dialogue]").appendChild(row);
    });
    host.querySelector("[data-back]").onclick = () => home(host);
    host.querySelector("[data-save]").onclick = () => {
      try {
        draft = readEditor(host);
        draft.playerConfirmed = false;
        GameState.current.contextPackDraft = clone(draft);
        delete GameState.current.contextPackDraftProgress;
        App.saveStory(false);
        tell("Context Pack 草稿已保存到目前故事。");
        editor(host);
      } catch (error) { tell(error.message); }
    };
    host.querySelector("[data-confirm]").onclick = () => {
      try {
        draft = readEditor(host);
        draft.playerConfirmed = true;
        GameState.current.contextPack = clone(draft);
        delete GameState.current.contextPackDraft;
        delete GameState.current.contextPackDraftProgress;
        App.saveStory(false);
        tell("Context Pack 已由玩家確認並套用。");
        editor(host);
      } catch (error) { tell(error.message); }
    };
    host.querySelector("[data-download]").onclick = () => {
      try { download(readEditor(host), "BAO-LAB-Context-Pack-" + new Date().toISOString().slice(0, 10) + ".json"); }
      catch (error) { tell(error.message); }
    };
    host.querySelector("[data-sequel]").onclick = () => {
      try {
        const next = readEditor(host);
        next.playerConfirmed = Boolean(draft?.playerConfirmed && confirmationSignature(next) === confirmationSignature(draft));
        startSequel(next);
      } catch (error) { tell(error.message); }
    };
    host.querySelector("[data-ai]").onclick = async event => {
      const button = event.currentTarget;
      const status = host.querySelector("[data-organize-status]");
      try {
        button.disabled = true;
        button.textContent = "準備整理…";
        const result = await organize(readEditor(host), sourceMessages.length ? sourceMessages : Chat.messages, progress => {
          if (!button.isConnected || !status) return;
          if (progress.phase === "plan") status.textContent = "共 " + progress.chunkCount + " 段；預計 " + progress.totalCalls + " 次模型呼叫。";
          if (progress.phase === "chunk") {
            button.textContent = "整理 " + progress.current + "／" + progress.total;
            status.textContent = "正在整理第 " + progress.current + " 段，共 " + progress.total + " 段；途中草稿會保存在目前故事。";
          }
          if (progress.phase === "merge") {
            button.textContent = "合併 " + progress.current + "／" + progress.total;
            status.textContent = "正在進行第 " + progress.level + " 層合併；未確認內容不會成為故事事實。";
          }
          if (progress.phase === "done") status.textContent = "整理完成，請逐項檢查後再按「確認並套用」。";
        });
        if (result) {
          draft = result;
          editor(host);
        }
      } catch (error) {
        if (status) status.textContent = "整理中斷；已完成的途中草稿仍保存在目前故事。";
        tell(error.message || "整理失敗。");
      }
      finally {
        if (button.isConnected) {
          button.disabled = false;
          button.textContent = "用記憶模型整理草稿";
        }
      }
    };
  };

  const previewScreen = host => {
    const data = preview();
    host.innerHTML = '<div class="story-tools-toolbar"><button class="secondary" type="button" data-back>← 返回</button><span class="story-tools-pill">約 ' + data.estimatedTokens.toLocaleString() + ' tokens</span></div>' +
      '<section class="story-tools-card"><h3>Context 預覽器</h3><p>依目前狀態建立，不呼叫模型。智慧記憶若在真正送出前觸發新摘要，實際內容可能略有變動。</p>' +
      '<div class="story-preview-meta">記憶模式：' + App.escapeHTML(data.mode) + ' · 近期保留：約 ' + data.rounds + ' 輪 · API Key：不顯示</div>' +
      '<details open><summary>實際 System Prompt</summary><textarea data-system rows="14" readonly></textarea></details>' +
      '<details open><summary>記憶與近期對話</summary><textarea data-memory rows="14" readonly></textarea></details><div data-sections></div></section>';
    host.querySelector("[data-system]").value = data.systemPrompt;
    host.querySelector("[data-memory]").value = JSON.stringify(data.memoryMessages, null, 2);
    Object.entries(data.sections).forEach(([label, value]) => {
      const detail = document.createElement("details");
      const summary = document.createElement("summary");
      const area = document.createElement("textarea");
      summary.textContent = label;
      area.readOnly = true;
      area.rows = 9;
      area.value = typeof value === "string" ? value : JSON.stringify(value, null, 2);
      detail.append(summary, area);
      host.querySelector("[data-sections]").appendChild(detail);
    });
    host.querySelector("[data-back]").onclick = () => home(host);
  };

  const importScreen = host => {
    host.innerHTML = '<div class="story-tools-toolbar"><button class="secondary" type="button" data-back>← 返回</button></div>' +
      '<section class="story-tools-card"><h3>外部聊天歷史匯入</h3><p>支援 BAO/LAB JSON、messages JSON，以及「玩家：／角色：」純文字。匯入只會建立 Context Pack 草稿，不會把幾百輪直接塞進主模型。</p>' +
      '<input type="file" data-file accept=".json,.txt,application/json,text/plain"><div class="story-import-note">草稿必須由玩家確認；系統不會自行永久判定玩家討厭誰、喜歡誰或想做什麼。</div></section>';
    host.querySelector("[data-back]").onclick = () => home(host);
    host.querySelector("[data-file]").onchange = async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const parsed = parseExternalText(await file.text());
        sourceMessages = parsed.messages || [];
        draft = parsed.pack || createPack(sourceMessages, { type: "external", platform: file.name, messageCount: sourceMessages.length });
        editor(host);
      } catch (error) { tell(error.message || "匯入失敗。"); }
    };
  };

  const home = host => {
    const hasPack = Boolean(GameState.current?.contextPack);
    const hasDraft = Boolean(GameState.current?.contextPackDraft);
    const storageMode = Storage.status?.().mode === "indexedDB" ? "IndexedDB" : "localStorage fallback";
    host.innerHTML = '<div class="story-tools-intro"><div><div class="eyebrow">LOCAL-FIRST STORY DESK</div><h2>故事管理</h2><p>備份、搬家、整理前情與建立續篇都在瀏覽器完成；API Key 永遠不進匯出檔。</p><div class="story-preview-meta">故事儲存：' + storageMode + '</div></div><button class="story-tools-close" type="button">關閉</button></div>' +
      '<div class="story-tools-home">' +
      '<section class="story-tools-card"><h3>完整故事備份</h3><p>包含對話、Persona、記憶、Character Status、World State、World Modules、敘事偏好與 Context Pack。</p><div class="story-tools-actions"><button class="primary" type="button" data-export>匯出完整故事</button><button class="secondary" type="button" data-backup>建立本機備份</button><button class="secondary" type="button" data-import>匯入完整故事</button><input hidden type="file" data-story-file accept=".json,application/json"></div></section>' +
      '<section class="story-tools-card"><h3>Context Pack / 建立續篇</h3><p>超長故事會依完整對話輪次分段整理，再分層合併成可由玩家確認的前情。</p><div class="story-tools-actions"><button class="primary" type="button" data-create>整理目前故事</button>' + (hasDraft ? '<button class="secondary" type="button" data-edit-draft>繼續未確認草稿</button>' : '') + (hasPack ? '<button class="secondary" type="button" data-edit>編輯既有 Pack</button>' : '') + '</div></section>' +
      '<section class="story-tools-card"><h3>外部聊天歷史</h3><p>先轉成可檢查的 Context Pack，再由玩家確認。</p><button class="secondary" type="button" data-external>匯入外部紀錄</button></section>' +
      '<section class="story-tools-card"><h3>Context 預覽器</h3><p>查看下一輪實際使用的角色卡、記憶、狀態、模組、Persona 與敘事偏好。</p><button class="secondary" type="button" data-preview>預覽送出內容</button></section></div>';
    host.querySelector(".story-tools-close").onclick = close;
    host.querySelector("[data-export]").onclick = () => {
      if (!Storage.exportCurrentStory("完整故事備份")) tell("目前沒有可匯出的故事。");
    };
    host.querySelector("[data-backup]").onclick = () => {
      tell(Storage.saveSlot((App.activeCharacter?.name || "故事") + " · 完整備份") ? "已建立本機手動備份。" : "目前沒有可備份的故事。");
    };
    const picker = host.querySelector("[data-story-file]");
    host.querySelector("[data-import]").onclick = () => picker.click();
    picker.onchange = async () => {
      const file = picker.files?.[0];
      if (!file) return;
      try {
        Storage.importSlot(await Storage.importFile(file));
        window.BAORefreshSaveUI?.();
        tell("完整故事已匯入手動存檔；API Key 已清除。可從首頁存檔列表讀取。");
      } catch (error) { tell(error.message || "匯入失敗。"); }
      finally { picker.value = ""; }
    };
    host.querySelector("[data-create]").onclick = () => {
      sourceMessages = clone(Chat.messages);
      draft = createPack(Chat.messages);
      editor(host);
    };
    host.querySelector("[data-edit-draft]")?.addEventListener("click", () => {
      sourceMessages = clone(Chat.messages);
      draft = normalizePack(GameState.current.contextPackDraft);
      editor(host);
    });
    host.querySelector("[data-edit]")?.addEventListener("click", () => {
      sourceMessages = clone(Chat.messages);
      draft = normalizePack(GameState.current.contextPack);
      editor(host);
    });
    host.querySelector("[data-external]").onclick = () => importScreen(host);
    host.querySelector("[data-preview]").onclick = () => previewScreen(host);
  };

  const open = () => {
    if (!App.activeCharacter || !GameState.current) return tell("請先開始或讀取一個故事。");
    ensureStyles();
    close();
    const wrap = document.createElement("div");
    wrap.className = "story-tools-backdrop";
    wrap.innerHTML = '<section class="story-tools-modal"><div class="story-tools-main"></div></section>';
    document.body.appendChild(wrap);
    wrap.addEventListener("click", event => { if (event.target === wrap) close(); });
    home(wrap.querySelector(".story-tools-main"));
  };

  const inject = () => {
    const row = document.getElementById("bao-player-settings");
    if (!row || row.querySelector("[data-bao-open='story-tools']")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary";
    button.dataset.baoOpen = "story-tools";
    button.textContent = "▤ 故事管理";
    button.onclick = open;
    row.appendChild(button);
  };

  const originalBuild = App.buildSystemPrompt.bind(App);
  App.buildSystemPrompt = function() {
    const base = originalBuild();
    const pack = GameState.current?.contextPack;
    return pack?.playerConfirmed ? base + "\n\n" + packPrompt(pack) : base;
  };

  const originalRender = App.renderChatShell.bind(App);
  App.renderChatShell = function(fresh = false) {
    originalRender(fresh);
    setTimeout(inject, 0);
  };

  window.BAOStoryTools = { open, createPack, normalizePack, confirmationSignature, packPrompt, parseExternalText, preview, startSequel, chunkMessages, organizationPlan, mergeCallCount, tokenEstimate };
  ensureStyles();
  setTimeout(inject, 240);
})();
