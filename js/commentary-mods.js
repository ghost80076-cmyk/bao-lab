(() => {
  "use strict";
  if (window.BAOCommentaryMods || !window.App || !window.BAOCommentaryModsCore) return;

  const core = window.BAOCommentaryModsCore;
  const PACK_SRC = "js/commentary-mods-adult-pack.js?v=1";
  let packPromise = null;

  const ensureStyles = () => {
    if (document.querySelector('link[href^="css/commentary-mods.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/commentary-mods.css?v=1";
    document.head.appendChild(link);
  };

  const adultEnabled = () => Boolean(window.BAOContentPreferences?.isAdultContentEnabled?.());
  const notify = (message, tone = "success") => {
    if (window.BAOFeedback?.notify) window.BAOFeedback.notify(message, tone);
    else window.alert(message);
  };
  const esc = value => App.escapeHTML(String(value ?? ""));

  const loadPack = () => {
    if (!adultEnabled()) return Promise.resolve([]);
    if (window.BAOAdultCommentaryPack?.mods) return Promise.resolve(core.sanitizeCatalog(window.BAOAdultCommentaryPack.mods));
    if (packPromise) return packPromise;
    packPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${PACK_SRC}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve(core.sanitizeCatalog(window.BAOAdultCommentaryPack?.mods || [])), { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = PACK_SRC;
      script.onload = () => resolve(core.sanitizeCatalog(window.BAOAdultCommentaryPack?.mods || []));
      script.onerror = () => {
        packPromise = null;
        reject(new Error("成人場外人格模組載入失敗。"));
      };
      document.head.appendChild(script);
    });
    return packPromise;
  };

  const catalog = () => core.availableCatalog(window.BAOAdultCommentaryPack?.mods || [], { adultEnabled: adultEnabled() });

  const ensureState = () => {
    if (!window.GameState?.current) return core.normalizeState({});
    const normalized = core.normalizeState(GameState.current.commentaryMods || {});
    GameState.current.commentaryMods = normalized;
    return normalized;
  };

  const saveState = state => {
    if (!window.GameState?.current) return core.normalizeState(state);
    const normalized = core.normalizeState(state);
    GameState.current.commentaryMods = normalized;
    try { App.saveStory?.(false); } catch (_) {}
    return normalized;
  };

  const activeMods = () => core.activeMods(ensureState(), catalog(), { adultEnabled: adultEnabled() });

  const lastAssistant = () => {
    const list = Array.isArray(window.Chat?.messages) ? Chat.messages : [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i]?.role === "assistant" && !list[i]?.greeting) return list[i];
    }
    return null;
  };

  const previousUserText = message => {
    const list = Array.isArray(window.Chat?.messages) ? Chat.messages : [];
    const index = list.findIndex(item => String(item?.id || "") === String(message?.id || ""));
    for (let i = (index >= 0 ? index : list.length) - 1; i >= 0; i -= 1) {
      if (list[i]?.role === "user") return String(list[i]?.content || "");
    }
    return "";
  };

  const renderAll = () => {
    document.querySelectorAll(".bao-commentary-mod-block").forEach(node => node.remove());
    if (!adultEnabled() || !window.GameState?.current) return;
    const state = ensureState();
    const stream = document.getElementById("chat-stream");
    if (!stream) return;
    const messages = (Chat.messages || []).filter(item => item?.role === "assistant");
    const nodes = [...stream.querySelectorAll(".message.assistant")];
    messages.forEach((message, index) => {
      const output = core.outputFor(state, message.id);
      const host = nodes[index];
      if (!output || !host) return;
      const icons = output.modIds.includes("yinmo-monitor") && output.modIds.includes("succubus-bun")
        ? "🔥💕" : output.modIds.includes("yinmo-monitor") ? "🔥" : output.modIds.includes("succubus-bun") ? "💕" : "◈";
      const details = document.createElement("details");
      details.className = "bao-commentary-mod-block";
      details.dataset.messageId = String(message.id || "");
      details.innerHTML = `
        <summary><span>${icons} 場外人格</span><small>展開碎碎念</small></summary>
        <div class="bao-commentary-mod-content">${App.formatMessage(output.content)}</div>`;
      host.insertAdjacentElement("afterend", details);
    });
  };

  const generateFor = async (message = null, options = {}) => {
    if (!adultEnabled() || App.config?.demoMode) return false;
    const target = message || lastAssistant();
    if (!target?.id || !String(target.content || "").trim()) return false;
    let state = ensureState();
    if (!options.force && core.outputFor(state, target.id)) return false;
    await loadPack();
    const mods = activeMods();
    if (!mods.length) return false;

    const messages = core.buildMessages({
      mods,
      sceneText: String(target.content || ""),
      playerText: previousUserText(target)
    });
    if (!messages.length) return false;

    const api = structuredClone(App.config?.api || {});
    window.BAOCreditsPilot?.prepareAccountConfig?.(api);
    if (!api.model || !api.baseUrl || (!api.key && !window.BAOCreditsPilot?.isAccountReady?.(api))) return false;
    api.__auxiliaryTask = true;
    api.__commentaryTask = true;
    api.maxOutputTokens = mods.length > 1 ? 1400 : 850;

    try {
      const result = await API.send(api, messages);
      const content = String(result?.text || "").trim();
      if (!content || /^NO_COMMENTARY\.?$/i.test(content)) return false;
      state = core.addOutput(state, {
        messageId: target.id,
        content,
        modIds: mods.map(item => item.id),
        createdAt: new Date().toISOString()
      });
      saveState(state);
      renderAll();
      return true;
    } catch (error) {
      console.warn("YoruBay commentary MOD generation failed:", error);
      if (options.notify !== false) notify("正文已保留；場外人格這一輪沒有成功回應。", "error");
      return false;
    }
  };

  const close = () => document.querySelector(".bao-commentary-mod-backdrop")?.remove();

  const open = async () => {
    if (!window.GameState?.current || !App.activeCharacter) {
      notify("先進入一個故事，再設定場外人格。", "error");
      return;
    }
    if (!adultEnabled()) {
      window.BAOContentPreferences?.guard?.({ adult_content: true });
      return;
    }
    let mods;
    try { mods = await loadPack(); }
    catch (error) { notify(error.message || "場外人格載入失敗。", "error"); return; }
    close();
    const state = ensureState();
    const active = new Set(state.enabled);
    const wrap = document.createElement("div");
    wrap.className = "bao-commentary-mod-backdrop";
    wrap.innerHTML = `
      <section class="bao-commentary-mod-panel" role="dialog" aria-modal="true" aria-labelledby="bao-commentary-mod-title">
        <header>
          <div>
            <span class="eyebrow">OFF-STAGE PERSONAS</span>
            <h2 id="bao-commentary-mod-title">場外人格 MOD</h2>
            <p>只讀取本輪可見正文，另外產生折疊評論；不寫回主對話、角色記憶或世界狀態。</p>
          </div>
          <button type="button" class="bao-commentary-mod-close" data-commentary-close aria-label="關閉場外人格設定">×</button>
        </header>
        <div class="bao-commentary-mod-warning">
          <b>成人內容已開啟</b>
          <span>每個啟用中的場外人格會共用一次額外模型請求，因此每輪會增加 Token／燈火用量。關閉成人內容後，這些評論與入口會立即隱藏，但故事資料不會被刪除。</span>
        </div>
        <div class="bao-commentary-mod-list">
          ${mods.map(mod => `
            <label class="bao-commentary-mod-choice">
              <input type="checkbox" data-commentary-mod="${esc(mod.id)}" ${active.has(mod.id) ? "checked" : ""}>
              <span><b>${esc(mod.label)}</b><small>${esc(mod.description)}</small></span>
            </label>`).join("")}
        </div>
        <div class="bao-commentary-mod-link-note" ${active.has("yinmo-monitor") && active.has("succubus-bun") ? "" : "hidden"} data-commentary-twins>
          🔥💕 兩個 MOD 同時啟用時，會自動追加「雙子互動」；不需要第三個開關。
        </div>
        <div class="bao-commentary-mod-actions">
          <button type="button" class="secondary" data-commentary-latest>評論目前最後一輪</button>
          <button type="button" class="primary" data-commentary-done>完成</button>
        </div>
        <details class="bao-commentary-mod-commands">
          <summary>保留舊版召喚指令</summary>
          <div>【召喚淫魔班長】 · 【召喚魅魔肉包】 · 【召喚淫魔雙子】 · 【只留淫魔班長】 · 【只留魅魔肉包】 · 【雙子全開】 · 【遣回淫魔雙子】</div>
        </details>
      </section>`;
    document.body.appendChild(wrap);

    const twins = () => {
      const selected = new Set([...wrap.querySelectorAll("[data-commentary-mod]:checked")].map(node => node.dataset.commentaryMod));
      const note = wrap.querySelector("[data-commentary-twins]");
      if (note) note.hidden = !(selected.has("yinmo-monitor") && selected.has("succubus-bun"));
    };

    wrap.querySelectorAll("[data-commentary-mod]").forEach(input => input.addEventListener("change", event => {
      const current = ensureState();
      saveState(core.toggle(current, event.currentTarget.dataset.commentaryMod, event.currentTarget.checked));
      twins();
    }));
    wrap.querySelector("[data-commentary-latest]")?.addEventListener("click", async event => {
      const button = event.currentTarget;
      button.disabled = true;
      const ok = await generateFor(lastAssistant(), { force: true, notify: true });
      button.disabled = false;
      notify(ok ? "場外人格已評論目前最後一輪。" : "目前沒有可產生的場外評論。", ok ? "success" : "info");
    });
    wrap.querySelector("[data-commentary-done]")?.addEventListener("click", close);
    wrap.querySelector("[data-commentary-close]")?.addEventListener("click", close);
    wrap.addEventListener("click", event => { if (event.target === wrap) close(); });
    wrap.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
    wrap.querySelector("[data-commentary-close]")?.focus();
  };

  const summary = () => {
    if (!adultEnabled()) return null;
    const state = ensureState();
    const mods = catalog();
    const active = core.activeMods(state, mods, { adultEnabled: true });
    const enabled = new Set(state.enabled);
    return {
      id: "commentary",
      enabledCount: active.length,
      availableCount: mods.length,
      labels: active.map(item => item.label),
      items: mods.map(item => ({ id: item.id, label: item.label, description: item.description, enabled: enabled.has(item.id) })),
      active: active.length > 0
    };
  };

  const handleCommand = async raw => {
    if (!adultEnabled()) return false;
    await loadPack();
    const action = core.command(raw, catalog());
    if (!action) return false;
    const next = saveState(core.applyCommand(ensureState(), action));
    const labels = core.activeMods(next, catalog(), { adultEnabled: true }).map(item => item.label);
    notify(labels.length ? `場外人格已切換：${labels.join("＋")}。` : "場外人格已全部遣回。");
    return true;
  };

  if (typeof App.wrapSendMessage === "function") {
    App.wrapSendMessage("commentary-mods:after-story", async function(next, ...args) {
      const input = document.getElementById("user-input");
      const raw = String(input?.value || "").trim();
      if (raw.startsWith("【") && raw.endsWith("】")) {
        if (!adultEnabled() && /淫魔|魅魔|雙子/.test(raw)) {
          window.BAOContentPreferences?.guard?.({ adult_content: true });
          return false;
        }
        if (adultEnabled() && await handleCommand(raw)) {
          if (input) input.value = "";
          return true;
        }
      }

      const before = new Set((Chat.messages || []).filter(item => item?.role === "assistant").map(item => String(item.id || "")));
      const result = await next(...args);
      if (!adultEnabled()) return result;
      const target = [...(Chat.messages || [])].reverse().find(item => item?.role === "assistant" && !before.has(String(item.id || "")));
      if (target) await generateFor(target, { notify: false });
      return result;
    });
  }

  if (typeof App.wrapRenderChatShell === "function") {
    App.wrapRenderChatShell("commentary-mods:render", function(next, ...args) {
      const result = next(...args);
      window.setTimeout(renderAll, 0);
      return result;
    });
  }

  window.addEventListener("yorubay:content-preferences-changed", event => {
    if (event.detail?.adultContentEnabled) {
      loadPack().catch(error => console.warn("YoruBay adult commentary pack preload failed:", error));
    } else {
      close();
      renderAll();
    }
  });

  ensureStyles();
  if (adultEnabled()) loadPack().catch(error => console.warn("YoruBay adult commentary pack preload failed:", error));

  window.BAOCommentaryMods = Object.freeze({
    open,
    close,
    summary,
    catalog,
    activeMods,
    ensureState,
    renderAll,
    generateLatest: () => generateFor(lastAssistant(), { force: true, notify: true }),
    handleCommand
  });
})();
