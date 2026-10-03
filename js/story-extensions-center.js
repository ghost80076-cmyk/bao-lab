(() => {
  "use strict";
  if (window.BAOStoryExtensionsCenter || !window.App || !window.BAOStoryExtensionsCore) return;

  const core = window.BAOStoryExtensionsCore;
  const esc = value => App.escapeHTML(String(value ?? ""));
  const AUTHOR_PREFIX = "bao-lab:author-regex:v1:";
  const close = () => document.querySelector(".story-extensions-backdrop")?.remove();

  const ensureStyles = () => {
    if (document.querySelector('link[href^="css/story-extensions-center.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/story-extensions-center.css?v=2";
    document.head.appendChild(link);
  };

  const readAuthorRegex = () => {
    const id = String(App.activeCharacter?.id || "").slice(0, 80);
    if (!id) return {};
    try {
      return JSON.parse(localStorage.getItem(AUTHOR_PREFIX + encodeURIComponent(id)) || "null") || {};
    } catch (_) {
      return {};
    }
  };

  const snapshot = () => {
    let world = [];
    let worldInventory = {};
    try {
      const modules = window.BAOWorldModules;
      world = modules?.definitions?.(App.activeCharacter) || [];
      const base = modules?.baseDefinitions?.(App.activeCharacter) || [];
      const custom = modules?.getCustomization?.(App.activeCharacter) || {};
      worldInventory = {
        work: base,
        platform: (Array.isArray(custom.enabledBuiltIns) ? custom.enabledBuiltIns : [])
          .map(id => modules?.normalizeModule?.({ id })).filter(Boolean),
        player: Array.isArray(custom.customModules) ? custom.customModules : [],
        disabled: Array.isArray(custom.disabled) ? custom.disabled : []
      };
    } catch (_) {}
    let replace = {};
    try { replace = window.BAOPlayerTextReplace?.get?.() || {}; } catch (_) {}
    let regex = {};
    try { regex = window.BAORegex?.load?.() || {}; } catch (_) {}
    const scene = window.BAOSceneHTML?.prefs || { mode: "native", status: "native" };
    return core.overview({
      world,
      worldInventory,
      scene,
      replace,
      regex,
      authorRegex: readAuthorRegex(),
      commentary: window.BAOCommentaryMods?.summary?.() || null
    });
  };

  const focusSceneSettings = () => {
    window.BAOChatToolNavigation?.openDrawer?.();
    window.setTimeout(() => {
      const detail = document.querySelector('[data-chat-tool-group="scene"]');
      if (detail) detail.open = true;
      const control = detail?.querySelector("select,button,input") || document.querySelector("#bao-scene-controls select");
      if (control) {
        control.scrollIntoView({ block: "center", behavior: "smooth" });
        control.focus();
      } else {
        window.BAOFeedback?.notify?.("閱讀排版工具仍在載入，請稍後再試。", "error");
      }
    }, 80);
  };

  const ACTIONS = {
    world() {
      if (window.BAOWorldModuleManager?.open) window.BAOWorldModuleManager.open();
      else window.BAOFeedback?.notify?.("世界模組管理仍在載入。", "error");
    },
    scene() { focusSceneSettings(); },
    replace() {
      const button = document.querySelector('[data-bao-open="text-replace"]');
      if (button) button.click();
      else window.BAOFeedback?.notify?.("文字替換 MOD 仍在載入。", "error");
    },
    regex() {
      window.open("regex-manager.html", "_blank", "noopener");
    },
    commentary() {
      if (window.BAOCommentaryMods?.open) window.BAOCommentaryMods.open();
      else window.BAOFeedback?.notify?.("場外人格 MOD 仍在載入。", "error");
    }
  };


  const notify = (message, type = "success") => {
    if (window.BAOFeedback?.notify) window.BAOFeedback.notify(message, type);
    else window.alert(message);
  };

  const packPreviewHTML = description => `
    <section class="story-extension-pack-preview" aria-labelledby="story-extension-pack-title">
      <header>
        <div>
          <span class="story-extension-eyebrow">PORTABLE SETTINGS</span>
          <h3 id="story-extension-pack-title">準備匯入擴充設定</h3>
          <p>只會套用你勾選的類別；每一類都會取代該類目前的玩家設定。</p>
        </div>
        <button type="button" class="story-extension-pack-cancel" data-extension-pack-cancel>取消</button>
      </header>
      <div class="story-extension-pack-sections">
        ${description.sections.map(section => `
          <label class="story-extension-pack-section">
            <input type="checkbox" data-extension-pack-section="${esc(section.id)}" checked>
            <span><b>${esc(section.label)}</b><small>${esc(section.detail)}</small><em>${esc(section.impact)}</em></span>
          </label>`).join("")}
      </div>
      <div class="story-extension-pack-excluded">
        <b>不會帶入</b>
        <span>${description.excluded.map(item => esc(item)).join(" · ")}</span>
      </div>
      <button type="button" class="primary story-extension-pack-apply" data-extension-pack-apply>套用選取設定</button>
    </section>`;

  const mountPackPreview = (wrap, description) => {
    wrap.querySelector(".story-extension-pack-preview")?.remove();
    const footer = wrap.querySelector(".story-extensions-note");
    if (!footer) return;
    footer.insertAdjacentHTML("beforebegin", packPreviewHTML(description));
    const preview = wrap.querySelector(".story-extension-pack-preview");
    preview?.querySelector("[data-extension-pack-cancel]")?.addEventListener("click", () => preview.remove());
    preview?.querySelector("[data-extension-pack-apply]")?.addEventListener("click", () => {
      const selected = [...preview.querySelectorAll("[data-extension-pack-section]:checked")]
        .map(input => input.dataset.extensionPackSection).filter(Boolean);
      if (!selected.length) {
        notify("請至少勾選一類設定再套用。", "error");
        return;
      }
      const labels = description.sections.filter(section => selected.includes(section.id)).map(section => section.label);
      if (!window.confirm(`套用「${labels.join("、")}」？選取類別目前的玩家設定會被設定包取代。`)) return;
      try {
        const result = window.BAOStoryExtensionPack?.applyPack?.(description.pack, selected);
        if (!result?.applied?.length) throw new Error("沒有設定被套用。");
        notify(`已套用：${result.applied.join("、")}。`);
        window.setTimeout(() => open(), 0);
      } catch (error) {
        notify(error?.message || "故事擴充設定套用失敗。", "error");
      }
    });
    preview?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const scopeChips = scopes => (Array.isArray(scopes) ? scopes : [])
    .map(scope => `<span class="story-extension-scope">${esc(scope)}</span>`).join("");

  const sourceChips = sources => (Array.isArray(sources) ? sources : [])
    .map(item => {
      const count = item.count === null || item.count === undefined ? "" : ` · ${Number(item.count).toLocaleString()}`;
      return `<span class="story-extension-source" data-source="${esc(item.id || "")}">${esc(item.label)}${esc(count)}</span>`;
    }).join("");

  const ownershipMeta = data => {
    const meta = data?.ownership || {};
    const permissions = Array.isArray(meta.permissions) ? meta.permissions : [];
    return `
      <div class="story-extension-meta">
        <div><b>來源</b><span class="story-extension-sources">${sourceChips(meta.sources)}</span></div>
        <div><b>保存</b><span>${esc(meta.storage || "依工具設定")}</span></div>
        <div><b>適用</b><span>${esc(meta.appliesTo || "目前故事")}</span></div>
        <div><b>啟用</b><span>${esc(meta.control || "玩家決定")}</span></div>
        ${permissions.length ? `<div class="story-extension-permissions"><b>授權</b><span>${permissions.map(item => `<em>${esc(item)}</em>`).join("")}</span></div>` : ""}
      </div>`;
  };


  const quickButton = (quick, extra = "") => {
    if (!quick?.kind) return "";
    const label = quick.label || (quick.enabled ? "停用" : "啟用");
    return `<button type="button" class="story-extension-quick" data-extension-quick="${esc(quick.kind)}" data-extension-key="${esc(quick.key || "")}" data-extension-extra="${esc(extra)}" aria-pressed="${quick.enabled ? "true" : "false"}">${esc(label)}</button>`;
  };

  const saveStoryQuietly = () => {
    try { App.saveStory?.(false); } catch (_) {}
  };

  const rerenderAfterQuickChange = cardId => {
    window.setTimeout(() => open({ expandCard: cardId }), 0);
  };

  const applyQuickChange = (kind, key, cardId) => {
    if (!kind) return false;

    if (kind === "world") {
      const modules = window.BAOWorldModules;
      const draft = modules?.getCustomization?.(App.activeCharacter);
      if (!modules || !draft || !key) return false;
      const disabled = new Set(Array.isArray(draft.disabled) ? draft.disabled : []);
      if (disabled.has(key)) disabled.delete(key); else disabled.add(key);
      modules.applyCustomization({ ...draft, disabled: [...disabled] }, App.activeCharacter);
      saveStoryQuietly();
      window.BAOWorldModuleUI?.injectTabs?.();
      const activePanel = document.querySelector("#game-ui .ui-tab.active")?.dataset?.panel;
      if (activePanel) App.renderUIPanel?.(activePanel);
      rerenderAfterQuickChange(cardId);
      return true;
    }

    if (kind === "replace-master") {
      const state = window.BAOPlayerTextReplace?.get?.();
      if (!state) return false;
      window.BAOPlayerTextReplace.set({ ...state, active: !state.active });
      rerenderAfterQuickChange(cardId);
      return true;
    }

    if (kind === "replace-rule") {
      const state = window.BAOPlayerTextReplace?.get?.();
      if (!state) return false;
      const rules = (state.rules || []).map((rule, index) => {
        const ruleKey = rule.id || String(index);
        return ruleKey === key ? { ...rule, enabled: !rule.enabled } : rule;
      });
      window.BAOPlayerTextReplace.set({ ...state, rules });
      rerenderAfterQuickChange(cardId);
      return true;
    }

    if (kind === "regex-master") {
      const state = window.BAORegex?.load?.();
      if (!state) return false;
      window.BAORegex.save({ ...state, active: !state.active });
      window.BAORegexChat?.schedule?.();
      rerenderAfterQuickChange(cardId);
      return true;
    }

    if (kind === "regex-rule") {
      const state = window.BAORegex?.load?.();
      if (!state) return false;
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || index >= (state.rules || []).length) return false;
      const rules = state.rules.map((rule, i) => i === index ? { ...rule, enabled: !rule.enabled } : rule);
      window.BAORegex.save({ ...state, rules });
      window.BAORegexChat?.schedule?.();
      rerenderAfterQuickChange(cardId);
      return true;
    }

    return false;
  };


  const inventoryHTML = data => {
    const groups = Array.isArray(data?.inventory) ? data.inventory.filter(group => group?.items?.length) : [];
    if (!groups.length) return "";
    const total = groups.reduce((sum, group) => sum + group.items.length, 0);
    const summary = groups.map(group => `${group.label} ${group.items.length}`).join(" · ");
    return `
      <details class="story-extension-inventory">
        <summary><span>目前內容</span><small>${esc(total + " 項 · " + summary)}</small></summary>
        <div class="story-extension-inventory-body">
          ${groups.map(group => `
            <section class="story-extension-inventory-group" data-extension-source-group="${esc(group.id || "")}">
              <header><b>${esc(group.label || "其他")}</b><span>${Number(group.items.length).toLocaleString()} 項</span>${quickButton(group.quick, group.id || "")}</header>
              <div class="story-extension-items">
                ${group.items.map(item => `
                  <div class="story-extension-item" data-state="${esc(item.state || "info")}">
                    <div><b>${esc(item.label || "未命名")}</b>${item.detail ? `<small>${esc(item.detail)}</small>` : ""}</div>
                    <span>${esc(item.status || "")}</span>
                    ${quickButton(item.quick, group.id || "")}
                  </div>`).join("")}
              </div>
            </section>`).join("")}
        </div>
      </details>`;
  };

  const card = data => `
    <article class="story-extension-card" data-extension-card="${esc(data.id)}">
      <div class="story-extension-copy">
        <span class="story-extension-eyebrow">${esc(data.eyebrow)}</span>
        <h3>${esc(data.title)}</h3>
        <p>${esc(data.detail)}</p>
        <div class="story-extension-scopes" aria-label="作用範圍">${scopeChips(data.scopes)}</div>
        ${ownershipMeta(data)}
        ${inventoryHTML(data)}
      </div>
      <button type="button" class="secondary" data-extension-action="${esc(data.id)}">${data.id === "regex" ? "開啟工具" : "管理"} →</button>
    </article>`;

  const open = (options = {}) => {
    if (!window.GameState?.current || !App.activeCharacter) {
      window.BAOFeedback?.notify?.("先進入一個故事，再查看故事擴充。", "error");
      return;
    }
    close();
    ensureStyles();
    const data = snapshot();
    const wrap = document.createElement("div");
    wrap.className = "story-extensions-backdrop";
    wrap.innerHTML = `
      <section class="story-extensions-panel" role="dialog" aria-modal="true" aria-labelledby="story-extensions-title">
        <header class="story-extensions-head">
          <div>
            <div class="eyebrow">STORY EXTENSIONS</div>
            <h2 id="story-extensions-title">故事擴充</h2>
            <p>${esc(data.title)} · <b>${esc(App.activeCharacter?.name || "目前故事")}</b></p>
          </div>
          <div class="story-extensions-head-actions">
            <button type="button" class="story-extensions-help" data-extension-help aria-label="故事擴充說明" aria-expanded="false" aria-controls="story-extension-guide">?</button>
            <button type="button" class="story-extensions-close" data-extension-close aria-label="關閉故事擴充">×</button>
          </div>
        </header>
        <div class="story-extension-guide" id="story-extension-guide">
          <b>先看「作用範圍、來源、保存位置、適用故事與啟用權限」，再決定要不要開。</b>
          <span>世界模組會參與 AI 上下文與狀態；閱讀排版會影響 AI 回覆格式與畫面；玩家文字替換只改顯示。清單中的安全開關可以直接切換；新增、刪除、改內容與作品授權仍留在完整管理工具。作品 Regex 不會在這裡快速取得權限。</span>
        </div>
        <div class="story-extensions-list">
          ${data.cards.map(card).join("")}
        </div>
        <footer class="story-extensions-note">
          <span>「作品提供」代表作品附帶能力，不代表自動取得權限；需要玩家同意的功能仍維持關閉。打開這個頁面本身不會啟用任何規則。</span>
          <div class="story-extension-pack-actions">
            <button type="button" class="secondary" data-extension-pack-export>匯出擴充設定</button>
            <button type="button" class="secondary" data-extension-pack-import>匯入擴充設定</button>
            <input type="file" accept=".json,application/json" data-extension-pack-file hidden>
          </div>
          <small>設定包只搬移玩家可攜設定；不包含故事內容、世界狀態、API Key、作品 Regex 或作者授權。</small>
        </footer>
      </section>`;
    document.body.appendChild(wrap);

    wrap.querySelector("[data-extension-close]")?.addEventListener("click", close);
    wrap.querySelector("[data-extension-help]")?.addEventListener("click", event => {
      const panel = event.currentTarget.closest(".story-extensions-panel");
      const open = !panel?.classList.contains("story-extensions-help-open");
      panel?.classList.toggle("story-extensions-help-open", open);
      event.currentTarget.setAttribute("aria-expanded", open ? "true" : "false");
    });
    wrap.addEventListener("click", event => { if (event.target === wrap) close(); });
    wrap.querySelectorAll("[data-extension-action]").forEach(button => {
      button.addEventListener("click", () => {
        const action = ACTIONS[button.dataset.extensionAction];
        if (!action) return;
        close();
        window.setTimeout(action, 0);
      });
    });
    wrap.querySelectorAll("[data-extension-quick]").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        const card = button.closest("[data-extension-card]");
        const cardId = card?.dataset.extensionCard || "";
        if (!applyQuickChange(button.dataset.extensionQuick, button.dataset.extensionKey || "", cardId)) {
          window.BAOFeedback?.notify?.("這個項目無法快速切換，請使用完整管理工具。", "error");
        }
      });
    });

    const packApi = window.BAOStoryExtensionPack;
    const exportButton = wrap.querySelector("[data-extension-pack-export]");
    const importButton = wrap.querySelector("[data-extension-pack-import]");
    const importFile = wrap.querySelector("[data-extension-pack-file]");
    if (!packApi) {
      if (exportButton) exportButton.disabled = true;
      if (importButton) importButton.disabled = true;
    } else {
      exportButton?.addEventListener("click", () => {
        try {
          const pack = packApi.exportCurrent();
          const info = window.BAOStoryExtensionPackCore?.describePack?.(pack);
          notify(info ? `擴充設定已匯出，共 ${info.sections.length} 類設定；不含故事內容與 API Key。` : "擴充設定已匯出。");
        } catch (error) {
          notify(error?.message || "擴充設定匯出失敗。", "error");
        }
      });
      importButton?.addEventListener("click", () => importFile?.click());
      importFile?.addEventListener("change", async event => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        try {
          const description = await packApi.readFile(file);
          mountPackPreview(wrap, description);
        } catch (error) {
          notify(error?.message || "無法讀取這份擴充設定包。", "error");
        }
      });
    }

    if (options.expandCard) {
      wrap.querySelector(`[data-extension-card="${CSS.escape(String(options.expandCard))}"] .story-extension-inventory`)?.setAttribute("open", "");
    }
    wrap.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
    wrap.querySelector("[data-extension-close]")?.focus();
  };

  const summary = () => {
    const data = snapshot();
    return { title: data.title, detail: data.detail };
  };

  window.BAOStoryExtensionsCenter = Object.freeze({ open, close, snapshot, summary });
})();
