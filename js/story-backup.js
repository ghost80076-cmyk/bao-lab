(() => {
  if (!window.Storage || !window.BAOStoryLibrary) return;

  const SCHEMA = "bao-lab-story-bundle";
  const VERSION = 1;
  const Library = window.BAOStoryLibrary;
  const clone = value => Storage.clone ? Storage.clone(value) : structuredClone(value);
  const scrub = value => Storage.scrubSecrets ? Storage.scrubSecrets(clone(value)) : clone(value);

  const isBundle = value => Boolean(
    value && typeof value === "object" && value.schema === SCHEMA && Array.isArray(value.chapters)
  );

  const sanitizeCheckpoint = checkpoint => {
    if (!checkpoint || typeof checkpoint !== "object") return null;
    const messageId = String(checkpoint.messageId || "");
    const seq = Number(checkpoint.seq);
    if (!messageId || !Number.isFinite(seq) || seq < 0 || !checkpoint.payload || typeof checkpoint.payload !== "object") return null;
    const payload = scrub(checkpoint.payload);
    payload.config = payload.config && typeof payload.config === "object" ? payload.config : {};
    payload.config.api = Object.assign({}, payload.config.api || {}, { key: "" });
    payload.state = payload.state && typeof payload.state === "object" ? payload.state : {};
    payload.state.config = payload.config;
    payload.chat = payload.chat && typeof payload.chat === "object" ? payload.chat : {};
    delete payload.chat.messages;
    return {
      messageId,
      seq,
      updatedAt: String(checkpoint.updatedAt || new Date().toISOString()),
      payload
    };
  };

  const sanitizeBundle = input => {
    if (!isBundle(input)) throw new Error("這不是有效的 BAO/LAB 完整故事備份。");
    const story = input.story && typeof input.story === "object" ? scrub(input.story) : {};
    const chapters = input.chapters.map((entry, index) => {
      if (!entry || typeof entry !== "object" || !entry.payload) throw new Error(`完整故事備份的第 ${index + 1} 個章節無效。`);
      const payload = Storage.sanitizeImportedStory(entry.payload);
      const lib = payload._library && typeof payload._library === "object" ? payload._library : {};
      const chapterId = String(entry.chapterId || lib.chapterId || "");
      if (!chapterId) throw new Error(`完整故事備份的第 ${index + 1} 個章節缺少 chapterId。`);
      const parentChapterId = String(entry.parentChapterId ?? lib.parentChapterId ?? "");
      return {
        chapterId,
        parentChapterId,
        label: String(entry.label || lib.chapterLabel || payload.label || "章節").slice(0, 100),
        createdAt: String(entry.createdAt || lib.chapterCreatedAt || payload.savedAt || new Date().toISOString()),
        updatedAt: String(entry.updatedAt || payload.savedAt || new Date().toISOString()),
        branchPointMessageId: String(entry.branchPointMessageId ?? lib.branchPointMessageId ?? ""),
        branchPointSeq: Number.isFinite(Number(entry.branchPointSeq ?? lib.branchPointSeq)) ? Number(entry.branchPointSeq ?? lib.branchPointSeq) : -1,
        branchPointPreview: String(entry.branchPointPreview ?? lib.branchPointPreview ?? "").slice(0, 160),
        payload,
        checkpoints: (Array.isArray(entry.checkpoints) ? entry.checkpoints : []).map(sanitizeCheckpoint).filter(Boolean)
      };
    });
    if (!chapters.length) throw new Error("完整故事備份沒有任何章節。");
    const ids = new Set(chapters.map(chapter => chapter.chapterId));
    if (ids.size !== chapters.length) throw new Error("完整故事備份包含重複的 chapterId。");
    return {
      schema: SCHEMA,
      version: Math.max(1, Number(input.version || VERSION)),
      exportedAt: String(input.exportedAt || new Date().toISOString()),
      story,
      activeChapterId: String(input.activeChapterId || story.activeChapterId || chapters[0].chapterId),
      chapters
    };
  };

  const buildBundle = async (storyId = Library.refs().storyId) => {
    const targetStoryId = String(storyId || "");
    if (!targetStoryId) throw new Error("目前沒有可匯出的故事。");
    if (Library.refs().storyId === targetStoryId) Storage.saveStory();
    await Library.flush();
    const records = await Library.allRecords();
    const storyRecord = records.find(record => record.kind === "story" && record.storyId === targetStoryId);
    const chapterRecords = records
      .filter(record => record.kind === "chapter" && record.storyId === targetStoryId)
      .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    if (!storyRecord || !chapterRecords.length) throw new Error("Story Library 找不到這個故事的完整資料。");

    const chapters = [];
    for (const chapter of chapterRecords) {
      const payload = await Library.reconstruct(targetStoryId, chapter.chapterId);
      if (!payload) throw new Error(`無法重建章節「${chapter.label || chapter.chapterId}」。`);
      const checkpoints = records
        .filter(record => record.kind === "checkpoint" && record.storyId === targetStoryId && record.chapterId === chapter.chapterId && record.payload)
        .sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0))
        .map(record => sanitizeCheckpoint(record))
        .filter(Boolean);
      chapters.push({
        chapterId: chapter.chapterId,
        parentChapterId: chapter.parentChapterId || "",
        label: chapter.label || payload._library?.chapterLabel || "章節",
        createdAt: chapter.createdAt || payload._library?.chapterCreatedAt || payload.savedAt,
        updatedAt: chapter.updatedAt || payload.savedAt,
        branchPointMessageId: chapter.branchPointMessageId || "",
        branchPointSeq: Number(chapter.branchPointSeq ?? -1),
        branchPointPreview: chapter.branchPointPreview || "",
        payload: Storage.sanitizeImportedStory(payload),
        checkpoints
      });
    }

    const refs = Library.refs();
    const activeChapterId = refs.storyId === targetStoryId && refs.chapterId
      ? refs.chapterId
      : (storyRecord.activeChapterId || chapters[0].chapterId);
    return scrub({
      schema: SCHEMA,
      version: VERSION,
      exportedAt: new Date().toISOString(),
      story: {
        storyId: targetStoryId,
        title: storyRecord.title || storyRecord.characterName || "未命名故事",
        characterId: storyRecord.characterId || chapters[0].payload.characterId,
        characterName: storyRecord.characterName || chapters[0].payload.characterName,
        createdAt: storyRecord.createdAt || chapters[0].createdAt,
        updatedAt: storyRecord.updatedAt || chapters.at(-1)?.updatedAt || new Date().toISOString(),
        activeChapterId
      },
      activeChapterId,
      chapters
    });
  };

  const importBundle = async input => {
    const bundle = sanitizeBundle(input);
    if (!await Library.open()) throw new Error("Story Library 無法使用，不能匯入完整故事分支。");
    const previousRefs = Library.refs();
    const storyId = Library.id("story");
    const storyCreatedAt = bundle.story.createdAt || new Date().toISOString();
    const chapterMap = {};
    bundle.chapters.forEach(chapter => {
      chapterMap[chapter.chapterId] = Library.id(chapter.parentChapterId ? "branch" : "chapter");
    });

    let importedActive = null;
    try {
      for (const chapter of bundle.chapters) {
        const payload = Storage.sanitizeImportedStory(chapter.payload);
        const chapterId = chapterMap[chapter.chapterId];
        const parentChapterId = chapter.parentChapterId && chapterMap[chapter.parentChapterId]
          ? chapterMap[chapter.parentChapterId]
          : "";
        payload.savedAt = chapter.updatedAt || payload.savedAt || new Date().toISOString();
        payload.label = chapter.label;
        payload._library = {
          storyId,
          chapterId,
          storyCreatedAt,
          chapterCreatedAt: chapter.createdAt || payload.savedAt,
          chapterLabel: chapter.label,
          parentChapterId,
          branchPointMessageId: chapter.branchPointMessageId || "",
          branchPointSeq: Number(chapter.branchPointSeq ?? -1),
          branchPointPreview: chapter.branchPointPreview || ""
        };
        Library.adoptRefs(payload);
        if (!await Library.persist(payload)) throw new Error(`章節「${chapter.label}」寫入 Story Library 失敗。`);

        const messageIds = new Set((payload.chat?.messages || []).map(message => String(message?.id || "")).filter(Boolean));
        const importedCheckpoints = chapter.checkpoints
          .filter(checkpoint => messageIds.has(checkpoint.messageId))
          .map(checkpoint => {
            const checkpointPayload = scrub(checkpoint.payload);
            checkpointPayload.config = checkpointPayload.config && typeof checkpointPayload.config === "object" ? checkpointPayload.config : {};
            checkpointPayload.config.api = Object.assign({}, checkpointPayload.config.api || {}, { key: "" });
            checkpointPayload.state = checkpointPayload.state && typeof checkpointPayload.state === "object" ? checkpointPayload.state : {};
            checkpointPayload.state.config = checkpointPayload.config;
            checkpointPayload.chat = checkpointPayload.chat && typeof checkpointPayload.chat === "object" ? checkpointPayload.chat : {};
            delete checkpointPayload.chat.messages;
            checkpointPayload._library = clone(payload._library);
            return {
              id: "checkpoint:" + storyId + ":" + chapterId + ":" + checkpoint.messageId,
              kind: "checkpoint",
              storyId,
              chapterId,
              messageId: checkpoint.messageId,
              seq: checkpoint.seq,
              updatedAt: checkpoint.updatedAt || payload.savedAt,
              payload: checkpointPayload
            };
          });
        if (importedCheckpoints.length) {
          await Library.transaction("readwrite", store => importedCheckpoints.forEach(record => store.put(record)));
        }
      }

      const desiredOldChapterId = bundle.activeChapterId && chapterMap[bundle.activeChapterId]
        ? bundle.activeChapterId
        : bundle.chapters[0].chapterId;
      const activeChapterId = chapterMap[desiredOldChapterId];
      const records = await Library.allRecords();
      const storyRecord = records.find(record => record.kind === "story" && record.storyId === storyId);
      if (storyRecord) {
        storyRecord.title = String(bundle.story.title || storyRecord.title || "匯入故事").slice(0, 100);
        storyRecord.createdAt = storyCreatedAt;
        storyRecord.updatedAt = bundle.story.updatedAt || new Date().toISOString();
        storyRecord.activeChapterId = activeChapterId;
        await Library.transaction("readwrite", store => store.put(storyRecord));
      }
      importedActive = await Library.reconstruct(storyId, activeChapterId);
      if (!importedActive) throw new Error("完整故事匯入後無法重建目前章節。");
      return {
        storyId,
        chapterId: activeChapterId,
        chapterCount: bundle.chapters.length,
        title: String(bundle.story.title || importedActive.characterName || "匯入故事"),
        chapterMap: clone(chapterMap),
        payload: importedActive
      };
    } catch (error) {
      await Library.deleteStory(storyId).catch?.(() => {});
      throw error;
    } finally {
      if (previousRefs.storyId && previousRefs.chapterId) Library.adoptRefs({ _library: previousRefs });
      else Library.clearRefs();
    }
  };

  const downloadBundle = bundle => {
    const safe = sanitizeBundle(bundle);
    const blob = new Blob([JSON.stringify(safe, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const name = String(safe.story?.title || safe.story?.characterName || "story").replace(/[\\/:*?"<>|]/g, "-");
    anchor.href = url;
    anchor.download = "BAO-LAB-完整故事-" + name + "-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  };

  const exportCurrentStory = async () => {
    const bundle = await buildBundle();
    downloadBundle(bundle);
    return bundle;
  };

  const originalImportFile = Storage.importFile?.bind(Storage);
  if (originalImportFile) {
    Storage.importFile = async file => {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!isBundle(parsed)) return Storage.sanitizeImportedStory(parsed);
      const imported = await importBundle(parsed);
      return imported.payload;
    };
  }

  const installExportButton = () => {
    if (typeof document === "undefined" || document.getElementById("export-story-button")) return;
    const importButton = document.getElementById("import-save-button");
    if (!importButton) return;
    const button = document.createElement("button");
    button.id = "export-story-button";
    button.className = "secondary";
    button.type = "button";
    button.textContent = "完整故事備份";
    button.addEventListener("click", async () => {
      if (!Library.refs().storyId || !Storage.hasStory?.()) { alert("目前沒有可匯出的故事。"); return; }
      const original = button.textContent;
      button.disabled = true;
      button.textContent = "整理完整故事…";
      try {
        const bundle = await exportCurrentStory();
        alert(`完整故事備份已建立，共 ${bundle.chapters.length} 個章節／分支。API Key 不會寫入備份。`);
      } catch (error) {
        alert(error?.message || "完整故事備份失敗。");
      } finally {
        button.disabled = false;
        button.textContent = original;
      }
    });
    importButton.before(button);
  };

  window.BAOStoryBackup = {
    schema: SCHEMA,
    version: VERSION,
    isBundle,
    sanitizeBundle,
    buildBundle,
    importBundle,
    downloadBundle,
    exportCurrentStory
  };

  installExportButton();
})();
