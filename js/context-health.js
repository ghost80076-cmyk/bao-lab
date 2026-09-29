(() => {
  "use strict";
  if (window.BAOContextHealth || !window.App || !window.Chat || !window.BAOContextHealthCore) return;

  const core = window.BAOContextHealthCore;
  const esc = value => App.escapeHTML(String(value ?? ""));
  const close = () => document.querySelector(".context-health-backdrop")?.remove();

  const ensureStyles = () => {
    if (document.querySelector('link[href="css/context-health.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/context-health.css";
    document.head.appendChild(link);
  };

  const lastStoryUsage = () => {
    const list = Array.isArray(Chat.usageLedger) ? Chat.usageLedger : [];
    return [...list].reverse().find(item => item?.kind === "story") || [...list].reverse().find(Boolean) || {};
  };

  const snapshot = () => {
    const config = App.config || {};
    const memoryDiag = Chat.memoryDiagnostics?.(config) || {
      totalRounds: Chat.turnCount?.() || 0,
      recentRounds: 0,
      coveredRounds: 0,
      pendingRounds: 0,
      hasSummary: Boolean(Chat.summary),
      health: {}
    };
    let notes = [];
    try { notes = window.BAOMemoryWorkbench?.readSlots?.() || []; } catch (_) {}
    const noteCount = Array.isArray(notes) ? notes.filter(item => item?.enabled !== false && String(item?.text || "").trim()).length : 0;

    let worldDefs = [];
    try { worldDefs = window.BAOWorldModules?.definitions?.(App.activeCharacter) || []; } catch (_) {}

    let statusConfig = {};
    try { statusConfig = window.BAOCharacterStatus?.configFor?.(App.activeCharacter) || {}; } catch (_) {}
    const statusTracked = statusConfig?.enabled !== false && Array.isArray(statusConfig?.fields) && statusConfig.fields.length > 0;

    const narrativeState = window.BAONarrativeSettings?.get?.() || {};
    const narrativeStatus = window.BAONarrativeSettings?.statusLabel?.(narrativeState) || { items: [] };
    const usage = lastStoryUsage();

    return core.summary({
      lastInputTokens: Chat.lastStoryPromptTokens || usage.input,
      budget: config.memory?.maxContext,
      guard: Chat.contextGuard || {},
      memoryDiag,
      noteCount,
      lastStoryUsage: usage,
      hasCharacter: Boolean(App.activeCharacter),
      characterDetail: App.activeCharacter?.name || "",
      recentRounds: Chat.contextGuard?.recentRounds || memoryDiag.recentRounds || 0,
      hasSummary: Boolean(memoryDiag.hasSummary || Chat.summary),
      coveredRounds: memoryDiag.coveredRounds || 0,
      personaName: config.persona?.name || "",
      worldCount: Array.isArray(worldDefs) ? worldDefs.length : 0,
      statusTracked,
      narrativeCount: Array.isArray(narrativeStatus.items) ? narrativeStatus.items.length : 0,
      contextPackConfirmed: Boolean(GameState.current?.contextPack?.playerConfirmed)
    });
  };

  const formatTok = value => value === null || value === undefined || !Number.isFinite(Number(value))
    ? "尚無資料"
    : Number(value).toLocaleString() + " tok";

  const guardCopy = data => {
    const p = data.pressure;
    if (p.level === "manual") return "目前使用完整上下文模式；夜灣不會依管理預算自動縮短近期原文。";
    if (p.level === "critical") return "已接近夜灣管理預算；系統會優先整理較早內容，但未成功摘要的原文不會被靜默丟棄。";
    if (p.level === "high") return "輸入量偏高；系統正在縮短近期保留範圍並用長期摘要保護前情。";
    if (p.level === "watch") return "輸入量開始接近整理區間；夜灣會準備把較早劇情整理成長期記憶。";
    if (p.level === "normal") return "目前空間充足；近期劇情可以直接以原文參與故事。";
    return "還沒有足夠的模型用量資料。完成一輪 AI 回覆後會顯示目前輸入壓力。";
  };

  const open = () => {
    if (!GameState.current || !App.config) {
      window.BAOFeedback?.notify?.("先進入一個故事，再查看上下文狀態。", "error");
      return;
    }
    close();
    ensureStyles();
    const data = snapshot();
    const p = data.pressure;
    const pct = p.percent === null ? null : Math.min(100, p.percent);
    const ratioText = p.percent === null ? "—" : p.percent.toFixed(p.percent >= 100 ? 0 : 1) + "%";

    const wrap = document.createElement("div");
    wrap.className = "context-health-backdrop";
    wrap.innerHTML = `
      <section class="context-health-panel" role="dialog" aria-modal="true" aria-labelledby="context-health-title">
        <header class="context-health-head">
          <div>
            <div class="eyebrow">CONTEXT HEALTH</div>
            <h2 id="context-health-title">上下文狀態</h2>
            <p>看懂這個故事目前「帶了多少前情」，不用先理解 Token 工程細節。</p>
          </div>
          <button type="button" class="context-health-close" data-context-health-close aria-label="關閉上下文狀態">×</button>
        </header>

        <section class="context-health-hero" data-level="${esc(p.level)}">
          <div class="context-health-hero-line">
            <div><span>目前輸入壓力</span><strong>${esc(p.label)}</strong></div>
            <b>${esc(ratioText)}</b>
          </div>
          <div class="context-health-meter" aria-label="目前輸入占夜灣管理預算比例"><i style="width:${pct === null ? 0 : pct}%"></i></div>
          <p>${esc(guardCopy(data))}</p>
          <div class="context-health-numbers">
            <span>本輪輸入 <b>${esc(formatTok(p.input))}</b></span>
            <span>夜灣管理預算 <b>${esc(formatTok(p.budget))}</b></span>
            <span>近期原文 <b>${data.recentRounds ? esc(data.recentRounds + " 輪") : "—"}</b></span>
          </div>
        </section>

        <div class="context-health-cards">
          <article><span>故事記憶</span><strong>${esc(data.memory.title)}</strong><small>${esc(data.memory.detail)}</small></article>
          <article><span>Prompt Cache</span><strong>${esc(data.cache.title)}</strong><small>${esc(data.cache.detail)}</small></article>
        </div>

        <section class="context-health-layers">
          <div class="context-health-section-title">
            <div><h3>目前故事層</h3><p>這裡顯示哪些資料層已啟用，不假裝估算每一層的精確 Token 佔比。</p></div>
          </div>
          <div class="context-health-layer-list">
            ${data.layers.map(item => `
              <div class="context-health-layer ${item.active ? "active" : "inactive"}">
                <span class="context-health-dot" aria-hidden="true"></span>
                <div><b>${esc(item.label)}</b><small>${esc(item.detail)}</small></div>
                <em>${item.active ? "使用中" : "未啟用"}</em>
              </div>`).join("")}
          </div>
        </section>

        <details class="context-health-advanced">
          <summary>進階 Token 說明</summary>
          <p><b>夜灣管理預算</b>是夜灣用來決定何時整理舊劇情的參考值，不等於模型官方 Context Window。真正上限與計費仍由你選擇的模型／服務商決定。</p>
          <p>「本輪輸入」來自 Provider 回報時才會顯示；不同 Provider 對快取 Token 的回報方式可能不同，因此未知時不推算。</p>
        </details>

        <footer class="context-health-footer">
          <button type="button" class="secondary" data-context-action="memory">🧠 查看／調整記憶</button>
          <button type="button" class="secondary" data-context-action="control">☷ 回到故事控制台</button>
        </footer>
      </section>`;

    document.body.appendChild(wrap);
    wrap.querySelector("[data-context-health-close]")?.addEventListener("click", close);
    wrap.addEventListener("click", event => { if (event.target === wrap) close(); });
    wrap.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
    wrap.querySelector('[data-context-action="memory"]')?.addEventListener("click", () => {
      close();
      window.setTimeout(() => window.BAOMemoryWorkbench?.open?.(), 0);
    });
    wrap.querySelector('[data-context-action="control"]')?.addEventListener("click", () => {
      close();
      window.setTimeout(() => window.BAOStoryControlCenter?.open?.(), 0);
    });
    wrap.querySelector("[data-context-health-close]")?.focus();
  };

  const entryLabel = () => {
    const data = snapshot();
    const p = data.pressure;
    if (p.percent === null) return "◔ 上下文狀態";
    const pct = Math.max(0, p.percent);
    return `◔ 上下文 ${pct.toFixed(pct >= 100 ? 0 : 0)}%`;
  };

  const injectEntry = () => {
    const bar = document.querySelector("#chat-view .usage-bar");
    if (!bar) return;
    let button = bar.querySelector("[data-open-context-health]");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "context-health-entry";
      button.dataset.openContextHealth = "true";
      button.addEventListener("click", open);
      bar.appendChild(button);
    }
    button.textContent = entryLabel();
    button.title = "查看本輪輸入、故事記憶、近期原文與目前啟用的上下文層";
  };

  const originalRenderUsage = Chat.renderUsage?.bind(Chat);
  if (originalRenderUsage && !Chat.__contextHealthRenderWrapped) {
    Chat.renderUsage = function(...args) {
      const result = originalRenderUsage(...args);
      window.setTimeout(injectEntry, 0);
      return result;
    };
    Chat.__contextHealthRenderWrapped = true;
  }

  const originalShell = App.renderChatShell.bind(App);
  App.renderChatShell = function(...args) {
    const result = originalShell(...args);
    window.setTimeout(injectEntry, 0);
    return result;
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => window.setTimeout(injectEntry, 250));
  } else window.setTimeout(injectEntry, 250);

  window.BAOContextHealth = Object.freeze({ open, close, snapshot, injectEntry });
})();
