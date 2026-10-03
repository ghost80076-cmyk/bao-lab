(() => {
  "use strict";
  if (window.BAOInterpretationMods || !window.App || !window.BAOInterpretationModsCore) return;

  const core = window.BAOInterpretationModsCore;
  const ADVISOR_ID = "bun-interpreter";
  const OBSERVER_ID = "class-monitor";
  let pendingAdvisor = null;

  const ensureStyles = () => {
    if (document.querySelector('link[href^="css/interpretation-mods.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/interpretation-mods.css?v=1";
    document.head.appendChild(link);
  };

  const esc = value => App.escapeHTML(String(value ?? ""));
  const catalog = () => core.sanitizeCatalog(window.BAOInterpretationOfficialPack?.mods || []);

  const notify = (message, tone = "success") => {
    if (window.BAOFeedback?.notify) window.BAOFeedback.notify(message, tone);
    else window.alert(message);
  };

  const ensureState = () => {
    if (!window.GameState?.current) return core.normalizeState({});
    const normalized = core.normalizeState(GameState.current.interpretationMods || {});
    GameState.current.interpretationMods = normalized;
    return normalized;
  };

  const saveState = state => {
    if (!window.GameState?.current) return core.normalizeState(state);
    const normalized = core.normalizeState(state);
    GameState.current.interpretationMods = normalized;
    try { App.saveStory?.(false); } catch (_) {}
    return normalized;
  };

  const enabled = id => ensureState().enabled.includes(id);

  const lastAssistant = () => {
    const list = Array.isArray(window.Chat?.messages) ? Chat.messages : [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i]?.role === "assistant" && !list[i]?.greeting) return list[i];
    }
    return null;
  };

  const previousUser = message => {
    const list = Array.isArray(window.Chat?.messages) ? Chat.messages : [];
    const index = list.findIndex(item => String(item?.id || "") === String(message?.id || ""));
    for (let i = (index >= 0 ? index : list.length) - 1; i >= 0; i -= 1) {
      if (list[i]?.role === "user") return list[i];
    }
    return null;
  };

  const apiForAuxiliary = kind => {
    const api = structuredClone(App.config?.api || {});
    window.BAOCreditsPilot?.prepareAccountConfig?.(api);
    if (!api.model || !api.baseUrl || (!api.key && !window.BAOCreditsPilot?.isAccountReady?.(api))) return null;
    api.__auxiliaryTask = true;
    api.__interpretationTask = kind;
    return api;
  };

  const sendAuxiliary = async (kind, messages, maxOutputTokens) => {
    if (!Array.isArray(messages) || !messages.length || App.config?.demoMode) return "";
    const api = apiForAuxiliary(kind);
    if (!api) return "";
    api.maxOutputTokens = maxOutputTokens;
    const result = await API.send(api, messages);
    return String(result?.text || "").trim();
  };

  const generateAdvisor = async playerText => {
    const state = ensureState();
    if (!state.enabled.includes(ADVISOR_ID)) return "";
    const mods = core.activeForStage(state, catalog(), "pre_response_advisor");
    if (!mods.length) return "";
    const messages = core.buildAdvisorMessages({
      mods,
      playerText,
      previousScene: lastAssistant()?.content || "",
      detailMode: state.detailMode
    });
    try {
      return await sendAuxiliary("advisor", messages, state.detailMode === "detailed" ? 850 : 420);
    } catch (error) {
      console.warn("YoruBay interpretation advisor failed:", error);
      return "";
    }
  };

  const generateObserver = async (message, playerText = "") => {
    const state = ensureState();
    if (!state.enabled.includes(OBSERVER_ID) || !message?.content) return "";
    const mods = core.activeForStage(state, catalog(), "post_response_observer");
    if (!mods.length) return "";
    const messages = core.buildObserverMessages({
      mods,
      playerText,
      sceneText: message.content,
      detailMode: state.detailMode,
      monitorTone: state.monitorTone
    });
    try {
      return await sendAuxiliary("observer", messages, state.detailMode === "detailed" ? 900 : 480);
    } catch (error) {
      console.warn("YoruBay interpretation observer failed:", error);
      return "";
    }
  };

  const makeBlock = ({ type, title, icon, content }) => {
    const details = document.createElement("details");
    details.className = `bao-interpretation-mod-block bao-interpretation-${type}`;
    details.innerHTML = `
      <summary><span>${esc(icon)} ${esc(title)}</span><small>展開解讀</small></summary>
      <div class="bao-interpretation-mod-content">${App.formatMessage(content)}</div>`;
    return details;
  };

  const renderAll = () => {
    document.querySelectorAll(".bao-interpretation-mod-block").forEach(node => node.remove());
    if (!window.GameState?.current) return;
    const state = ensureState();
    const stream = document.getElementById("chat-stream");
    if (!stream) return;
    const messages = (Chat.messages || []).filter(item => item?.role === "assistant");
    const nodes = [...stream.querySelectorAll(".message.assistant")];

    messages.forEach((message, index) => {
      const output = core.outputFor(state, message.id);
      const host = nodes[index];
      if (!output || !host) return;
      let cursor = host;

      if (state.showAdvisor && output.advisor) {
        const block = makeBlock({ type: "advisor", title: "肉包解讀", icon: "🎀", content: output.advisor });
        cursor.insertAdjacentElement("afterend", block);
        cursor = block;
      }
      if (output.observer) {
        const block = makeBlock({ type: "observer", title: "班長解讀", icon: "📘", content: output.observer });
        cursor.insertAdjacentElement("afterend", block);
      }
    });
  };

  const activeLabels = state => {
    const set = new Set(core.normalizeState(state).enabled);
    return catalog().filter(item => set.has(item.id)).map(item => item.label);
  };

  const requestCount = state => {
    const set = new Set(core.normalizeState(state).enabled);
    return (set.has(ADVISOR_ID) ? 1 : 0) + (set.has(OBSERVER_ID) ? 1 : 0);
  };

  const callWarningText = state => {
    const count = requestCount(state);
    if (count === 2) return "雙系統每輪最多增加 2 次輔助模型請求：肉包 1 次在正文前、班長 1 次在正文後。";
    if (count === 1) return "目前每輪最多增加 1 次輔助模型請求。未觸發或沒有可分析內容時可能不產生輸出。";
    return "目前兩個模組都未啟用，不會增加模型請求。";
  };

  const close = () => document.querySelector(".bao-interpretation-mod-backdrop")?.remove();

  const open = () => {
    if (!window.GameState?.current || !App.activeCharacter) {
      notify("先進入一個故事，再設定雙向解讀。", "error");
      return;
    }
    ensureStyles();
    close();
    const state = ensureState();
    const active = new Set(state.enabled);
    const mods = catalog();
    const wrap = document.createElement("div");
    wrap.className = "bao-interpretation-mod-backdrop";
    wrap.innerHTML = `
      <section class="bao-interpretation-mod-panel" role="dialog" aria-modal="true" aria-labelledby="bao-interpretation-mod-title">
        <header>
          <div>
            <span class="eyebrow">TWO-WAY INTERPRETATION</span>
            <h2 id="bao-interpretation-mod-title">雙向解讀 MOD</h2>
            <p>肉包先整理玩家輸入給主模型參考；班長在正文完成後整理 NPC 的可見表現。兩者都不是讀心，也不會寫進主對話或長期記憶。</p>
          </div>
          <button type="button" class="bao-interpretation-mod-close" data-interpretation-close aria-label="關閉雙向解讀設定">×</button>
        </header>

        <div class="bao-interpretation-mod-warning">
          <b>這組 MOD 會真的分成生成前／生成後兩個階段</b>
          <span data-interpretation-cost>${esc(callWarningText(state))}</span>
        </div>

        <div class="bao-interpretation-mod-list">
          ${mods.map(mod => `
            <label class="bao-interpretation-mod-choice">
              <input type="checkbox" data-interpretation-mod="${esc(mod.id)}" ${active.has(mod.id) ? "checked" : ""}>
              <span>
                <b>${esc(mod.label)}<em>${esc(mod.badge)}</em></b>
                <small>${esc(mod.description)}</small>
              </span>
            </label>`).join("")}
        </div>

        <section class="bao-interpretation-mod-settings">
          <label>
            <span>解讀篇幅</span>
            <select data-interpretation-detail>
              <option value="compact" ${state.detailMode === "compact" ? "selected" : ""}>簡潔（預設）</option>
              <option value="detailed" ${state.detailMode === "detailed" ? "selected" : ""}>詳細</option>
            </select>
          </label>
          <label>
            <span>班長語氣</span>
            <select data-interpretation-tone>
              <option value="professional" ${state.monitorTone === "professional" ? "selected" : ""}>專業理性</option>
              <option value="banter" ${state.monitorTone === "banter" ? "selected" : ""}>輕鬆吐槽</option>
            </select>
          </label>
          <label class="bao-interpretation-inline-check">
            <input type="checkbox" data-interpretation-show-advisor ${state.showAdvisor ? "checked" : ""}>
            <span>正文後也顯示肉包的顧問摘要</span>
          </label>
        </section>

        <div class="bao-interpretation-mod-note">
          <b>優先級固定</b>
          <span>玩家明示內容 → 角色／世界硬設定 → 已發生事實與關係狀態 → 當前場景 → 肉包摘要。任何衝突都以左側較高優先級為準。</span>
        </div>

        <div class="bao-interpretation-mod-actions">
          <button type="button" class="primary" data-interpretation-done>完成</button>
        </div>

        <details class="bao-interpretation-mod-commands">
          <summary>文字指令</summary>
          <div>【啟用班長】 · 【關閉班長】 · 【啟用肉包】 · 【關閉肉包】 · 【啟用雙系統】 · 【關閉雙系統】 · 【班長切換專業模式】 · 【班長切換吐槽模式】 · 【解讀簡潔模式】 · 【解讀詳細模式】</div>
        </details>
      </section>`;
    document.body.appendChild(wrap);

    const refreshCost = () => {
      const node = wrap.querySelector("[data-interpretation-cost]");
      if (node) node.textContent = callWarningText(ensureState());
    };

    wrap.querySelectorAll("[data-interpretation-mod]").forEach(input => {
      input.addEventListener("change", event => {
        saveState(core.toggle(ensureState(), event.currentTarget.dataset.interpretationMod, event.currentTarget.checked));
        refreshCost();
      });
    });
    wrap.querySelector("[data-interpretation-detail]")?.addEventListener("change", event => {
      const stateNow = ensureState();
      saveState({ ...stateNow, detailMode: event.currentTarget.value === "detailed" ? "detailed" : "compact" });
    });
    wrap.querySelector("[data-interpretation-tone]")?.addEventListener("change", event => {
      const stateNow = ensureState();
      saveState({ ...stateNow, monitorTone: event.currentTarget.value === "banter" ? "banter" : "professional" });
    });
    wrap.querySelector("[data-interpretation-show-advisor]")?.addEventListener("change", event => {
      const stateNow = ensureState();
      saveState({ ...stateNow, showAdvisor: event.currentTarget.checked });
      renderAll();
    });
    wrap.querySelector("[data-interpretation-done]")?.addEventListener("click", close);
    wrap.querySelector("[data-interpretation-close]")?.addEventListener("click", close);
    wrap.addEventListener("click", event => { if (event.target === wrap) close(); });
  };

  const summary = () => {
    const state = ensureState();
    const mods = catalog();
    const enabledSet = new Set(state.enabled);
    const active = mods.filter(item => enabledSet.has(item.id));
    return {
      enabledCount: active.length,
      availableCount: mods.length,
      labels: active.map(item => item.label),
      items: mods.map(item => ({
        id: item.id,
        label: item.label,
        description: item.description,
        stage: item.stage,
        enabled: enabledSet.has(item.id)
      })),
      requestCount: requestCount(state),
      detailMode: state.detailMode,
      active: active.length > 0
    };
  };

  const handleCommand = raw => {
    const action = core.command(raw, catalog());
    if (!action) return false;
    const next = saveState(core.applyCommand(ensureState(), action));
    const labels = activeLabels(next);
    notify(labels.length ? `雙向解讀已切換：${labels.join("＋")}。` : "雙向解讀已全部關閉。");
    renderAll();
    return true;
  };

  if (typeof App.wrapBuildMessages === "function") {
    App.wrapBuildMessages("interpretation-mods:advisor-context", async function(next, ...args) {
      const messages = await next(...args);
      if (!pendingAdvisor?.content || pendingAdvisor.consumed) return messages;
      const result = Array.isArray(messages) ? messages.map(message => ({ ...message })) : [];
      let index = -1;
      for (let i = result.length - 1; i >= 0; i -= 1) {
        if (result[i]?.role === "user") { index = i; break; }
      }
      if (index < 0) return result;
      const visible = String(result[index].content || "");
      if (pendingAdvisor.playerText && !visible.includes(pendingAdvisor.playerText)) return result;
      const block = core.advisorContext(pendingAdvisor.content);
      if (!block) return result;
      result[index].content = [visible.trim(), block].filter(Boolean).join("\n\n");
      pendingAdvisor.consumed = true;
      return result;
    });
  }

  if (typeof App.wrapSendMessage === "function") {
    App.wrapSendMessage("interpretation-mods:lifecycle", async function(next, ...args) {
      const input = document.getElementById("user-input");
      const raw = String(input?.value || "").trim();
      if (raw.startsWith("【") && raw.endsWith("】") && handleCommand(raw)) {
        if (input) input.value = "";
        return true;
      }

      const before = new Set((Chat.messages || []).filter(item => item?.role === "assistant").map(item => String(item.id || "")));
      const advisor = raw ? await generateAdvisor(raw) : "";
      pendingAdvisor = advisor ? { playerText: raw, content: advisor, consumed: false } : null;

      try {
        const result = await next(...args);
        const target = [...(Chat.messages || [])].reverse().find(item => item?.role === "assistant" && !before.has(String(item.id || "")));
        if (!target) return result;

        const observer = await generateObserver(target, raw);
        if (advisor || observer) {
          const playerMessage = previousUser(target);
          const state = core.addOutput(ensureState(), {
            messageId: target.id,
            playerMessageId: playerMessage?.id || "",
            advisor,
            observer,
            createdAt: new Date().toISOString()
          });
          saveState(state);
          renderAll();
        }
        return result;
      } finally {
        pendingAdvisor = null;
      }
    });
  }

  if (typeof App.wrapRenderChatShell === "function") {
    App.wrapRenderChatShell("interpretation-mods:render", function(next, ...args) {
      const result = next(...args);
      window.setTimeout(renderAll, 0);
      return result;
    });
  }

  ensureStyles();

  window.BAOInterpretationMods = Object.freeze({
    open,
    close,
    summary,
    catalog,
    ensureState,
    renderAll,
    handleCommand
  });
})();
