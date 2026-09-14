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

  const organize = async (pack, messages) => {
    const api = App.config?.api || {};
    if (!api.key) throw new Error("尚未設定 API Key；你仍可手動編輯並確認。");
    if (!confirm("這會使用你的記憶模型（若未設定則使用目前模型）並產生 Token 用量。要繼續嗎？")) return null;
    const transcript = messages.slice(-400).map(x => (x.role === "user" ? "玩家" : "AI 角色") + "：" + x.content).join("\n\n").slice(-80000);
    const prompt = [
      "把外部角色扮演紀錄整理成 Context Pack 草稿，只提取原文明確存在的事實。",
      "不得永久推斷玩家心理、喜惡、人格、意圖或未說出口的決定；不確定就留空。",
      "只輸出 JSON：summary 字串、importantEvents 字串陣列、relationships 字串陣列、openThreads 字串陣列。",
      "【現有草稿】\n" + JSON.stringify({
        summary: pack.summary,
        importantEvents: pack.importantEvents,
        relationships: pack.relationships,
        openThreads: pack.openThreads
      }),
      "【外部紀錄】\n" + transcript
    ].join("\n\n");
    const config = Object.assign({}, api, { __memoryTask: true });
    if (App.config?.memory?.summaryModel) config.model = App.config.memory.summaryModel;
    const result = await API.send(config, [
      { role: "system", content: "只整理可驗證的劇情事實，輸出合法 JSON，不續寫故事。" },
      { role: "user", content: prompt }
    ]);
    const data = parseAIJSON(result?.text || "");
    return normalizePack(Object.assign({}, pack, {
      summary: String(data.summary || pack.summary || ""),
      importantEvents: Array.isArray(data.importantEvents) ? data.importantEvents : pack.importantEvents,
      relationships: Array.isArray(data.relationships) ? data.relationships : pack.relationships,
      openThreads: Array.isArray(data.openThreads) ? data.openThreads : pack.openThreads,
      playerConfirmed: false
    }));
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

  const tokenEstimate = value => {
    const text = String(value || "");
    const cjk = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
    return Math.max(1, Math.ceil(cjk + (text.length - cjk) / 4));
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
      '<div class="story-tools-actions"><button class="secondary" type="button" data-ai>用記憶模型整理草稿</button><button class="secondary" type="button" data-download>匯出 Pack</button><button class="secondary" type="button" data-save>保存草稿</button><button class="primary" type="button" data-confirm>確認並套用</button><button class="primary" type="button" data-sequel>建立續篇</button></div></section>';
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
      try {
        button.disabled = true;
        button.textContent = "整理中…";
        const result = await organize(readEditor(host), sourceMessages.length ? sourceMessages : Chat.messages);
        if (result) {
          draft = result;
          editor(host);
        }
      } catch (error) { tell(error.message || "整理失敗。"); }
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
    host.innerHTML = '<div class="story-tools-intro"><div><div class="eyebrow">LOCAL-FIRST STORY DESK</div><h2>故事管理</h2><p>備份、搬家、整理前情與建立續篇都在瀏覽器完成；API Key 永遠不進匯出檔。</p></div><button class="story-tools-close" type="button">關閉</button></div>' +
      '<div class="story-tools-home">' +
      '<section class="story-tools-card"><h3>完整故事備份</h3><p>包含對話、Persona、記憶、Character Status、World State、World Modules、敘事偏好與 Context Pack。</p><div class="story-tools-actions"><button class="primary" type="button" data-export>匯出完整故事</button><button class="secondary" type="button" data-backup>建立本機備份</button><button class="secondary" type="button" data-import>匯入完整故事</button><input hidden type="file" data-story-file accept=".json,application/json"></div></section>' +
      '<section class="story-tools-card"><h3>Context Pack / 建立續篇</h3><p>舊故事只整理成後續真正需要的前情，不持續塞入全部歷史。</p><div class="story-tools-actions"><button class="primary" type="button" data-create>整理目前故事</button>' + (hasPack ? '<button class="secondary" type="button" data-edit>編輯既有 Pack</button>' : '') + '</div></section>' +
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

  window.BAOStoryTools = { open, createPack, normalizePack, confirmationSignature, packPrompt, parseExternalText, preview, startSequel };
  ensureStyles();
  setTimeout(inject, 240);
})();
