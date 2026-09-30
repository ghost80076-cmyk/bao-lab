(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BAOExploreDiscoveryCore = api;
})(typeof window !== "undefined" ? window : null, function() {
  "use strict";

  const clean = value => String(value ?? "").trim();
  const fold = value => clean(value).toLocaleLowerCase("zh-Hant");
  const DAY_MS = 24 * 60 * 60 * 1000;
  const UPDATE_FRESH_DAYS = 30;

  function dateMs(value) {
    if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, value) : 0;
    const parsed = Date.parse(clean(value));
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  function versionNumber(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
  }

  function publicationMeta(entry = {}) {
    const publishedAt = dateMs(entry.published_at || entry.publishedAt);
    const updatedAt = dateMs(entry.updated_at || entry.updatedAt) || publishedAt;
    const publishedVersion = versionNumber(entry.published_version || entry.publishedVersion);
    const versionPublishedAt = publishedVersion
      ? (dateMs(entry.version_published_at || entry.versionPublishedAt) || updatedAt || publishedAt)
      : 0;
    return {
      publishedAt,
      updatedAt: Math.max(updatedAt, publishedAt),
      publishedVersion,
      versionPublishedAt,
      activityAt: publishedVersion ? versionPublishedAt : Math.max(updatedAt, publishedAt)
    };
  }

  function isFresh(timestamp, now = Date.now(), days = UPDATE_FRESH_DAYS) {
    const time = dateMs(timestamp);
    const current = dateMs(now);
    const windowMs = Math.max(1, Number(days) || UPDATE_FRESH_DAYS) * DAY_MS;
    return Boolean(time && current >= time && current - time <= windowMs);
  }

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
    const scope = ["favorites", "recent", "updates"].includes(state.scope) ? state.scope : "all";
    const query = fold(state.query || "");
    if (!inCategory(character, category)) return false;
    if (!supports(character, capability)) return false;
    if (scope === "favorites" && extra.favorite !== true) return false;
    if (scope === "recent" && !Number(extra.recentAt || 0)) return false;
    if (scope === "updates" && !extra.recentUpdate) return false;
    if (!query) return true;
    return haystack(character, extra).includes(query);
  }

  function filter(list = [], state = {}, extraFor = () => ({})) {
    const source = Array.isArray(list) ? list : [];
    const matched = source.filter(item => matches(item, state, extraFor(item) || {}));
    if (!["recent", "updates"].includes(state.scope)) return matched;
    const key = state.scope === "updates" ? "activityAt" : "recentAt";
    return matched.slice().sort((a, b) => {
      const aTime = Number((extraFor(a) || {})[key] || 0);
      const bTime = Number((extraFor(b) || {})[key] || 0);
      return bTime - aTime;
    });
  }

  function normalizeLibrary(value = {}) {
    const favorites = [...new Set((Array.isArray(value.favorites) ? value.favorites : [])
      .map(clean).filter(Boolean))].slice(0, 500);
    const recent = (Array.isArray(value.recent) ? value.recent : [])
      .map(item => ({
        id: clean(item?.id),
        viewedAt: Math.max(0, Number(item?.viewedAt) || 0),
        seenUpdatedAt: dateMs(item?.seenUpdatedAt),
        seenVersion: versionNumber(item?.seenVersion)
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
      recentAt: recent?.viewedAt || 0,
      seenUpdatedAt: recent?.seenUpdatedAt || 0,
      seenVersion: recent?.seenVersion || 0
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

  function markViewed(library = {}, id = "", viewedAt = Date.now(), seenUpdatedAt = 0, seenVersion = 0) {
    const safe = normalizeLibrary(library);
    const key = clean(id);
    const stamp = dateMs(viewedAt);
    if (!key || !stamp) return safe;
    return normalizeLibrary({
      ...safe,
      recent: [{
        id: key,
        viewedAt: stamp,
        seenUpdatedAt: dateMs(seenUpdatedAt),
        seenVersion: versionNumber(seenVersion)
      }, ...safe.recent.filter(item => item.id !== key)]
    });
  }

  function workUpdateState(entry = {}, libraryInfo = {}, now = Date.now(), days = UPDATE_FRESH_DAYS) {
    const publication = publicationMeta(entry);
    const viewed = Number(libraryInfo.recentAt || 0) > 0;
    const seenUpdatedAt = dateMs(libraryInfo.seenUpdatedAt);
    const seenVersion = versionNumber(libraryInfo.seenVersion);
    const publishedFresh = isFresh(publication.publishedAt, now, days);
    const activityFresh = isFresh(publication.activityAt, now, days);

    let badge = "";
    let effectiveSeenVersion = seenVersion;

    if (publication.publishedVersion) {
      // v1 is also a valid baseline. Legacy continuity records did not store
      // a version, so only treat them as current when their timestamp proves
      // they saw this exact published version.
      if (!effectiveSeenVersion && viewed && seenUpdatedAt >= publication.versionPublishedAt) {
        effectiveSeenVersion = publication.publishedVersion;
      }

      if (!viewed && (publishedFresh || activityFresh)) {
        badge = "NEW";
      } else if (viewed && effectiveSeenVersion < publication.publishedVersion) {
        badge = "UPDATED";
      }
    } else {
      // Backwards-compatible timestamp behavior for older/community manifests
      // that have not adopted explicit version metadata yet.
      const changedAfterPublish = publication.updatedAt > publication.publishedAt;
      if (!viewed && (publishedFresh || activityFresh)) badge = "NEW";
      else if (activityFresh && changedAfterPublish && (!viewed || seenUpdatedAt < publication.updatedAt)) badge = "UPDATED";
    }

    return {
      ...publication,
      recentUpdate: activityFresh,
      badge,
      effectiveSeenVersion
    };
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
    dateMs,
    versionNumber,
    publicationMeta,
    isFresh,
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
    workUpdateState,
    capabilityLabels,
    resultLabel
  });
});
