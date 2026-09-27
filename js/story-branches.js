(() => {
  if (window.BAOStoryBranches || !window.BAOStoryLibrary || typeof App === "undefined" || typeof Chat === "undefined") return;

  const Library = window.BAOStoryLibrary;
  const escape = value => App.escapeHTML(String(value ?? ""));
  const attr = value => App.escapeAttr(String(value ?? ""));
  // A session credential only follows a story when the destination is the same API service.
  const sameConnection = (left = {}, right = {}) => {
    const url = value => String(value || "").trim().replace(/\/+$/, "");
    return Boolean(url(left.baseUrl) && url(right.baseUrl)) && url(left.baseUrl) === url(right.baseUrl)
      && String(left.protocol || "openai") === String(right.protocol || "openai");
  };
  let decorating = false;

  const ensureStyles = () => {
    if (document.querySelector('link[href="css/story-branches.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/story-branches.css";
    document.head.appendChild(link);
  };

  const close = () => document.querySelector(".story-branches-backdrop")?.remove();
  const waitForRevisionState = async () => {
    try { await window.BAOStoryRevisionState?.whenIdle?.(); }
    catch (error) { console.warn("BAO/LAB revision reconciliation did not finish before branch operation:", error); }
  };
  const dateValue = chapter => Date.parse(chapter?.createdAt || chapter?.updatedAt || "") || 0;
  const compareChapters = (a, b) => dateValue(a) - dateValue(b)
    || String(a?.label || "").localeCompare(String(b?.label || ""), "zh-Hant");
  const chapterMap = chapters => new Map((chapters || []).map(chapter => [chapter.chapterId, chapter]));

  const lineageFor = (chapter, map) => {
    const lineage = [];
    const seen = new Set();
    let cursor = chapter;
    while (cursor?.chapterId && !seen.has(cursor.chapterId)) {
      seen.add(cursor.chapterId);
      lineage.unshift(cursor);
      cursor = cursor.parentChapterId ? map.get(cursor.parentChapterId) : null;
    }
    return lineage;
  };

  const buildTree = chapters => {
    const sorted = [...(chapters || [])].sort(compareChapters);
    const map = chapterMap(sorted);
    const children = new Map(sorted.map(chapter => [chapter.chapterId, []]));
    const roots = [];
    sorted.forEach(chapter => {
      if (chapter.parentChapterId && map.has(chapter.parentChapterId)) children.get(chapter.parentChapterId).push(chapter);
      else roots.push(chapter);
    });
    const visit = (chapter, depth = 0, seen = new Set()) => {
      if (!chapter?.chapterId || seen.has(chapter.chapterId)) return null;
      const nextSeen = new Set(seen).add(chapter.chapterId);
      return {
        chapter,
        depth,
        children: (children.get(chapter.chapterId) || [])
          .sort(compareChapters)
          .map(child => visit(child, depth + 1, nextSeen))
          .filter(Boolean)
      };
    };
    return { map, roots: roots.map(root => visit(root)).filter(Boolean) };
  };

  const formatUpdatedAt = value => {
    const date = new Date(value || "");
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  const restore = async (storyId, chapterId) => {
    await waitForRevisionState();
    App.saveStory?.(false);
    await Library.flush();
    const save = await Library.reconstruct(storyId, chapterId);
    if (!save) throw new Error("找不到這條故事線的完整資料。");
    const previousApi = App.config?.api || {};
    let key = sameConnection(previousApi, save.config?.api) ? String(previousApi.key || "") : "";
    if (!save.config?.demoMode && !key) {
      const entered = window.prompt("這條故事線的 API 連線可能與目前不同。API Key 不會儲存在分支，請輸入此故事使用的 API Key：", "");
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
    if (!save.config?.demoMode && !key) window.BAOChatAPISettings?.open?.();
    return true;
  };

  const createFrom = async index => {
    const message = Chat.messages?.[Number(index)];
    if (!message?.id || message.role !== "assistant") return alert("找不到這則 AI 回覆。");
    const label = window.prompt("替新分支命名：", "另一條故事線");
    if (label === null) return;
    try {
      await waitForRevisionState();
      App.saveStory?.(false);
      await Library.flush();
      const previousApi = App.config?.api || {};
      const save = await Library.createBranch(message.id, label);
      if (!Storage.restoreStory(save)) throw new Error("分支已建立，但無法切換到分支。");
      const key = sameConnection(previousApi, App.config.api) ? String(previousApi.key || "") : "";
      App.config.api = Object.assign({}, App.config.api || {}, { key });
      if (GameState.current) GameState.current.config = App.config;
      App.renderChatShell(false);
      App.showView("chat");
      App.saveStory(false);
      window.BAORefreshSaveUI?.();
      if (!save.config?.demoMode && !key) window.BAOChatAPISettings?.open?.();
      alert("已建立獨立故事分支。原故事線仍完整保留。");
    } catch (error) {
      alert(error.message || "建立故事分支失敗。");
    }
  };

  const renderNode = (node, refs, map) => {
    const chapter = node.chapter;
    const active = chapter.chapterId === refs.chapterId;
    const parent = chapter.parentChapterId ? map.get(chapter.parentChapterId) : null;
    const kind = chapter.parentChapterId ? `分支 L${node.depth}` : "主線篇章";
    const parentLine = parent ? `<span class="story-branch-parent">從「${escape(parent.label || "上層故事線")}」分出</span>` : "";
    const preview = chapter.branchPointPreview ? `<p class="story-branch-preview">分岔點：${escape(chapter.branchPointPreview.slice(0, 120))}</p>` : "";
    const updated = formatUpdatedAt(chapter.updatedAt);
    const children = node.children.length
      ? `<ol class="story-branch-children">${node.children.map(child => renderNode(child, refs, map)).join("")}</ol>`
      : "";
    return `<li class="story-branch-node" data-depth="${node.depth}" data-parent="${attr(chapter.parentChapterId || "")}">
      <article class="story-branch-row${active ? " is-active" : ""}" data-chapter="${attr(chapter.chapterId)}" ${active ? 'aria-current="true"' : ""}>
        <div class="story-branch-copy">
          <div class="story-branch-heading"><span class="story-branch-kind">${kind}</span><b>${escape(chapter.label || "未命名故事線")}</b>${active ? '<span class="story-library-active">目前故事線</span>' : ""}</div>
          <div class="story-branch-meta"><span>${Number(chapter.messageCount || 0).toLocaleString()} 則訊息</span>${updated ? `<span>更新 ${escape(updated)}</span>` : ""}</div>
          ${parentLine}${preview}
        </div>
        <div class="story-library-actions"><button type="button" class="primary" data-switch ${active ? "disabled" : ""}>切換</button><button type="button" class="secondary" data-rename>改名</button>${chapter.parentChapterId ? `<button type="button" class="story-library-danger" data-delete ${active ? "disabled" : ""}>刪除</button>` : ""}</div>
      </article>${children}
    </li>`;
  };

  const open = async () => {
    ensureStyles();
    close();
    const refs = Library.refs();
    if (!refs.storyId) return alert("目前沒有可管理的故事。");
    const backdrop = document.createElement("div");
    backdrop.className = "story-tools-backdrop story-branches-backdrop";
    backdrop.innerHTML = '<section class="story-tools-modal story-branches-modal" role="dialog" aria-modal="true" aria-label="故事分支"><main class="story-tools-main"><header class="story-tools-intro"><div><span class="eyebrow">LOCAL BRANCHES</span><h2>故事分支</h2></div><button type="button" class="story-tools-close" data-close aria-label="關閉">×</button></header><p class="note">每條故事線都有自己的對話、長期記憶、Context Pack、Token 使用量、角色與世界狀態。從舊回覆改走另一個選擇時，請建立分支，不會覆蓋原主線。</p><div class="story-branch-list"><p>正在讀取故事線……</p></div></main></section>';
    document.body.appendChild(backdrop);
    backdrop.querySelector("[data-close]").onclick = close;
    backdrop.addEventListener("click", event => { if (event.target === backdrop) close(); });

    const chapters = await Library.listChapters(refs.storyId);
    if (!backdrop.isConnected) return;
    const { map, roots } = buildTree(chapters);
    const active = map.get(refs.chapterId);
    const path = active ? lineageFor(active, map) : [];
    const list = backdrop.querySelector(".story-branch-list");
    const pathHTML = path.length
      ? `<div class="story-branch-current-path"><span>目前路徑</span><strong>${path.map(chapter => escape(chapter.label || "未命名故事線")).join(" <i>›</i> ")}</strong></div>`
      : "";
    list.innerHTML = roots.length
      ? `${pathHTML}<ol class="story-branch-tree">${roots.map(node => renderNode(node, refs, map)).join("")}</ol>`
      : '<div class="story-library-empty">尚未建立故事線。</div>';

    list.onclick = async event => {
      const row = event.target.closest("[data-chapter]");
      if (!row) return;
      const chapter = map.get(row.dataset.chapter);
      if (!chapter) return;
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
    } finally { decorating = false; }
  };

  ensureStyles();
  const observer = new MutationObserver(() => queueMicrotask(decorate));
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(decorate, 0);
  setTimeout(decorate, 150);
  window.BAOStoryBranches = { version: 2, open, restore, createFrom, decorate, buildTree, lineageFor };
})();