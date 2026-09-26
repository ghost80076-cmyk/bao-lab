(() => {
  if (typeof App === "undefined" || typeof Chat === "undefined" || !window.BAOMemoryWorkbench) return;

  const diag = () => Chat.memoryDiagnostics?.(App.config) || {
    totalRounds: Chat.turnCount?.() || 0,
    coveredRounds: 0,
    pendingRounds: 0,
    hasSummary: Boolean(Chat.summary),
    health: {},
    model: App.config?.api?.model || ""
  };

  const playerLabel = data => {
    if (Chat.summarizing || data.health?.phase === "running") return "正在整理";
    if (data.health?.phase === "failed") return "需要注意";
    return "記憶正常";
  };

  const playerText = data => {
    if (Chat.summarizing || data.health?.phase === "running") return "AI 正在整理較早的劇情；原始對話仍會保留。";
    if (data.health?.phase === "failed") return data.health?.message || "這次整理沒有成功，但原始對話仍完整保留。";
    if (data.hasSummary) return "較早的 " + data.coveredRounds + " 輪已整理成長期記憶；最近劇情仍保留原文。";
    if (data.pendingRounds > 0) return "有 " + data.pendingRounds + " 輪較早內容等待整理；成功整理前不會移除原文。";
    return "目前 " + data.totalRounds + " 輪仍由近期原文直接保留，尚未需要整理舊劇情。";
  };

  const relabelButton = (button, label, note) => {
    if (!button) return;
    button.textContent = label;
    if (note) {
      const small = document.createElement("small");
      small.textContent = note;
      button.appendChild(small);
    }
  };

  const simplifyContext = root => {
    const pane = root.querySelector('[data-pane="context"]');
    if (!pane) return;
    const data = diag();
    const title = pane.querySelector(".memory-pane-title");
    if (title) {
      const heading = title.querySelector("h3");
      const copy = title.querySelector("p");
      if (heading) heading.textContent = "記憶狀態";
      if (copy) copy.textContent = "平常不用操作；BAO/LAB 會自動保留近期劇情，必要時再整理舊內容。";
      title.querySelector(".memory-pill")?.remove();
    }

    const health = pane.querySelector(".memory-health-card");
    if (health) {
      const label = health.querySelector("b");
      const copy = health.querySelector("p");
      if (label) label.textContent = playerLabel(data);
      if (copy) copy.textContent = playerText(data);
      if (!health.querySelector(".memory-player-facts")) {
        const facts = document.createElement("div");
        facts.className = "memory-player-facts";
        const notes = window.BAOMemoryWorkbench.readSlots().filter(item => item.enabled && item.text?.trim()).length;
        const round = document.createElement("span");
        round.textContent = "目前對話 " + data.totalRounds + " 輪";
        const fixed = document.createElement("span");
        fixed.textContent = "必記事項 " + notes + " 筆";
        facts.append(round, fixed);
        health.appendChild(facts);
      }

      const meta = health.querySelector(".memory-health-meta");
      if (meta && !pane.querySelector(".memory-diagnostics")) {
        const details = document.createElement("details");
        details.className = "memory-player-details memory-diagnostics";
        const summary = document.createElement("summary");
        summary.textContent = "進階診斷";
        details.append(summary, meta);
        health.insertAdjacentElement("afterend", details);
      }
    }

    const summaryPreview = pane.querySelector(".memory-summary-preview summary");
    if (summaryPreview) summaryPreview.textContent = "查看 AI 已整理的舊劇情";

    const previewTitle = pane.querySelector(".memory-preview-title");
    const previewList = pane.querySelector(".memory-context-list");
    if (previewTitle && previewList && !pane.querySelector(".memory-recent-preview")) {
      const details = document.createElement("details");
      details.className = "memory-player-details memory-recent-preview";
      const summary = document.createElement("summary");
      summary.textContent = "查看近期對話預覽";
      const note = document.createElement("p");
      note.className = "note";
      note.textContent = "只顯示最近 12 則訊息作為預覽，不代表模型實際只收到這些內容。";
      details.append(summary, note, previewList);
      previewTitle.replaceWith(details);
    }
  };

  const simplifyNotes = root => {
    const pane = root.querySelector('[data-pane="notes"]');
    if (!pane) return;
    const heading = pane.querySelector(".memory-pane-title h3");
    const copy = pane.querySelector(".memory-pane-title p");
    if (heading) heading.textContent = "必記事項";
    if (copy) copy.textContent = "只有你真的希望 AI 長期記住的內容才需要放這裡；一般遊玩不用手動整理。";
    pane.querySelector(".memory-pill")?.remove();
    pane.querySelectorAll(".memory-note-meta span:first-child").forEach(node => node.textContent = "只屬於目前故事");
    const add = pane.querySelector("[data-add-note]");
    if (add) add.textContent = "＋ 新增必記事項";
    if (add && !pane.querySelector("[data-memory-ai-helper]")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary memory-ai-helper";
      button.dataset.memoryAiHelper = "true";
      button.textContent = "✨ AI 幫我整理";
      button.addEventListener("click", () => window.BAOMemoryWorkbench.refresh(root, "refine"));
      add.insertAdjacentElement("afterend", button);
    }
  };

  const simplifyRefine = root => {
    const pane = root.querySelector('[data-pane="refine"]');
    if (!pane) return;
    const title = pane.querySelector(".memory-pane-title");
    const heading = title?.querySelector("h3");
    const copy = title?.querySelector("p");
    if (heading) heading.textContent = "AI 幫我整理";
    if (copy) copy.textContent = "進階工具：從既有對話整理出草稿，再由你決定要不要寫成必記事項。";
    const pill = title?.querySelector(".memory-pill");
    if (pill) pill.textContent = "進階";
    if (title && !title.querySelector("[data-memory-back-notes]")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "memory-back-link";
      button.dataset.memoryBackNotes = "true";
      button.textContent = "← 返回必記事項";
      button.addEventListener("click", () => window.BAOMemoryWorkbench.refresh(root, "notes"));
      title.querySelector("div")?.prepend(button);
    }
    pane.querySelectorAll("[data-write-draft]").forEach(button => button.textContent = "寫入必記事項");
  };

  const simplifyCanon = root => {
    const pane = root.querySelector('[data-pane="canon"]');
    if (!pane) return;
    const heading = pane.querySelector(".memory-pane-title h3");
    const copy = pane.querySelector(".memory-pane-title p");
    if (heading) heading.textContent = "劇情檔案";
    if (copy) copy.textContent = "長篇故事的重要人物、事件、已知情報與伏筆。一般遊玩不需要手動操作。";
    pane.querySelector(".memory-pill")?.remove();

    const area = pane.querySelector("#canon-workbench-area");
    if (!area) return;
    const cards = area.querySelectorAll(".canon-summary > div");
    if (cards[0]) {
      const label = cards[0].querySelector("span");
      if (label) label.textContent = "已確認劇情";
    }
    if (cards[1]) {
      const label = cards[1].querySelector("span");
      if (label) label.textContent = "新增對話";
      const small = cards[1].querySelector("small");
      if (small) small.textContent = "從上次整理後計算";
    }
    if (cards[2]) cards[2].hidden = true;
    area.querySelector(".canon-summary")?.classList.add("canon-summary-simple");

    const incremental = area.querySelector("[data-canon-incremental]");
    relabelButton(incremental, "整理最新劇情", "只整理上次確認後新增的對話");

    const full = area.querySelector("[data-canon-full]");
    if (full && !area.querySelector(".canon-advanced-tools")) {
      const details = document.createElement("details");
      details.className = "canon-advanced-tools";
      const summary = document.createElement("summary");
      summary.textContent = "進階工具";
      details.appendChild(summary);
      relabelButton(full, "完整重建劇情檔案", "從整段歷史重新整理，會增加 API 使用量");
      full.parentElement?.insertAdjacentElement("afterend", details);
      details.appendChild(full);
    }

    const confirmButton = area.querySelector("[data-canon-confirm]");
    const discardButton = area.querySelector("[data-canon-discard]");
    if (confirmButton) confirmButton.textContent = "確認這份劇情檔案";
    if (discardButton) discardButton.textContent = "放棄草稿";

    const notice = area.querySelector(".canon-notice");
    if (notice) notice.textContent = "AI 只會先產生草稿；你確認後才會成為正式劇情資料，原始聊天不會被修改。";

    const empty = area.querySelector(".memory-empty");
    if (empty) empty.textContent = "還沒有劇情檔案。一般遊玩不用建立；故事很長、人物與伏筆變多時再整理即可。";

    area.querySelectorAll(".canon-book").forEach(book => {
      const controls = book.querySelector(".canon-book-controls");
      const evidence = book.querySelector("details:not(.canon-book-advanced)");
      if (controls && !book.querySelector(".canon-book-advanced")) {
        const details = document.createElement("details");
        details.className = "canon-book-advanced";
        const summary = document.createElement("summary");
        summary.textContent = "進階資料";
        book.appendChild(details);
        details.appendChild(controls);
        if (evidence) {
          const evidenceSummary = evidence.querySelector("summary");
          if (evidenceSummary) evidenceSummary.textContent = "證據來源";
          details.appendChild(evidence);
        }
      }
    });
  };

  const simplify = root => {
    if (!root?.querySelector) return;
    const desk = root.querySelector(".memory-desk");
    if (!desk) return;
    desk.classList.add("memory-simple");

    const kicker = desk.querySelector(".memory-desk-kicker");
    const heading = desk.querySelector(".memory-desk-head h2");
    const copy = desk.querySelector(".memory-desk-head p");
    if (kicker) kicker.textContent = "MEMORY · BAO/LAB";
    if (heading) heading.textContent = "記憶";
    if (copy) copy.textContent = "平常不用設定。系統會自動維持前情，你只需要在必要時補充「一定要記住」的事情。";

    const keepStats = new Set(["auto", "rounds", "notes"]);
    desk.querySelectorAll(".memory-desk-stat").forEach(card => {
      const stat = card.querySelector("[data-stat]")?.dataset.stat;
      card.hidden = !keepStats.has(stat);
      const label = card.querySelector("span");
      if (stat === "auto" && label) label.textContent = "記憶狀態";
      if (stat === "rounds" && label) label.textContent = "目前對話";
      if (stat === "notes" && label) label.textContent = "必記事項";
    });

    const tabs = {
      context: ["記憶狀態", "看 AI 現在怎麼記"],
      notes: ["必記事項", "指定不能忘記的內容"],
      canon: ["劇情檔案", "長篇故事的重要事實"]
    };
    desk.querySelectorAll(".memory-desk-tab").forEach(button => {
      const key = button.dataset.tab;
      if (key === "refine") {
        button.hidden = true;
        return;
      }
      if (!tabs[key]) return;
      const label = button.querySelector("b");
      const desc = button.querySelector("span");
      if (label) label.textContent = tabs[key][0];
      if (desc) desc.textContent = tabs[key][1];
    });

    simplifyContext(root);
    simplifyNotes(root);
    simplifyRefine(root);
    simplifyCanon(root);
  };

  const originalRefresh = window.BAOMemoryWorkbench.refresh.bind(window.BAOMemoryWorkbench);
  window.BAOMemoryWorkbench.refresh = function(root, tab) {
    const result = originalRefresh(root, tab);
    simplify(root);
    return result;
  };

  const originalOpen = window.BAOMemoryWorkbench.open.bind(window.BAOMemoryWorkbench);
  window.BAOMemoryWorkbench.open = function() {
    const result = originalOpen();
    simplify(document.querySelector(".memory-desk-backdrop"));
    return result;
  };

  const relabelLauncher = () => {
    const button = document.querySelector('#bao-player-settings [data-bao-open="memory"]');
    if (button) button.textContent = "🧠 記憶";
  };

  const originalRenderChatShell = App.renderChatShell.bind(App);
  App.renderChatShell = function(fresh = false) {
    const result = originalRenderChatShell(fresh);
    setTimeout(relabelLauncher, 0);
    return result;
  };

  const originalPanel = App.renderUIPanel.bind(App);
  App.renderUIPanel = function(panel) {
    if (panel !== "memory") return originalPanel(panel);
    const ui = document.getElementById("ui-panel");
    if (!ui || !window.GameState?.current) return originalPanel(panel);
    const data = diag();
    ui.innerHTML = "";
    const card = document.createElement("section");
    card.className = "memory-quick-status";
    const label = document.createElement("b");
    label.textContent = playerLabel(data);
    const copy = document.createElement("p");
    copy.textContent = playerText(data);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary";
    button.textContent = "查看／調整記憶";
    button.addEventListener("click", () => window.BAOMemoryWorkbench.open());
    card.append(label, copy, button);
    ui.appendChild(card);
  };

  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        const root = node.matches?.(".memory-desk-backdrop") ? node : node.querySelector?.(".memory-desk-backdrop");
        if (root) simplify(root);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  relabelLauncher();
  window.BAOMemoryWorkbenchSimple = { simplify, playerLabel, playerText };
})();