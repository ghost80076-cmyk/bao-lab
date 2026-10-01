(() => {
  "use strict";
  const core = window.BAOCharacterStudioFlowCore;
  const form = document.getElementById("studio-form");
  const editor = document.querySelector(".studio-editor");
  if (!core || !form || !editor || window.BAOCharacterStudioFlow) return;

  const field = name => form.elements.namedItem(name);
  const ensureStyles = () => {
    if (document.querySelector('link[href^="css/character-studio-flow.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/character-studio-flow.css?v=2";
    document.head.appendChild(link);
  };

  const values = () => Object.fromEntries([
    "name", "id", "system_prompt", "greeting",
    "profile", "world", "lore", "npc_rules",
    "author_instructions", "creator_notes", "quote"
  ].map(name => [name, String(field(name)?.value || "")]));

  const targetFor = id => {
    if (id === "basic") return form.querySelector(".studio-grid");
    if (id === "core") return field("system_prompt")?.closest("label");
    if (id === "opening") return field("greeting")?.closest("label");
    if (id === "world") return form.querySelector(".studio-advanced:not(#studio-gameplay-theme)");
    if (id === "appearance") return document.getElementById("studio-gameplay-theme");
    if (id === "finish") return form.querySelector(".studio-button-row");
    return null;
  };

  const firstFieldFor = id => ({
    basic: field("name"),
    core: field("system_prompt"),
    opening: field("greeting"),
    world: field("profile"),
    appearance: field("gameplay_theme"),
    finish: document.getElementById("studio-preview-button")
  })[id] || null;

  let activeStep = "basic";

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
    intro.innerHTML = '<div><span class="eyebrow">CREATION FLOW</span><b>創作流程</b></div><strong id="studio-flow-progress" role="status" aria-live="polite">必填 0/4</strong>';
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
    shell.append(intro, nav);
    form.insertAdjacentElement("beforebegin", shell);
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
    });
    editor.appendChild(button);
    return button;
  };

  const setActive = id => {
    activeStep = id;
    document.querySelectorAll("[data-flow-step]").forEach(button => {
      const active = button.dataset.flowStep === id;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
  };

  const update = () => {
    const shell = makeShell();
    const states = core.stepStates(values(), {
      gameplayEnabled: !Boolean(field("gameplay_theme")?.disabled)
    });
    const progress = shell.querySelector("#studio-flow-progress");
    if (progress) progress.textContent = core.overallLabel(values());
    shell.querySelectorAll("[data-flow-step]").forEach(button => {
      const item = states[button.dataset.flowStep];
      if (!item) return;
      button.dataset.state = item.state;
      const label = button.querySelector("[data-flow-state]");
      if (label) label.textContent = item.label;
    });
    setActive(activeStep);
    return states;
  };

  const go = (id, intentional = false) => {
    const target = targetFor(id);
    if (!target) return false;
    if (target.matches("details")) target.open = true;
    setActive(id);
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    if (intentional) {
      const focus = firstFieldFor(id);
      if (focus && !focus.disabled && window.matchMedia("(min-width: 821px)").matches) {
        window.setTimeout(() => {
          try { focus.focus({ preventScroll: true }); } catch (_) {}
        }, 220);
      }
    }
    return true;
  };

  const detectStep = node => {
    for (const step of core.STEPS) {
      const target = targetFor(step.id);
      if (target && (target === node || target.contains(node))) return step.id;
    }
    return "";
  };

  ensureStyles();
  installAnchors();
  makeShell();
  installEditDone();
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  const editable = node => node instanceof Element && node.matches("input,textarea,select");
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
  window.BAOCharacterStudioFlow = Object.freeze({ update, go, values, targetFor });
})();
