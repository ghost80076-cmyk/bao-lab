(() => {
  "use strict";

  const core = window.BAOExploreDiscoveryCore;
  const root = document.getElementById("explore-view");
  if (!core || !root || typeof App === "undefined" || window.BAOExploreDiscovery) return;

  const STORAGE_KEY = "yorubay:explore-continuity:v1";
  const PREF_KEY = "yorubay:explore-preferences:v1";

  const readLibrary = () => {
    try {
      return core.normalizeLibrary(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
    } catch (error) {
      console.warn("YoruBay explore continuity could not be read:", error);
      return core.normalizeLibrary({});
    }
  };

  const writeLibrary = next => {
    const safe = core.normalizeLibrary(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    } catch (error) {
      console.warn("YoruBay explore continuity could not be saved:", error);
    }
    library = safe;
    return safe;
  };

  const readPreferences = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
      return {
        sort: ["default", "latest", "updated"].includes(raw?.sort) ? raw.sort : "default"
      };
    } catch {
      return { sort: "default" };
    }
  };

  const writePreferences = () => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ sort: state.sort }));
    } catch (error) {
      console.warn("YoruBay explore preferences could not be saved:", error);
    }
  };

  let library = readLibrary();
  const preferences = readPreferences();

  const state = {
    category: "all",
    rating: "general",
    query: "",
    capability: "all",
    scope: "all",
    sort: preferences.sort
  };

  const manifestEntry = character =>
    (App.characterManifest || []).find(item => String(item?.id || "") === String(character?.id || "")) || {};

  const extraFor = character => {
    const item = manifestEntry(character);
    const libraryInfo = core.libraryMeta(library, character?.id);
    const updateInfo = core.workUpdateState(item, libraryInfo);
    return {
      author: item.author || "",
      ...libraryInfo,
      ...updateInfo
    };
  };

  const formatActivityDate = value => {
    const stamp = Number(value || 0);
    if (!stamp) return "";
    const date = new Date(stamp);
    const now = new Date();
    const start = item => new Date(item.getFullYear(), item.getMonth(), item.getDate()).getTime();
    const days = Math.round((start(now) - start(date)) / (24 * 60 * 60 * 1000));
    if (days === 0) return "今天";
    if (days === 1) return "昨天";
    return new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric" }).format(date);
  };

  const cardContextText = (item, libraryInfo, updateInfo) => {
    if (state.scope === "recent" && libraryInfo.recentAt) {
      return "上次看過 · " + formatActivityDate(libraryInfo.recentAt);
    }
    if (state.scope === "updates" && updateInfo.activityAt) {
      const version = updateInfo.publishedVersion ? " · v" + updateInfo.publishedVersion : "";
      return "更新於 · " + formatActivityDate(updateInfo.activityAt) + version;
    }
    if (state.scope === "favorites") {
      if (updateInfo.badge === "UPDATED") return "收藏中 · 有新內容";
      if (libraryInfo.recentAt) return "收藏中 · 上次看過 " + formatActivityDate(libraryInfo.recentAt);
      return "收藏中 · 尚未開始";
    }
    const author = String(item?.author || "").trim();
    return author ? "作者 · " + author : "";
  };

  const ensureTools = () => {
    let host = document.getElementById("explore-discovery-tools");
    if (host) return host;

    host = document.createElement("section");
    host.id = "explore-discovery-tools";
    host.className = "explore-discovery-tools";
    host.setAttribute("aria-label", "搜尋與篩選作品");
    host.innerHTML = `
      <div class="explore-toolbar">
        <div class="explore-search">
          <label for="explore-search-input">搜尋作品</label>
          <div class="explore-search-box">
            <span aria-hidden="true">⌕</span>
            <input id="explore-search-input" type="search" autocomplete="off" spellcheck="false"
              placeholder="搜尋標題、描述、標籤…">
            <button type="button" class="text-button explore-search-clear" data-explore-clear hidden>清除</button>
          </div>
        </div>
        <button type="button" class="secondary explore-filter-trigger" data-explore-filter-open
          aria-haspopup="dialog" aria-controls="explore-filter-sheet">
          <span aria-hidden="true">☷</span><span>篩選</span>
          <b data-explore-filter-count hidden>0</b>
        </button>
      </div>
      <div id="explore-active-filters" class="explore-active-filters" aria-label="目前篩選條件" hidden></div>
      <div class="explore-result-line">
        <span id="explore-result-count" role="status" aria-live="polite">整理作品中…</span>
        <button type="button" class="text-button" data-explore-reset hidden>全部重設</button>
      </div>
      <div id="explore-search-empty" class="explore-search-empty" hidden>
        <b>沒有找到符合條件的作品</b>
        <span>可以換一個關鍵字，或清除篩選後再看看。</span>
      </div>
      <dialog id="explore-filter-sheet" class="explore-filter-sheet" aria-labelledby="explore-filter-title">
        <div class="explore-filter-panel">
          <div class="explore-filter-head">
            <div><span class="eyebrow">DISCOVER</span><h3 id="explore-filter-title">調整探索方式</h3></div>
            <button type="button" class="text-button" data-explore-filter-close aria-label="關閉篩選">關閉</button>
          </div>

          <section class="explore-filter-group" aria-labelledby="explore-sort-label">
            <h4 id="explore-sort-label">排序</h4>
            <div class="explore-option-row">
              <button type="button" data-explore-sort="default">預設</button>
              <button type="button" data-explore-sort="latest">最近發布</button>
              <button type="button" data-explore-sort="updated">最近更新</button>
            </div>
          </section>

          <section class="explore-filter-group" aria-labelledby="explore-scope-label">
            <h4 id="explore-scope-label">我的</h4>
            <div class="explore-option-row">
              <button type="button" data-explore-scope="all">全部作品</button>
              <button type="button" data-explore-scope="favorites">★ 收藏</button>
              <button type="button" data-explore-scope="recent">最近看過</button>
              <button type="button" data-explore-scope="updates">有近期更新</button>
            </div>
          </section>

          <section class="explore-filter-group" aria-labelledby="explore-category-label">
            <h4 id="explore-category-label">角色</h4>
            <div class="explore-option-row">
              <button type="button" data-explore-category="all">全部</button>
              <button type="button" data-explore-category="male">男性角色</button>
              <button type="button" data-explore-category="female">女性角色</button>
            </div>
          </section>

          <section class="explore-filter-group" aria-labelledby="explore-rating-label">
            <h4 id="explore-rating-label">內容分級</h4>
            <div class="explore-option-row">
              <button type="button" data-explore-rating="general">一般</button>
              <button type="button" data-explore-rating="mature">成熟內容</button>
            </div>
          </section>

          <section class="explore-filter-group" aria-labelledby="explore-capability-label">
            <h4 id="explore-capability-label">作品能力</h4>
            <div class="explore-option-row">
              <button type="button" data-explore-capability="all">全部</button>
              <button type="button" data-explore-capability="world">世界模擬</button>
              <button type="button" data-explore-capability="ui">互動 UI</button>
            </div>
          </section>

          <div class="explore-filter-actions">
            <button type="button" class="secondary" data-explore-clear-filters>清除</button>
            <button type="button" class="primary" data-explore-done>完成</button>
          </div>
        </div>
      </dialog>`

    const list = document.getElementById("character-list");
    list?.insertAdjacentElement("beforebegin", host);

    const input = host.querySelector("#explore-search-input");
    const clear = host.querySelector("[data-explore-clear]");
    const reset = host.querySelector("[data-explore-reset]");
    const dialog = host.querySelector("#explore-filter-sheet");

    const closeDialog = () => {
      if (!dialog) return;
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      else dialog.removeAttribute("open");
    };

    const openDialog = () => {
      if (!dialog) return;
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    };

    const setCategory = category => {
      state.category = ["all", "male", "female"].includes(category) ? category : "all";
      scheduleApply();
      return true;
    };

    const setRating = rating => {
      const next = rating === "mature" ? "mature" : "general";
      if (next === "mature" && localStorage.getItem("bao-lab:adult-confirmed") !== "yes") {
        if (!confirm("成熟內容僅供已滿 18 歲使用者瀏覽。請確認你已年滿 18 歲。")) return false;
        localStorage.setItem("bao-lab:adult-confirmed", "yes");
      }
      state.rating = next;
      document.getElementById("adult-notice")?.classList.toggle("hidden", next !== "mature");
      scheduleApply();
      return true;
    };

    const clearFilters = ({ includeQuery = false } = {}) => {
      state.capability = "all";
      state.scope = "all";
      state.rating = "general";
      state.sort = "default";
      if (includeQuery) {
        state.query = "";
        input.value = "";
      }
      writePreferences();
      state.category = "all";
      document.getElementById("adult-notice")?.classList.add("hidden");
      App.renderCharacters("all");
      scheduleApply();
    };

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
      clearFilters({ includeQuery: true });
      input.focus();
    });

    host.querySelector("[data-explore-filter-open]")?.addEventListener("click", openDialog);
    host.querySelector("[data-explore-filter-close]")?.addEventListener("click", closeDialog);
    host.querySelector("[data-explore-done]")?.addEventListener("click", closeDialog);
    host.querySelector("[data-explore-clear-filters]")?.addEventListener("click", () => clearFilters());

    dialog?.addEventListener("click", event => {
      if (event.target === dialog) closeDialog();
    });

    host.querySelectorAll("[data-explore-scope]").forEach(button => {
      button.addEventListener("click", () => {
        state.scope = button.dataset.exploreScope || "all";
        scheduleApply();
      });
    });

    host.querySelectorAll("[data-explore-capability]").forEach(button => {
      button.addEventListener("click", () => {
        state.capability = button.dataset.exploreCapability || "all";
        scheduleApply();
      });
    });

    host.querySelectorAll("[data-explore-category]").forEach(button => {
      button.addEventListener("click", () => setCategory(button.dataset.exploreCategory || "all"));
    });

    host.querySelectorAll("[data-explore-rating]").forEach(button => {
      button.addEventListener("click", () => setRating(button.dataset.exploreRating || "general"));
    });

    host.querySelectorAll("[data-explore-sort]").forEach(button => {
      button.addEventListener("click", () => {
        state.sort = button.dataset.exploreSort || "default";
        writePreferences();
        scheduleApply();
      });
    });

    host.addEventListener("click", event => {
      const chip = event.target.closest?.("[data-explore-remove]");
      if (!chip) return;
      const key = chip.dataset.exploreRemove;
      if (key === "query") {
        state.query = "";
        input.value = "";
      } else if (key === "category") state.category = "all";
      else if (key === "rating") {
        state.rating = "general";
        document.getElementById("adult-notice")?.classList.add("hidden");
      } else if (key === "scope") state.scope = "all";
      else if (key === "capability") state.capability = "all";
      else if (key === "sort") {
        state.sort = "default";
        writePreferences();
      } else if (key === "layout") {
        state.layout = "standard";
        writePreferences();
      }
      scheduleApply();
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

      const imageWrap = card.querySelector(".character-image-wrap");
      const content = card.querySelector(".character-content");
      if (!content) return;

      const libraryInfo = core.libraryMeta(library, character.id);
      const item = manifestEntry(character);
      const updateInfo = core.workUpdateState(item, libraryInfo);
      let favoriteButton = card.querySelector("[data-explore-favorite]");
      if (!favoriteButton && imageWrap) {
        favoriteButton = document.createElement("button");
        favoriteButton.type = "button";
        favoriteButton.className = "explore-favorite-button";
        favoriteButton.dataset.exploreFavorite = character.id;
        imageWrap.appendChild(favoriteButton);
        favoriteButton.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          writeLibrary(core.toggleFavorite(library, character.id));
          scheduleApply();
        });
      }
      if (favoriteButton) {
        favoriteButton.classList.toggle("active", libraryInfo.favorite);
        favoriteButton.setAttribute("aria-pressed", String(libraryInfo.favorite));
        favoriteButton.setAttribute("aria-label", (libraryInfo.favorite ? "取消收藏 " : "收藏 ") + (character.title || character.name || "作品"));
        favoriteButton.title = libraryInfo.favorite ? "取消收藏" : "收藏";
        favoriteButton.textContent = libraryInfo.favorite ? "★" : "☆";
      }

      let updateBadge = imageWrap?.querySelector(".explore-update-badge");
      if (updateInfo.badge) {
        if (!updateBadge && imageWrap) {
          updateBadge = document.createElement("span");
          updateBadge.className = "explore-update-badge";
          imageWrap.appendChild(updateBadge);
        }
        if (updateBadge) {
          updateBadge.textContent = updateInfo.badge;
          updateBadge.dataset.kind = updateInfo.badge.toLowerCase();
          const version = updateInfo.publishedVersion ? " v" + updateInfo.publishedVersion : "";
          updateBadge.title = updateInfo.badge === "UPDATED"
            ? "你看過這個作品，但現在有新版" + version
            : "你還沒看過這個作品目前的版本" + version;
          updateBadge.setAttribute("aria-label", updateBadge.title);
        }
      } else {
        updateBadge?.remove();
      }

      content.querySelector(".explore-card-continuity")?.remove();
      let context = content.querySelector(".explore-card-context");
      const contextText = cardContextText(item, libraryInfo, updateInfo);
      if (!contextText) {
        context?.remove();
      } else {
        if (!context) {
          context = document.createElement("div");
          context.className = "explore-card-context";
          const title = content.querySelector("h3");
          if (title) title.insertAdjacentElement("afterend", context);
          else content.prepend(context);
        }
        context.textContent = contextText;
      }

      const tags = content.querySelector(".tags");
      if (tags) {
        const tagCount = tags.querySelectorAll(".tag").length;
        const hiddenCount = Math.max(0, tagCount - 3);
        tags.classList.toggle("explore-tags-condensed", tagCount > 3);
        if (hiddenCount) tags.dataset.hiddenCount = String(hiddenCount);
        else delete tags.dataset.hiddenCount;
      }

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

  const decorateDetailVersion = item => {
    const detail = document.getElementById("character-detail");
    if (!detail) return;
    detail.querySelectorAll(".explore-detail-version").forEach(node => node.remove());
    const publication = core.publicationMeta(item || {});
    if (!publication.publishedVersion && !publication.activityAt) return;
    const line = document.createElement("div");
    line.className = "explore-detail-version";
    const bits = [];
    if (publication.publishedVersion) bits.push("公開版本 v" + publication.publishedVersion);
    if (publication.activityAt) bits.push("更新於 " + formatActivityDate(publication.activityAt));
    line.textContent = bits.join(" · ");
    const title = detail.querySelector("h1");
    if (title) title.insertAdjacentElement("afterend", line);
    else detail.prepend(line);
  };

  const apply = () => {
    const host = ensureTools();
    const matches = currentMatches();
    const visible = new Set(matches.map(item => String(item.id || "")));

    const list = document.getElementById("character-list");
    const cards = [...document.querySelectorAll("#character-list [data-character-id]")];
    cards.forEach(card => {
      card.classList.toggle("bao-explore-filter-hidden", !visible.has(String(card.dataset.characterId || "")));
    });

    if (list) {
      const ordered = ["recent", "updates"].includes(state.scope) || ["latest", "updated"].includes(state.sort);
      const preferred = ordered
        ? matches.map(item => String(item.id || ""))
        : (App.characters || []).map(item => String(item.id || ""));
      const rank = new Map(preferred.map((id, index) => [id, index]));
      cards.sort((a, b) =>
        (rank.get(String(a.dataset.characterId || "")) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(String(b.dataset.characterId || "")) ?? Number.MAX_SAFE_INTEGER)
      );
      const more = list.querySelector(".character-load-more");
      cards.forEach(card => list.insertBefore(card, more || null));
    }

    decorateCards();

    host.querySelectorAll("[data-explore-scope]").forEach(button => {
      const active = button.dataset.exploreScope === state.scope;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    host.querySelectorAll("[data-explore-capability]").forEach(button => {
      const active = button.dataset.exploreCapability === state.capability;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    host.querySelectorAll("[data-explore-category]").forEach(button => {
      const active = button.dataset.exploreCategory === state.category;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    host.querySelectorAll("[data-explore-rating]").forEach(button => {
      const active = button.dataset.exploreRating === state.rating;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    host.querySelectorAll("[data-explore-sort]").forEach(button => {
      const active = button.dataset.exploreSort === state.sort;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    const input = host.querySelector("#explore-search-input");
    if (input && input.value !== state.query) input.value = state.query;

    const hasQuery = Boolean(core.clean(state.query));
    const hasCapability = state.capability !== "all";
    const hasScope = state.scope !== "all";
    const hasCategory = state.category !== "all";
    const hasRating = state.rating !== "general";
    const hasSort = state.sort !== "default";
    const hasFilters = hasCapability || hasScope || hasCategory || hasRating || hasSort;
    const clear = host.querySelector("[data-explore-clear]");
    const reset = host.querySelector("[data-explore-reset]");
    if (clear) clear.hidden = !hasQuery;
    if (reset) reset.hidden = !(hasQuery || hasFilters);

    const activeFilters = host.querySelector("#explore-active-filters");
    if (activeFilters) {
      const chips = [];
      const labels = {
        category: { male: "男性角色", female: "女性角色" },
        rating: { mature: "成熟內容" },
        scope: { favorites: "收藏", recent: "最近看過", updates: "有近期更新" },
        capability: { world: "世界模擬", ui: "互動 UI" },
        sort: { latest: "最近發布", updated: "最近更新排序" }
      };
      if (hasQuery) chips.push({ key: "query", label: "搜尋：" + core.clean(state.query) });
      if (hasCategory) chips.push({ key: "category", label: labels.category[state.category] || state.category });
      if (hasRating) chips.push({ key: "rating", label: labels.rating[state.rating] || state.rating });
      if (hasScope) chips.push({ key: "scope", label: labels.scope[state.scope] || state.scope });
      if (hasCapability) chips.push({ key: "capability", label: labels.capability[state.capability] || state.capability });
      if (hasSort) chips.push({ key: "sort", label: labels.sort[state.sort] || state.sort });
      activeFilters.innerHTML = chips.map(chip =>
        `<button type="button" data-explore-remove="${App.escapeAttr(chip.key)}">${App.escapeHTML(chip.label)} <span aria-hidden="true">×</span></button>`
      ).join("");
      activeFilters.hidden = chips.length === 0;
    }

    const filterCount = host.querySelector("[data-explore-filter-count]");
    if (filterCount) {
      const count = [hasCapability, hasScope, hasCategory, hasRating, hasSort].filter(Boolean).length;
      filterCount.textContent = String(count);
      filterCount.hidden = count === 0;
    }

    const count = host.querySelector("#explore-result-count");
    if (count) count.textContent = core.resultLabel(matches.length, Boolean(App.hasMoreCharacterCatalog?.()));

    const empty = host.querySelector("#explore-search-empty");
    if (empty) {
      empty.hidden = matches.length !== 0;
      const title = empty.querySelector("b");
      const copy = empty.querySelector("span");
      if (state.scope === "favorites") {
        if (title) title.textContent = "還沒有符合條件的收藏";
        if (copy) copy.textContent = "點作品封面上的 ☆ 收藏；收藏只保存在這台裝置。";
      } else if (state.scope === "recent") {
        if (title) title.textContent = "最近還沒有看過符合條件的作品";
        if (copy) copy.textContent = "打開作品詳情後，夜灣會在這台裝置記住最近瀏覽。";
      } else if (state.scope === "updates") {
        if (title) title.textContent = "目前沒有近期更新的作品";
        if (copy) copy.textContent = "只有作品目錄明確提供發布／更新時間時，夜灣才會顯示 NEW 或 UPDATED。";
      } else {
        if (title) title.textContent = "沒有找到符合條件的作品";
        if (copy) copy.textContent = "可以換一個關鍵字，或清除能力篩選後再看看。";
      }
    }

    root.dataset.exploreQuery = hasQuery ? "active" : "idle";
    root.dataset.exploreCapability = state.capability;
    root.dataset.exploreScope = state.scope;
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

  const originalRenderDetail = App.renderDetail.bind(App);
  App.renderDetail = function(...args) {
    const result = originalRenderDetail(...args);
    decorateDetailVersion(manifestEntry(App.activeCharacter));
    return result;
  };

  const originalRender = App.renderCharacters.bind(App);
  App.renderCharacters = function(filter = "all") {
    if (["male", "female"].includes(filter)) state.category = filter;
    const result = originalRender("all");
    scheduleApply();
    return result;
  };

  const originalOpenCharacter = App.openCharacter.bind(App);
  App.openCharacter = async function(id) {
    const item = (App.characterManifest || []).find(entry => String(entry?.id || "") === String(id || "")) || {};
    const publication = core.publicationMeta(item);
    const result = await originalOpenCharacter(id);
    if (String(App.activeCharacter?.id || "") === String(id || "")) {
      decorateDetailVersion(item);
      writeLibrary(core.markViewed(
        library,
        id,
        Date.now(),
        publication.versionPublishedAt || publication.updatedAt,
        publication.publishedVersion
      ));
      scheduleApply();
    }
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
      state.scope = "all";
      state.category = "all";
      state.rating = "general";
      state.sort = "default";
      writePreferences();
      App.renderCharacters("all");
      scheduleApply();
    },
    matches: currentMatches,
    library() {
      return core.normalizeLibrary(library);
    },
    toggleFavorite(id) {
      writeLibrary(core.toggleFavorite(library, id));
      scheduleApply();
      return core.libraryMeta(library, id);
    },
    markViewed(id, viewedAt) {
      const item = (App.characterManifest || []).find(entry => String(entry?.id || "") === String(id || "")) || {};
      const publication = core.publicationMeta(item);
      writeLibrary(core.markViewed(
        library,
        id,
        viewedAt,
        publication.versionPublishedAt || publication.updatedAt,
        publication.publishedVersion
      ));
      scheduleApply();
      return core.libraryMeta(library, id);
    }
  });
})();
