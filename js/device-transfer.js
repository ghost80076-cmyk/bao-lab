/* Portable, local-first device transfer package. Never includes API credentials. */
(() => {
  if (!window.Storage || typeof CharacterEngine === "undefined") return;
  const SCHEMA = "bao-lab-device-transfer";
  const VERSION = 1;
  const MAX_FILE_BYTES = 100 * 1024 * 1024;

  const redactStrings = value => {
    if (Array.isArray(value)) return value.map(redactStrings);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactStrings(item)]));
    if (typeof value !== "string") return value;
    return value
      .replace(/\bsk-(?:ant-)?[A-Za-z0-9_-]{12,}\b/g, "[REDACTED]")
      .replace(/\bAIza[A-Za-z0-9_-]{20,}\b/g, "[REDACTED]");
  };
  const sanitize = value => redactStrings(Storage.scrubSecrets(Storage.clone ? Storage.clone(value) : structuredClone(value)));

  const settings = () => sanitize({
    player: Storage.localJSON?.("bao-lab:player-settings", {}) || {},
    narrative: Storage.localJSON?.("bao-lab:narrative-settings-v1", {}) || {},
    memorySlots: Storage.localJSON?.("bao-lab:player-memory-slots", []) || []
  });

  const build = async () => {
    await CharacterEngine.readyCustomLibrary?.();
    await CharacterEngine.flushCustomLibrary?.();
    await window.BAOStoryLibrary?.flush?.();
    const storyRecords = window.BAOStoryLibrary ? await BAOStoryLibrary.listStories() : [];
    const stories = [];
    for (const story of storyRecords) stories.push(await BAOStoryBackup.buildBundle(story.storyId));
    const characters = await CharacterEngine.exportCustomLibrary?.() || [];
    return sanitize({
      schema: SCHEMA,
      version: VERSION,
      exportedAt: new Date().toISOString(),
      app: "BAO/LAB",
      characters,
      stories,
      settings: settings()
    });
  };

  const download = async () => {
    const pack = await build();
    const blob = new Blob([JSON.stringify(pack)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `BAO-LAB-裝置搬家包-${new Date().toISOString().slice(0, 10)}.bao.json`;
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return { characters: pack.characters.length, stories: pack.stories.length, bytes: blob.size };
  };

  const validate = input => {
    if (!input || input.schema !== SCHEMA || !Array.isArray(input.characters) || !Array.isArray(input.stories)) {
      throw new Error("這不是有效的 BAO/LAB 裝置搬家包。");
    }
    if (Number(input.version || 0) > VERSION) throw new Error("這份裝置搬家包來自較新的版本，請先更新 BAO/LAB。");
    return sanitize(input);
  };

  const importPack = async file => {
    if (!file || Number(file.size || 0) > MAX_FILE_BYTES) throw new Error("裝置搬家包超過 100 MB，請分開匯出故事或移除大型角色封面。");
    let parsed;
    try { parsed = JSON.parse(await file.text()); }
    catch { throw new Error("裝置搬家包不是有效的 JSON 檔案。"); }
    const pack = validate(parsed);
    await CharacterEngine.importCustomLibrary?.(pack.characters);
    let storyCount = 0;
    for (const bundle of pack.stories) {
      await BAOStoryBackup.importBundle(bundle);
      storyCount += 1;
    }
    Storage.applyPreferences?.(pack.settings || {});
    window.BAORefreshSaveUI?.();
    return { characters: pack.characters.length, stories: storyCount };
  };

  const install = () => {
    const tools = document.querySelector(".character-tools");
    if (!tools || tools.querySelector("[data-device-transfer-export]")) return false;
    const exportButton = document.createElement("button");
    exportButton.type = "button"; exportButton.className = "secondary";
    exportButton.dataset.deviceTransferExport = "true"; exportButton.textContent = "匯出裝置搬家包";
    const importButton = document.createElement("button");
    importButton.type = "button"; importButton.className = "secondary";
    importButton.dataset.deviceTransferImport = "true"; importButton.textContent = "匯入裝置搬家包";
    const picker = document.createElement("input");
    picker.type = "file"; picker.hidden = true; picker.accept = ".json,.bao.json,application/json";
    const status = document.createElement("span"); status.className = "note"; status.style.width = "100%";
    status.textContent = "搬家包包含本機角色、角色封面、故事與偏好設定；不包含連線金鑰（API Key）。";
    exportButton.addEventListener("click", async () => {
      exportButton.disabled = true;
      try {
        const result = await download();
        alert(`裝置搬家包已建立：${result.characters} 張本機角色、${result.stories} 個故事。連線金鑰（API Key）未匯出。`);
      } catch (error) { alert(error.message || "裝置搬家包建立失敗。"); }
      finally { exportButton.disabled = false; }
    });
    importButton.addEventListener("click", () => picker.click());
    picker.addEventListener("change", async () => {
      const file = picker.files?.[0]; if (!file) return;
      if (!confirm("匯入後，同 ID 的本機角色會更新；故事會以新的本機故事加入。要繼續嗎？")) { picker.value = ""; return; }
      importButton.disabled = true;
      try {
        const result = await importPack(file);
        alert(`裝置搬家完成：${result.characters} 張本機角色、${result.stories} 個故事。請重新輸入需要使用的連線金鑰（API Key）。`);
      } catch (error) { alert(error.message || "裝置搬家包匯入失敗。"); }
      finally { importButton.disabled = false; picker.value = ""; }
    });
    tools.append(exportButton, importButton, picker, status);
    return true;
  };

  window.BAODeviceTransfer = { schema: SCHEMA, version: VERSION, build, validate, importPack, download };
  let attempts = 0;
  const timer = setInterval(() => { if (install() || ++attempts >= 80) clearInterval(timer); }, 100);
})();
