(() => {
  "use strict";
  if (window.BAOStoryQuickCommands || !window.App || !window.BAOStoryQuickCommandsCore) return;

  const core = window.BAOStoryQuickCommandsCore;
  const esc = value => App.escapeHTML(String(value ?? ""));
  const close = () => document.querySelector(".story-quick-backdrop")?.remove();

  const ensureStyles = () => {
    if (document.querySelector('link[href^="css/story-quick-commands.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/story-quick-commands.css?v=2";
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

  const groups = () => ({ ...core.grouped(App.activeCharacter || {}, state()), event: window.BAOThreeRealmsEvents?.commands?.() || [], generator: window.BAOThreeRealmsEvents?.commands?.('generator') || [], query: window.BAOThreeRealmsEvents?.commands?.('query') || [], workshop: window.BAOThreeRealmsEvents?.commands?.('workshop') || [] });
  const summary = () => {
    const info = core.summary(App.activeCharacter || {}, state());
    const event = window.BAOThreeRealmsEvents?.commands?.() || [];
    const generator = window.BAOThreeRealmsEvents?.commands?.('generator') || [];
    const query = window.BAOThreeRealmsEvents?.commands?.('query') || [];
    const workshop = window.BAOThreeRealmsEvents?.commands?.('workshop') || [];
    if (event.length || generator.length || query.length || workshop.length) {
      info.title = `${info.groups.builtIn.length + info.groups.author.length + info.groups.player.length + event.length + generator.length + query.length + workshop.length} 個快捷指令`;
      info.detail += ` · ${event.length} 種三界事件 · ${generator.length} 種角色構思 · ${query.length} 種查詢整理 · ${workshop.length} 種世界與劇情構思`;
    }
    return info;
  };

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
            <p id="story-quick-intro">把常用的要求填進輸入框；夜灣不會替你送出，最後仍由你決定。</p>
          </div>
          <div class="story-quick-head-actions">
            <button type="button" class="story-quick-help" data-quick-help aria-label="快捷指令說明" aria-expanded="false" aria-controls="story-quick-intro">?</button>
            <button type="button" class="story-quick-close" data-quick-close aria-label="關閉快捷指令">×</button>
          </div>
        </header>

        ${groupHTML("常用", "夜灣提供的通用故事操作。", commandGroups.builtIn)}
        ${groupHTML("作品提供", "只有這個作品有提供時才會出現。", commandGroups.author)}
        ${groupHTML("三界事件", "選擇事件後填入輸入框，送出時才引導本輪故事。", commandGroups.event)}
        ${groupHTML("角色構思", "選擇氣運之子，或填入想融合的原作角色與作品。", commandGroups.generator)}
        ${groupHTML("查詢整理", "只整理故事中已知的關係、事件、物品與世界資訊。", commandGroups.query)}
        ${groupHTML("世界與劇情構思", "提出融合、自訂、切換或角色退場方案；由你選擇與調整。", commandGroups.workshop)}
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
          <section class="story-quick-share" aria-label="匯入與匯出快捷指令">
            <h4>分享／搬移我的指令</h4>
            <p class="note">只匯出這個故事裡自己建立的指令，不包含角色設定、聊天、API Key；匯入另一個故事前會先預覽。</p>
            <div class="story-quick-share-actions">
              <button type="button" class="secondary" data-quick-export ${commandGroups.player.length ? "" : "disabled"}>匯出指令 JSON</button>
              <button type="button" class="secondary" data-quick-import>匯入指令 JSON</button>
              <input type="file" accept=".json,application/json" data-quick-file hidden>
            </div>
            <p role="status" class="note" data-quick-share-status aria-live="polite"></p>
            <div data-quick-import-preview hidden></div>
          </section>
        </details>
      </section>`;
    document.body.appendChild(wrap);

    wrap.querySelector("[data-quick-close]")?.addEventListener("click", close);
    wrap.querySelector("[data-quick-help]")?.addEventListener("click", event => {
      const panel = event.currentTarget.closest(".story-quick-panel");
      const open = !panel?.classList.contains("story-quick-help-open");
      panel?.classList.toggle("story-quick-help-open", open);
      event.currentTarget.setAttribute("aria-expanded", open ? "true" : "false");
    });
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

    const owner = GameState.current;
    const shareStatus = wrap.querySelector("[data-quick-share-status]");
    const previewRoot = wrap.querySelector("[data-quick-import-preview]");
    const shareFile = wrap.querySelector("[data-quick-file]");
    const validOwner = () => GameState.current === owner && wrap.isConnected;
    wrap.querySelector("[data-quick-export]")?.addEventListener("click", () => {
      if (!validOwner()) return;
      const pack = core.exportPack(state());
      if (!pack.commands.length) {
        shareStatus.textContent = "本故事還沒有可以匯出的自訂指令。";
        return;
      }
      const data = JSON.stringify(pack, null, 2);
      const url = URL.createObjectURL(new Blob([data], { type: "application/json;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "yorubay-quick-commands.json";
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      shareStatus.textContent = "已產生指令包；可自行分享或帶到其他故事。";
    });
    wrap.querySelector("[data-quick-import]")?.addEventListener("click", () => {
      if (!validOwner()) return;
      shareFile.value = "";
      shareFile.click();
    });
    shareFile?.addEventListener("change", async () => {
      const file = shareFile.files?.[0];
      if (!file || !validOwner()) return;
      previewRoot.hidden = true;
      previewRoot.replaceChildren();
      try {
        if (file.size > core.MAX_IMPORT_BYTES)
          throw new Error("指令 JSON 不能超過 20 KB。");
        const pack = core.parsePack(await file.text());
        if (!validOwner()) return;
        const others = [...core.BUILT_INS, ...core.authorCommands(App.activeCharacter || {})];
        const plan = core.mergePack(state(), pack, others);
        if (!plan.added) {
          shareStatus.textContent = "沒有可新增的指令：" + plan.duplicates + " 條重複，" + plan.overflow + " 條超出上限。";
          return;
        }
        shareStatus.textContent = "以下只會新增到目前故事；請確認內容後再匯入。";
        const intro = document.createElement("p");
        intro.className = "note";
        intro.textContent = "可新增 " + plan.added + " 條 · 跳過重複 " + plan.duplicates + " 條 · 超出上限 " + plan.overflow + " 條";
        const list = document.createElement("div");
        list.className = "story-quick-import-items";
        for (const item of pack.commands) {
          const row = document.createElement("article");
          const label = document.createElement("strong"); label.textContent = item.label;
          const body = document.createElement("small"); body.textContent = item.text;
          row.append(label, body);
          list.append(row);
        }
        const actions = document.createElement("div");
        actions.className = "story-quick-share-actions";
        const confirm = document.createElement("button");
        confirm.type = "button"; confirm.className = "primary"; confirm.textContent = "確認加入本故事";
        const cancel = document.createElement("button");
        cancel.type = "button"; cancel.className = "secondary"; cancel.textContent = "取消";
        cancel.addEventListener("click", () => { previewRoot.hidden = true; previewRoot.replaceChildren(); shareStatus.textContent = "已取消匯入。"; });
        confirm.addEventListener("click", () => {
          if (!validOwner()) return;
          const fresh = core.mergePack(state(), pack, [...core.BUILT_INS, ...core.authorCommands(App.activeCharacter || {})]);
          if (fresh.added) write(fresh.commands);
          if (fresh.added) {
            open();
          } else {
            previewRoot.hidden = true;
            shareStatus.textContent = "沒有新指令加入，現有指令未變動。";
          }
        });
        actions.append(confirm, cancel);
        previewRoot.append(intro, list, actions);
        previewRoot.hidden = false;
      } catch (error) {
        if (validOwner()) shareStatus.textContent = "匯入失敗：" + String(error?.message || "指令包格式錯誤");
      }
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
    const nativeGroups = groups();
    const nativeCount = ['event', 'generator', 'query', 'workshop'].reduce((n, category) => n + nativeGroups[category].length, 0);
    button.textContent = `⌁ 快捷指令 · ${info.groups.author.length + info.groups.player.length ? info.groups.author.length + info.groups.player.length + " 個自訂" : "常用"}`;
    if (nativeCount) button.textContent += ' · 三界故事';
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
