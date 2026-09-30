(() => {
  "use strict";

  const core = window.BAOExploreDiscoveryCore;
  const root = document.getElementById("explore-view");
  if (!core || !root || typeof App === "undefined" || window.BAOExploreDiscovery) return;

  const STORAGE_KEY = "yorubay:explore-continuity:v1";

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

  let library = readLibrary();

  const state = {
    category: "all",
    query: "",
    capability: "all",
    scope: "all"
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
      <div class="explore-search">
        <label for="explore-search-input">搜尋作品</label>
        <div class="explore-search-box">
          <span aria-hidden="true">⌕</span>
          <input id="explore-search-input" type="search" autocomplete="off" spellcheck="false"
            placeholder="搜尋標題、描述、標籤…">
          <button type="button" class="text-button explore-search-clear" data-explore-clear hidden>清除</button>
        </div>
      </div>
      <div class="explore-scope" aria-label="我的作品篩選">
        <span>我的：</span>
        <button type="button" class="filter active" data-explore-scope="all">全部作品</button>
        <button type="button" class="filter" data-explore-scope="favorites">★ 收藏</button>
        <button type="button" class="filter" data-explore-scope="recent">最近看過</button>
        <button type="button" class="filter" data-explore-scope="updates">最近更新</button>
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
      state.scope = "all";
      input.value = "";
      scheduleApply();
      input.focus();
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
            : "這是你還沒看過的新作品" + version;
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
    const detail = document.querySelector("#character-detail .detail-copy");
    if (!detail) return;
    detail.querySelector(".explore-detail-version")?.remove();
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
      const preferred = ["recent", "updates"].includes(state.scope)
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

    const input = host.querySelector("#explore-search-input");
    if (input && input.value !== state.query) input.value = state.query;

    const hasQuery = Boolean(core.clean(state.query));
    const hasCapability = state.capability !== "all";
    const hasScope = state.scope !== "all";
    const clear = host.querySelector("[data-explore-clear]");
    const reset = host.querySelector("[data-explore-reset]");
    if (clear) clear.hidden = !hasQuery;
    if (reset) reset.hidden = !(hasQuery || hasCapability || hasScope);

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

  const originalRender = App.renderCharacters.bind(App);
  App.renderCharacters = function(filter = "all") {
    state.category = ["male", "female", "r18"].includes(filter) ? filter : "all";
    const result = originalRender(filter);
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
