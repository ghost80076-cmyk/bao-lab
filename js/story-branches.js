(() => {
  if (window.BAOStoryBranches || !window.BAOStoryLibrary || typeof App === "undefined" || typeof Chat === "undefined") return;

  const Library = window.BAOStoryLibrary;
  const escape = value => App.escapeHTML(String(value ?? ""));
  const attr = value => App.escapeAttr(String(value ?? ""));
  let decorating = false;

  const ensureStyles = () => {
    if (document.querySelector('link[href="css/story-branches.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/story-branches.css";
    document.head.appendChild(link);
  };

  const close = () => document.querySelector(".story-branches-backdrop")?.remove();

  const restore = async (storyId, chapterId) => {
    App.saveStory?.(false);
    await Library.flush();
    const save = await Library.reconstruct(storyId, chapterId);
    if (!save) throw new Error("找不到這條故事線的完整資料。");
    let key = String(App.config?.api?.key || "");
    if (!save.config?.demoMode && !key) {
      const entered = window.prompt("API Key 不會儲存在故事分支。請貼上 API Key 才能繼續：", "");
      if (entered === null) return false;
      key = entered.trim();
    }
    if (!Storage.restoreStory(save)) throw new Error("無法恢復這條故事線。");
    App.config.api = Object.assign({}, App.config.api || {}, { key });
    if (GameState.current) GameState.current.config = App.config;
    App.renderChatShell(false);
    App.showView("chat");
    App.saveStory(false);
    window.BAORefreshSaveUI?.();
    close();
    return true;
  };

  const createFrom = async index => {
    const message = Chat.messages?.[Number(index)];
    if (!message?.id || message.role !== "assistant") return alert("找不到這則 AI 回覆。");
    const label = window.prompt("替新分支命名：", "另一條故事線");
    if (label === null) return;
    try {
      const currentKey = String(App.config?.api?.key || "");
      const save = await Library.createBranch(message.id, label);
      if (!Storage.restoreStory(save)) throw new Error("分支已建立，但無法切換到分支。");
      App.config.api = Object.assign({}, App.config.api || {}, { key: currentKey });
      if (GameState.current) GameState.current.config = App.config;
      App.renderChatShell(false);
      App.showView("chat");
      App.saveStory(false);
      window.BAORefreshSaveUI?.();
      alert("已建立獨立故事分支。原故事線仍完整保留。");
    } catch (error) {
      alert(error.message || "建立故事分支失敗。");
    }
  };

  const depthOf = (chapter, map) => {
    let depth = 0;
    let cursor = chapter;
    const seen = new Set();
    while (cursor?.parentChapterId && !seen.has(cursor.parentChapterId)) {
      seen.add(cursor.parentChapterId);
      cursor = map.get(cursor.parentChapterId);
      if (cursor) depth += 1;
    }
    return depth;
  };

  const open = async () => {
    ensureStyles();
    close();
    const refs = Library.refs();
    if (!refs.storyId) return alert("目前沒有可管理的故事。");
    const backdrop = document.createElement("div");
    backdrop.className = "story-tools-backdrop story-branches-backdrop";
    backdrop.innerHTML = '<section class="story-tools-modal" role="dialog" aria-modal="true" aria-label="故事分支"><main class="story-tools-main"><header class="story-tools-intro"><div><span class="eyebrow">LOCAL BRANCHES</span><h2>故事分支</h2></div><button type="button" class="story-tools-close" data-close aria-label="關閉">×</button></header><p class="note">從任一已保存的 AI 回覆分岔。對話、摘要、Token 使用量、角色與世界狀態會在分岔後各自獨立。</p><div class="story-branch-list"><p>正在讀取故事線……</p></div></main></section>';
    document.body.appendChild(backdrop);
    backdrop.querySelector("[data-close]").onclick = close;
    backdrop.addEventListener("click", event => { if (event.target === backdrop) close(); });

    const chapters = await Library.listChapters(refs.storyId);
    const map = new Map(chapters.map(chapter => [chapter.chapterId, chapter]));
    const list = backdrop.querySelector(".story-branch-list");
    list.innerHTML = chapters.map(chapter => {
      const active = chapter.chapterId === refs.chapterId;
      const depth = depthOf(chapter, map);
      const kind = chapter.parentChapterId ? `分支 L${depth}` : "主線／篇章";
      const preview = chapter.branchPointPreview ? `<p>分岔點：${escape(chapter.branchPointPreview.slice(0, 120))}</p>` : "";
      return `<article class="story-branch-row" style="--branch-depth:${depth}" data-chapter="${attr(chapter.chapterId)}"><div><span class="story-branch-kind">${kind}</span><b>${escape(chapter.label || "未命名故事線")}</b>${active ? '<span class="story-library-active">目前故事線</span>' : ""}<small>${Number(chapter.messageCount || 0).toLocaleString()} 則訊息</small>${preview}</div><div class="story-library-actions"><button type="button" class="primary" data-switch ${active ? "disabled" : ""}>切換</button><button type="button" class="secondary" data-rename>改名</button>${chapter.parentChapterId ? `<button type="button" class="story-library-danger" data-delete ${active ? "disabled" : ""}>刪除</button>` : ""}</div></article>`;
    }).join("") || '<div class="story-library-empty">尚未建立故事線。</div>';

    list.onclick = async event => {
      const row = event.target.closest("[data-chapter]");
      if (!row) return;
      const chapter = map.get(row.dataset.chapter);
      try {
        if (event.target.closest("[data-switch]")) await restore(refs.storyId, chapter.chapterId);
        if (event.target.closest("[data-rename]")) {
          const label = window.prompt("故事線名稱：", chapter.label || "");
          if (label !== null && await Library.renameChapter(refs.storyId, chapter.chapterId, label)) await open();
        }
        if (event.target.closest("[data-delete]")) {
          const descendants = await Library.branchDescendants(refs.storyId, chapter.chapterId);
          const suffix = descendants.length ? `\n這也會刪除 ${descendants.length} 條子分支。` : "";
          if (!window.confirm(`確定刪除「${chapter.label}」？${suffix}\n此操作無法復原。`)) return;
          const result = await Library.deleteBranch(refs.storyId, chapter.chapterId);
          if (!result) throw new Error("目前使用中的分支不能刪除。");
          await open();
        }
      } catch (error) {
        alert(error.message || "故事分支操作失敗。");
      }
    };
  };

  const injectEntryPoints = () => {
    const aside = document.querySelector("#chat-view aside");
    if (aside && !aside.querySelector("#story-branch-button")) {
      const button = document.createElement("button");
      button.id = "story-branch-button";
      button.className = "secondary";
      button.type = "button";
      button.textContent = "⑂ 故事分支";
      button.onclick = open;
      aside.querySelector("#save-slot-button")?.insertAdjacentElement("afterend", button);
    }
    const mobile = document.querySelector(".story-mobile-tools");
    if (mobile && !mobile.querySelector('[data-story-mobile-action="branches"]')) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.storyMobileAction = "branches";
      button.textContent = "故事分支";
      button.onclick = open;
      mobile.appendChild(button);
    }
  };

  const decorate = () => {
    if (decorating) return;
    decorating = true;
    try {
      injectEntryPoints();
      document.querySelectorAll('#chat-stream > .message.assistant[data-message-index]').forEach(element => {
        const index = Number(element.dataset.messageIndex);
        const message = Chat.messages?.[index];
        const tools = element.querySelector(".story-message-tools");
        if (!tools || !message?.id || tools.querySelector("[data-create-branch]")) return;
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.createBranch = String(index);
        button.textContent = "⑂ 從這裡分支";
        button.onclick = () => createFrom(index);
        tools.appendChild(button);
      });
    } finally {
      decorating = false;
    }
  };

  ensureStyles();
  const observer = new MutationObserver(() => queueMicrotask(decorate));
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(decorate, 0);
  setTimeout(decorate, 150);
  window.BAOStoryBranches = { version: 1, open, restore, createFrom, decorate };
})();
