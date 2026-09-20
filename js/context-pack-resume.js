(() => {
  if (typeof App === "undefined" || typeof Chat === "undefined" || typeof Storage === "undefined" || typeof API === "undefined" || !window.BAOStoryTools) return;

  const SESSION_KEY = "contextPackDraftResume";
  const VERSION = 1;
  const clone = value => typeof Storage.clone === "function" ? Storage.clone(value) : JSON.parse(JSON.stringify(value));
  const now = () => new Date().toISOString();
  const state = () => GameState.current || null;
  const lineList = value => String(value || "").split(/\r?\n/).map(item => item.trim()).filter(Boolean);

  const normalizeMessages = input => (Array.isArray(input) ? input : []).map(item => {
    if (!item || (item.role !== "user" && item.role !== "assistant")) return null;
    return { role: item.role, content: String(item.content || "") };
  }).filter(Boolean);

  const hashText = value => {
    const text = String(value || "");
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  };

  const fingerprintMessages = input => {
    const messages = normalizeMessages(input);
    let hash = 0x811c9dc5;
    const feed = value => {
      const text = String(value || "");
      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
    };
    messages.forEach(item => {
      feed(item.role);
      feed("\u0000");
      feed(item.content);
      feed("\u0001");
    });
    return hash.toString(16).padStart(8, "0");
  };

  const makeSource = (messages, source = {}) => {
    const list = normalizeMessages(messages);
    const external = source.type === "external" || source.kind === "external";
    const base = {
      kind: external ? "external" : "current-story",
      messageCount: list.length,
      fingerprint: fingerprintMessages(list),
      platform: String(source.platform || (external ? "外部紀錄" : "BAO/LAB")),
      format: String(source.format || "")
    };
    if (external) base.messages = clone(list);
    return base;
  };

  const resolveSource = source => {
    if (!source || typeof source !== "object") return null;
    if (source.kind === "external") {
      const messages = normalizeMessages(source.messages);
      if (messages.length !== Number(source.messageCount || messages.length)) return null;
      if (source.fingerprint && fingerprintMessages(messages) !== source.fingerprint) return null;
      return messages;
    }
    if (source.kind === "current-story") {
      const count = Math.max(0, Number(source.messageCount || 0));
      if (!count || !Array.isArray(Chat.messages) || Chat.messages.length < count) return null;
      const messages = normalizeMessages(Chat.messages.slice(0, count));
      if (messages.length !== count) return null;
      if (source.fingerprint && fingerprintMessages(messages) !== source.fingerprint) return null;
      return messages;
    }
    return null;
  };

  const getSession = () => state()?.[SESSION_KEY] || null;
  const saveStory = () => App.saveStory?.(false);
  const setSession = session => {
    const current = state();
    if (!current) return;
    current[SESSION_KEY] = Object.assign({}, session, { version: VERSION, updatedAt: now() });
    saveStory();
  };
  const clearSession = () => {
    const current = state();
    if (!current) return;
    delete current[SESSION_KEY];
    delete current.contextPackDraftProgress;
    saveStory();
  };

  const beginDraft = (messages, source = {}) => {
    const current = state();
    if (!current) return null;
    const list = normalizeMessages(messages);
    if (!list.length) return null;
    const packSource = Object.assign({}, source, { messageCount: list.length });
    const pack = window.BAOStoryTools.createPack(list, packSource);
    current.contextPackDraft = clone(pack);
    current[SESSION_KEY] = {
      version: VERSION,
      source: makeSource(list, packSource),
      seedPack: clone(pack),
      work: null,
      updatedAt: now()
    };
    delete current.contextPackDraftProgress;
    saveStory();
    return pack;
  };

  const beginCurrentDraft = () => beginDraft(Chat.messages, {
    type: "current-story",
    platform: "BAO/LAB",
    characterId: App.activeCharacter?.id || "",
    characterName: App.activeCharacter?.name || ""
  });

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
    const current = state();
    const next = window.BAOStoryTools.normalizePack(current?.contextPackDraft || {});
    next.title = root.querySelector("[data-title]")?.value.trim() || "未命名劇情摘要包";
    next.summary = root.querySelector("[data-summary]")?.value.trim() || "";
    next.importantEvents = lineList(root.querySelector("[data-events]")?.value);
    next.relationships = lineList(root.querySelector("[data-relations]")?.value);
    next.openThreads = lineList(root.querySelector("[data-threads]")?.value);
    next.characterStatuses = parseObject(root.querySelector("[data-statuses]")?.value, "人物狀態");
    next.worldState = parseObject(root.querySelector("[data-world]")?.value, "世界狀態");
    next.modules = parseObject(root.querySelector("[data-modules]")?.value, "世界模組");
    next.playerConfirmed = false;
    return next;
  };

  const applyPack = (root, input) => {
    const pack = window.BAOStoryTools.normalizePack(input);
    const assign = (selector, value) => { const el = root.querySelector(selector); if (el) el.value = value; };
    assign("[data-title]", pack.title);
    assign("[data-summary]", pack.summary);
    assign("[data-events]", pack.importantEvents.join("\n"));
    assign("[data-relations]", pack.relationships.join("\n"));
    assign("[data-threads]", pack.openThreads.join("\n"));
    assign("[data-statuses]", JSON.stringify(pack.characterStatuses, null, 2));
    assign("[data-world]", JSON.stringify(pack.worldState, null, 2));
    assign("[data-modules]", JSON.stringify(pack.modules, null, 2));
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

  const uniqueLines = values => {
    const seen = new Set();
    return (values || []).map(String).map(item => item.trim()).filter(value => {
      if (!value) return false;
      const key = value.replace(/\s+/g, " ").toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const combineFragmentsLocally = fragments => normalizeFragment({
    summary: (fragments || []).map(item => item?.summary).filter(Boolean).join("\n\n").slice(-50000),
    importantEvents: uniqueLines((fragments || []).flatMap(item => item?.importantEvents || [])),
    relationships: uniqueLines((fragments || []).flatMap(item => item?.relationships || [])),
    characterStatuses: Object.assign({}, ...(fragments || []).map(item => item?.characterStatuses || {})),
    worldState: Object.assign({}, ...(fragments || []).map(item => item?.worldState || {})),
    modules: Object.assign({}, ...(fragments || []).map(item => item?.modules || {})),
    openThreads: uniqueLines((fragments || []).flatMap(item => item?.openThreads || []))
  });

  const packFromFragment = (inputPack, fragment, messages) => {
    const pack = window.BAOStoryTools.normalizePack(inputPack);
    const data = normalizeFragment(fragment);
    const external = pack.source?.type === "external";
    return window.BAOStoryTools.normalizePack(Object.assign({}, pack, {
      summary: data.summary || pack.summary,
      importantEvents: uniqueLines([...(pack.importantEvents || []), ...data.importantEvents]),
      relationships: uniqueLines([...(pack.relationships || []), ...data.relationships]),
      characterStatuses: external ? Object.assign({}, pack.characterStatuses || {}, data.characterStatuses) : Object.assign({}, data.characterStatuses, pack.characterStatuses || {}),
      worldState: external ? Object.assign({}, pack.worldState || {}, data.worldState) : Object.assign({}, data.worldState, pack.worldState || {}),
      modules: external ? Object.assign({}, pack.modules || {}, data.modules) : Object.assign({}, data.modules, pack.modules || {}),
      openThreads: uniqueLines([...(pack.openThreads || []), ...data.openThreads]),
      recentDialogue: normalizeMessages(messages).slice(-12),
      playerConfirmed: false
    }));
  };

  const parseAIJSON = input => {
    const text = String(input || "").replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("整理模型沒有回傳可讀 JSON。");
    return JSON.parse(text.slice(start, end + 1));
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

  const planFingerprint = plan => hashText((plan?.chunks || []).map((chunk, index) => index + ":" + fingerprintMessages(chunk)).join("|"));

  const saveCheckpoint = (seedPack, fragment, messages, session, progress) => {
    const current = state();
    if (!current) return;
    current.contextPackDraft = packFromFragment(seedPack, fragment, messages);
    current.contextPackDraftProgress = Object.assign({ version: 2, updatedAt: now() }, progress || {});
    current[SESSION_KEY] = Object.assign({}, session, { version: VERSION, updatedAt: now() });
    saveStory();
  };

  const organizeDraft = async (pack, inputMessages, onProgress = () => {}, options = {}) => {
    const api = App.config?.api || {};
    if (!api.key) throw new Error("尚未設定連線金鑰（API Key）；重新貼上自己的金鑰後即可從保存進度繼續。");
    const messages = normalizeMessages(inputMessages);
    const plan = window.BAOStoryTools.organizationPlan(messages, options.maxTokens ? { maxTokens: options.maxTokens } : {});
    if (!plan.chunkCount) throw new Error("目前沒有可整理的對話。");

    let session = getSession();
    if (!session) {
      session = {
        version: VERSION,
        source: makeSource(messages, pack?.source || {}),
        seedPack: clone(pack),
        work: null,
        updatedAt: now()
      };
    }
    const fingerprint = planFingerprint(plan);
    let work = session.work;
    if (!work || work.planFingerprint !== fingerprint || Number(work.chunkCount) !== plan.chunkCount) {
      work = {
        version: 1,
        planFingerprint: fingerprint,
        chunkCount: plan.chunkCount,
        mergeCalls: plan.mergeCalls,
        totalCalls: plan.totalCalls,
        fragments: [],
        nextChunk: 0,
        mergeInput: null,
        mergeNext: [],
        mergeIndex: 0,
        mergeLevel: 0,
        mergeCompleted: 0
      };
      session.seedPack = clone(pack);
      session.work = work;
      setSession(session);
    }

    const completedCalls = Math.max(0, Number(work.nextChunk || 0)) + Math.max(0, Number(work.mergeCompleted || 0));
    const remainingCalls = Math.max(0, plan.totalCalls - completedCalls);
    if (!options.skipConfirm) {
      const message = completedCalls
        ? "找到關頁前保存的劇情摘要包（Context Pack）整理進度：已完成 " + completedCalls + "／" + plan.totalCalls + " 次模型呼叫，剩餘約 " + remainingCalls + " 次。要從中斷處繼續嗎？"
        : "將 " + messages.length + " 則訊息分成 " + plan.chunkCount + " 段整理，" + (plan.mergeCalls ? "再進行 " + plan.mergeCalls + " 次分層合併，" : "") + "預計呼叫記憶模型 " + plan.totalCalls + " 次。這會產生字詞用量（Token），要繼續嗎？";
      if (!confirm(message)) return null;
    }

    const config = Object.assign({}, api, { __memoryTask: true, maxOutputTokens: 2200 });
    if (App.config?.memory?.summaryModel) config.model = App.config.memory.summaryModel;
    onProgress({ phase: "plan", chunkCount: plan.chunkCount, mergeCalls: plan.mergeCalls, totalCalls: plan.totalCalls, completedCalls, remainingCalls });

    while (work.nextChunk < plan.chunks.length) {
      const index = work.nextChunk;
      onProgress({ phase: "chunk", current: index + 1, total: plan.chunkCount, totalCalls: plan.totalCalls });
      const fragment = await requestFragment(config, fragmentPrompt(plan.chunks[index], index + 1, plan.chunkCount));
      work.fragments.push(fragment);
      work.nextChunk += 1;
      session.work = work;
      saveCheckpoint(session.seedPack || pack, combineFragmentsLocally(work.fragments), messages, session, {
        phase: "chunk",
        completed: work.nextChunk,
        total: plan.chunkCount,
        mergeCompleted: work.mergeCompleted || 0,
        totalCalls: plan.totalCalls
      });
    }

    if (!work.mergeInput) {
      work.mergeInput = clone(work.fragments);
      work.mergeNext = [];
      work.mergeIndex = 0;
      work.mergeLevel = Math.max(1, Number(work.mergeLevel || 0) + 1);
      session.work = work;
      setSession(session);
    }

    while (work.mergeInput.length > 1) {
      while (work.mergeIndex < work.mergeInput.length) {
        const batch = work.mergeInput.slice(work.mergeIndex, work.mergeIndex + 6);
        work.mergeIndex += batch.length;
        if (batch.length === 1) {
          work.mergeNext.push(batch[0]);
          session.work = work;
          setSession(session);
          continue;
        }
        const callNumber = work.mergeCompleted + 1;
        onProgress({ phase: "merge", current: callNumber, total: plan.mergeCalls, level: work.mergeLevel, totalCalls: plan.totalCalls });
        const merged = await requestFragment(config, mergePrompt(batch));
        work.mergeNext.push(merged);
        work.mergeCompleted += 1;
        session.work = work;
        const partial = combineFragmentsLocally(work.mergeNext.concat(work.mergeInput.slice(work.mergeIndex)));
        saveCheckpoint(session.seedPack || pack, partial, messages, session, {
          phase: "merge",
          completed: work.mergeCompleted,
          total: plan.mergeCalls,
          level: work.mergeLevel,
          chunkCompleted: work.nextChunk,
          totalCalls: plan.totalCalls
        });
      }
      work.mergeInput = clone(work.mergeNext);
      work.mergeNext = [];
      work.mergeIndex = 0;
      if (work.mergeInput.length > 1) work.mergeLevel += 1;
      session.work = work;
      setSession(session);
    }

    const finalFragment = work.mergeInput[0] || work.fragments[0] || combineFragmentsLocally(work.fragments);
    const finalPack = packFromFragment(session.seedPack || pack, finalFragment, messages);
    const current = state();
    if (current) {
      current.contextPackDraft = clone(finalPack);
      delete current.contextPackDraftProgress;
      session.work = null;
      session.seedPack = clone(finalPack);
      current[SESSION_KEY] = Object.assign({}, session, { updatedAt: now() });
      saveStory();
    }
    onProgress({ phase: "done", chunkCount: plan.chunkCount, mergeCalls: plan.mergeCalls, totalCalls: plan.totalCalls });
    return finalPack;
  };

  const resetWorkFromSavedDraft = () => {
    const current = state();
    const session = getSession();
    if (!current || !session || !current.contextPackDraft) return;
    session.work = null;
    session.seedPack = clone(current.contextPackDraft);
    current[SESSION_KEY] = Object.assign({}, session, { updatedAt: now() });
    delete current.contextPackDraftProgress;
    saveStory();
  };

  const enhanceEditor = () => {
    if (typeof document === "undefined") return;
    const root = document.querySelector(".story-tools-backdrop");
    const button = root?.querySelector("[data-ai]");
    if (!root || !button) return;
    const session = getSession();
    const messages = resolveSource(session?.source);
    if (!session || !messages?.length) return;

    button.disabled = false;
    button.title = "來源與整理進度保存在目前故事；關閉頁面後可繼續。";
    const progress = state()?.contextPackDraftProgress;
    if (session.work && (session.work.nextChunk || session.work.mergeCompleted)) button.textContent = "繼續 AI 整理草稿";
    const status = root.querySelector("[data-organize-status]");
    if (status && progress) {
      if (progress.phase === "chunk") status.textContent = "已恢復關頁前進度：分段 " + Number(progress.completed || 0) + "／" + Number(progress.total || 0) + "；可從下一段繼續。";
      if (progress.phase === "merge") status.textContent = "已恢復關頁前進度：合併 " + Number(progress.completed || 0) + "／" + Number(progress.total || 0) + "；可從中斷處繼續。";
    } else if (status && button.dataset.resumeEnhanced !== "1") {
      status.textContent = "整理來源已保存於目前故事；即使關閉頁面，重新開啟後仍可繼續 AI 整理。";
    }
    if (button.dataset.resumeEnhanced === "1") return;
    button.dataset.resumeEnhanced = "1";
    button.onclick = async event => {
      const runButton = event.currentTarget;
      const liveStatus = root.querySelector("[data-organize-status]");
      try {
        const current = state();
        let liveSession = getSession();
        const sourceMessages = resolveSource(liveSession?.source);
        if (!sourceMessages?.length) throw new Error("找不到原本的整理來源；為避免混入其他故事，不會自動改用目前對話。");
        const editorPack = readEditor(root);
        const storedPack = window.BAOStoryTools.normalizePack(current?.contextPackDraft || {});
        if (liveSession?.work && window.BAOStoryTools.confirmationSignature(editorPack) !== window.BAOStoryTools.confirmationSignature(storedPack)) {
          liveSession.work = null;
          liveSession.seedPack = clone(editorPack);
          current.contextPackDraft = clone(editorPack);
          current[SESSION_KEY] = liveSession;
          delete current.contextPackDraftProgress;
          saveStory();
        }
        runButton.disabled = true;
        runButton.textContent = "準備整理…";
        const result = await organizeDraft(editorPack, sourceMessages, progressInfo => {
          if (!runButton.isConnected || !liveStatus) return;
          if (progressInfo.phase === "plan") {
            liveStatus.textContent = progressInfo.completedCalls
              ? "從保存進度繼續；剩餘約 " + progressInfo.remainingCalls + " 次模型呼叫。"
              : "共 " + progressInfo.chunkCount + " 段；預計 " + progressInfo.totalCalls + " 次模型呼叫。";
          }
          if (progressInfo.phase === "chunk") {
            runButton.textContent = "整理 " + progressInfo.current + "／" + progressInfo.total;
            liveStatus.textContent = "正在整理第 " + progressInfo.current + " 段；每完成一段都會保存，可關頁後續跑。";
          }
          if (progressInfo.phase === "merge") {
            runButton.textContent = "合併 " + progressInfo.current + "／" + progressInfo.total;
            liveStatus.textContent = "正在進行第 " + progressInfo.level + " 層合併；合併進度也會保存。";
          }
          if (progressInfo.phase === "done") liveStatus.textContent = "整理完成，請逐項檢查後再按「確認並套用」。";
        });
        if (result) applyPack(root, result);
      } catch (error) {
        if (liveStatus) liveStatus.textContent = "整理中斷；已完成的分段與合併進度仍保存在目前故事，可稍後繼續。";
        alert(error.message || "整理失敗。");
      } finally {
        if (runButton.isConnected) {
          runButton.disabled = false;
          runButton.textContent = getSession()?.work ? "繼續 AI 整理草稿" : "用記憶模型整理草稿";
        }
      }
    };
  };

  let pendingImport = null;
  const watchFile = event => {
    const input = event.target?.closest?.(".story-tools-backdrop [data-file]");
    const file = input?.files?.[0];
    if (!file) return;
    pendingImport = {
      filename: file.name,
      promise: file.text().then(text => window.BAOStoryTools.parseExternalText(text))
    };
  };

  const captureActions = event => {
    const button = event.target?.closest?.(".story-tools-backdrop button");
    if (!button) return;

    if (button.matches("[data-create]")) {
      setTimeout(() => { beginCurrentDraft(); enhanceEditor(); }, 0);
      return;
    }
    if (button.matches("[data-edit-draft]")) {
      setTimeout(enhanceEditor, 0);
      return;
    }
    if (button.matches("[data-save]")) {
      setTimeout(() => { resetWorkFromSavedDraft(); enhanceEditor(); }, 0);
      return;
    }
    if (button.matches("[data-confirm]")) {
      setTimeout(() => {
        if (!state()?.contextPackDraft && state()?.contextPack?.playerConfirmed) clearSession();
      }, 0);
      return;
    }
    if (button.matches("[data-select]") && pendingImport) {
      const select = document.querySelector(".story-tools-backdrop [data-conversation]");
      const index = Number(select?.value || 0);
      const previous = pendingImport;
      pendingImport = {
        filename: previous.filename,
        promise: previous.promise.then(parsed => parsed?.conversations?.[index]?.result || parsed)
      };
      return;
    }
    if (button.matches("[data-continue]") && /確認身分並建立草稿/.test(button.textContent || "") && pendingImport) {
      const selections = [...document.querySelectorAll(".story-tools-backdrop [data-participant-index]")].map(item => item.value);
      const pending = pendingImport;
      pending.promise.then(parsed => {
        if (!parsed || parsed.pack) return;
        const participants = Array.isArray(parsed.report?.participants) ? parsed.report.participants : [];
        if (participants.some((item, index) => !selections[index])) return;
        const assignments = {};
        participants.forEach((item, index) => { assignments[item.name] = selections[index]; });
        const messages = window.BAOStoryTools.resolveImportedMessages(parsed, assignments);
        if (!messages.length) return;
        const source = {
          type: "external",
          platform: pending.filename || parsed.report?.format || "外部紀錄",
          format: parsed.report?.format || "",
          messageCount: messages.length
        };
        setTimeout(() => { beginDraft(messages, source); enhanceEditor(); }, 0);
      }).catch(() => {});
    }
  };

  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("change", watchFile, true);
    document.addEventListener("click", captureActions, true);
  }
  if (typeof MutationObserver !== "undefined" && typeof document !== "undefined" && document.body) {
    new MutationObserver(() => enhanceEditor()).observe(document.body, { childList: true, subtree: true });
  }
  if (typeof setTimeout === "function") setTimeout(enhanceEditor, 0);

  window.BAOContextPackResume = {
    version: VERSION,
    sessionKey: SESSION_KEY,
    fingerprintMessages,
    makeSource,
    resolveSource,
    beginDraft,
    beginCurrentDraft,
    normalizeFragment,
    combineFragmentsLocally,
    planFingerprint,
    organizeDraft,
    enhanceEditor,
    getSession: () => clone(getSession()),
    clearSession
  };
})();
