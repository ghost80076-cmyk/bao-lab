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

  const records = value => Array.isArray(value) && value.every(item => item && typeof item === "object" && !Array.isArray(item));

  const workRecords = value => records(value) && value.every(item => typeof item.id === "string" && item.id.trim());

  async function loadJson(url, validate) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("Public metadata unavailable");
    const value = await response.json();
    if (!validate(value)) throw new Error("Invalid public metadata");
    return value;
  }

  async function loadAllWorks() {
    const [official, manifest] = await Promise.allSettled([
      loadJson("data/characters.json", workRecords),
      loadJson("data/character-catalog/community/manifest.json", value => value && Array.isArray(value.pages))
    ]);
    const works = official.status === "fulfilled" ? [...official.value] : [];
    let complete = official.status === "fulfilled" && manifest.status === "fulfilled";
    const pages = manifest.status === "fulfilled" ? manifest.value.pages : [];
    const results = await Promise.allSettled(pages.map(async page => {
      if (typeof page?.file !== "string" || !page.file.trim()) throw new Error("Missing catalog page");
      return loadJson(page.file, workRecords);
    }));
    for (const result of results) {
      if (result.status === "fulfilled") works.push(...result.value);
      else complete = false;
    }
    return { works, complete };
  }

  function retryNotice() {
    return `<section class="author-profile-state" role="status"><p>部分作品暫時無法載入，清單可能不完整。</p><button type="button" class="primary" data-author-retry>重新載入作品</button></section>`;
  }

  function renderUnavailable() {
    document.title = "作者資料暫時無法載入｜夜灣 YoruBay";
    root.innerHTML = `<section class="author-profile-state" role="status"><h1>作者資料暫時無法載入</h1><p>請稍後重試，或先返回夜灣探索作品。</p><div class="author-state-actions"><button type="button" class="primary" data-author-retry>重新載入</button><a class="secondary" href="./">返回夜灣</a></div></section>`;
  }

  function renderMissing(message) {
    document.title = "找不到作者｜夜灣 YoruBay";
    root.innerHTML = `
      <section class="author-profile-state">
        <div class="eyebrow">AUTHOR</div>
        <h1>找不到這位作者</h1>
        <p>${esc(message || "這個作者頁目前不存在，可能尚未公開或連結已失效。")}</p>
        <div class="author-state-actions">
          <a class="primary" href="author">查看所有作者</a>
          <a class="secondary" href="./">返回夜灣</a>
        </div>
      </section>`;
  }

  function workCard(item) {
    const title = item.title || item.name || "未命名作品";
    const image = item.avatar || "assets/bao-bun.svg";
    const description = item.description || "這個作品尚未提供簡介。";
    const version = core.publicationLabel(item);
    const rating = (window.BAOContentPreferences?.isDiscoveryAdult?.(item) ?? (item.rating === "adult")) ? "成熟內容" : "一般展示";
    return `
      <article class="author-work-card">
        <a class="author-work-cover" href="./?work=${encodeURIComponent(item.id)}" aria-label="查看作品 ${esc(title)}">
          <img src="${esc(image)}" alt="${esc(title)}">
        </a>
        <div class="author-work-copy">
          <div class="author-work-meta"><span>${esc(rating)}</span>${version ? `<span>${esc(version)}</span>` : ""}</div>
          <h2><a href="./?work=${encodeURIComponent(item.id)}">${esc(title)}</a></h2>
          <p>${esc(description)}</p>
          <div class="author-work-tags">${(Array.isArray(item.tags) ? item.tags : []).slice(0, 5).map(tag => `<span>#${esc(tag)}</span>`).join("")}</div>
        </div>
      </article>`;
  }

  function authorCard(author, complete) {
    const bio = author.bio || "這位作者尚未填寫公開介紹。";
    return `
      <article class="author-directory-card">
        <div class="author-directory-card-head">
          <div>
            <div class="eyebrow">AUTHOR</div>
            <h2><a href="author?id=${encodeURIComponent(author.id)}">${esc(author.name)}</a></h2>
            <p class="author-profile-id">@${esc(author.id)}</p>
          </div>
          <span class="author-directory-count">${complete ? "" : "已載入 "}${author.work_count} 部作品</span>
        </div>
        <p class="author-directory-bio">${esc(bio)}</p>
        <div class="author-directory-actions">
          <a class="primary" href="author?id=${encodeURIComponent(author.id)}">查看作者與作品 →</a>
          ${author.support_links.length ? '<span class="author-directory-support">有作者支持連結</span>' : ""}
        </div>
      </article>`;
  }

  function renderDirectory(registry, works, complete) {
    const visibleWorks = (Array.isArray(works) ? works : [])
      .filter(item => window.BAOContentPreferences?.canExpose?.(item) !== false);
    const authors = core.directoryEntries(registry, visibleWorks);
    document.title = "作者｜夜灣 YoruBay";

    root.innerHTML = `
      ${complete ? "" : retryNotice()}
      <section class="author-directory-hero">
        <div class="eyebrow">CREATORS</div>
        <h1>夜灣作者</h1>
        <p>從作品找到創作者，也能從創作者回到他公開的故事。作者頁與支持連結都是公開資訊；夜灣不代收、不轉金流、不抽成。</p>
        <div class="author-profile-summary">${authors.length} 位公開作者</div>
      </section>

      <section class="author-directory">
        <div class="author-works-head">
          <div>
            <div class="eyebrow">DIRECTORY</div>
            <h2>所有作者</h2>
          </div>
          <a class="text-button" href="./">探索作品</a>
        </div>
        <div class="author-directory-grid">
          ${authors.length ? authors.map(author => authorCard(author, complete)).join("") : '<p class="note">目前還沒有公開作者。</p>'}
        </div>
      </section>`;
  }

  async function render() {
    if (authorId && !core.validAuthorId(authorId)) {
      renderMissing("作者 ID 格式無效。");
      return;
    }

    root.innerHTML = '<section class="author-profile-state"><p>正在整理作者頁…</p></section>';

    const [registryResult, catalogResult] = await Promise.allSettled([
      loadJson("data/authors.json", value => value && records(value.authors) && value.authors.every(author => core.validAuthorId(author.id))),
      loadAllWorks()
    ]);
    if (registryResult.status !== "fulfilled") { renderUnavailable(); return; }
    const registry = core.normalizeRegistry(registryResult.value);
    const { works, complete } = catalogResult.status === "fulfilled" ? catalogResult.value : { works: [], complete: false };

    if (!authorId) {
      renderDirectory(registry, works, complete);
      return;
    }

    const author = registry.authors.find(item => item.id === authorId);
    if (!author) {
      renderMissing("這位作者目前沒有公開作者頁。");
      return;
    }

    const authoredWorks = core.worksForAuthor(works, author.id)
      .filter(item => window.BAOContentPreferences?.canExpose?.(item) !== false);
    document.title = author.name + "｜作者｜夜灣 YoruBay";

    root.innerHTML = `
      ${complete ? "" : retryNotice()}
      <section class="author-profile-hero">
        <div class="author-profile-copy">
          <div class="eyebrow">AUTHOR</div>
          <h1>${esc(author.name)}</h1>
          <p class="author-profile-id">@${esc(author.id)}</p>
          <p class="author-profile-bio">${esc(author.bio || "這位作者尚未填寫公開介紹。")}</p>
          <div class="author-profile-summary">${complete ? "" : "已載入 "}${authoredWorks.length} 部公開作品</div>
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
          <a class="text-button" href="author">所有作者</a>
        </div>
        <div class="author-work-grid">
          ${authoredWorks.length ? authoredWorks.map(workCard).join("") : `<p class="note">${complete ? '目前還沒有公開作品。' : '作品清單尚未完整載入，請稍後重試。'}</p>`}
        </div>
      </section>`;
  }

  root.addEventListener("click", event => {
    if (event.target.closest?.("[data-author-retry]")) render();
  });
  render();
})();
