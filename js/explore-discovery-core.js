(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BAOExploreDiscoveryCore = api;
})(typeof window !== "undefined" ? window : null, function() {
  "use strict";

  const clean = value => String(value ?? "").trim();
  const fold = value => clean(value).toLocaleLowerCase("zh-Hant");

  function isAdult(character = {}) {
    return String(character.category || "").toLowerCase() === "r18" ||
      String(character.rating || "").toLowerCase() === "adult";
  }

  function inCategory(character = {}, category = "all") {
    const active = ["male", "female", "r18"].includes(category) ? category : "all";
    if (active === "all") return !isAdult(character);
    return String(character.category || "").toLowerCase() === active;
  }

  function supports(character = {}, capability = "all") {
    if (capability === "world") return character.supported_modes?.world === true;
    if (capability === "ui") return character.supported_display?.ui === true;
    return true;
  }

  function haystack(character = {}, extra = {}) {
    return [
      character.name,
      character.title,
      character.description,
      extra.author,
      ...(Array.isArray(character.tags) ? character.tags : []),
      ...(Array.isArray(character.categories) ? character.categories : []),
      ...(Array.isArray(character.audience) ? character.audience : [])
    ].map(fold).filter(Boolean).join("\n");
  }

  function matches(character = {}, state = {}, extra = {}) {
    const category = state.category || "all";
    const capability = state.capability || "all";
    const scope = ["favorites", "recent"].includes(state.scope) ? state.scope : "all";
    const query = fold(state.query || "");
    if (!inCategory(character, category)) return false;
    if (!supports(character, capability)) return false;
    if (scope === "favorites" && extra.favorite !== true) return false;
    if (scope === "recent" && !Number(extra.recentAt || 0)) return false;
    if (!query) return true;
    return haystack(character, extra).includes(query);
  }

  function filter(list = [], state = {}, extraFor = () => ({})) {
    const source = Array.isArray(list) ? list : [];
    const matched = source.filter(item => matches(item, state, extraFor(item) || {}));
    if (state.scope !== "recent") return matched;
    return matched.slice().sort((a, b) => {
      const aTime = Number((extraFor(a) || {}).recentAt || 0);
      const bTime = Number((extraFor(b) || {}).recentAt || 0);
      return bTime - aTime;
    });
  }

  function normalizeLibrary(value = {}) {
    const favorites = [...new Set((Array.isArray(value.favorites) ? value.favorites : [])
      .map(clean).filter(Boolean))].slice(0, 500);
    const recent = (Array.isArray(value.recent) ? value.recent : [])
      .map(item => ({
        id: clean(item?.id),
        viewedAt: Math.max(0, Number(item?.viewedAt) || 0)
      }))
      .filter(item => item.id && item.viewedAt)
      .sort((a, b) => b.viewedAt - a.viewedAt)
      .filter((item, index, list) => list.findIndex(other => other.id === item.id) === index)
      .slice(0, 60);
    return { favorites, recent };
  }

  function libraryMeta(library = {}, id = "") {
    const safe = normalizeLibrary(library);
    const key = clean(id);
    const recent = safe.recent.find(item => item.id === key);
    return {
      favorite: safe.favorites.includes(key),
      recentAt: recent?.viewedAt || 0
    };
  }

  function toggleFavorite(library = {}, id = "") {
    const safe = normalizeLibrary(library);
    const key = clean(id);
    if (!key) return safe;
    const favorites = safe.favorites.includes(key)
      ? safe.favorites.filter(item => item !== key)
      : [key, ...safe.favorites];
    return normalizeLibrary({ ...safe, favorites });
  }

  function markViewed(library = {}, id = "", viewedAt = Date.now()) {
    const safe = normalizeLibrary(library);
    const key = clean(id);
    const stamp = Math.max(0, Number(viewedAt) || 0);
    if (!key || !stamp) return safe;
    return normalizeLibrary({
      ...safe,
      recent: [{ id: key, viewedAt: stamp }, ...safe.recent.filter(item => item.id !== key)]
    });
  }

  function capabilityLabels(character = {}) {
    const labels = [];
    if (character.supported_modes?.world === true) labels.push("世界模擬");
    if (character.supported_display?.ui === true) labels.push("互動 UI");
    return labels;
  }

  function resultLabel(count, hasMore = false) {
    const safe = Math.max(0, Number(count) || 0);
    return "目前顯示 " + safe + " 個作品" + (hasMore ? " · 載入更多後搜尋範圍會擴大" : "");
  }

  return Object.freeze({
    clean,
    fold,
    isAdult,
    inCategory,
    supports,
    haystack,
    matches,
    filter,
    normalizeLibrary,
    libraryMeta,
    toggleFavorite,
    markViewed,
    capabilityLabels,
    resultLabel
  });
});
