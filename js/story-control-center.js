(() => {
  "use strict";
  if (window.BAOStoryControlCenter || !window.App || !window.BAOStoryControlCore) return;

  const core = window.BAOStoryControlCore;
  const esc = value => App.escapeHTML(String(value ?? ""));
  const close = () => document.querySelector(".story-control-backdrop")?.remove();

  const ensureStyles = () => {
    if (document.querySelector('link[href="css/story-control-center.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/story-control-center.css";
    document.head.appendChild(link);
  };

  const routeLabel = api => {
    if (window.BAOCreditsPilot?.isAccountReady?.(api)) return "夜灣官方額度";
    const base = String(api?.baseUrl || api?.base_url || "");
    if (/localhost|127\.0\.0\.1|\[?::1\]?/i.test(base)) return "本地 AI";
    if (api?.key) return "自備 API";
    return "";
  };

  const snapshot = () => {
    const config = App.config || {};
    const refs = window.BAOStoryLibrary?.refs?.() || {};
    const memoryDiag = window.Chat?.memoryDiagnostics?.(config) || {
      totalRounds: window.Chat?.turnCount?.() || 0,
      coveredRounds: 0,
      pendingRounds: 0,
      hasSummary: Boolean(window.Chat?.summary),
      health: {}
    };
    let notes = [];
    try { notes = window.BAOMemoryWorkbench?.readSlots?.() || []; } catch (_) {}
    let statusConfig = {};
    try { statusConfig = window.BAOCharacterStatus?.configFor?.(App.activeCharacter) || {}; } catch (_) {}
    const narrativeState = window.BAONarrativeSettings?.get?.() || {};
    const narrativeStatus = window.BAONarrativeSettings?.statusLabel?.(narrativeState) || {};
    let extensions = { title: "故事擴充使用原始設定", detail: "世界、閱讀與顯示規則" };
    try {
      const info = window.BAOStoryExtensionsCenter?.summary?.();
      if (info) extensions = info;
    } catch (_) {}
    let quick = { title: "常用快捷指令", detail: "點一下填入，不會自動送出" };
    try {
      const info = window.BAOStoryQuickCommands?.summary?.();
      if (info) quick = { title: info.title, detail: info.detail };
    } catch (_) {}
    let context = { title: "尚無上下文資料", detail: "完成一輪 AI 回覆後會顯示目前輸入壓力" };
    try {
      const health = window.BAOContextHealth?.snapshot?.();
      if (health?.pressure) {
        const pct = health.pressure.percent === null || health.pressure.percent === undefined
          ? ""
          : " · " + health.pressure.percent.toFixed(health.pressure.percent >= 100 ? 0 : 0) + "%";
        context = {
          title: health.pressure.label + pct,
          detail: health.pressure.input === null || health.pressure.input === undefined
            ? health.memory?.title || "尚無 Provider 用量資料"
            : Number(health.pressure.input).toLocaleString() + " tok 本輪輸入 · " + (health.memory?.title || "記憶正常")
        };
      }
    } catch (_) {}

    return {
      refs,
      stats: core.storyStats(window.Chat?.messages || [], refs),
      model: core.modelSummary(config.api || {}, routeLabel(config.api || {})),
      persona: core.personaSummary(config.persona || {}),
      memory: core.memorySummary(memoryDiag, Array.isArray(notes) ? notes.length : 0),
      context,
      status: core.statusSummary(statusConfig, window.BAOSceneHTML?.prefs?.status || "native"),
      extensions,
      narrative: core.narrativeSummary(narrativeStatus),
      quick
    };
  };

  const ACTIONS = {
    model() { window.BAOChatAPISettings?.open?.(); },
    persona() { window.BAOStoryActors?.open?.("player"); },
    memory() { window.BAOMemoryWorkbench?.open?.(); },
    context() { window.BAOContextHealth?.open?.(); },
    status() { window.BAOCharacterStatusUI?.openSettings?.(); },
    extensions() { window.BAOStoryExtensionsCenter?.open?.(); },
    narrative() { window.BAONarrativeSettings?.open?.(); },
    quick() { window.BAOStoryQuickCommands?.open?.(); },
    search() { window.BAOConversationSearch?.open?.(); },
    all() { window.BAOChatToolNavigation?.openDrawer?.(); }
  };

  const card = (id, eyebrow, data, hint) => `
    <button type="button" class="story-control-card" data-story-control-action="${id}">
      <span class="story-control-card-label">${esc(eyebrow)}</span>
      <strong>${esc(data.title)}</strong>
      <small>${esc(data.detail)}</small>
      <span class="story-control-card-link">${esc(hint)} →</span>
    </button>`;

  const open = () => {
    if (!GameState.current || !App.config) {
      window.BAOFeedback?.notify?.("先進入一個故事，再開啟故事控制台。", "error");
      return;
    }
    close();
    ensureStyles();
    const data = snapshot();
    const wrap = document.createElement("div");
    wrap.className = "story-control-backdrop";
    const title = App.activeCharacter?.name || "目前故事";
    wrap.innerHTML = `
      <section class="story-control-panel" role="dialog" aria-modal="true" aria-labelledby="story-control-title">
        <header class="story-control-head">
          <div>
            <div class="eyebrow">STORY CONTROL</div>
            <h2 id="story-control-title">本故事控制台</h2>
            <p><b>${esc(title)}</b> · ${esc(data.stats.chapter)} · 約 ${data.stats.turns.toLocaleString()} 輪</p>
          </div>
          <button type="button" class="story-control-close" data-story-control-close aria-label="關閉故事控制台">×</button>
        </header>
        <p class="story-control-intro">這裡只整理「目前這一份故事」正在使用的設定。API Key、全站語言與其他帳號設定仍留在原本的全域入口。</p>
        <div class="story-control-grid">
          ${card("model", "AI 模型", data.model, "切換模型")}
          ${card("persona", "玩家身份", data.persona, "調整人物")}
          ${card("memory", "故事記憶", data.memory, "查看記憶")}
          ${card("context", "上下文狀態", data.context, "查看前情")}
          ${card("status", "人物／世界狀態", data.status, "管理狀態")}
          ${card("extensions", "故事擴充", data.extensions, "查看作用範圍")}
          ${card("narrative", "敘事與描寫", data.narrative, "調整敘事")}
          ${card("quick", "快捷指令", data.quick, "打開指令")}
        </div>
        <footer class="story-control-footer">
          <button type="button" class="secondary" data-story-control-action="search">⌕ 搜尋這個故事</button>
          <button type="button" class="secondary" data-story-control-action="all">☰ 全部故事工具</button>
        </footer>
      </section>`;
    document.body.appendChild(wrap);

    wrap.querySelector("[data-story-control-close]")?.addEventListener("click", close);
    wrap.addEventListener("click", event => { if (event.target === wrap) close(); });
    wrap.querySelectorAll("[data-story-control-action]").forEach(button => {
      button.addEventListener("click", () => {
        const action = ACTIONS[button.dataset.storyControlAction];
        if (!action) return;
        close();
        window.setTimeout(action, 0);
      });
    });
    wrap.addEventListener("keydown", event => {
      if (event.key === "Escape") close();
    });
    wrap.querySelector("[data-story-control-close]")?.focus();
  };

  const injectEntry = () => {
    const chat = document.getElementById("chat-view");
    if (!chat?.classList.contains("active")) return;
    const bar = document.getElementById("bao-chat-tool-shortcuts");
    const host = bar || chat.querySelector(".chat-topline");
    if (!host || host.querySelector("[data-open-story-control]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary story-control-entry";
    button.dataset.openStoryControl = "true";
    button.textContent = "☷ 故事控制台";
    button.title = "查看這個故事目前使用的模型、身份、記憶、狀態與故事擴充";
    button.addEventListener("click", open);
    if (bar) {
      const all = bar.querySelector("button:last-child");
      if (all) bar.insertBefore(button, all);
      else bar.appendChild(button);
    } else host.appendChild(button);
  };

  const originalRender = App.renderChatShell.bind(App);
  App.renderChatShell = function(...args) {
    const result = originalRender(...args);
    window.setTimeout(injectEntry, 0);
    return result;
  };

  const originalShowView = App.showView.bind(App);
  App.showView = function(view, ...args) {
    const result = originalShowView(view, ...args);
    if (view === "chat") window.setTimeout(injectEntry, 0);
    return result;
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => window.setTimeout(injectEntry, 250));
  } else window.setTimeout(injectEntry, 250);

  window.BAOStoryControlCenter = Object.freeze({ open, close, snapshot, injectEntry });
})();
