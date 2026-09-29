(() => {
  "use strict";
  if (window.BAOStoryQuickCommands || !window.App || !window.BAOStoryQuickCommandsCore) return;

  const core = window.BAOStoryQuickCommandsCore;
  const esc = value => App.escapeHTML(String(value ?? ""));
  const close = () => document.querySelector(".story-quick-backdrop")?.remove();

  const ensureStyles = () => {
    if (document.querySelector('link[href="css/story-quick-commands.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/story-quick-commands.css";
    document.head.appendChild(link);
  };

  const state = () => {
    if (!GameState.current) return [];
    if (!Array.isArray(GameState.current.quickCommands)) GameState.current.quickCommands = [];
    return GameState.current.quickCommands;
  };

  const write = commands => {
    if (!GameState.current) return false;
    GameState.current.quickCommands = core.customCommands(commands).map(item => ({
      id: item.id,
      label: item.label,
      text: item.text
    }));
    try { App.saveStory?.(false); } catch (_) {}
    injectEntry();
    return true;
  };

  const groups = () => core.grouped(App.activeCharacter || {}, state());
  const summary = () => core.summary(App.activeCharacter || {}, state());

  const fillInput = command => {
    const input = document.getElementById("user-input");
    if (!input || !command?.text) return false;
    const before = String(input.value || "").trimEnd();
    input.value = before ? before + "\n" + command.text : command.text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
    window.BAOFeedback?.notify?.("已填入輸入框，尚未送出。");
    return true;
  };

  const commandCard = item => `
    <button type="button" class="story-quick-command" data-quick-id="${esc(item.id)}" data-quick-source="${esc(item.source)}">
      <strong>${esc(item.label)}</strong>
      <span>${esc(item.text)}</span>
      <em>填入輸入框 →</em>
    </button>`;

  const groupHTML = (title, note, items) => {
    if (!items.length) return "";
    return `
      <section class="story-quick-group">
        <div class="story-quick-group-head"><h3>${esc(title)}</h3><p>${esc(note)}</p></div>
        <div class="story-quick-grid">${items.map(commandCard).join("")}</div>
      </section>`;
  };

  const renderCustomList = items => items.length
    ? `<div class="story-quick-custom-list">${items.map(item => `
        <div class="story-quick-custom-row">
          <div><b>${esc(item.label)}</b><small>${esc(item.text)}</small></div>
          <button type="button" class="text-button" data-quick-delete="${esc(item.id)}">刪除</button>
        </div>`).join("")}</div>`
    : '<p class="note">這個故事還沒有你自己建立的快捷指令。</p>';

  const open = () => {
    if (!GameState.current) {
      window.BAOFeedback?.notify?.("先進入一個故事，再使用快捷指令。", "error");
      return;
    }
    close();
    ensureStyles();
    const commandGroups = groups();
    const wrap = document.createElement("div");
    wrap.className = "story-quick-backdrop";
    wrap.innerHTML = `
      <section class="story-quick-panel" role="dialog" aria-modal="true" aria-labelledby="story-quick-title">
        <header class="story-quick-head">
          <div>
            <div class="eyebrow">QUICK COMMANDS</div>
            <h2 id="story-quick-title">快捷指令</h2>
            <p>把常用的要求填進輸入框；夜灣不會替你送出，最後仍由你決定。</p>
          </div>
          <button type="button" class="story-quick-close" data-quick-close aria-label="關閉快捷指令">×</button>
        </header>

        ${groupHTML("常用", "夜灣提供的通用故事操作。", commandGroups.builtIn)}
        ${groupHTML("作品提供", "只有這個作品有提供時才會出現。", commandGroups.author)}
        ${groupHTML("我的快捷指令", "只保存在目前這份故事。", commandGroups.player)}

        <details class="story-quick-editor">
          <summary>＋ 新增我的快捷指令</summary>
          <form data-quick-form>
            <label>名稱<input name="label" maxlength="${core.MAX_LABEL}" placeholder="例如：慢慢推進"></label>
            <label>填入內容<textarea name="text" maxlength="${core.MAX_TEXT}" required placeholder="例如：放慢節奏，多寫人物反應與環境，不替我做決定。"></textarea></label>
            <div class="story-quick-editor-actions">
              <span class="note">最多 ${core.MAX_CUSTOM} 個；儲存在目前故事。</span>
              <button type="submit" class="primary">儲存快捷指令</button>
            </div>
          </form>
          ${renderCustomList(commandGroups.player)}
        </details>
      </section>`;
    document.body.appendChild(wrap);

    wrap.querySelector("[data-quick-close]")?.addEventListener("click", close);
    wrap.addEventListener("click", event => { if (event.target === wrap) close(); });
    wrap.addEventListener("keydown", event => { if (event.key === "Escape") close(); });

    wrap.querySelectorAll("[data-quick-id]").forEach(button => {
      button.addEventListener("click", () => {
        const source = button.dataset.quickSource;
        const item = groups()[source === "built_in" ? "builtIn" : source]?.find(command => command.id === button.dataset.quickId);
        if (!item || !fillInput(item)) return;
        close();
      });
    });

    wrap.querySelector("[data-quick-form]")?.addEventListener("submit", event => {
      event.preventDefault();
      const form = event.currentTarget;
      const label = String(new FormData(form).get("label") || "").trim();
      const text = String(new FormData(form).get("text") || "").trim();
      if (!text) return;
      const current = core.customCommands(state());
      if (current.length >= core.MAX_CUSTOM) {
        window.BAOFeedback?.notify?.(`這個故事最多 ${core.MAX_CUSTOM} 個自訂快捷指令。`, "error");
        return;
      }
      const item = core.normalizeCommand({ id: "player-" + Date.now(), label: label || text, text }, current.length, "player");
      if (!item) return;
      write([...current, item]);
      open();
    });

    wrap.querySelectorAll("[data-quick-delete]").forEach(button => {
      button.addEventListener("click", () => {
        const id = button.dataset.quickDelete;
        write(core.customCommands(state()).filter(item => item.id !== id));
        open();
      });
    });

    wrap.querySelector("[data-quick-close]")?.focus();
  };

  const injectEntry = () => {
    const row = document.getElementById("bao-player-settings");
    if (!row) return;
    let button = row.querySelector('[data-bao-open="quick-commands"]');
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.dataset.baoOpen = "quick-commands";
      button.addEventListener("click", open);
      row.appendChild(button);
    }
    const info = summary();
    button.textContent = `⌁ 快捷指令 · ${info.groups.author.length + info.groups.player.length ? info.groups.author.length + info.groups.player.length + " 個自訂" : "常用"}`;
    button.title = "把常用故事要求填入輸入框，不會自動送出";
  };

  const originalShell = App.renderChatShell.bind(App);
  App.renderChatShell = function(...args) {
    const result = originalShell(...args);
    window.setTimeout(injectEntry, 0);
    return result;
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => window.setTimeout(injectEntry, 250));
  } else window.setTimeout(injectEntry, 250);

  window.BAOStoryQuickCommands = Object.freeze({ open, close, groups, summary, fillInput, state, write, injectEntry });
})();
