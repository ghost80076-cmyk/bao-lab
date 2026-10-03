(() => {
  "use strict";
  if (window.BAOActorMode || !window.App || !window.BAOActorModeCore) return;

  const core = window.BAOActorModeCore;
  const esc = value => App.escapeHTML(String(value ?? ""));

  const defaults = () => {
    const raw = App.activeCharacter?.actor_mode;
    return raw && typeof raw === "object" ? raw : {};
  };

  const ensureStyles = () => {
    if (document.querySelector('link[href^="css/actor-mode.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/actor-mode.css?v=1";
    document.head.appendChild(link);
  };

  const notify = (message, tone = "success") => {
    if (window.BAOFeedback?.notify) window.BAOFeedback.notify(message, tone);
    else window.alert(message);
  };

  const ensureState = () => {
    if (!window.GameState?.current) return core.normalizeState({}, defaults());
    const normalized = core.normalizeState(GameState.current.actorMode || {}, defaults());
    GameState.current.actorMode = normalized;
    return normalized;
  };

  const saveState = state => {
    if (!window.GameState?.current) return core.normalizeState(state, defaults());
    const normalized = core.normalizeState(state, defaults());
    GameState.current.actorMode = normalized;
    try { App.saveStory?.(false); } catch (_) {}
    return normalized;
  };

  const close = () => document.querySelector(".bao-actor-mode-backdrop")?.remove();

  const open = () => {
    if (!window.GameState?.current || !App.activeCharacter) {
      notify("先進入一個故事，再設定演員模式。", "error");
      return;
    }
    ensureStyles();
    close();
    const state = ensureState();
    const role = state.role || {};
    const wrap = document.createElement("div");
    wrap.className = "bao-actor-mode-backdrop";
    wrap.innerHTML = [
      '<section class="bao-actor-mode-panel" role="dialog" aria-modal="true" aria-labelledby="bao-actor-mode-title">',
      '<header><div><span class="bao-actor-mode-eyebrow">ROLE LAYER MOD</span><h2 id="bao-actor-mode-title">演員模式</h2>',
      '<p>把「角色本體」與「這一場正在演的人」分開。只增加主提示詞，不會多送一次模型請求。</p></div>',
      '<button type="button" class="bao-actor-mode-close" data-actor-close aria-label="關閉">×</button></header>',
      '<div class="bao-actor-mode-note"><b>它不做什麼</b><span>不取代世界引擎、不讓 NPC 讀心、不把鏡月或其他演員變成整個世界。</span></div>',
      '<label class="bao-actor-toggle"><input type="checkbox" data-actor-enabled ' + (state.enabled ? "checked" : "") + '><span><b>啟用演員模式</b><small>角色本體保留；戲中身份另外成立。</small></span></label>',
      '<label class="bao-actor-toggle"><input type="checkbox" data-actor-active ' + (state.roleActive ? "checked" : "") + '><span><b>目前正在扮演</b><small>關閉時回到角色本體；不會刪掉下面的角色草稿。</small></span></label>',
      '<div class="bao-actor-mode-grid">',
      '<label>本場角色／身份<input data-actor-field="label" value="' + esc(role.label || "") + '" placeholder="例如：對玩家有戒心的新鄰居"></label>',
      '<label>身份設定<textarea data-actor-field="identity" placeholder="職業、經歷、處境…">' + esc(role.identity || "") + '</textarea></label>',
      '<label>與玩家的戲中關係<textarea data-actor-field="relationship" placeholder="只寫戲中的關係">' + esc(role.relationship || "") + '</textarea></label>',
      '<label>人格與行為<textarea data-actor-field="personality" placeholder="性格、價值觀、觸發與例外…">' + esc(role.personality || "") + '</textarea></label>',
      '<label>語氣<textarea data-actor-field="voice" placeholder="用詞、句式、距離感…">' + esc(role.voice || "") + '</textarea></label>',
      '<label>目前動機<textarea data-actor-field="motive" placeholder="這個人此刻真正想做什麼？">' + esc(role.motive || "") + '</textarea></label>',
      '<label class="bao-actor-wide">資訊邊界<textarea data-actor-field="knowledge" placeholder="這個角色現在合理知道什麼／不知道什麼？">' + esc(role.knowledge || "") + '</textarea></label>',
      '</div>',
      '<details class="bao-actor-mode-commands"><summary>快捷指令</summary><div>【啟用演員模式】 · 【開始扮演】 · 【停止扮演】 · 【清除戲中角色】</div></details>',
      '<div class="bao-actor-mode-actions"><button type="button" class="secondary" data-actor-clear>清除戲中角色</button><button type="button" class="primary" data-actor-save>儲存</button></div>',
      '</section>'
    ].join("");

    const readRole = () => {
      const out = {};
      wrap.querySelectorAll("[data-actor-field]").forEach(node => { out[node.dataset.actorField] = node.value; });
      return out;
    };

    wrap.querySelector("[data-actor-save]")?.addEventListener("click", () => {
      saveState({
        ...state,
        enabled: wrap.querySelector("[data-actor-enabled]")?.checked === true,
        roleActive: wrap.querySelector("[data-actor-active]")?.checked === true,
        role: readRole()
      });
      notify("演員模式已儲存。");
      close();
    });

    wrap.querySelector("[data-actor-clear]")?.addEventListener("click", () => {
      saveState(core.applyCommand(ensureState(), { type: "clearRole" }, defaults()));
      notify("已清除戲中角色；演員本體保留。");
      close();
    });

    wrap.querySelector("[data-actor-close]")?.addEventListener("click", close);
    wrap.addEventListener("click", event => { if (event.target === wrap) close(); });
    document.body.appendChild(wrap);
  };

  const handleCommand = raw => {
    const action = core.command(raw);
    if (!action) return false;
    const next = saveState(core.applyCommand(ensureState(), action, defaults()));
    const label = next.roleActive ? (next.role?.label || "目前角色") : App.activeCharacter?.name || "角色本體";
    if (action.type === "enabled") notify(next.enabled ? "演員模式已啟用。" : "演員模式已停用。");
    else if (action.type === "clearRole") notify("已清除戲中角色。");
    else notify(next.roleActive ? "已進入：" + label + "。" : "已停止扮演，回到角色本體。");
    return true;
  };

  if (typeof App.wrapBuildMessages === "function") {
    App.wrapBuildMessages("actor-mode:role-layer", async function(next, ...args) {
      const messages = await next(...args);
      const state = ensureState();
      const prompt = core.buildPrompt({
        state,
        defaults: defaults(),
        actorName: App.activeCharacter?.name || ""
      });
      if (!prompt) return messages;
      const result = Array.isArray(messages) ? messages.map(message => ({ ...message })) : [];
      const systemIndex = result.findIndex(message => message?.role === "system");
      if (systemIndex >= 0) {
        result[systemIndex].content = [String(result[systemIndex].content || "").trim(), prompt].filter(Boolean).join("\n\n");
      } else {
        result.unshift({ role: "system", content: prompt });
      }
      return result;
    });
  }

  if (typeof App.wrapSendMessage === "function") {
    App.wrapSendMessage("actor-mode:commands", async function(next, ...args) {
      const input = document.getElementById("user-input");
      const raw = String(input?.value || "").trim();
      if (raw.startsWith("【") && raw.endsWith("】") && handleCommand(raw)) {
        if (input) input.value = "";
        return true;
      }
      return next(...args);
    });
  }

  const summary = () => {
    const state = ensureState();
    const label = state.roleActive ? String(state.role?.label || "").trim() : "";
    return {
      enabled: state.enabled === true,
      roleActive: state.roleActive === true,
      roleLabel: label,
      actorName: App.activeCharacter?.name || "",
      active: state.enabled === true
    };
  };

  window.BAOActorMode = Object.freeze({
    open,
    close,
    summary,
    state: ensureState,
    save: saveState
  });
})();
