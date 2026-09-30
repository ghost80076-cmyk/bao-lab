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
    const query = fold(state.query || "");
    if (!inCategory(character, category)) return false;
    if (!supports(character, capability)) return false;
    if (!query) return true;
    return haystack(character, extra).includes(query);
  }

  function filter(list = [], state = {}, extraFor = () => ({})) {
    const source = Array.isArray(list) ? list : [];
    return source.filter(item => matches(item, state, extraFor(item) || {}));
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
    capabilityLabels,
    resultLabel
  });
});
