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
    let worldDefs = [];
    try { worldDefs = window.BAOWorldModules?.definitions?.(App.activeCharacter) || []; } catch (_) {}
    const narrativeState = window.BAONarrativeSettings?.get?.() || {};
    const narrativeStatus = window.BAONarrativeSettings?.statusLabel?.(narrativeState) || {};
    let replaceState = {};
    try { replaceState = window.BAOPlayerTextReplace?.get?.() || {}; } catch (_) {}

    return {
      refs,
      stats: core.storyStats(window.Chat?.messages || [], refs),
      model: core.modelSummary(config.api || {}, routeLabel(config.api || {})),
      persona: core.personaSummary(config.persona || {}),
      memory: core.memorySummary(memoryDiag, Array.isArray(notes) ? notes.length : 0),
      status: core.statusSummary(statusConfig, window.BAOSceneHTML?.prefs?.status || "native"),
      world: core.worldSummary(worldDefs),
      narrative: core.narrativeSummary(narrativeStatus),
      mod: core.modSummary(replaceState)
    };
  };

  const ACTIONS = {
    model() { window.BAOChatAPISettings?.open?.(); },
    persona() { window.BAOStoryActors?.open?.("player"); },
    memory() { window.BAOMemoryWorkbench?.open?.(); },
    status() { window.BAOCharacterStatusUI?.openSettings?.(); },
    world() { window.BAOWorldModuleManager?.open?.(); },
    narrative() { window.BAONarrativeSettings?.open?.(); },
    mod() { document.querySelector('[data-bao-open="text-replace"]')?.click(); },
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
          ${card("status", "人物／世界狀態", data.status, "管理狀態")}
          ${card("world", "世界模組", data.world, "管理模組")}
          ${card("narrative", "敘事與描寫", data.narrative, "調整敘事")}
          ${card("mod", "顯示 MOD", data.mod, "文字替換")}
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
    button.title = "查看這個故事目前使用的模型、身份、記憶、狀態與模組";
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => window.setTimeout(injectEntry, 250));
  } else window.setTimeout(injectEntry, 250);

  window.BAOStoryControlCenter = Object.freeze({ open, close, snapshot, injectEntry });
})();
