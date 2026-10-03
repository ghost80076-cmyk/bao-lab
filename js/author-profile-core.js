(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BAOAuthorProfileCore = api;
})(typeof window !== "undefined" ? window : null, function() {
  "use strict";

  const clean = value => String(value ?? "").trim();

  function validAuthorId(value) {
    return /^[a-z0-9][a-z0-9_-]{1,63}$/.test(clean(value).toLowerCase());
  }

  function safeSupportLink(value) {
    if (!value || typeof value !== "object") return null;
    const label = clean(value.label || "支持作者").slice(0, 40) || "支持作者";
    const raw = clean(value.url).slice(0, 600);
    if (!raw) return null;
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
      return { label, url: parsed.href };
    } catch {
      return null;
    }
  }

  function normalizeAuthor(value = {}) {
    const id = clean(value.id).toLowerCase();
    if (!validAuthorId(id)) return null;
    const supportLinks = (Array.isArray(value.support_links) ? value.support_links : [])
      .map(safeSupportLink)
      .filter(Boolean)
      .slice(0, 5);
    return {
      id,
      name: clean(value.name || id).slice(0, 80) || id,
      bio: clean(value.bio).slice(0, 1200),
      support_links: supportLinks,
      created_at: clean(value.created_at),
      updated_at: clean(value.updated_at)
    };
  }

  function normalizeRegistry(value = {}) {
    const seen = new Set();
    const authors = (Array.isArray(value.authors) ? value.authors : [])
      .map(normalizeAuthor)
      .filter(author => {
        if (!author || seen.has(author.id)) return false;
        seen.add(author.id);
        return true;
      });
    return { schema_version: 1, authors };
  }

  function worksForAuthor(list = [], authorId = "") {
    const key = clean(authorId).toLowerCase();
    if (!validAuthorId(key)) return [];
    return (Array.isArray(list) ? list : [])
      .filter(item => clean(item?.author_id).toLowerCase() === key)
      .sort((a, b) => {
        const left = Date.parse(a?.version_published_at || a?.updated_at || a?.published_at || "") || 0;
        const right = Date.parse(b?.version_published_at || b?.updated_at || b?.published_at || "") || 0;
        return right - left;
      });
  }

  function publicationLabel(item = {}) {
    const version = Math.max(0, Number(item.published_version || 0) || 0);
    const bits = [];
    if (version) bits.push("v" + version);
    const stamp = Date.parse(item.version_published_at || item.updated_at || item.published_at || "");
    if (stamp) {
      bits.push(new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "numeric", day: "numeric" })
        .format(new Date(stamp)));
    }
    return bits.join(" · ");
  }

  return Object.freeze({
    clean,
    validAuthorId,
    safeSupportLink,
    normalizeAuthor,
    normalizeRegistry,
    worksForAuthor,
    publicationLabel
  });
});
