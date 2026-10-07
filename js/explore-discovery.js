(() => {
  "use strict";

  const core = window.BAOExploreDiscoveryCore;
  const root = document.getElementById("explore-view");
  if (!core || !root || typeof App === "undefined" || window.BAOExploreDiscovery) return;

  const STORAGE_KEY = "yorubay:explore-continuity:v1";
  const PREF_KEY = "yorubay:explore-preferences:v1";
  const adultEnabled = () => Boolean(window.BAOContentPreferences?.isAdultContentEnabled?.());
  const defaultRating = () => adultEnabled() ? "all" : "general";

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
        sort: ["default", "latest", "updated"].includes(raw?.sort) ? raw.sort : "default",
        view: ["poster", "detail"].includes(raw?.view) ? raw.view : "poster"
      };
    } catch {
      return { sort: "default", view: "poster" };
    }
  };

  const writePreferences = () => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ sort: state.sort, view: state.view }));
    } catch (error) {
      console.warn("YoruBay explore preferences could not be saved:", error);
    }
  };

  let library = readLibrary();
  const preferences = readPreferences();

  const state = {
    category: "all",
    rating: defaultRating(),
    query: "",
    capability: "all",
    scope: "all",
    sort: preferences.sort,
    view: preferences.view
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

  const authorHref = item => {
    const id = String(item?.author_id || "").trim().toLowerCase();
    return /^[a-z0-9][a-z0-9_-]{1,63}$/.test(id)
      ? "author.html?id=" + encodeURIComponent(id)
      : "";
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
    return "";
  };

  const cardAuthorText = item => {
    const author = String(item?.author || "").trim();
    return author ? "作者 · " + author : "";
  };


  let previewDialog = null;

  const closePreview = () => {
    if (!previewDialog) return;
    if (typeof previewDialog.close === "function" && previewDialog.open) previewDialog.close();
    else previewDialog.removeAttribute("open");
  };

  const ensurePreview = () => {
    if (previewDialog?.isConnected) return previewDialog;
    const dialog = document.createElement("dialog");
    dialog.id = "explore-work-preview";
    dialog.className = "explore-work-preview";
    dialog.setAttribute("aria-labelledby", "explore-work-preview-title");
    dialog.innerHTML = '<div class="explore-work-preview-panel">'
      + '<div class="explore-work-preview-media"><img data-explore-preview-image alt=""><span data-explore-preview-rating></span></div>'
      + '<div class="explore-work-preview-copy">'
      + '<div class="explore-work-preview-head"><div><h3 id="explore-work-preview-title" data-explore-preview-title></h3></div>'
      + '<button type="button" class="text-button" data-explore-preview-close aria-label="關閉作品預覽">關閉</button></div>'
      + '<div class="explore-work-preview-meta" data-explore-preview-meta></div>'
      + '<p class="explore-work-preview-description" data-explore-preview-description></p>'
      + '<div class="explore-work-preview-capabilities" data-explore-preview-capabilities></div>'
      + '<div class="tags explore-work-preview-tags" data-explore-preview-tags></div>'
      + '<div class="explore-work-preview-actions"><button type="button" class="secondary" data-explore-preview-close>繼續瀏覽</button>'
      + '<button type="button" class="primary" data-explore-preview-open>查看作品</button></div>'
      + '</div></div>';

    dialog.querySelectorAll("[data-explore-preview-close]").forEach(button => {
      button.addEventListener("click", closePreview);
    });
    dialog.addEventListener("click", event => {
      if (event.target === dialog) closePreview();
    });
    dialog.querySelector("[data-explore-preview-open]")?.addEventListener("click", async event => {
      const id = String(event.currentTarget.dataset.characterId || "");
      closePreview();
      if (id) await App.openCharacter(id);
    });
    document.body.appendChild(dialog);
    previewDialog = dialog;
    return dialog;
  };

  const openPreview = id => {
    const key = String(id || "");
    const character = (App.characters || []).find(item => String(item?.id || "") === key);
    if (!character) return false;
    if (window.BAOContentPreferences?.isAdult?.(character) && !adultEnabled()) {
      window.BAOContentPreferences?.guard?.(character);
      return false;
    }

    const dialog = ensurePreview();
    const item = manifestEntry(character);
    const publication = core.publicationMeta(item);
    const labels = core.capabilityLabels(character);
    const title = character.title || character.name || "未命名作品";
    const author = String(item.author || "").trim();
    const rating = character.rating === "adult" || item.rating === "adult" ? "成熟內容" : "一般內容";
    const meta = [];
    if (author) meta.push("作者 · " + author);
    meta.push(rating);
    if (publication.publishedVersion) meta.push("公開版本 v" + publication.publishedVersion);
    if (publication.activityAt) meta.push("更新於 " + formatActivityDate(publication.activityAt));

    const image = dialog.querySelector("[data-explore-preview-image]");
    if (image) {
      image.src = character.avatar || "";
      image.alt = title;
    }
    const ratingNode = dialog.querySelector("[data-explore-preview-rating]");
    if (ratingNode) {
      ratingNode.textContent = rating;
      ratingNode.dataset.kind = rating === "成熟內容" ? "mature" : "general";
    }
    const titleNode = dialog.querySelector("[data-explore-preview-title]");
    if (titleNode) titleNode.textContent = title;
    const metaNode = dialog.querySelector("[data-explore-preview-meta]");
    if (metaNode) {
      metaNode.replaceChildren();
      const href = authorHref(item);
      const parts = [];
      if (author && href) {
        const link = document.createElement("a");
        link.className = "explore-author-link";
        link.href = href;
        link.textContent = "作者 · " + author;
        parts.push(link);
      } else if (author) {
        parts.push(document.createTextNode("作者 · " + author));
      }
      parts.push(document.createTextNode(rating));
      if (publication.publishedVersion) parts.push(document.createTextNode("公開版本 v" + publication.publishedVersion));
      if (publication.activityAt) parts.push(document.createTextNode("更新於 " + formatActivityDate(publication.activityAt)));
      parts.forEach((part, index) => {
        if (index) metaNode.append(" · ");
        metaNode.append(part);
      });
    }
    const description = dialog.querySelector("[data-explore-preview-description]");
    if (description) description.textContent = character.description || "這個作品尚未提供簡介。";

    const capabilityNode = dialog.querySelector("[data-explore-preview-capabilities]");
    if (capabilityNode) {
      capabilityNode.innerHTML = labels.map(label => "<span>" + App.escapeHTML(label) + "</span>").join("");
      capabilityNode.hidden = labels.length === 0;
    }
    const tagNode = dialog.querySelector("[data-explore-preview-tags]");
    if (tagNode) {
      tagNode.innerHTML = (character.tags || []).slice(0, 8)
        .map(tag => '<span class="tag">#' + App.escapeHTML(tag) + "</span>").join("");
      tagNode.hidden = !(character.tags || []).length;
    }
    const openButton = dialog.querySelector("[data-explore-preview-open]");
    if (openButton) openButton.dataset.characterId = key;

    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    return true;
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
        <div class="explore-result-actions">
          <div class="explore-view-toggle" role="group" aria-label="作品顯示方式">
            <button type="button" data-explore-view="poster" aria-pressed="false">▦ 封面</button>
            <button type="button" data-explore-view="detail" aria-pressed="false">☷ 詳細</button>
          </div>
          <button type="button" class="text-button" data-explore-reset hidden>全部重設</button>
        </div>
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
            <h4 id="explore-category-label">作品取向</h4>
            <div class="explore-option-row">
              <button type="button" data-explore-category="all">全部</button>
              <button type="button" data-explore-category="general">一般向</button>
              <button type="button" data-explore-category="female">女性向</button>
              <button type="button" data-explore-category="male">男性向</button>
            </div>
          </section>

          <section class="explore-filter-group" aria-labelledby="explore-rating-label" data-explore-adult-controls ${adultEnabled() ? "" : "hidden"}>
            <h4 id="explore-rating-label">內容分級</h4>
            <div class="explore-option-row">
              <button type="button" data-explore-rating="all">全部</button>
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

    const syncViewMode = () => {
      root.dataset.exploreView = state.view;
      host.querySelectorAll("[data-explore-view]").forEach(button => {
        const active = button.dataset.exploreView === state.view;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
    };

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
      state.category = ["all", "general", "male", "female"].includes(category) ? category : "all";
      scheduleApply();
      return true;
    };

    const setRating = rating => {
      const next = ["all", "general", "mature"].includes(rating) ? rating : defaultRating();
      if ((next === "all" || next === "mature") && !adultEnabled()) {
        window.BAOContentPreferences?.guard?.({ rating: "adult" });
        return false;
      }
      state.rating = next;
      document.getElementById("adult-notice")?.classList.toggle(
        "hidden",
        !adultEnabled() || next === "general"
      );
      App.renderCharacters("all");
      return true;
    };

    const clearFilters = ({ includeQuery = false } = {}) => {
      state.capability = "all";
      state.scope = "all";
      state.rating = defaultRating();
      state.sort = "default";
      if (includeQuery) {
        state.query = "";
        input.value = "";
      }
      writePreferences();
      state.category = "all";
      document.getElementById("adult-notice")?.classList.toggle("hidden", !adultEnabled());
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

    host.querySelectorAll("[data-explore-view]").forEach(button => {
      button.addEventListener("click", () => {
        state.view = button.dataset.exploreView === "detail" ? "detail" : "poster";
        writePreferences();
        syncViewMode();
      });
    });
    syncViewMode();

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
        state.rating = defaultRating();
        document.getElementById("adult-notice")?.classList.toggle("hidden", !adultEnabled());
      } else if (key === "scope") state.scope = "all";
      else if (key === "capability") state.capability = "all";
      else if (key === "sort") {
        state.sort = "default";
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

      let badgeRow = imageWrap?.querySelector(".explore-card-badge-row");
      const staticBadges = imageWrap
        ? [...imageWrap.querySelectorAll(":scope > .category-badge, :scope > .rating-badge")]
        : [];
      if (imageWrap && staticBadges.length && !badgeRow) {
        badgeRow = document.createElement("div");
        badgeRow.className = "explore-card-badge-row";
        imageWrap.appendChild(badgeRow);
      }
      if (badgeRow) {
        staticBadges.forEach(badge => {
          if (badge.parentElement !== badgeRow) badgeRow.appendChild(badge);
        });
      }

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
        if (!badgeRow && imageWrap) {
          badgeRow = document.createElement("div");
          badgeRow.className = "explore-card-badge-row";
          imageWrap.appendChild(badgeRow);
        }
        if (!updateBadge && badgeRow) {
          updateBadge = document.createElement("span");
          updateBadge.className = "explore-update-badge";
          badgeRow.appendChild(updateBadge);
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

      let authorLine = content.querySelector(".explore-card-author");
      const authorText = cardAuthorText(item);
      if (!authorText) {
        authorLine?.remove();
      } else {
        if (!authorLine) {
          authorLine = document.createElement("div");
          authorLine.className = "explore-card-author";
          const title = content.querySelector("h3");
          if (title) title.insertAdjacentElement("afterend", authorLine);
          else content.prepend(authorLine);
        }
        authorLine.replaceChildren();
        const href = authorHref(item);
        if (href) {
          const link = document.createElement("a");
          link.className = "explore-author-link";
          link.href = href;
          link.textContent = authorText;
          link.addEventListener("click", event => event.stopPropagation());
          authorLine.appendChild(link);
        } else {
          authorLine.textContent = authorText;
        }
      }

      let context = content.querySelector(".explore-card-context");
      const contextText = cardContextText(item, libraryInfo, updateInfo);
      if (!contextText) {
        context?.remove();
      } else {
        if (!context) {
          context = document.createElement("div");
          context.className = "explore-card-context";
          const anchor = content.querySelector(".explore-card-author") || content.querySelector("h3");
          if (anchor) anchor.insertAdjacentElement("afterend", context);
          else content.prepend(context);
        }
        context.replaceChildren();
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

      // Capability metadata already has a compact card row in the gallery presentation.
      // Keep these labels available to filters and the work preview, but never inject a
      // second "世界模擬 / 互動 UI" row over the poster.
      content.querySelector(".explore-card-capabilities")?.remove();
    });
  };

  const decorateDetailVersion = item => {
    const detail = document.getElementById("character-detail");
    if (!detail) return;
    detail.querySelectorAll(".explore-detail-version,.explore-detail-author").forEach(node => node.remove());

    const title = detail.querySelector("h1");
    const author = String(item?.author || "").trim();
    const href = authorHref(item);
    if (author) {
      const authorLine = document.createElement("div");
      authorLine.className = "explore-detail-author";
      if (href) {
        const link = document.createElement("a");
        link.className = "explore-author-link";
        link.href = href;
        link.textContent = "作者 · " + author;
        authorLine.appendChild(link);
      } else {
        authorLine.textContent = "作者 · " + author;
      }
      if (title) title.insertAdjacentElement("afterend", authorLine);
      else detail.prepend(authorLine);
    }

    const publication = core.publicationMeta(item || {});
    if (!publication.publishedVersion && !publication.activityAt) return;
    const line = document.createElement("div");
    line.className = "explore-detail-version";
    const bits = [];
    if (publication.publishedVersion) bits.push("公開版本 v" + publication.publishedVersion);
    if (publication.activityAt) bits.push("更新於 " + formatActivityDate(publication.activityAt));
    line.textContent = bits.join(" · ");

    const anchor = detail.querySelector(".explore-detail-author") || title;
    if (anchor) anchor.insertAdjacentElement("afterend", line);
    else detail.prepend(line);
  };

  const apply = () => {
    const host = ensureTools();
    if (!adultEnabled() && state.rating !== "general") {
      state.rating = "general";
      state.category = "all";
    }
    const adultControls = host?.querySelector("[data-explore-adult-controls]");
    if (adultControls) adultControls.hidden = !adultEnabled();
    document.getElementById("adult-notice")?.classList.toggle(
      "hidden",
      !adultEnabled() || state.rating === "general"
    );
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
      const orderedCards = cards.slice().sort((a, b) =>
        (rank.get(String(a.dataset.characterId || "")) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(String(b.dataset.characterId || "")) ?? Number.MAX_SAFE_INTEGER)
      );
      const currentOrder = cards.map(card => String(card.dataset.characterId || ""));
      const nextOrder = orderedCards.map(card => String(card.dataset.characterId || ""));
      const needsReorder = currentOrder.length === nextOrder.length &&
        currentOrder.some((id, index) => id !== nextOrder[index]);
      if (needsReorder) {
        const more = list.querySelector(".character-load-more");
        orderedCards.forEach(card => list.insertBefore(card, more || null));
      }
    }

    decorateCards();

    const portalCategory = state.category;
    document.querySelectorAll("#category-portals .category-portal").forEach(button => {
      button.classList.toggle("active", button.dataset.category === portalCategory);
    });
    document.getElementById("explore-view")?.setAttribute("data-category-theme", portalCategory || "all");

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
    const hasRating = state.rating !== defaultRating();
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
        category: { general: "一般向", female: "女性向", male: "男性向" },
        rating: { all: "全部分級", general: "一般內容", mature: "成熟內容" },
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
    if (filter === "r18") {
      if (!adultEnabled()) {
        state.rating = "general";
        state.category = "all";
        const blocked = originalRender("all");
        scheduleApply();
        return blocked;
      }
      state.rating = "mature";
      state.category = "all";
    } else if (["general", "male", "female"].includes(filter)) {
      state.category = filter;
    } else if (filter === "all") {
      // "all" refreshes the rendered catalog, but keeps the independent
      // orientation/rating filters selected by the player.
    }
    const result = originalRender("all");
    scheduleApply();
    return result;
  };

  const originalOpenCharacter = App.openCharacter.bind(App);
  App.openCharacter = async function(id) {
    const character = (App.characters || []).find(entry => String(entry?.id || "") === String(id || "")) || null;
    const item = (App.characterManifest || []).find(entry => String(entry?.id || "") === String(id || "")) || {};
    const adultTarget = character || item;
    if (window.BAOContentPreferences?.isAdult?.(adultTarget) && !adultEnabled()) {
      window.BAOContentPreferences?.guard?.(adultTarget);
      return false;
    }
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

  window.addEventListener("yorubay:content-preferences-changed", () => {
    const enabled = adultEnabled();
    const adultControls = root.querySelector("[data-explore-adult-controls]");
    if (adultControls) adultControls.hidden = !enabled;
    if (enabled) {
      state.rating = "all";
      state.category = "all";
      document.getElementById("adult-notice")?.classList.remove("hidden");
      App.renderCharacters("all");
      return;
    }
    state.rating = "general";
    state.category = "all";
    document.getElementById("adult-notice")?.classList.add("hidden");
    closePreview();
    App.renderCharacters("all");
  });

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

  const openDeepLinkedWork = async () => {
    const id = String(new URLSearchParams(location.search).get("work") || "").trim();
    if (!id) return;

    for (let attempt = 0; attempt < 50; attempt += 1) {
      let exists = (App.characterManifest || []).some(item => String(item?.id || "") === id);
      if (!exists && App.hasMoreCharacterCatalog?.()) {
        try {
          const added = await App.loadMoreCharacters();
          if (added) App.renderCharacters("all");
        } catch {}
        exists = (App.characterManifest || []).some(item => String(item?.id || "") === id);
      }
      if (exists) {
        App.showView("explore");
        scheduleApply();
        window.setTimeout(() => openPreview(id), 40);
        return;
      }
      await new Promise(resolve => window.setTimeout(resolve, 100));
    }
  };

  window.addEventListener("load", () => {
    window.setTimeout(openDeepLinkedWork, 0);
  }, { once: true });

  window.BAOExploreDiscovery = Object.freeze({
    state,
    apply,
    openPreview,
    closePreview,
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
