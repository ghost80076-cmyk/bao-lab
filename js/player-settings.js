(() => {
  if (typeof App === "undefined" || typeof Chat === "undefined") return;

  const SETTINGS_KEY = "bao-lab:player-settings";
  const MEMORY_KEY = "bao-lab:player-memory-slots";
  const defaults = {
    replyLength: "free",
    pov: "card",
    language: "zh-Hant",
    autoMemory: true,
    demoMode: false,
    appearance: { fontSize: 16, bgMode: "solid", customBg: "", bgOpacity: 12, bgBlur: 0, assistantColor: "#171b24", userColor: "#242a37", bubbleOpacity: 100 }
  };

  const readJSON = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const writeJSON = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const settings = Object.assign({}, defaults, readJSON(SETTINGS_KEY, {}));
  settings.appearance = Object.assign({}, defaults.appearance, settings.appearance || {});
  let memorySlots = readJSON(MEMORY_KEY, [{ id: "memory-1", title: "記憶 1", text: "", enabled: true }]);
  if (!Array.isArray(memorySlots) || !memorySlots.length) memorySlots = [{ id: "memory-1", title: "記憶 1", text: "", enabled: true }];

  const saveSettings = () => writeJSON(SETTINGS_KEY, settings);
  const saveMemory = () => writeJSON(MEMORY_KEY, memorySlots);
  const enabledMemoryText = () => memorySlots.filter(x => x.enabled && x.text.trim()).map(x => `【${x.title}】\n${x.text.trim()}`).join("\n\n");

  const ensureStyles = () => {
    if (document.querySelector('link[href="css/player-settings.css"]')) return;
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "css/player-settings.css"; document.head.appendChild(link);
  };

  const closeModal = () => document.querySelector(".bao-modal-backdrop")?.remove();
  const showModal = (title, body, onReady = null, footer = true) => {
    closeModal();
    const wrap = document.createElement("div");
    wrap.className = "bao-modal-backdrop";
    wrap.innerHTML = `<section class="bao-modal"><div class="bao-modal-head"><h2>${App.escapeHTML(title)}</h2><button class="bao-modal-close" type="button">關閉</button></div><div class="bao-modal-body">${body}</div>${footer ? '<div class="bao-modal-footer"><button class="secondary bao-modal-cancel" type="button">取消</button><button class="primary bao-modal-save" type="button">完成</button></div>' : ""}</section>`;
    document.body.appendChild(wrap);
    wrap.querySelector(".bao-modal-close")?.addEventListener("click", closeModal);
    wrap.querySelector(".bao-modal-cancel")?.addEventListener("click", closeModal);
    wrap.addEventListener("click", e => { if (e.target === wrap) closeModal(); });
    onReady?.(wrap);
    return wrap;
  };

  const replyLabels = {
    short: ["短", "約 600 字以內"], long: ["長", "約 1000 字以上"], free: ["自由", "約 1500 字以內"],
    card: ["跟角色卡走", "由角色卡自己決定"], first: ["第一人稱", "角色以「我」自述"], second: ["第二人稱", "旁白以「你／妳」稱呼玩家"], third: ["第三人稱", "全知或鏡頭式第三人稱"],
    en: ["English", "英文"], "zh-Hans": ["简体中文", "簡體中文"], "zh-Hant": ["繁體中文", "繁體中文"]
  };

  const choiceButtons = (name, values, selected) => values.map(v => `<button type="button" class="bao-choice ${v === selected ? "active" : ""}" data-setting="${name}" data-value="${v}"><b>${replyLabels[v][0]}</b><span>${replyLabels[v][1]}</span></button>`).join("");

  const openReplySettings = () => {
    const body = `<div class="bao-setting-section"><h3>回覆長度</h3><p>控制故事回覆的大致篇幅。實際長度仍會受模型與場景影響。</p><div class="bao-choice-grid">${choiceButtons("replyLength", ["short","long","free"], settings.replyLength)}</div></div>
    <div class="bao-setting-section"><h3>敘事人稱</h3><p>可固定視角，也可以交給角色卡本身決定。</p><div class="bao-choice-grid two">${choiceButtons("pov", ["card","first","second","third"], settings.pov)}</div></div>
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

  const applyAppearance = () => {
    const view = document.getElementById("chat-view"); if (!view) return;
    const a = settings.appearance;
    view.style.setProperty("--chat-font-size", `${a.fontSize}px`);
    view.style.setProperty("--chat-assistant", a.assistantColor);
    view.style.setProperty("--chat-user", a.userColor);
    view.style.setProperty("--chat-bubble-opacity", String(a.bubbleOpacity / 100));
    view.style.setProperty("--chat-bg-opacity", String(a.bgOpacity / 100));
    view.style.setProperty("--chat-bg-blur", `${a.bgBlur}px`);
    let url = "";
    if (a.bgMode === "character") url = App.activeCharacter?.avatar || "";
    if (a.bgMode === "custom" && /^https?:\/\//i.test(a.customBg || "")) url = a.customBg;
    const safe = String(url).replace(/["\\]/g, "\\$&");
    view.style.setProperty("--chat-bg-image", url ? `url("${safe}")` : "none");
  };

  const openAppearanceSettings = () => {
    const a = settings.appearance;
    const body = `<div class="bao-setting-section"><h3>訊息字級</h3><div class="bao-range-row"><input id="bao-font-size" type="range" min="13" max="24" value="${a.fontSize}"><b><span id="bao-font-size-value">${a.fontSize}</span>px</b></div></div>
    <div class="bao-setting-section"><h3>對話背景</h3><div class="bao-choice-grid">${["solid","character","custom"].map(v => `<button type="button" class="bao-choice ${a.bgMode===v?"active":""}" data-bg-mode="${v}"><b>${v==="solid"?"純色":v==="character"?"角色照片":"自訂圖片"}</b><span>${v==="solid"?"無背景圖":v==="character"?"使用角色圖":"圖片網址"}</span></button>`).join("")}</div><input id="bao-custom-bg" style="margin-top:10px" placeholder="https://..." value="${App.escapeAttr(a.customBg || "")}"><div class="bao-range-row" style="margin-top:14px"><label>背景強度</label><b><span id="bao-bg-opacity-value">${a.bgOpacity}</span>%</b><input id="bao-bg-opacity" style="grid-column:1/-1" type="range" min="0" max="100" value="${a.bgOpacity}"></div><div class="bao-range-row" style="margin-top:14px"><label>背景模糊</label><b><span id="bao-bg-blur-value">${a.bgBlur}</span>px</b><input id="bao-bg-blur" style="grid-column:1/-1" type="range" min="0" max="24" value="${a.bgBlur}"></div></div>
    <div class="bao-setting-section"><h3>訊息氣泡</h3><div class="bao-color-row"><label>角色氣泡</label><input id="bao-assistant-color" type="color" value="${a.assistantColor}"></div><div class="bao-color-row" style="margin-top:10px"><label>玩家氣泡</label><input id="bao-user-color" type="color" value="${a.userColor}"></div><div class="bao-range-row" style="margin-top:14px"><label>氣泡透明度</label><b><span id="bao-bubble-opacity-value">${a.bubbleOpacity}</span>%</b><input id="bao-bubble-opacity" style="grid-column:1/-1" type="range" min="20" max="100" value="${a.bubbleOpacity}"></div></div>`;
    showModal("聊天外觀", body, wrap => {
      let bgMode = a.bgMode;
      wrap.querySelectorAll("[data-bg-mode]").forEach(btn => btn.addEventListener("click", () => { bgMode = btn.dataset.bgMode; wrap.querySelectorAll("[data-bg-mode]").forEach(x => x.classList.toggle("active", x===btn)); }));
      [["bao-font-size","bao-font-size-value"],["bao-bg-opacity","bao-bg-opacity-value"],["bao-bg-blur","bao-bg-blur-value"],["bao-bubble-opacity","bao-bubble-opacity-value"]].forEach(([input,value]) => wrap.querySelector(`#${input}`)?.addEventListener("input", e => wrap.querySelector(`#${value}`).textContent = e.target.value));
      wrap.querySelector(".bao-modal-save").addEventListener("click", () => {
        settings.appearance = { fontSize:Number(wrap.querySelector("#bao-font-size").value), bgMode, customBg:wrap.querySelector("#bao-custom-bg").value.trim(), bgOpacity:Number(wrap.querySelector("#bao-bg-opacity").value), bgBlur:Number(wrap.querySelector("#bao-bg-blur").value), assistantColor:wrap.querySelector("#bao-assistant-color").value, userColor:wrap.querySelector("#bao-user-color").value, bubbleOpacity:Number(wrap.querySelector("#bao-bubble-opacity").value) };
        saveSettings(); applyAppearance(); closeModal();
      });
    });
  };

  const injectChatButtons = () => {
    const aside = document.querySelector("#chat-view aside");
    if (!aside || document.getElementById("bao-player-settings")) return;
    const box = document.createElement("div"); box.id = "bao-player-settings"; box.className = "bao-settings-row";
    box.innerHTML = '<button type="button" class="secondary" data-bao-open="reply">⚙ 回覆設定</button><button type="button" class="secondary" data-bao-open="memory">🧠 記憶管理</button><button type="button" class="secondary" data-bao-open="appearance">✦ 聊天外觀</button>';
    aside.insertBefore(box, aside.querySelector(".text-button"));
    box.querySelector('[data-bao-open="reply"]').onclick = openReplySettings;
    box.querySelector('[data-bao-open="memory"]').onclick = openMemorySettings;
    box.querySelector('[data-bao-open="appearance"]').onclick = openAppearanceSettings;
  };

  const injectDemoOption = () => {
    const step = document.querySelector('[data-step-panel="4"]'); if (!step || document.getElementById("bao-demo-mode")) return;
    const box = document.createElement("div"); box.className = "bao-demo-box";
    box.innerHTML = `<label><input id="bao-demo-mode" type="checkbox" ${settings.demoMode ? "checked" : ""}><span><b>無 API 本機預覽</b><br><small class="note">不呼叫任何模型、不產生 Token 費用。只用來測試聊天流程、記憶與外觀。</small></span></label>`;
    step.appendChild(box);
    box.querySelector("#bao-demo-mode").addEventListener("change", e => { settings.demoMode = e.target.checked; saveSettings(); });
  };

  const lengthInstruction = () => settings.replyLength === "short" ? "回覆盡量控制在約 600 個中文字以內。" : settings.replyLength === "long" ? "回覆可較完整，通常至少約 1000 個中文字，但不要為湊字數重複描寫。" : "依劇情自由調整篇幅，通常控制在約 1500 個中文字以內。";
  const povInstruction = () => ({ card:"敘事人稱依角色卡原本設定。", first:"固定使用第一人稱敘事，由角色以「我」自述。", second:"固定使用第二人稱敘事，旁白以「你／妳」稱呼玩家。", third:"固定使用第三人稱敘事，可採鏡頭式描寫，但角色不得知道未取得的資訊。" }[settings.pov]);
  const languageInstruction = () => ({ "zh-Hant":"所有自然語言回覆使用繁體中文。", "zh-Hans":"所有自然語言回覆使用簡體中文。", en:"All natural-language replies must be in English." }[settings.language]);

  const originalBuildSystemPrompt = App.buildSystemPrompt.bind(App);
  App.buildSystemPrompt = function() {
    const base = originalBuildSystemPrompt();
    const memory = enabledMemoryText();
    return [base, "", "【玩家回覆設定】", lengthInstruction(), povInstruction(), languageInstruction(), memory ? `\n【玩家手動記憶】\n${memory}` : ""].filter(Boolean).join("\n");
  };

  const originalCollectConfig = App.collectConfig.bind(App);
  App.collectConfig = function() { const cfg = originalCollectConfig(); cfg.demoMode = Boolean(document.getElementById("bao-demo-mode")?.checked || settings.demoMode); return cfg; };

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

  const init = () => { ensureStyles(); injectDemoOption(); injectChatButtons(); applyAppearance(); };
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", () => setTimeout(init, 120)); else setTimeout(init, 120);
})();
