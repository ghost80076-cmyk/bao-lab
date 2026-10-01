(() => {
  if (typeof App === "undefined" || typeof Chat === "undefined") return;

  const SETTINGS_KEY = "bao-lab:player-settings";
  const MEMORY_KEY = "bao-lab:player-memory-slots";
  const APPEARANCE_V2_KEY = "bao-lab:night-reading-appearance-v2";
  const legacyAppearance = { fontSize: 16, bgMode: "solid", customBg: "", bgOpacity: 12, bgBlur: 0, assistantColor: "#171b24", userColor: "#242a37", bubbleOpacity: 100 };
  const defaults = {
    replyLength: "auto",
    pov: "card",
    dialogueFormat: "card",
    language: "zh-Hant",
    autoMemory: true,
    demoMode: false,
    appearance: {
      fontSize: 16,
      fontFamily: "system",
      bgMode: "character",
      customBg: "",
      bgOpacity: 34,
      bgBlur: 6,
      bubblePreset: "night",
      assistantColor: "#171b24",
      assistantTextColor: "#e8e2d7",
      assistantOpacity: 70,
      userColor: "#242a37",
      userTextColor: "#f4f0ea",
      userOpacity: 82,
      bubbleOpacity: 76,
      bubbleRadius: 18
    }
  };
  const bubblePresets = {
    night: { label: "夜霧", assistantColor: "#171b24", assistantTextColor: "#e8e2d7", assistantOpacity: 70, userColor: "#242a37", userTextColor: "#f4f0ea", userOpacity: 82, bubbleRadius: 18 },
    lamplight: { label: "燈火", assistantColor: "#211b18", assistantTextColor: "#f0e2cf", assistantOpacity: 76, userColor: "#3a2c24", userTextColor: "#fff4e5", userOpacity: 90, bubbleRadius: 20 },
    harbor: { label: "深海", assistantColor: "#15212d", assistantTextColor: "#dfeaf4", assistantOpacity: 76, userColor: "#1f3447", userTextColor: "#eef7ff", userOpacity: 90, bubbleRadius: 18 },
    dusk: { label: "薄暮", assistantColor: "#211b2b", assistantTextColor: "#e9e1f2", assistantOpacity: 74, userColor: "#352840", userTextColor: "#f7efff", userOpacity: 88, bubbleRadius: 22 },
    clear: { label: "透明", assistantColor: "#171b24", assistantTextColor: "#e8e2d7", assistantOpacity: 28, userColor: "#242a37", userTextColor: "#f4f0ea", userOpacity: 42, bubbleRadius: 16 }
  };
  const chatFontStacks = {
    system: 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans TC",sans-serif',
    serif: 'Georgia,"Noto Serif TC","Times New Roman",serif',
    rounded: '"Trebuchet MS","Noto Sans TC",system-ui,sans-serif'
  };

  const readJSON = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const writeJSON = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const storedSettings = readJSON(SETTINGS_KEY, {});
  // Local preview is a per-story choice. Clean up the legacy durable flag once,
  // then keep it only in runtime state for the builder that is currently open.
  if (storedSettings && typeof storedSettings === "object" && "demoMode" in storedSettings) {
    delete storedSettings.demoMode;
    writeJSON(SETTINGS_KEY, storedSettings);
  }
  const settings = Object.assign({}, defaults, storedSettings);
  settings.demoMode = false;
  if (settings.replyLength === "free") settings.replyLength = "auto";
  if (!["card", "named"].includes(settings.dialogueFormat)) settings.dialogueFormat = "card";
  settings.appearance = Object.assign({}, defaults.appearance, settings.appearance || {});
  const storedAppearance = storedSettings?.appearance && typeof storedSettings.appearance === "object" ? storedSettings.appearance : {};
  if (!("assistantOpacity" in storedAppearance) && Number.isFinite(Number(storedAppearance.bubbleOpacity))) settings.appearance.assistantOpacity = Number(storedAppearance.bubbleOpacity);
  if (!("userOpacity" in storedAppearance) && Number.isFinite(Number(storedAppearance.bubbleOpacity))) settings.appearance.userOpacity = Number(storedAppearance.bubbleOpacity);
  if (!("assistantTextColor" in storedAppearance)) settings.appearance.assistantTextColor = defaults.appearance.assistantTextColor;
  if (!("userTextColor" in storedAppearance)) settings.appearance.userTextColor = defaults.appearance.userTextColor;
  if (!("bubbleRadius" in storedAppearance)) settings.appearance.bubbleRadius = defaults.appearance.bubbleRadius;
  if (!("fontFamily" in storedAppearance)) settings.appearance.fontFamily = defaults.appearance.fontFamily;
  try {
    const migrated = localStorage.getItem(APPEARANCE_V2_KEY) === "yes";
    const old = storedSettings?.appearance;
    const untouchedLegacy = !old || Object.entries(legacyAppearance).every(([key, value]) => old?.[key] === value);
    if (!migrated && untouchedLegacy) {
      Object.assign(settings.appearance, defaults.appearance);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...storedSettings, appearance: settings.appearance }));
    }
    if (!migrated) localStorage.setItem(APPEARANCE_V2_KEY, "yes");
  } catch {}
  let memorySlots = readJSON(MEMORY_KEY, [{ id: "memory-1", title: "記憶 1", text: "", enabled: true }]);
  if (!Array.isArray(memorySlots) || !memorySlots.length) memorySlots = [{ id: "memory-1", title: "記憶 1", text: "", enabled: true }];

  const durableSettings = () => {
    const { demoMode: _demoMode, ...durable } = settings;
    return durable;
  };
  const saveSettings = () => writeJSON(SETTINGS_KEY, durableSettings());
  const saveMemory = () => writeJSON(MEMORY_KEY, memorySlots);
  const enabledMemoryText = () => (window.BAOMemoryWorkbench?.readSlots?.() || readJSON(MEMORY_KEY, memorySlots)).filter(x => x.enabled && String(x.text || "").trim()).map(x => `【${x.title}】\n${x.text.trim()}`).join("\n\n");

  const ensureStyles = () => {
    if (document.querySelector('link[href^="css/player-settings.css"]')) return;
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "css/player-settings.css?v=4"; document.head.appendChild(link);
  };

  const closeModal = () => document.querySelector(".bao-modal-backdrop")?.remove();
  const showModal = (title, body, onReady = null, footer = true) => {
    closeModal();
    const wrap = document.createElement("div");
    const hasHelp = /<p(?:\s|>)/i.test(body);
    wrap.className = "bao-modal-backdrop";
    wrap.innerHTML = `<section class="bao-modal bao-player-modal" role="dialog" aria-modal="true" aria-labelledby="bao-player-modal-title"><div class="bao-modal-head"><h2 id="bao-player-modal-title">${App.escapeHTML(title)}</h2><div class="bao-modal-head-actions">${hasHelp ? '<button class="bao-modal-help" type="button" aria-label="設定說明" aria-expanded="false">?</button>' : ""}<button class="bao-modal-close" type="button">關閉</button></div></div><div class="bao-modal-body">${body}</div>${footer ? '<div class="bao-modal-footer"><button class="secondary bao-modal-cancel" type="button">取消</button><button class="primary bao-modal-save" type="button">完成</button></div>' : ""}</section>`;
    document.body.appendChild(wrap);
    wrap.querySelector(".bao-modal-close")?.addEventListener("click", closeModal);
    wrap.querySelector(".bao-modal-cancel")?.addEventListener("click", closeModal);
    wrap.querySelector(".bao-modal-help")?.addEventListener("click", event => {
      const modal = event.currentTarget.closest(".bao-player-modal");
      const open = !modal?.classList.contains("bao-modal-help-open");
      modal?.classList.toggle("bao-modal-help-open", open);
      event.currentTarget.setAttribute("aria-expanded", open ? "true" : "false");
    });
    wrap.addEventListener("click", e => { if (e.target === wrap) closeModal(); });
    onReady?.(wrap);
    return wrap;
  };

  const replyLabels = {
    short: ["短", "快速推進 · 約 300～600 字"], long: ["長", "完整描寫 · 約 900～1500 字"], auto: ["自動", "依場景密度調整"],
    card: ["跟角色卡走", "沒有設定時採第三人稱"], first: ["角色第一人稱", "旁白「我」＝ AI 主要角色"], second: ["玩家第二人稱", "旁白「你／妳」＝玩家"], third: ["第三人稱", "雙方使用名稱或代詞"],
    named: ["名稱標示", "角色名稱：「對話」"],
    en: ["English", "英文"], "zh-Hans": ["简体中文", "簡體中文"], "zh-Hant": ["繁體中文", "繁體中文"]
  };

  const choiceButtons = (name, values, selected) => values.map(v => `<button type="button" class="bao-choice ${v === selected ? "active" : ""}" data-setting="${name}" data-value="${v}"><b>${replyLabels[v][0]}</b><span>${replyLabels[v][1]}</span></button>`).join("");

  const openReplySettings = () => {
    const body = `<div class="bao-setting-section"><h3>回覆長度</h3><p>控制輸出密度，不影響記憶模式。短適合快速對話；長要求完整場景；自動會依日常、戰鬥、轉折等情況調整。</p><div class="bao-choice-grid">${choiceButtons("replyLength", ["short","long","auto"], settings.replyLength)}</div></div>
    <div class="bao-setting-section"><h3>敘事人稱</h3><p>「角色第一人稱」中的我固定是 AI 主要角色；「玩家第二人稱」中的你／妳固定是玩家 Persona。</p><div class="bao-choice-grid two">${choiceButtons("pov", ["card","first","second","third"], settings.pov)}</div></div>
    <div class="bao-setting-section"><h3>對話格式</h3><p>這只控制台詞標示方式，與敘事人稱分開。AI 不會因此替玩家編造台詞。</p><div class="bao-choice-grid two">${choiceButtons("dialogueFormat", ["card","named"], settings.dialogueFormat)}</div></div>
    <div class="bao-setting-section"><h3>回覆語言</h3><div class="bao-choice-grid">${choiceButtons("language", ["en","zh-Hans","zh-Hant"], settings.language)}</div></div>`;
    const modal = showModal("回覆設定", body, wrap => {
      wrap.querySelectorAll("[data-setting]").forEach(btn => btn.addEventListener("click", () => {
        settings[btn.dataset.setting] = btn.dataset.value;
        wrap.querySelectorAll(`[data-setting="${btn.dataset.setting}"]`).forEach(x => x.classList.toggle("active", x === btn));
      }));
      wrap.querySelector(".bao-modal-save").addEventListener("click", () => { saveSettings(); closeModal(); });
    });
    return modal;
  };

  const renderMemoryBody = () => {
    const totalChars = memorySlots.reduce((n, x) => n + x.text.length, 0);
    const cap = memorySlots.length * 20000;
    const pct = Math.min(100, cap ? totalChars / cap * 100 : 0);
    return `<div class="bao-setting-section"><h3>記憶管理</h3><p>不需要 API 也能手動記錄。開啟自動記憶後，無 API 預覽模式會把最近對話片段收進本機；接上 API 時則沿用智慧摘要。</p><label class="bao-toggle"><span><b>自動記憶</b><br><small class="note">本機片段收納 / API 智慧摘要</small></span><input id="bao-auto-memory" type="checkbox" ${settings.autoMemory ? "checked" : ""}></label></div>
    <div class="bao-setting-section"><div style="display:flex;justify-content:space-between;gap:12px"><b>記憶與對話用量</b><span class="note">${totalChars.toLocaleString()} / ${cap.toLocaleString()} 字</span></div><div class="bao-memory-meter"><i style="width:${pct}%"></i></div></div>
    <div id="bao-memory-slots">${memorySlots.map((slot, i) => `<div class="bao-memory-slot" data-memory-id="${slot.id}"><div class="bao-memory-slot-head"><label><input type="checkbox" data-memory-enabled ${slot.enabled ? "checked" : ""}> 使用中</label><button class="text-button" type="button" data-memory-delete>刪除</button></div><input data-memory-title value="${App.escapeAttr(slot.title)}" aria-label="記憶名稱"><textarea data-memory-text maxlength="20000" placeholder="可自行輸入筆記、角色關係、重要事件或摘要。">${App.escapeHTML(slot.text)}</textarea><small>${slot.text.length.toLocaleString()} / 20,000 字</small></div>`).join("")}</div><button id="bao-add-memory" class="secondary" type="button">＋ 新增記憶欄位</button>`;
  };

  const openMemorySettings = () => {
    const modal = showModal("記憶管理", renderMemoryBody(), wrap => {
      const sync = () => {
        settings.autoMemory = Boolean(wrap.querySelector("#bao-auto-memory")?.checked);
        wrap.querySelectorAll("[data-memory-id]").forEach(node => {
          const slot = memorySlots.find(x => x.id === node.dataset.memoryId); if (!slot) return;
          slot.enabled = Boolean(node.querySelector("[data-memory-enabled]")?.checked);
          slot.title = node.querySelector("[data-memory-title]")?.value.trim() || "未命名記憶";
          slot.text = node.querySelector("[data-memory-text]")?.value || "";
        });
      };
      wrap.querySelectorAll("[data-memory-delete]").forEach(btn => btn.addEventListener("click", () => {
        const node = btn.closest("[data-memory-id]");
        if (memorySlots.length <= 1) { node.querySelector("[data-memory-text]").value = ""; return; }
        memorySlots = memorySlots.filter(x => x.id !== node.dataset.memoryId); node.remove();
      }));
      wrap.querySelector("#bao-add-memory")?.addEventListener("click", () => { sync(); memorySlots.push({ id:`memory-${Date.now()}`, title:`記憶 ${memorySlots.length + 1}`, text:"", enabled:true }); saveMemory(); closeModal(); openMemorySettings(); });
      wrap.querySelector(".bao-modal-save").addEventListener("click", () => { sync(); saveSettings(); saveMemory(); closeModal(); });
    });
    return modal;
  };

  const safeBackground = value => {
    const url = String(value || "").trim();
    return /^(?:https?:\/\/|assets\/|\.\/assets\/)/i.test(url) ? url : "";
  };
  const applyAppearance = () => {
    const view = document.getElementById("chat-view"); if (!view) return;
    const a = settings.appearance;
    view.style.setProperty("--chat-font-size", `${a.fontSize}px`);
    view.style.setProperty("--chat-font-family", chatFontStacks[a.fontFamily] || chatFontStacks.system);
    view.style.setProperty("--chat-assistant", a.assistantColor);
    view.style.setProperty("--chat-assistant-text", a.assistantTextColor || defaults.appearance.assistantTextColor);
    view.style.setProperty("--chat-assistant-opacity", String(Number(a.assistantOpacity ?? a.bubbleOpacity ?? 76) / 100));
    view.style.setProperty("--chat-user", a.userColor);
    view.style.setProperty("--chat-user-text", a.userTextColor || defaults.appearance.userTextColor);
    view.style.setProperty("--chat-user-opacity", String(Number(a.userOpacity ?? a.bubbleOpacity ?? 76) / 100));
    view.style.setProperty("--chat-bubble-opacity", String(Number(a.bubbleOpacity ?? 76) / 100));
    view.style.setProperty("--chat-bubble-radius", `${Number(a.bubbleRadius ?? 18)}px`);
    view.style.setProperty("--chat-bg-opacity", String(a.bgOpacity / 100));
    view.style.setProperty("--chat-bg-blur", `${a.bgBlur}px`);
    let url = "";
    if (a.bgMode === "character") url = safeBackground(App.activeCharacter?.reading_background || App.activeCharacter?.avatar);
    if (a.bgMode === "custom") url = safeBackground(a.customBg);
    const safe = String(url).replace(/["\\]/g, "\\$&");
    view.style.setProperty("--chat-bg-image", url ? `url("${safe}")` : "none");
    view.dataset.baoReadingBackground = url && Number(a.bgOpacity) > 0 ? "image" : "solid";
  };

  const openAppearanceSettings = () => {
    const a = settings.appearance;
    const body = `<div class="bao-appearance-tabs" role="tablist" aria-label="聊天外觀分類">
      <button type="button" class="active" role="tab" aria-selected="true" data-appearance-tab="bubble">聊天氣泡</button>
      <button type="button" role="tab" aria-selected="false" data-appearance-tab="background">閱讀背景</button>
      <button type="button" role="tab" aria-selected="false" data-appearance-tab="text">文字</button>
    </div>
    <div class="bao-appearance-panel" data-appearance-panel="bubble">
      <div class="bao-bubble-preview" aria-label="聊天氣泡即時預覽">
        <div class="bao-bubble-preview-head"><b>即時預覽</b><span>只預覽外觀，不會送出訊息</span></div>
        <div class="bao-preview-message assistant"><div class="bao-preview-bubble">今晚還不睡嗎？</div></div>
        <div class="bao-preview-message user"><div class="bao-preview-bubble">再陪我一下。</div></div>
      </div>
      <div class="bao-setting-section">
        <h3>氣泡主題</h3>
        <p>先選一套夜灣配色，再分別細調角色與玩家。作者自訂 HTML 不會被這裡強制染色。</p>
        <div class="bao-bubble-presets">${Object.entries(bubblePresets).map(([key, preset]) => `<button type="button" class="bao-bubble-preset ${a.bubblePreset===key?"active":""}" data-bubble-preset="${key}"><span class="bao-preset-swatch"><i style="background:${preset.assistantColor}"></i><i style="background:${preset.userColor}"></i></span><b>${preset.label}</b></button>`).join("")}</div>
      </div>
      <div class="bao-setting-section">
        <div class="bao-bubble-role-tabs" role="tablist" aria-label="氣泡角色">
          <button type="button" class="active" role="tab" aria-selected="true" data-bubble-role-tab="assistant">角色</button>
          <button type="button" role="tab" aria-selected="false" data-bubble-role-tab="user">玩家</button>
        </div>
        <div class="bao-bubble-role-panel" data-bubble-role-panel="assistant">
          <div class="bao-color-row"><label for="bao-assistant-color">氣泡底色</label><input id="bao-assistant-color" type="color" value="${a.assistantColor}"></div>
          <div class="bao-color-row"><label for="bao-assistant-text-color">文字顏色</label><input id="bao-assistant-text-color" type="color" value="${a.assistantTextColor || defaults.appearance.assistantTextColor}"></div>
          <div class="bao-range-row"><label for="bao-assistant-opacity">填充透明度</label><b><span id="bao-assistant-opacity-value">${a.assistantOpacity ?? a.bubbleOpacity}</span>%</b><input id="bao-assistant-opacity" style="grid-column:1/-1" type="range" min="20" max="100" value="${a.assistantOpacity ?? a.bubbleOpacity}"></div>
        </div>
        <div class="bao-bubble-role-panel" data-bubble-role-panel="user" hidden>
          <div class="bao-color-row"><label for="bao-user-color">氣泡底色</label><input id="bao-user-color" type="color" value="${a.userColor}"></div>
          <div class="bao-color-row"><label for="bao-user-text-color">文字顏色</label><input id="bao-user-text-color" type="color" value="${a.userTextColor || defaults.appearance.userTextColor}"></div>
          <div class="bao-range-row"><label for="bao-user-opacity">填充透明度</label><b><span id="bao-user-opacity-value">${a.userOpacity ?? a.bubbleOpacity}</span>%</b><input id="bao-user-opacity" style="grid-column:1/-1" type="range" min="20" max="100" value="${a.userOpacity ?? a.bubbleOpacity}"></div>
        </div>
        <div class="bao-range-row bao-bubble-radius-row"><label for="bao-bubble-radius">圓角</label><b><span id="bao-bubble-radius-value">${a.bubbleRadius ?? 18}</span>px</b><input id="bao-bubble-radius" style="grid-column:1/-1" type="range" min="6" max="28" value="${a.bubbleRadius ?? 18}"></div>
        <p class="bao-bubble-reading-note">角色長篇回覆仍以閱讀為主；這裡只調整文字層次與輕量氣泡感，不把正文改成社群軟體式大泡泡。</p>
      </div>
    </div>
    <div class="bao-appearance-panel" data-appearance-panel="background" hidden>
      <div class="bao-setting-section"><h3>閱讀背景</h3><p>背景只負責作品氣氛；正文保持開放閱讀，頂部、輸入框與資料面板才使用深色玻璃。</p><div class="bao-choice-grid"><button type="button" class="bao-choice" data-bg-preset="off"><b>關閉</b><span>純色閱讀</span></button><button type="button" class="bao-choice" data-bg-preset="soft"><b>柔和</b><span>推薦 · 夜讀</span></button><button type="button" class="bao-choice" data-bg-preset="immersive"><b>沉浸</b><span>更明顯的作品圖</span></button></div><h4 class="bao-setting-subhead">背景來源</h4><div class="bao-choice-grid">${["solid","character","custom"].map(v => `<button type="button" class="bao-choice ${a.bgMode===v?"active":""}" data-bg-mode="${v}"><b>${v==="solid"?"純色":v==="character"?"作品圖片":"自訂圖片"}</b><span>${v==="solid"?"不載入圖片":v==="character"?"優先作品背景／角色圖":"圖片網址"}</span></button>`).join("")}</div><input id="bao-custom-bg" style="margin-top:10px" placeholder="https://..." value="${App.escapeAttr(a.customBg || "")}"><div class="bao-range-row" style="margin-top:14px"><label>背景強度</label><b><span id="bao-bg-opacity-value">${a.bgOpacity}</span>%</b><input id="bao-bg-opacity" style="grid-column:1/-1" type="range" min="0" max="70" value="${a.bgOpacity}"></div><div class="bao-range-row" style="margin-top:14px"><label>背景柔焦</label><b><span id="bao-bg-blur-value">${a.bgBlur}</span>px</b><input id="bao-bg-blur" style="grid-column:1/-1" type="range" min="0" max="18" value="${a.bgBlur}"></div></div>
    </div>
    <div class="bao-appearance-panel" data-appearance-panel="text" hidden>
      <div class="bao-setting-section"><h3>故事文字</h3><p>文字設定只套用夜灣原生故事文字；作者自訂 HTML 仍保留作品自己的排版。</p>
        <label class="bao-select-row" for="bao-font-family"><span>字型</span><select id="bao-font-family"><option value="system" ${a.fontFamily==="system"?"selected":""}>系統字型</option><option value="serif" ${a.fontFamily==="serif"?"selected":""}>夜讀襯線</option><option value="rounded" ${a.fontFamily==="rounded"?"selected":""}>圓潤無襯線</option></select></label>
        <div class="bao-range-row"><label for="bao-font-size">訊息字級</label><b><span id="bao-font-size-value">${a.fontSize}</span>px</b><input id="bao-font-size" style="grid-column:1/-1" type="range" min="13" max="24" value="${a.fontSize}"></div>
      </div>
    </div>`;
    showModal("聊天外觀", body, wrap => {
      let bgMode = a.bgMode;
      let bubblePreset = a.bubblePreset || "custom";
      const tab = (group, value) => {
        wrap.querySelectorAll(`[data-${group}-tab]`).forEach(button => {
          const active = button.dataset[`${group}Tab`] === value;
          button.classList.toggle("active", active);
          button.setAttribute("aria-selected", active ? "true" : "false");
        });
        wrap.querySelectorAll(`[data-${group}-panel]`).forEach(panel => {
          panel.hidden = panel.dataset[`${group}Panel`] !== value;
        });
      };
      wrap.querySelectorAll("[data-appearance-tab]").forEach(button => button.addEventListener("click", () => tab("appearance", button.dataset.appearanceTab)));
      wrap.querySelectorAll("[data-bubble-role-tab]").forEach(button => button.addEventListener("click", () => tab("bubbleRole", button.dataset.bubbleRoleTab)));

      const setRange = (id, valueId, value) => {
        const input = wrap.querySelector(`#${id}`);
        if (!input) return;
        input.value = String(value);
        const label = wrap.querySelector(`#${valueId}`);
        if (label) label.textContent = String(value);
      };
      const setColor = (id, value) => {
        const input = wrap.querySelector(`#${id}`);
        if (input) input.value = value;
      };
      const selectMode = mode => {
        bgMode = mode;
        wrap.querySelectorAll("[data-bg-mode]").forEach(x => x.classList.toggle("active", x.dataset.bgMode === mode));
      };
      const markBubbleCustom = () => {
        bubblePreset = "custom";
        wrap.querySelectorAll("[data-bubble-preset]").forEach(x => x.classList.remove("active"));
      };
      const updateBubblePreview = () => {
        const preview = wrap.querySelector(".bao-bubble-preview");
        if (!preview) return;
        preview.style.setProperty("--preview-assistant", wrap.querySelector("#bao-assistant-color").value);
        preview.style.setProperty("--preview-assistant-text", wrap.querySelector("#bao-assistant-text-color").value);
        preview.style.setProperty("--preview-assistant-opacity", String(Number(wrap.querySelector("#bao-assistant-opacity").value) / 100));
        preview.style.setProperty("--preview-user", wrap.querySelector("#bao-user-color").value);
        preview.style.setProperty("--preview-user-text", wrap.querySelector("#bao-user-text-color").value);
        preview.style.setProperty("--preview-user-opacity", String(Number(wrap.querySelector("#bao-user-opacity").value) / 100));
        preview.style.setProperty("--preview-radius", `${wrap.querySelector("#bao-bubble-radius").value}px`);
        preview.style.setProperty("--preview-font-size", `${wrap.querySelector("#bao-font-size").value}px`);
        preview.style.setProperty("--preview-font-family", chatFontStacks[wrap.querySelector("#bao-font-family").value] || chatFontStacks.system);
      };
      wrap.querySelectorAll("[data-bubble-preset]").forEach(button => button.addEventListener("click", () => {
        const preset = bubblePresets[button.dataset.bubblePreset];
        if (!preset) return;
        bubblePreset = button.dataset.bubblePreset;
        wrap.querySelectorAll("[data-bubble-preset]").forEach(x => x.classList.toggle("active", x === button));
        setColor("bao-assistant-color", preset.assistantColor);
        setColor("bao-assistant-text-color", preset.assistantTextColor);
        setRange("bao-assistant-opacity", "bao-assistant-opacity-value", preset.assistantOpacity);
        setColor("bao-user-color", preset.userColor);
        setColor("bao-user-text-color", preset.userTextColor);
        setRange("bao-user-opacity", "bao-user-opacity-value", preset.userOpacity);
        setRange("bao-bubble-radius", "bao-bubble-radius-value", preset.bubbleRadius);
        updateBubblePreview();
      }));
      ["bao-assistant-color","bao-assistant-text-color","bao-user-color","bao-user-text-color"].forEach(id => wrap.querySelector(`#${id}`)?.addEventListener("input", () => { markBubbleCustom(); updateBubblePreview(); }));
      [["bao-assistant-opacity","bao-assistant-opacity-value"],["bao-user-opacity","bao-user-opacity-value"],["bao-bubble-radius","bao-bubble-radius-value"]].forEach(([input,value]) => wrap.querySelector(`#${input}`)?.addEventListener("input", e => {
        wrap.querySelector(`#${value}`).textContent = e.target.value;
        markBubbleCustom();
        updateBubblePreview();
      }));
      [["bao-font-size","bao-font-size-value"],["bao-bg-opacity","bao-bg-opacity-value"],["bao-bg-blur","bao-bg-blur-value"]].forEach(([input,value]) => wrap.querySelector(`#${input}`)?.addEventListener("input", e => {
        wrap.querySelector(`#${value}`).textContent = e.target.value;
        if (input === "bao-font-size") updateBubblePreview();
      }));
      wrap.querySelector("#bao-font-family")?.addEventListener("change", updateBubblePreview);
      wrap.querySelectorAll("[data-bg-mode]").forEach(btn => btn.addEventListener("click", () => selectMode(btn.dataset.bgMode)));
      wrap.querySelectorAll("[data-bg-preset]").forEach(btn => btn.addEventListener("click", () => {
        const preset = btn.dataset.bgPreset;
        wrap.querySelectorAll("[data-bg-preset]").forEach(x => x.classList.toggle("active", x === btn));
        if (preset === "off") {
          selectMode("solid"); setRange("bao-bg-opacity","bao-bg-opacity-value",0); setRange("bao-bg-blur","bao-bg-blur-value",0);
        } else if (preset === "immersive") {
          selectMode("character"); setRange("bao-bg-opacity","bao-bg-opacity-value",50); setRange("bao-bg-blur","bao-bg-blur-value",3);
        } else {
          selectMode("character"); setRange("bao-bg-opacity","bao-bg-opacity-value",34); setRange("bao-bg-blur","bao-bg-blur-value",6);
        }
      }));
      updateBubblePreview();
      const save = wrap.querySelector(".bao-modal-save");
      if (save) save.textContent = "儲存外觀";
      save?.addEventListener("click", () => {
        const assistantOpacity = Number(wrap.querySelector("#bao-assistant-opacity").value);
        const userOpacity = Number(wrap.querySelector("#bao-user-opacity").value);
        settings.appearance = {
          fontSize: Number(wrap.querySelector("#bao-font-size").value),
          fontFamily: wrap.querySelector("#bao-font-family").value,
          bgMode,
          customBg: wrap.querySelector("#bao-custom-bg").value.trim(),
          bgOpacity: Number(wrap.querySelector("#bao-bg-opacity").value),
          bgBlur: Number(wrap.querySelector("#bao-bg-blur").value),
          bubblePreset,
          assistantColor: wrap.querySelector("#bao-assistant-color").value,
          assistantTextColor: wrap.querySelector("#bao-assistant-text-color").value,
          assistantOpacity,
          userColor: wrap.querySelector("#bao-user-color").value,
          userTextColor: wrap.querySelector("#bao-user-text-color").value,
          userOpacity,
          bubbleOpacity: Math.round((assistantOpacity + userOpacity) / 2),
          bubbleRadius: Number(wrap.querySelector("#bao-bubble-radius").value)
        };
        saveSettings(); applyAppearance(); closeModal();
      });
    });
  };

  const injectChatButtons = () => {
    const aside = document.querySelector("#chat-view aside");
    if (!aside || document.getElementById("bao-player-settings")) return;
    const box = document.createElement("div"); box.id = "bao-player-settings"; box.className = "bao-settings-row";
    box.innerHTML = '<button type="button" class="secondary" data-bao-open="reply">⚙ 回覆設定</button><button type="button" class="secondary" data-bao-open="memory">🧠 記憶管理</button><button type="button" class="secondary" data-bao-open="appearance">✦ 聊天外觀</button>';
    const exit = aside.querySelector(".text-button");
    if (exit?.parentElement) exit.parentElement.insertBefore(box, exit);
    else aside.appendChild(box);
    box.querySelector('[data-bao-open="reply"]').onclick = openReplySettings;
    box.querySelector('[data-bao-open="memory"]').onclick = openMemorySettings;
    box.querySelector('[data-bao-open="appearance"]').onclick = openAppearanceSettings;
  };

  const resetDemoChoice = () => {
    settings.demoMode = false;
    const input = document.getElementById("bao-demo-mode");
    if (input) input.checked = false;
  };

  const injectDemoOption = () => {
    const step = document.querySelector('[data-step-panel="4"]'); if (!step || document.getElementById("bao-demo-mode")) return;
    const box = document.createElement("div"); box.className = "bao-demo-box";
    box.innerHTML = `<label><input id="bao-demo-mode" type="checkbox"><span><b>無 API 本機預覽</b><br><small class="note">不呼叫任何模型、不產生 Token 費用。只用來測試聊天流程、記憶與外觀。</small></span></label>`;
    step.appendChild(box);
    box.querySelector("#bao-demo-mode").addEventListener("change", e => { settings.demoMode = e.target.checked; });
  };

  const lengthInstruction = () => settings.replyLength === "short"
    ? "使用精簡回覆，優先快速對話與劇情推進，通常約 300～600 個中文字；不要為縮短而省略理解本輪所需的關鍵動作或結果。"
    : settings.replyLength === "long"
      ? "使用完整場景回覆，充分描寫動作、環境、角色反應與因果，通常約 900～1500 個中文字；不要為達字數而重複、灌水或拖慢劇情。"
      : "依場景密度自動調整篇幅：日常對話可以簡潔；戰鬥、重大轉折、關係變化或需要沉浸描寫的場景可以加長。不要硬湊固定字數。";
  const povInstruction = () => {
    const roleName = App.activeCharacter?.name || "AI 主要角色";
    const playerName = App.config?.persona?.name || "玩家";
    return ({
      card: `敘事人稱依角色卡原本設定；若角色卡沒有明確指定，使用第三人稱鏡頭式敘事。無論採何種人稱，都必須維持「${roleName}」與「${playerName}」的身份邊界。`,
      first: `固定使用 AI 主要角色第一人稱敘事。旁白中的「我」只能指 AI 主要扮演角色「${roleName}」，不能指玩家「${playerName}」。描述玩家時使用玩家名稱或「你／妳」，不得替玩家補心理、台詞或行動。`,
      second: `固定使用玩家第二人稱敘事。旁白中的「你／妳」只能指玩家「${playerName}」；AI 主要角色是「${roleName}」，在旁白中使用角色名稱或合適代詞。角色自己的對話可以自然使用「我」，但不得與玩家身份互換。`,
      third: `固定使用第三人稱鏡頭式／有限視角敘事。「${roleName}」與「${playerName}」都使用名稱或合適代詞指稱；不得使用全知視角洩露角色尚未取得的資訊，也不得代替玩家決定心理、台詞或行動。`
    }[settings.pov]);
  };
  const dialogueInstruction = () => {
    const roleName = App.activeCharacter?.name || "AI 主要角色";
    const playerName = App.config?.persona?.name || "玩家";
    if (settings.dialogueFormat !== "named") return "對話格式依角色卡設定；若角色卡沒有指定，使用自然引號台詞。不得自行生成玩家的新台詞。";
    return `所有可聽見的角色台詞使用下列格式並各自成行：角色名稱：「對話內容」。AI 主要角色的名稱固定寫作「${roleName}」，其他 NPC 使用實際名稱。不得自行生成玩家「${playerName}」的新台詞；只有在忠實重述玩家本輪已輸入的原話時，才可使用格式：${playerName}：「原話」。旁白維持一般敘事，不要加上角色名稱標籤。`;
  };
  const languageInstruction = () => ({ "zh-Hant":"所有自然語言回覆使用繁體中文。", "zh-Hans":"所有自然語言回覆使用簡體中文。", en:"All natural-language replies must be in English." }[settings.language]);

  const originalBuildSystemPrompt = App.buildSystemPrompt.bind(App);
  App.buildSystemPrompt = function() {
    const base = originalBuildSystemPrompt();
    const memory = enabledMemoryText();
    return [base, "", "【玩家回覆設定】", lengthInstruction(), povInstruction(), dialogueInstruction(), languageInstruction(), memory ? `\n【玩家手動記憶】\n${memory}` : ""].filter(Boolean).join("\n");
  };

  const originalOpenBuilder = App.openBuilder.bind(App);
  App.openBuilder = function(...args) {
    resetDemoChoice();
    return originalOpenBuilder(...args);
  };

  const originalCollectConfig = App.collectConfig.bind(App);
  App.collectConfig = function() { const cfg = originalCollectConfig(); cfg.demoMode = Boolean(document.getElementById("bao-demo-mode")?.checked); return cfg; };

  const originalStartStory = App.startStory.bind(App);
  App.startStory = function() {
    const cfg = this.collectConfig();
    if (!cfg.demoMode) return originalStartStory();
    this.config = cfg; Chat.reset(); GameState.create(this.activeCharacter, this.config); this.renderChatShell(true); this.showView("chat"); this.saveStory(false);
  };

  const demoReply = text => {
    const c = App.activeCharacter?.name || "角色";
    const lang = settings.language;
    if (lang === "en") return `[Local preview — no API]\n${c} pauses for a moment, then reacts to your latest action. This is a scripted preview used only to test layout, memory and appearance settings. It does not represent the quality of a real model response.`;
    const simp = lang === "zh-Hans";
    const prefix = simp ? "【本机预览 · 未使用 API】" : "【本機預覽 · 未使用 API】";
    const lines = settings.pov === "first"
      ? (simp ? `我停顿了一下，重新看向眼前的情景。你的行动已经被记录在这次预览里。` : `我停頓了一下，重新看向眼前的情景。你的行動已經被記錄在這次預覽裡。`)
      : settings.pov === "second"
      ? (simp ? `你注意到${c}的视线停了片刻，像是在回应刚才发生的事。` : `你注意到${c}的視線停了片刻，像是在回應剛才發生的事。`)
      : (simp ? `${c}停顿了一下，视线重新落回眼前的情景。` : `${c}停頓了一下，視線重新落回眼前的情景。`);
    const note = simp ? "这段文字是本机脚本，只用来测试聊天流程、回复长度、人称、记忆与外观，不代表真实模型输出。" : "這段文字是本機腳本，只用來測試聊天流程、回覆長度、人稱、記憶與外觀，不代表真實模型輸出。";
    const extra = settings.replyLength === "long" ? `\n\n${simp ? "画面继续推进，环境与人物状态会在真实模型接入后由角色卡与世界规则共同决定。现在你可以继续输入几轮，检查存档、记忆栏位与聊天界面是否正常。" : "畫面繼續推進，環境與人物狀態會在真實模型接入後由角色卡與世界規則共同決定。現在你可以繼續輸入幾輪，檢查存檔、記憶欄位與聊天介面是否正常。"}` : "";
    return `${prefix}\n${lines}\n\n${note}${extra}`;
  };

  const localAutoMemory = () => {
    if (!settings.autoMemory || !App.config?.demoMode || Chat.messages.length < 4 || Chat.messages.length % 4 !== 0) return;
    let slot = memorySlots.find(x => x.id === "auto-local");
    if (!slot) { slot = { id:"auto-local", title:"自動記憶（本機）", text:"", enabled:true }; memorySlots.unshift(slot); }
    const recent = Chat.messages.slice(-4).map(m => `${m.role === "user" ? "玩家" : "角色"}：${String(m.content).slice(0,500)}`).join("\n");
    slot.text = `${slot.text}\n\n${recent}`.trim().slice(-12000);
    saveMemory();
  };

  const originalSendMessage = App.sendMessage.bind(App);
  App.sendMessage = async function() {
    if (!this.config?.demoMode) return originalSendMessage();
    const input = document.getElementById("user-input"), text = input?.value.trim(); if (!text) return;
    const stream = document.getElementById("chat-stream");
    stream.insertAdjacentHTML("beforeend", `<div class="message user"><div class="bubble">${this.formatMessage(text)}</div></div>`); input.value = ""; Chat.add("user", text);
    const reply = demoReply(text); Chat.add("assistant", reply);
    stream.insertAdjacentHTML("beforeend", `<div class="message assistant"><div class="bubble">${this.formatMessage(reply)}</div></div>`);
    localAutoMemory();
    document.getElementById("usage-context").textContent = "0 tok"; document.getElementById("usage-turn").textContent = "0 tok"; document.getElementById("usage-cache").textContent = "0 tok"; document.getElementById("usage-memory").textContent = "本機預覽";
    this.saveStory(false); stream.scrollTop = stream.scrollHeight;
  };

  const originalRenderChatShell = App.renderChatShell.bind(App);
  App.renderChatShell = function(fresh = false) { originalRenderChatShell(fresh); injectChatButtons(); applyAppearance(); if (this.config?.demoMode) document.getElementById("chat-model").innerHTML = '<span class="bao-demo-badge">LOCAL PREVIEW</span>'; };

  window.BAOPlayerSettings = {
    get: () => JSON.parse(JSON.stringify(settings)),
    set: value => {
      const next = Object.assign({}, defaults, value && typeof value === "object" ? value : {});
      next.demoMode = false;
      if (next.replyLength === "free") next.replyLength = "auto";
      if (!["card", "named"].includes(next.dialogueFormat)) next.dialogueFormat = "card";
      next.appearance = Object.assign({}, defaults.appearance, next.appearance || {});
      Object.keys(settings).forEach(key => delete settings[key]);
      Object.assign(settings, next);
      saveSettings();
      applyAppearance();
    }
  };

  const init = () => { ensureStyles(); injectDemoOption(); injectChatButtons(); applyAppearance(); };
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", () => setTimeout(init, 120)); else setTimeout(init, 120);
})();
