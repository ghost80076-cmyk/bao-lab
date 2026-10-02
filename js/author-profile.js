(() => {
  "use strict";

  const core = window.BAOAuthorProfileCore;
  const root = document.getElementById("author-profile-root");
  if (!core || !root) return;

  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[ch]));

  const query = new URLSearchParams(location.search);
  const authorId = String(query.get("id") || "").trim().toLowerCase();

  async function loadJson(url, fallback) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) return fallback;
      return await response.json();
    } catch {
      return fallback;
    }
  }

  async function loadAllWorks() {
    const official = await loadJson("data/characters.json", []);
    const manifest = await loadJson("data/character-catalog/community/manifest.json", { pages: [] });
    const pages = Array.isArray(manifest?.pages) ? manifest.pages : [];
    const community = [];
    for (const page of pages) {
      if (!page?.file) continue;
      const list = await loadJson(String(page.file), []);
      if (Array.isArray(list)) community.push(...list);
    }
    return [...(Array.isArray(official) ? official : []), ...community];
  }

  function renderMissing(message) {
    document.title = "找不到作者｜夜灣 YoruBay";
    root.innerHTML = `
      <section class="author-profile-state">
        <div class="eyebrow">AUTHOR</div>
        <h1>找不到這位作者</h1>
        <p>${esc(message || "這個作者頁目前不存在，可能尚未公開或連結已失效。")}</p>
        <a class="primary" href="./">返回夜灣</a>
      </section>`;
  }

  function workCard(item) {
    const title = item.title || item.name || "未命名作品";
    const image = item.avatar || "assets/bao-bun.svg";
    const description = item.description || "這個作品尚未提供簡介。";
    const version = core.publicationLabel(item);
    const rating = item.rating === "adult" ? "成熟內容" : "一般內容";
    return `
      <article class="author-work-card">
        <a class="author-work-cover" href="./?work=${encodeURIComponent(item.id)}" aria-label="查看作品 ${esc(title)}">
          <img src="${esc(image)}" alt="${esc(title)}">
        </a>
        <div class="author-work-copy">
          <div class="author-work-meta"><span>${esc(rating)}</span>${version ? `<span>${esc(version)}</span>` : ""}</div>
          <h2><a href="./?work=${encodeURIComponent(item.id)}">${esc(title)}</a></h2>
          <p>${esc(description)}</p>
          <div class="author-work-tags">${(item.tags || []).slice(0, 5).map(tag => `<span>#${esc(tag)}</span>`).join("")}</div>
        </div>
      </article>`;
  }

  async function render() {
    if (!core.validAuthorId(authorId)) {
      renderMissing("作者 ID 格式無效。");
      return;
    }

    root.innerHTML = '<section class="author-profile-state"><p>正在整理作者頁…</p></section>';

    const [registryRaw, works] = await Promise.all([
      loadJson("data/authors.json", { schema_version: 1, authors: [] }),
      loadAllWorks()
    ]);

    const registry = core.normalizeRegistry(registryRaw);
    const author = registry.authors.find(item => item.id === authorId);
    if (!author) {
      renderMissing("這位作者目前沒有公開作者頁。");
      return;
    }

    const authoredWorks = core.worksForAuthor(works, author.id);
    document.title = author.name + "｜作者｜夜灣 YoruBay";

    root.innerHTML = `
      <section class="author-profile-hero">
        <div class="author-profile-copy">
          <div class="eyebrow">AUTHOR</div>
          <h1>${esc(author.name)}</h1>
          <p class="author-profile-id">@${esc(author.id)}</p>
          <p class="author-profile-bio">${esc(author.bio || "這位作者尚未填寫公開介紹。")}</p>
          <div class="author-profile-summary">${authoredWorks.length} 部公開作品</div>
        </div>
        <aside class="author-support-card" ${author.support_links.length ? "" : "hidden"}>
          <div class="eyebrow">SUPPORT</div>
          <h2>支持作者</h2>
          <p>支持會直接前往作者提供的外部頁面，夜灣不代收、不轉金流、不抽成。</p>
          <div class="author-support-actions">
            ${author.support_links.map(link => `<a class="primary" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer external">${esc(link.label)}</a>`).join("")}
          </div>
        </aside>
      </section>

      <section class="author-works">
        <div class="author-works-head">
          <div>
            <div class="eyebrow">STORIES</div>
            <h2>${esc(author.name)} 的故事</h2>
          </div>
          <a class="text-button" href="./">回到探索</a>
        </div>
        <div class="author-work-grid">
          ${authoredWorks.length ? authoredWorks.map(workCard).join("") : '<p class="note">目前還沒有公開作品。</p>'}
        </div>
      </section>`;
  }

  render();
})();
