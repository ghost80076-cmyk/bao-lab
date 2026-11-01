(() => {
  "use strict";
  const core = window.BAOCharacterStudioFlowCore;
  const form = document.getElementById("studio-form");
  const editor = document.querySelector(".studio-editor");
  if (!core || !form || !editor || window.BAOCharacterStudioFlow) return;

  const field = name => form.elements.namedItem(name);
  const editable = node => node instanceof Element && node.matches("input,textarea,select");
  const STEP_COPY = Object.freeze({
    basic: {
      kicker: "FOUNDATION",
      title: "先把作品的輪廓定下來",
      detail: "名稱、作品方向與封面資訊先完成；其他複雜設定不用一次處理。"
    },
    core: {
      kicker: "CHARACTER / WORLD",
      title: "告訴 AI 這個角色或世界如何運作",
      detail: "把真正影響演繹的個性、動機、關係與世界規則放在這裡。"
    },
    opening: {
      kicker: "OPENING",
      title: "寫下玩家打開故事時看到的第一幕",
      detail: "先把場景、氣氛與可回應的切入點寫清楚；後續故事交給玩家與世界繼續。"
    },
    world: {
      kicker: "DEPTH",
      title: "需要時，再補人物與世界深度",
      detail: "世界書、NPC 規則與作者敘事偏好都屬於進階層；沒有需要可以直接跳過。"
    },
    appearance: {
      kicker: "EXPERIENCE",
      title: "決定玩家會怎麼看見這個作品",
      detail: "手機、頭像與 Gameplay UI 都是選配；不啟用時完全沿用夜灣原生閱讀體驗。"
    },
    finish: {
      kicker: "REVIEW",
      title: "預覽、檢查，然後決定下一步",
      detail: "先在本機確認內容，再儲存、試玩或匯出；這些操作都不會自動公開作品。"
    }
  });

  const ensureStyles = () => {
    if (document.querySelector('link[href^="css/character-studio-flow.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/character-studio-flow.css?v=5";
    document.head.appendChild(link);
  };

  const values = () => Object.fromEntries([
    "name", "id", "system_prompt", "greeting",
    "profile", "world", "lore", "npc_rules",
    "author_instructions", "creator_notes", "quote"
  ].map(name => [name, String(field(name)?.value || "")]));

  const legacyTargetFor = id => {
    if (id === "basic") return form.querySelector(".studio-grid");
    if (id === "core") return field("system_prompt")?.closest("label");
    if (id === "opening") return field("greeting")?.closest("label");
    if (id === "world") return form.querySelector(".studio-advanced:not(#studio-gameplay-theme)");
    if (id === "appearance") return document.getElementById("studio-gameplay-theme");
    if (id === "finish") return form.querySelector(".studio-button-row");
    return null;
  };

  const targetFor = id =>
    form.querySelector('[data-studio-flow-panel="' + id + '"]') || legacyTargetFor(id);

  const firstFieldFor = id => ({
    basic: field("name"),
    core: field("system_prompt"),
    opening: field("greeting"),
    world: field("profile"),
    appearance: field("phone_ui_enabled") || field("dialogue_mode") || field("gameplay_theme"),
    finish: document.getElementById("studio-preview-button")
  })[id] || null;

  let activeStep = "basic";
  let showAll = false;

  const hasField = (node, name) =>
    Boolean(node?.matches?.('[name="' + name + '"]') || node?.querySelector?.('[name="' + name + '"]'));

  const stepForNode = node => {
    if (!node) return "finish";
    if (["name", "id", "category", "rating", "mode", "description", "avatar", "tags"].some(name => hasField(node, name))) return "basic";
    if (["system_prompt", "recommended_styles"].some(name => hasField(node, name))) return "core";
    if (hasField(node, "greeting")) return "opening";
    if (node.id === "studio-feature-guide" || ["profile", "world", "lore", "npc_rules", "author_instructions", "creator_notes", "quote"].some(name => hasField(node, name))) return "world";
    if (["studio-gameplay-theme","studio-gameplay-composer"].includes(node.id) || ["phone_ui_enabled", "dialogue_mode"].some(name => hasField(node, name))) return "appearance";
    if (node.classList?.contains("studio-button-row")) return "finish";
    return "finish";
  };

  const installStagePanels = () => {
    let workspace = form.querySelector(".studio-flow-workspace");
    if (workspace) return workspace;

    const original = [...form.children];
    workspace = document.createElement("div");
    workspace.className = "studio-flow-workspace";
    workspace.dataset.showAll = "false";

    const panels = new Map();
    core.STEPS.forEach((step, index) => {
      const copy = STEP_COPY[step.id] || {};
      const panel = document.createElement("section");
      panel.className = "studio-flow-panel";
      panel.dataset.studioFlowPanel = step.id;
      panel.setAttribute("aria-labelledby", "studio-stage-title-" + step.id);
      panel.innerHTML =
        '<header class="studio-stage-head">' +
          '<div class="studio-stage-number">STEP ' + (index + 1) + ' / ' + core.STEPS.length + '</div>' +
          '<div class="studio-stage-copy">' +
            '<span>' + (copy.kicker || "CREATE") + '</span>' +
            '<h3 id="studio-stage-title-' + step.id + '">' + (copy.title || step.label) + '</h3>' +
            '<p>' + (copy.detail || "") + '</p>' +
          '</div>' +
          '<strong class="studio-stage-state" data-studio-stage-state>—</strong>' +
        '</header>';
      panels.set(step.id, panel);
      workspace.appendChild(panel);
    });

    original.forEach(node => panels.get(stepForNode(node))?.appendChild(node));
    form.appendChild(workspace);
    // Preview belongs to review; changing stages must hide it with its panel.
    const preview = document.getElementById("studio-preview");
    if (preview) panels.get("finish").appendChild(preview);
    return workspace;
  };

  const makeControls = () => {
    let controls = form.querySelector(".studio-flow-controls");
    if (controls) return controls;
    controls = document.createElement("div");
    controls.className = "studio-flow-controls";
    controls.innerHTML =
      '<button type="button" class="secondary" data-studio-flow-prev>← 上一步</button>' +
      '<span data-studio-flow-position aria-live="polite"></span>' +
      '<button type="button" class="primary" data-studio-flow-next>下一步 →</button>';
    controls.querySelector("[data-studio-flow-prev]").addEventListener("click", () => {
      const index = core.STEPS.findIndex(step => step.id === activeStep);
      if (index > 0) go(core.STEPS[index - 1].id, true);
    });
    controls.querySelector("[data-studio-flow-next]").addEventListener("click", () => {
      const index = core.STEPS.findIndex(step => step.id === activeStep);
      if (index >= 0 && index < core.STEPS.length - 1) go(core.STEPS[index + 1].id, true);
    });
    form.appendChild(controls);
    return controls;
  };

  const installCreationRoutes = () => {
    const actions = document.querySelector(".studio-actions");
    const newCharacter = document.getElementById("studio-new");
    const importButton = document.getElementById("studio-import");
    if (!actions || !newCharacter || !importButton || actions.dataset.creationRoutes === "1") return;
    actions.dataset.creationRoutes = "1";
    actions.setAttribute("aria-label", "創作入口");

    newCharacter.textContent = "＋ 角色作品";
    newCharacter.dataset.creationRoute = "character";
    newCharacter.title = "建立以單一角色互動為主的新作品";
    newCharacter.addEventListener("click", () => go("basic", true));

    const newWorld = document.createElement("button");
    newWorld.type = "button";
    newWorld.className = "secondary";
    newWorld.dataset.creationRoute = "world";
    newWorld.textContent = "＋ 世界作品";
    newWorld.title = "建立多人物或持續運作世界的新作品";
    newWorld.addEventListener("click", async () => {
      const button = newWorld;
      button.disabled = true;
      try {
        const created = await window.BAOCharacterStudio?.createDraft?.("world");
        if (created) go("basic", true);
      } finally {
        button.disabled = false;
      }
    });

    const opening = document.createElement("button");
    opening.type = "button";
    opening.className = "secondary";
    opening.dataset.creationRoute = "opening";
    opening.textContent = "故事開場";
    opening.title = "編輯目前作品的第一幕";
    opening.addEventListener("click", () => go("opening", true));

    const lore = document.createElement("button");
    lore.type = "button";
    lore.className = "secondary";
    lore.dataset.creationRoute = "lorebook";
    lore.textContent = "世界書";
    lore.title = "編輯目前作品的背景資料與按需世界書";
    lore.addEventListener("click", () => {
      if (!go("world")) return;
      const input = field("lore");
      input?.closest("details")?.setAttribute("open", "");
      input?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (window.matchMedia("(min-width: 821px)").matches) {
        window.setTimeout(() => input?.focus({ preventScroll: true }), 220);
      }
    });

    importButton.textContent = "匯入作品";
    importButton.dataset.creationRoute = "import";
    importButton.title = "匯入夜灣 JSON 或 SillyTavern JSON／PNG";
    newCharacter.after(newWorld);
    importButton.before(opening, lore);
  };

  const installAnchors = () => {
    core.STEPS.forEach(step => {
      const target = targetFor(step.id);
      if (target && !target.id) target.id = "studio-flow-step-" + step.id;
      if (target) target.dataset.studioFlowStep = step.id;
    });
  };

  const makeShell = () => {
    let shell = document.getElementById("studio-flow-shell");
    if (shell) return shell;
    shell = document.createElement("section");
    shell.id = "studio-flow-shell";
    shell.className = "studio-flow-shell";
    shell.setAttribute("aria-label", "角色卡創作流程");

    const intro = document.createElement("div");
    intro.className = "studio-flow-summary";
    intro.innerHTML =
      '<div class="studio-flow-title"><span class="eyebrow">CREATION FLOW</span><b>創作流程</b></div>' +
      '<div class="studio-flow-summary-actions">' +
        '<strong id="studio-flow-progress" role="status" aria-live="polite">必填 0/4</strong>' +
        '<button type="button" class="studio-flow-mode" data-studio-flow-all aria-pressed="false">全部欄位</button>' +
      '</div>';

    const meter = document.createElement("div");
    meter.className = "studio-flow-meter";
    meter.setAttribute("role", "progressbar");
    meter.setAttribute("aria-label", "必要欄位完成度");
    meter.setAttribute("aria-valuemin", "0");
    meter.setAttribute("aria-valuemax", "4");
    meter.innerHTML = "<span data-studio-flow-meter></span>";

    const nav = document.createElement("nav");
    nav.className = "studio-flow-nav";
    nav.setAttribute("aria-label", "創作步驟");
    core.STEPS.forEach((step, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "studio-flow-step";
      button.dataset.flowStep = step.id;
      button.innerHTML = '<span>' + (index + 1) + '</span><b>' + step.label + '</b><small data-flow-state>—</small>';
      button.addEventListener("click", () => go(step.id, true));
      nav.appendChild(button);
    });

    shell.append(intro, meter, nav);
    form.insertAdjacentElement("beforebegin", shell);
    shell.querySelector("[data-studio-flow-all]").addEventListener("click", () => setShowAll(!showAll));
    return shell;
  };

  const installEditDone = () => {
    let button = editor.querySelector("[data-studio-edit-done]");
    if (button) return button;
    button = document.createElement("button");
    button.type = "button";
    button.className = "studio-edit-done";
    button.dataset.studioEditDone = "1";
    button.setAttribute("aria-label", "完成編輯");
    button.textContent = "完成";
    button.addEventListener("click", () => {
      if (editable(document.activeElement)) {
        try { document.activeElement.blur(); } catch (_) {}
      }
      editor.classList.remove("studio-editing");
      revealActiveStep();
    });
    editor.appendChild(button);
    return button;
  };

  const updateControls = () => {
    const controls = form.querySelector(".studio-flow-controls");
    if (!controls) return;
    const index = core.STEPS.findIndex(step => step.id === activeStep);
    const previous = controls.querySelector("[data-studio-flow-prev]");
    const next = controls.querySelector("[data-studio-flow-next]");
    const position = controls.querySelector("[data-studio-flow-position]");
    controls.hidden = showAll;
    previous.hidden = index <= 0;
    next.hidden = index < 0 || index >= core.STEPS.length - 1;
    if (position && index >= 0) position.textContent = (index + 1) + " / " + core.STEPS.length + " · " + core.STEPS[index].label;
    if (next && index >= 0 && index < core.STEPS.length - 1) next.textContent = "下一步：" + core.STEPS[index + 1].short + " →";
  };

  const applyPanelVisibility = () => {
    const workspace = form.querySelector(".studio-flow-workspace");
    if (!workspace) return;
    workspace.dataset.showAll = String(showAll);
    workspace.querySelectorAll("[data-studio-flow-panel]").forEach(panel => {
      panel.hidden = !showAll && panel.dataset.studioFlowPanel !== activeStep;
    });
    updateControls();
  };

  // Reveal the current step without scrolling the page back up to the sticky nav.
  const revealActiveStep = () => {
    const nav = document.querySelector(".studio-flow-nav");
    const button = nav?.querySelector('[data-flow-step="' + activeStep + '"]');
    if (!nav || !button || !nav.getClientRects().length) return;
    const rail = nav.getBoundingClientRect();
    const item = button.getBoundingClientRect();
    const delta = item.left < rail.left ? item.left - rail.left
      : item.right > rail.right ? item.right - rail.right : 0;
    if (delta) nav.scrollLeft += delta;
  };

  const setShowAll = value => {
    showAll = Boolean(value);
    const button = document.querySelector("[data-studio-flow-all]");
    if (button) {
      button.setAttribute("aria-pressed", String(showAll));
      button.textContent = showAll ? "專注模式" : "全部欄位";
    }
    editor.classList.toggle("studio-show-all", showAll);
    applyPanelVisibility();
    if (!showAll) revealActiveStep();
    if (!showAll) targetFor(activeStep)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  };

  const setActive = id => {
    if (!core.STEPS.some(step => step.id === id)) return;
    activeStep = id;
    document.querySelectorAll("[data-flow-step]").forEach(button => {
      const active = button.dataset.flowStep === id;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
    applyPanelVisibility();
  };

  const update = () => {
    const shell = makeShell();
    const currentValues = values();
    const states = core.stepStates(currentValues, {
      gameplayEnabled: !Boolean(field("gameplay_theme")?.disabled)
    });
    const required = core.requiredProgress(currentValues);
    const progress = shell.querySelector("#studio-flow-progress");
    if (progress) progress.textContent = core.overallLabel(currentValues);

    const meter = shell.querySelector(".studio-flow-meter");
    const fill = shell.querySelector("[data-studio-flow-meter]");
    if (meter) meter.setAttribute("aria-valuenow", String(required.done));
    if (fill) fill.style.width = Math.round(required.done / required.total * 100) + "%";

    shell.querySelectorAll("[data-flow-step]").forEach(button => {
      const item = states[button.dataset.flowStep];
      if (!item) return;
      button.dataset.state = item.state;
      const label = button.querySelector("[data-flow-state]");
      if (label) label.textContent = item.label;
    });

    form.querySelectorAll("[data-studio-flow-panel]").forEach(panel => {
      const item = states[panel.dataset.studioFlowPanel];
      const state = panel.querySelector("[data-studio-stage-state]");
      if (item && state) {
        state.textContent = item.label;
        state.dataset.state = item.state;
      }
    });

    setActive(activeStep);
    return states;
  };

  const go = (id, intentional = false) => {
    const target = targetFor(id);
    if (!target) return false;
    setActive(id);

    if (id === "world") {
      field("profile")?.closest("details")?.setAttribute("open", "");
    }

    target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });

    revealActiveStep();

    if (intentional) {
      const focus = firstFieldFor(id);
      const details = focus?.closest?.("details");
      if (details && id !== "appearance") details.open = true;
      if (focus && !focus.disabled && window.matchMedia("(min-width: 821px)").matches) {
        window.setTimeout(() => {
          // A later step change or manual edit supersedes this deferred focus.
          if (showAll || activeStep !== id || !form.contains(focus) || focus.disabled) return;
          try { focus.focus({ preventScroll: true }); } catch (_) {}
        }, 220);
      }
    }
    return true;
  };

  const detectStep = node => node?.closest?.("[data-studio-flow-panel]")?.dataset.studioFlowPanel || "";

  ensureStyles();
  installStagePanels();
  installAnchors();
  makeShell();
  makeControls();
  installCreationRoutes();
  installEditDone();

  form.addEventListener("input", update);
  form.addEventListener("change", update);
  form.addEventListener("focusin", event => {
    const id = detectStep(event.target);
    if (id) setActive(id);
    if (editable(event.target)) editor.classList.add("studio-editing");
  });
  form.addEventListener("focusout", () => {
    requestAnimationFrame(() => {
      if (!editable(document.activeElement) || !form.contains(document.activeElement)) editor.classList.remove("studio-editing");
    });
  });

  const status = document.getElementById("studio-status");
  if (status) new MutationObserver(() => window.setTimeout(update, 0))
    .observe(status, { childList: true, subtree: true, characterData: true });

  update();
  window.BAOCharacterStudioFlow = Object.freeze({
    update,
    go,
    values,
    targetFor,
    setShowAll,
    installCreationRoutes
  });
})();
