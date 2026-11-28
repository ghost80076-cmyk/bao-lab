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
    link.href = "css/story-quick-commands.css?v=3";
    document.head.appendChild(link);
  };

  const state = () => {
    if (!GameState.current) return [];
    return Array.isArray(GameState.current.quickCommands) ? GameState.current.quickCommands : [];
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

  const libraryState = () => {
    try { return core.readLibrary(window.localStorage); } catch (_) { return []; }
  };
  const writeLibrary = commands => {
    try { core.writeLibrary(window.localStorage, commands); }
    catch (error) { window.BAOFeedback?.notify?.("個人指令庫未儲存：" + String(error?.message || "本機儲存不可用"), "error"); return false; }
    injectEntry();
    return true;
  };
  const groups = () => ({ ...core.grouped(App.activeCharacter || {}, state(), libraryState()), event: window.BAOThreeRealmsEvents?.commands?.() || [], generator: window.BAOThreeRealmsEvents?.commands?.('generator') || [], query: window.BAOThreeRealmsEvents?.commands?.('query') || [], workshop: window.BAOThreeRealmsEvents?.commands?.('workshop') || [] });
  const summary = () => {
    const info = core.summary(App.activeCharacter || {}, state(), libraryState());
    const event = window.BAOThreeRealmsEvents?.commands?.() || [];
    const generator = window.BAOThreeRealmsEvents?.commands?.('generator') || [];
    const query = window.BAOThreeRealmsEvents?.commands?.('query') || [];
    const workshop = window.BAOThreeRealmsEvents?.commands?.('workshop') || [];
    if (event.length || generator.length || query.length || workshop.length) {
      info.title = `${info.groups.builtIn.length + info.groups.author.length + info.groups.player.length + info.groups.library.length + event.length + generator.length + query.length + workshop.length} 個快捷指令`;
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
    : '<p class="note">目前這個儲存範圍還沒有自訂快捷指令。</p>';

  const open = (requestedScope = "story", editorOpen = false) => {
    if (!GameState.current) {
      window.BAOFeedback?.notify?.("先進入一個故事，再使用快捷指令。", "error");
      return;
    }
    close();
    ensureStyles();
    const owner = GameState.current;
    const shared = requestedScope === "library";
    const scope = shared ? "library" : "story";
    const scopeLabel = shared ? "個人指令庫" : "本故事";
    const scopedState = shared ? libraryState : state;
    const scopedWrite = shared ? writeLibrary : write;
    const otherCommands = () => shared ? core.BUILT_INS : [...core.BUILT_INS, ...core.authorCommands(App.activeCharacter || {})];
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

        ${groupHTML("常用", "夜灣提供的通用故事操作。", commandGroups.builtIn.filter(item => !core.DIRECTOR_IDS.includes(item.id)))}
        ${groupHTML("劇情引導", "只引導下一輪；有合理契機才發展。", commandGroups.builtIn.filter(item => core.DIRECTOR_IDS.slice(0, 4).includes(item.id)))}
        ${groupHTML("演繹校正", "依有效設定與已發生事件延續，不會自動重寫歷史。", commandGroups.builtIn.filter(item => core.DIRECTOR_IDS.slice(4).includes(item.id)))}
        ${groupHTML("作品提供", "只有這個作品有提供時才會出現。", commandGroups.author)}
        ${groupHTML("三界事件", "選擇事件後填入輸入框，送出時才引導本輪故事。", commandGroups.event)}
        ${groupHTML("角色構思", "選擇氣運之子，或填入想融合的原作角色與作品。", commandGroups.generator)}
        ${groupHTML("查詢整理", "只整理故事中已知的關係、事件、物品與世界資訊。", commandGroups.query)}
        ${groupHTML("世界與劇情構思", "提出融合、自訂、切換或角色退場方案；由你選擇與調整。", commandGroups.workshop)}
        ${groupHTML("我的快捷指令", "只保存在目前這份故事。", commandGroups.player)}
        ${groupHTML("個人指令庫", "同一瀏覽器可跨故事使用；不會自動注入或同步。", commandGroups.library)}

        <details class="story-quick-editor" ${editorOpen ? "open" : ""}>
          <summary>＋ 新增我的快捷指令</summary>
          <div class="story-quick-share-actions" aria-label="指令儲存範圍">
            <button type="button" class="secondary" data-quick-scope="story" aria-pressed="${!shared}">本故事</button>
            <button type="button" class="secondary" data-quick-scope="library" aria-pressed="${shared}">個人指令庫</button>
          </div>
          <p class="note">${shared ? "個人指令庫保存在此瀏覽器，不會隨故事存檔或跨裝置同步；可匯出 JSON 備份。" : "本故事指令隨故事保存，不會自動加入其他故事。"}</p>
          <form data-quick-form>
            <label>名稱<input name="label" maxlength="${core.MAX_LABEL}" placeholder="例如：慢慢推進"></label>
            <label>填入內容<textarea name="text" maxlength="${core.MAX_TEXT}" required placeholder="例如：放慢節奏，多寫人物反應與環境，不替我做決定。"></textarea></label>
            <div class="story-quick-editor-actions">
              <span class="note">最多 ${core.MAX_CUSTOM} 個；儲存在${scopeLabel}。</span>
              <button type="submit" class="primary">儲存快捷指令</button>
            </div>
          </form>
          ${renderCustomList(core.customCommands(scopedState()))}
          <section class="story-quick-share" aria-label="匯入與匯出快捷指令">
            <h4>分享／搬移我的指令</h4>
            <p class="note">只匯出所選範圍自己建立的指令，不附帶角色卡或聊天資料；如果指令文字本身含金鑰或個資，也會一起匯出，分享前請先檢查。</p>
            <div class="story-quick-share-actions">
              <button type="button" class="secondary" data-quick-export ${core.customCommands(scopedState()).length ? "" : "disabled"}>匯出指令 JSON</button>
              <button type="button" class="secondary" data-quick-import>匯入指令 JSON</button>
              <input type="file" accept=".json,application/json" data-quick-file hidden>
            </div>
            <p role="status" class="note" data-quick-share-status aria-live="polite"></p>
            <div data-quick-import-preview hidden></div>
          </section>
        </details>
      </section>`;
    document.body.appendChild(wrap);
    const validOwner = () => GameState.current === owner && wrap.isConnected;
    wrap.querySelectorAll("[data-quick-scope]").forEach(button => button.addEventListener("click", () => {
      if (validOwner()) open(button.dataset.quickScope, true);
    }));

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
        if (!validOwner()) return;
        const source = button.dataset.quickSource;
        const item = groups()[source === "built_in" ? "builtIn" : source]?.find(command => command.id === button.dataset.quickId);
        if (!item || !fillInput(item)) return;
        close();
      });
    });

    wrap.querySelector("[data-quick-form]")?.addEventListener("submit", event => {
      event.preventDefault();
      if (!validOwner()) return;
      const form = event.currentTarget;
      const label = String(new FormData(form).get("label") || "").trim();
      const text = String(new FormData(form).get("text") || "").trim();
      if (!text) return;
      const current = core.customCommands(scopedState());
      if (current.length >= core.MAX_CUSTOM) {
        window.BAOFeedback?.notify?.(`${scopeLabel}最多 ${core.MAX_CUSTOM} 個自訂快捷指令。`, "error");
        return;
      }
      const item = core.normalizeCommand({ id: "player-" + Date.now(), label: label || text, text }, current.length, "player");
      if (!item) return;
      if (shared && [...current, ...core.BUILT_INS].some(entry => entry.text.toLocaleLowerCase("zh-Hant") === item.text.toLocaleLowerCase("zh-Hant"))) {
        window.BAOFeedback?.notify?.("已有相同指令。", "error"); return;
      }
      if (scopedWrite([...current, item])) open(scope);
    });

    wrap.querySelectorAll("[data-quick-delete]").forEach(button => {
      button.addEventListener("click", () => {
        if (!validOwner()) return;
        const id = button.dataset.quickDelete;
        if (scopedWrite(core.customCommands(scopedState()).filter(item => item.id !== id))) open(scope, true);
      });
    });

    const shareStatus = wrap.querySelector("[data-quick-share-status]");
    const previewRoot = wrap.querySelector("[data-quick-import-preview]");
    const shareFile = wrap.querySelector("[data-quick-file]");
    wrap.querySelector("[data-quick-export]")?.addEventListener("click", () => {
      if (!validOwner()) return;
      const pack = core.exportPack(scopedState());
      if (!pack.commands.length) {
        shareStatus.textContent = `${scopeLabel}還沒有可以匯出的自訂指令。`;
        return;
      }
      const data = JSON.stringify(pack, null, 2);
      const url = URL.createObjectURL(new Blob([data], { type: "application/json;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = shared ? "yorubay-quick-command-library.json" : "yorubay-quick-commands.json";
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
        const plan = core.mergePack(scopedState(), pack, otherCommands());
        if (!plan.added) {
          shareStatus.textContent = "沒有可新增的指令：" + plan.duplicates + " 條重複，" + plan.overflow + " 條超出上限。";
          return;
        }
        shareStatus.textContent = shared ? "以下只會新增到個人指令庫；請確認內容後再匯入。" : "以下只會新增到目前故事；請確認內容後再匯入。";
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
        confirm.type = "button"; confirm.className = "primary"; confirm.textContent = shared ? "確認加入個人指令庫" : "確認加入本故事";
        const cancel = document.createElement("button");
        cancel.type = "button"; cancel.className = "secondary"; cancel.textContent = "取消";
        cancel.addEventListener("click", () => { previewRoot.hidden = true; previewRoot.replaceChildren(); shareStatus.textContent = "已取消匯入。"; });
        confirm.addEventListener("click", () => {
          if (!validOwner()) return;
          const fresh = core.mergePack(scopedState(), pack, otherCommands());
          if (fresh.added) {
            if (scopedWrite(fresh.commands)) open(scope);
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
    const customCount = info.groups.author.length + info.groups.player.length + info.groups.library.length;
    button.textContent = `⌁ 快捷指令 · ${customCount ? customCount + " 個自訂" : "常用"}`;
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

  window.BAOStoryQuickCommands = Object.freeze({ open, close, groups, summary, fillInput, state, write, libraryState, injectEntry });
})();
