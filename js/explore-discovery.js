(() => {
  "use strict";

  const core = window.BAOExploreDiscoveryCore;
  const root = document.getElementById("explore-view");
  if (!core || !root || typeof App === "undefined" || window.BAOExploreDiscovery) return;

  const state = {
    category: "all",
    query: "",
    capability: "all"
  };

  const manifestEntry = character =>
    (App.characterManifest || []).find(item => String(item?.id || "") === String(character?.id || "")) || {};

  const extraFor = character => {
    const item = manifestEntry(character);
    return { author: item.author || "" };
  };

  const ensureTools = () => {
    let host = document.getElementById("explore-discovery-tools");
    if (host) return host;

    host = document.createElement("section");
    host.id = "explore-discovery-tools";
    host.className = "explore-discovery-tools";
    host.setAttribute("aria-label", "搜尋與篩選作品");
    host.innerHTML = `
      <div class="explore-search">
        <label for="explore-search-input">搜尋作品</label>
        <div class="explore-search-box">
          <span aria-hidden="true">⌕</span>
          <input id="explore-search-input" type="search" autocomplete="off" spellcheck="false"
            placeholder="搜尋標題、描述、標籤…">
          <button type="button" class="text-button explore-search-clear" data-explore-clear hidden>清除</button>
        </div>
      </div>
      <div class="explore-capabilities" aria-label="作品能力篩選">
        <span>想找：</span>
        <button type="button" class="filter active" data-explore-capability="all">全部</button>
        <button type="button" class="filter" data-explore-capability="world">世界模擬</button>
        <button type="button" class="filter" data-explore-capability="ui">互動 UI</button>
      </div>
      <div class="explore-result-line">
        <span id="explore-result-count" role="status" aria-live="polite">整理作品中…</span>
        <button type="button" class="text-button" data-explore-reset hidden>重設篩選</button>
      </div>
      <div id="explore-search-empty" class="explore-search-empty" hidden>
        <b>沒有找到符合條件的作品</b>
        <span>可以換一個關鍵字，或清除能力篩選後再看看。</span>
      </div>`;

    const list = document.getElementById("character-list");
    list?.insertAdjacentElement("beforebegin", host);

    const input = host.querySelector("#explore-search-input");
    const clear = host.querySelector("[data-explore-clear]");
    const reset = host.querySelector("[data-explore-reset]");

    input?.addEventListener("input", () => {
      state.query = input.value;
      scheduleApply();
    });

    clear?.addEventListener("click", () => {
      state.query = "";
      input.value = "";
      scheduleApply();
      input.focus();
    });

    reset?.addEventListener("click", () => {
      state.query = "";
      state.capability = "all";
      input.value = "";
      scheduleApply();
      input.focus();
    });

    host.querySelectorAll("[data-explore-capability]").forEach(button => {
      button.addEventListener("click", () => {
        state.capability = button.dataset.exploreCapability || "all";
        scheduleApply();
      });
    });

    return host;
  };

  const currentMatches = () => core.filter(
    App.characters || [],
    state,
    extraFor
  );

  const decorateCards = () => {
    document.querySelectorAll("#character-list [data-character-id]").forEach(card => {
      const character = (App.characters || []).find(item => String(item?.id || "") === String(card.dataset.characterId || ""));
      if (!character) return;

      const content = card.querySelector(".character-content");
      if (!content) return;

      let meta = content.querySelector(".explore-card-capabilities");
      const labels = core.capabilityLabels(character);
      if (!labels.length) {
        meta?.remove();
        return;
      }

      if (!meta) {
        meta = document.createElement("div");
        meta.className = "explore-card-capabilities";
        const tags = content.querySelector(".tags");
        if (tags) tags.insertAdjacentElement("beforebegin", meta);
        else content.appendChild(meta);
      }
      meta.innerHTML = labels.map(label => `<span>${App.escapeHTML(label)}</span>`).join("");
    });
  };

  const apply = () => {
    const host = ensureTools();
    const matches = currentMatches();
    const visible = new Set(matches.map(item => String(item.id || "")));

    document.querySelectorAll("#character-list [data-character-id]").forEach(card => {
      card.classList.toggle("bao-explore-filter-hidden", !visible.has(String(card.dataset.characterId || "")));
    });

    decorateCards();

    host.querySelectorAll("[data-explore-capability]").forEach(button => {
      const active = button.dataset.exploreCapability === state.capability;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    const input = host.querySelector("#explore-search-input");
    if (input && input.value !== state.query) input.value = state.query;

    const hasQuery = Boolean(core.clean(state.query));
    const hasCapability = state.capability !== "all";
    const clear = host.querySelector("[data-explore-clear]");
    const reset = host.querySelector("[data-explore-reset]");
    if (clear) clear.hidden = !hasQuery;
    if (reset) reset.hidden = !(hasQuery || hasCapability);

    const count = host.querySelector("#explore-result-count");
    if (count) count.textContent = core.resultLabel(matches.length, Boolean(App.hasMoreCharacterCatalog?.()));

    const empty = host.querySelector("#explore-search-empty");
    if (empty) empty.hidden = matches.length !== 0;

    root.dataset.exploreQuery = hasQuery ? "active" : "idle";
    root.dataset.exploreCapability = state.capability;
  };

  let applyQueued = false;
  const scheduleApply = () => {
    if (applyQueued) return;
    applyQueued = true;
    window.requestAnimationFrame(() => {
      applyQueued = false;
      apply();
    });
  };

  const originalRender = App.renderCharacters.bind(App);
  App.renderCharacters = function(filter = "all") {
    state.category = ["male", "female", "r18"].includes(filter) ? filter : "all";
    const result = originalRender(filter);
    scheduleApply();
    return result;
  };

  const observer = new MutationObserver(records => {
    const relevant = records.some(record =>
      record.target?.id === "character-list" ||
      [...record.addedNodes].some(node => node.nodeType === 1 &&
        (node.id === "character-list" || node.matches?.("[data-character-id], .character-load-more")))
    );
    if (relevant) scheduleApply();
  });
  observer.observe(root, { childList: true, subtree: true });

  ensureTools();
  scheduleApply();

  window.BAOExploreDiscovery = Object.freeze({
    state,
    apply,
    reset() {
      state.query = "";
      state.capability = "all";
      scheduleApply();
    },
    matches: currentMatches
  });
})();
