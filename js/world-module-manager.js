(() => {
  if (typeof App === "undefined" || !window.BAOWorldModules) return;

  const TRACKING_LABELS = { high: "自動・優先", medium: "自動・一般", low: "自動・次要", manual: "手動" };
  const CONTEXT_LABELS = { core: "核心", relevant: "相關時", ui_only: "只顯示" };
  const KIND_LABELS = { object: "欄位物件", collection: "清單" };
  const clone = value => {
    try { return structuredClone(value); }
    catch { return JSON.parse(JSON.stringify(value ?? null)); }
  };
  const esc = value => App.escapeHTML(String(value ?? ""));

  const ensureStyles = () => {
    if (document.querySelector('link[href^="css/world-module-manager.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/world-module-manager.css?v=5";
    document.head.appendChild(link);
  };

  const open = () => {
    if (!GameState.current) { alert("請先開始或讀取一個故事。"); return; }
    const base = window.BAOWorldModules.baseDefinitions(App.activeCharacter).filter(def => def.visibility !== 'internal');
    const draft = clone(window.BAOWorldModules.getCustomization(App.activeCharacter));
    const baseIds = new Set(base.map(def => def.id));

    document.querySelector(".world-manager-backdrop")?.remove();
    const wrap = document.createElement("div");
    wrap.className = "world-manager-backdrop";
    wrap.innerHTML = `<section class="world-manager-modal" role="dialog" aria-modal="true" aria-labelledby="world-manager-title">
      <header class="world-manager-head"><div><div class="eyebrow">WORLD MODULES</div><h2 id="world-manager-title">世界模組管理</h2><p id="world-manager-intro">角色卡提供預設，玩家只在目前故事中啟用或擴充。</p></div><div class="world-manager-head-actions"><button type="button" class="world-manager-help" data-world-help aria-label="世界模組管理說明" aria-expanded="false" aria-controls="world-manager-intro">?</button><button type="button" class="text-button" data-world-close>關閉</button></div></header>
      <div class="world-manager-body"><main>
        <section class="world-manager-card world-manager-order-card"><div class="world-manager-title"><div><h3>目前模組順序</h3><p>順序同時影響頁籤與 Context 顯示。</p></div><button type="button" class="secondary" data-world-add>＋ 自訂模組</button></div><div class="world-manager-order" data-world-order></div></section>
        <section class="world-manager-card world-manager-presets-card" data-world-section="official"><h3>官方模組 <button type="button" class="bao-help-button" data-bao-help="three_realms" aria-label="了解三界功能怎麼選">?</button></h3><p>選擇這個故事需要的功能，作品預設的模組會標示來源。篩選僅改變列表顯示。</p><div class="world-manager-preset-discovery" aria-label="尋找官方模組"><input type="search" data-world-preset-search aria-label="搜尋官方模組" placeholder="搜尋官方模組，例如背包、任務、修煉"><div class="world-manager-preset-filters" aria-label="官方模組篩選"><button type="button" data-world-preset-filter="all" aria-pressed="true">全部</button><button type="button" data-world-preset-filter="enabled" aria-pressed="false">已啟用</button><button type="button" data-world-preset-filter="available" aria-pressed="false">可新增</button></div><p data-world-preset-count role="status" aria-live="polite"></p></div><div class="world-manager-presets" data-world-presets></div><p class="world-manager-preset-empty" data-world-preset-empty hidden>沒有符合條件的模組，請清除搜尋或切回「全部」。</p></section>
        <section class="world-manager-card world-manager-custom-card-list" data-world-section="mine"><h3>我的模組</h3><p>你為目前故事建立或匯入的模組；可以是欄位物件或項目清單，並直接接入既有 World Modules tracker。</p><div class="world-manager-custom" data-world-custom></div></section>
      </main><aside class="world-manager-guide">
        <section class="world-manager-card"><h3>Context 原則</h3><p><b>核心</b>：每輪精簡提供。</p><p><b>相關時</b>：文字命中或手動查看時提供。</p><p><b>只顯示</b>：不加入敘事背景；若啟用自動追蹤，仍提供給狀態模型核對。</p></section>
        <section class="world-manager-card"><h3>追蹤方式</h3><p>自動模組每次狀態整理都會核對，優先項目先處理；手動資料不交給 AI 更新。故事與狀態使用同模型時合併一次請求；獨立狀態模型依你設定的整理間隔執行。</p></section>
      </aside></div>
      <footer class="world-manager-foot"><button type="button" class="secondary" data-world-reset>恢復角色卡預設</button><span data-world-message></span><button type="button" class="primary" data-world-save>套用到目前故事</button></footer>
    </section>`;
    document.body.appendChild(wrap);
    const guide = wrap.querySelector(".world-manager-guide");
    const guideDetails = document.createElement("details");
    guideDetails.className = "world-manager-guide-details";
    guideDetails.open = window.YoruExperience?.get?.().level === "pro";
    const guideSummary = document.createElement("summary");
    guideSummary.textContent = "進階說明：AI 資料使用與追蹤方式";
    const guideContent = document.createElement("div");
    guideContent.className = "world-manager-guide-content";
    while (guide.firstChild) guideContent.appendChild(guide.firstChild);
    guideDetails.append(guideSummary, guideContent);
    guide.appendChild(guideDetails);

    let presetQuery = "";
    let presetFilter = "all";
    const presetSearch = wrap.querySelector("[data-world-preset-search]");
    const presetCounter = wrap.querySelector("[data-world-preset-count]");
    const presetEmpty = wrap.querySelector("[data-world-preset-empty]");
    const applyPresetDiscovery = () => {
      let shown = 0;
      const all = [...wrap.querySelectorAll(".world-preset")];
      for (const label of all) {
        const input = label.querySelector("[data-preset-id]");
        const enabled = Boolean(input?.checked);
        const text = (label.textContent || "").toLowerCase();
        const matches = (!presetQuery || text.includes(presetQuery)) &&
          (presetFilter === "all" || (presetFilter === "enabled" ? enabled : !enabled));
        label.hidden = !matches;
        if (matches) shown++;
      }
      presetCounter.textContent = "顯示 " + shown + " / " + all.length + " 個模組";
      presetEmpty.hidden = shown !== 0;
      wrap.querySelectorAll("[data-world-preset-filter]").forEach(button =>
        button.setAttribute("aria-pressed", String(button.dataset.worldPresetFilter === presetFilter)));
    };
    presetSearch.addEventListener("input", () => {
      presetQuery = presetSearch.value.trim().toLowerCase();
      applyPresetDiscovery();
    });
    wrap.querySelectorAll("[data-world-preset-filter]").forEach(button => button.addEventListener("click", () => {
      presetFilter = button.dataset.worldPresetFilter;
      applyPresetDiscovery();
    }));

    const activeIds = () => {
      const ids = [
        ...base.map(def => def.id),
        ...draft.enabledBuiltIns.filter(id => !baseIds.has(id)),
        ...draft.customModules.filter(def => def.visibility !== 'internal').map(def => def.id)
      ].filter(id => !draft.disabled.includes(id));
      return [...new Set(ids)];
    };

    const ensureOrder = () => {
      const ids = activeIds();
      draft.order = [...draft.order.filter(id => ids.includes(id)), ...ids.filter(id => !draft.order.includes(id))];
    };

    const moduleFor = id => base.find(def => def.id === id)
      || draft.customModules.find(def => def.id === id)
      || window.BAOWorldModules.normalizeModule({ id });

    const setEnabled = (id, enabled) => {
      if (baseIds.has(id)) {
        draft.disabled = draft.disabled.filter(item => item !== id);
        if (!enabled) draft.disabled.push(id);
      } else if (window.BAOWorldModules.BUILT_INS[id]) {
        draft.enabledBuiltIns = draft.enabledBuiltIns.filter(item => item !== id);
        draft.disabled = draft.disabled.filter(item => item !== id);
        if (enabled) draft.enabledBuiltIns.push(id);
      }
      ensureOrder();
    };

    const addCustom = () => {
      if (draft.customModules.length >= 12) { alert("每份故事最多新增 12 個自訂世界模組。"); return; }
      const id = window.BAOWorldModules.uniqueModuleId("module", App.activeCharacter, draft.customModules);
      draft.customModules.push({
        id, label: "新模組", icon: "•", description: "", tracking: "medium",
        context: "relevant", kind: "object", enabled: true, triggers: [], fields: [], origin: "player"
      });
      draft.order.push(id);
      render();
    };

    const renderPresets = () => {
      const box = wrap.querySelector("[data-world-presets]");
      box.innerHTML = Object.entries(window.BAOWorldModules.BUILT_INS).map(([id, preset]) => {
        const enabled = baseIds.has(id) ? !draft.disabled.includes(id) : draft.enabledBuiltIns.includes(id);
        const source = baseIds.has(id) ? "作品預設" : "官方範本";
        return `<label class="world-preset ${enabled ? "active" : ""}"><input type="checkbox" data-preset-id="${esc(id)}" ${enabled ? "checked" : ""}><span>${esc(preset.icon)} <b>${esc(preset.label)}</b><small>${source}${id === window.BAOThreeRealmsCultivation?.id ? ' · 境界、業力、突破與飛升' : ''}</small></span></label>`;
      }).join("");
      box.querySelectorAll("[data-preset-id]").forEach(input => input.addEventListener("change", () => {
        setEnabled(input.dataset.presetId, input.checked);
        render();
      }));
      applyPresetDiscovery();
    };

    const renderOrder = () => {
      ensureOrder();
      const box = wrap.querySelector("[data-world-order]");
      box.innerHTML = draft.order.length ? draft.order.map((id, index) => {
        const def = moduleFor(id);
        return `<div class="world-order-row"><span>${esc(def?.icon || "•")} <b>${esc(def?.label || id)}</b><small>${esc(id)}</small></span><div><button type="button" data-order-id="${esc(id)}" data-move="up" ${index === 0 ? "disabled" : ""}>↑</button><button type="button" data-order-id="${esc(id)}" data-move="down" ${index === draft.order.length - 1 ? "disabled" : ""}>↓</button></div></div>`;
      }).join("") : '<div class="world-manager-empty">目前沒有啟用中的世界模組。</div>';
      box.querySelectorAll("[data-order-id]").forEach(button => button.addEventListener("click", () => {
        const index = draft.order.indexOf(button.dataset.orderId);
        const target = button.dataset.move === "up" ? index - 1 : index + 1;
        if (index < 0 || target < 0 || target >= draft.order.length) return;
        [draft.order[index], draft.order[target]] = [draft.order[target], draft.order[index]];
        renderOrder();
      }));
    };

    const renderCustom = () => {
      const box = wrap.querySelector("[data-world-custom]");
      const visibleCustom = draft.customModules.filter(def => def.visibility !== 'internal');
      box.innerHTML = visibleCustom.length ? visibleCustom.map(def => {
        const enabled = !draft.disabled.includes(def.id);
        return `<article class="world-custom-card" data-custom-id="${esc(def.id)}"><div class="world-custom-head"><span><b>${esc(def.label)}</b><small>${esc(def.id)}</small></span><button type="button" data-custom-delete>刪除</button></div><div class="world-custom-grid">
          <label>名稱<input data-custom-prop="label" maxlength="40" value="${esc(def.label)}"></label>
          <label>圖示<input data-custom-prop="icon" maxlength="4" value="${esc(def.icon)}"></label>
          <label>資料形式<select data-custom-prop="kind">${Object.entries(KIND_LABELS).map(([key, text]) => `<option value="${key}" ${def.kind === key ? "selected" : ""}>${text}</option>`).join("")}</select></label>
          <label>AI 使用方式<select data-custom-prop="context">${Object.entries(CONTEXT_LABELS).map(([key, text]) => `<option value="${key}" ${def.context === key ? "selected" : ""}>${text}</option>`).join("")}</select></label>
          <label>追蹤方式<select data-custom-prop="tracking">${Object.entries(TRACKING_LABELS).map(([key, text]) => `<option value="${key}" ${def.tracking === key ? "selected" : ""}>${text}</option>`).join("")}</select></label>
          <label class="world-custom-enabled"><input type="checkbox" data-custom-enabled ${enabled ? "checked" : ""}> 啟用</label>
          <label class="wide">觸發詞<input data-custom-prop="triggers" value="${esc((def.triggers || []).join("、"))}" placeholder="例如：契約、組織、情報"></label>
          <label class="wide">給狀態 AI 的說明<textarea data-custom-prop="description" maxlength="500">${esc(def.description || "")}</textarea></label>
        </div></article>`;
      }).join("") : '<div class="world-manager-empty">目前故事還沒有「我的模組」。</div>';

      box.querySelectorAll("[data-custom-id]").forEach(card => {
        const id = card.dataset.customId;
        const def = draft.customModules.find(item => item.id === id);
        card.querySelector("[data-custom-delete]")?.addEventListener("click", () => {
          draft.customModules = draft.customModules.filter(item => item.id !== id);
          draft.disabled = draft.disabled.filter(item => item !== id);
          draft.order = draft.order.filter(item => item !== id);
          render();
        });
        card.querySelector("[data-custom-enabled]")?.addEventListener("change", event => {
          draft.disabled = draft.disabled.filter(item => item !== id);
          if (!event.target.checked) draft.disabled.push(id);
          renderOrder();
        });
        card.querySelectorAll("[data-custom-prop]").forEach(input => {
          const eventName = input.tagName === "SELECT" ? "change" : "input";
          input.addEventListener(eventName, () => {
            if (!def) return;
            const prop = input.dataset.customProp;
            if (prop === "triggers") def.triggers = input.value.split(/[、,，]/).map(x => x.trim()).filter(Boolean).slice(0, 40);
            else def[prop] = input.value;
            if (prop === "label" || prop === "icon") renderOrder();
          });
        });
      });
    };

    const render = () => {
      renderPresets();
      renderOrder();
      renderCustom();
    };

    const close = () => wrap.remove();
    wrap.querySelector("[data-world-close]").addEventListener("click", close);
    wrap.querySelector("[data-world-help]")?.addEventListener("click", event => {
      const modal = event.currentTarget.closest(".world-manager-modal");
      const open = !modal?.classList.contains("world-manager-help-open");
      modal?.classList.toggle("world-manager-help-open", open);
      event.currentTarget.setAttribute("aria-expanded", open ? "true" : "false");
    });
    wrap.addEventListener("click", event => { if (event.target === wrap) close(); });
    wrap.querySelector("[data-world-add]").addEventListener("click", addCustom);
    wrap.querySelector("[data-world-reset]").addEventListener("click", () => {
      if (!confirm("確定移除目前故事的世界模組調整？角色卡原始模組會保留。")) return;
      window.BAOWorldModules.resetCustomization(App.activeCharacter);
      App.saveStory?.(false);
      window.BAOStoryQuickCommands?.injectEntry?.();
      window.BAOWorldModuleUI?.injectTabs?.();
      close();
      App.renderUIPanel("npc");
    });
    wrap.querySelector("[data-world-save]").addEventListener("click", () => {
      window.BAOWorldModules.applyCustomization(draft, App.activeCharacter);
      App.saveStory?.(false);
      window.BAOStoryQuickCommands?.injectEntry?.();
      window.BAOWorldModuleUI?.injectTabs?.();
      close();
      App.renderUIPanel("npc");
    });
    render();
  };

  const injectButton = () => {
    const aside = document.querySelector("#chat-view aside");
    if (!aside || aside.querySelector("[data-open-world-manager]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary world-manager-launch";
    button.dataset.openWorldManager = "true";
    button.textContent = "◇ 世界模組管理";
    button.addEventListener("click", open);
    const exit = aside.querySelector(".text-button");
    if (exit?.parentElement) exit.parentElement.insertBefore(button, exit); else aside.appendChild(button);
  };

  const originalRender = App.renderChatShell.bind(App);
  App.renderChatShell = function(fresh = false) {
    originalRender(fresh);
    injectButton();
  };

  ensureStyles();
  window.BAOWorldModuleManager = { open };
})();
