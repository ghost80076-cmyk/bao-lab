(() => {
  "use strict";
  if (window.BAOStoryExtensionPack || !window.BAOStoryExtensionPackCore || !window.App) return;

  const core = window.BAOStoryExtensionPackCore;
  const MAX_FILE_BYTES = 1024 * 1024;
  const clone = value => {
    try { return structuredClone(value); }
    catch (_) { return JSON.parse(JSON.stringify(value ?? null)); }
  };

  const currentWorldSettings = () => {
    const modules = window.BAOWorldModules;
    if (!modules || !window.GameState?.current) return null;
    return clone(modules.getCustomization?.(App.activeCharacter) || {});
  };

  const currentTextReplace = () => {
    try { return clone(window.BAOPlayerTextReplace?.get?.() || null); }
    catch (_) { return null; }
  };

  const currentRegex = () => {
    try { return clone(window.BAORegex?.load?.() || null); }
    catch (_) { return null; }
  };

  const buildCurrentPack = () => core.buildPack({
    world: currentWorldSettings(),
    textReplace: currentTextReplace(),
    regex: currentRegex()
  });

  const download = input => {
    const pack = core.sanitizePack(input);
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "yorubay-story-extensions-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return pack;
  };

  const exportCurrent = () => download(buildCurrentPack());

  const readFile = async file => {
    if (!file) throw new Error("請先選擇故事擴充設定包。");
    if (Number(file.size || 0) > MAX_FILE_BYTES) throw new Error("故事擴充設定包不可超過 1 MB。");
    let parsed;
    try { parsed = JSON.parse(await file.text()); }
    catch (_) { throw new Error("設定包不是有效的 JSON 檔案。"); }
    return core.describePack(parsed);
  };

  const selectedSet = selection => {
    if (selection instanceof Set) return selection;
    if (Array.isArray(selection)) return new Set(selection.map(String));
    if (selection && typeof selection === "object") {
      return new Set(Object.entries(selection).filter(([, enabled]) => enabled).map(([id]) => id));
    }
    return new Set();
  };

  const applyWorld = settings => {
    const modules = window.BAOWorldModules;
    if (!modules || !window.GameState?.current) throw new Error("目前故事無法使用世界模組設定。");
    const imported = core.sanitizeWorld(settings);
    const current = modules.getCustomization?.(App.activeCharacter) || {};
    const baseIds = new Set((modules.baseDefinitions?.(App.activeCharacter) || []).map(item => String(item?.id || "")));
    const preservedDisabled = (Array.isArray(current.disabled) ? current.disabled : []).filter(id => baseIds.has(String(id)));
    const preservedOrder = (Array.isArray(current.order) ? current.order : []).filter(id => baseIds.has(String(id)));
    const next = {
      ...imported,
      disabled: [...new Set([...preservedDisabled, ...(imported.disabled || [])])],
      order: [...new Set([...preservedOrder, ...(imported.order || [])])]
    };
    modules.applyCustomization(next, App.activeCharacter);
    App.saveStory?.(false);
    window.BAOWorldModuleUI?.injectTabs?.();
    const activePanel = document.querySelector("#game-ui .ui-tab.active")?.dataset?.panel;
    if (activePanel) App.renderUIPanel?.(activePanel);
    return modules.getCustomization?.(App.activeCharacter) || next;
  };

  const applyTextReplace = settings => {
    if (!window.BAOPlayerTextReplace?.set) throw new Error("文字替換 MOD 仍在載入。");
    return window.BAOPlayerTextReplace.set(core.sanitizeTextReplace(settings));
  };

  const applyRegex = settings => {
    if (!window.BAORegex?.save) throw new Error("玩家 Regex 仍在載入。");
    const saved = window.BAORegex.save(core.sanitizeRegex(settings));
    window.BAORegexChat?.schedule?.();
    return saved;
  };

  const applyPack = (input, selection) => {
    const pack = core.sanitizePack(input);
    const selected = selectedSet(selection);
    if (!selected.size) throw new Error("請至少選擇一類設定再套用。");
    const applied = [];

    if (selected.has("world") && pack.sections.world) {
      applyWorld(pack.sections.world);
      applied.push("世界模組設定");
    }
    if (selected.has("textReplace") && pack.sections.textReplace) {
      applyTextReplace(pack.sections.textReplace);
      applied.push("文字替換 MOD");
    }
    if (selected.has("regex") && pack.sections.regex) {
      applyRegex(pack.sections.regex);
      applied.push("玩家 Regex");
    }
    if (!applied.length) throw new Error("選取的設定在這份設定包中不存在。");

    try {
      window.dispatchEvent(new CustomEvent("bao:story-extension-pack-applied", { detail: { applied: applied.slice() } }));
    } catch (_) {}
    return { pack, applied };
  };

  window.BAOStoryExtensionPack = Object.freeze({
    MAX_FILE_BYTES,
    buildCurrentPack,
    exportCurrent,
    download,
    readFile,
    applyPack
  });
})();
