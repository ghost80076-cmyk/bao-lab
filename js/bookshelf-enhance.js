/* Presentation-only bookshelf: reuse existing IndexedDB entries and restore buttons. */
(() => {
  'use strict';
  if (window.BAOBookshelfEnhance) return;
  const style = document.createElement('style');
  style.id = 'bao-bookshelf-style';
  style.textContent = `
    .story-library-story.bao-shelf-enhanced{background:linear-gradient(135deg,rgba(48,34,48,.74),rgba(10,12,19,.92) 62%);border-color:rgba(223,180,110,.16)}
    .bao-shelf-heading{display:flex;align-items:flex-start;gap:14px;min-width:0;flex:1 1 auto}
    .bao-shelf-copy{flex:1 1 auto;min-width:0}
    .bao-shelf-cover{position:relative;display:flex;flex:0 0 78px;width:78px;aspect-ratio:2/3;align-items:center;justify-content:center;overflow:hidden;border:1px solid rgba(223,180,110,.25);border-radius:3px 8px 8px 3px;background:linear-gradient(145deg,#443345,#171522);color:#f3dfbc;font-size:27px;font-family:serif;box-shadow:5px 7px 0 rgba(0,0,0,.18),0 14px 28px #0006}
    .bao-shelf-cover img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
    .bao-shelf-progress{margin:12px 0 0;color:#dfc49e;font-size:12px;line-height:1.5;letter-spacing:.025em}
    .story-library-story .bao-shelf-continue{background:linear-gradient(135deg,#ead0a9,#c89b60);color:#2d2130;border:1px solid #dfbd87;font-weight:700}
    .story-library-story.bao-shelf-current{border-color:rgba(223,180,110,.32);box-shadow:0 20px 48px rgba(0,0,0,.2),inset 0 0 0 1px rgba(223,180,110,.06)}
    .bao-shelf-toolbar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:11px 12px;border:1px solid rgba(223,180,110,.11);border-radius:14px;background:rgba(8,10,16,.48)}
    .bao-shelf-search{display:flex;align-items:center;gap:9px;min-width:0}
    .bao-shelf-search span{color:#a69db0;font-size:18px}
    .bao-shelf-search input{width:100%;min-width:0;border:0;outline:0;background:transparent;color:#f1edf4;font:inherit}
    .bao-shelf-search input::placeholder{color:#767884}
    .bao-shelf-count{color:#9b969f;font-size:11px;white-space:nowrap}
    .bao-shelf-empty{display:none;padding:20px;border:1px dashed rgba(223,180,110,.15);border-radius:14px;text-align:center;color:#9e99a4}
    .bao-shelf-empty[data-visible="true"]{display:block}
    .bao-shelf-status{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
    .bao-shelf-status span{padding:3px 7px;border-radius:999px;background:rgba(141,108,255,.08);border:1px solid rgba(184,169,255,.1);color:#aaa1bc;font-size:9px;font-weight:700}
    @media(max-width:560px){
      .bao-shelf-toolbar{grid-template-columns:1fr;padding:10px}
      .bao-shelf-count{padding-left:27px}
      .story-library-story.bao-shelf-enhanced{padding:13px}
      .bao-shelf-heading{gap:10px}.bao-shelf-cover{flex-basis:64px;width:64px}.story-library-story>header{gap:10px}
      .story-library-story.bao-shelf-enhanced>header>.story-library-actions{display:grid;grid-template-columns:minmax(0,1fr) auto auto;width:100%}
      .story-library-story.bao-shelf-enhanced .bao-shelf-continue{width:100%;min-height:44px}
    }
  `;
  document.head.append(style);
  const safePortrait = value => {
    const url = String(value || '').trim();
    return /^(?:https:\/\/|assets\/|\.\/assets\/)/i.test(url) ? url : '';
  };
  const findCharacter = story => (window.App?.characters || []).find(card =>
    String(card?.id || card?.meta?.id || '') === String(story.characterId || ''));
  const installToolbar = (shell, stories, cards) => {
    const head = shell.querySelector(".story-library-head");
    if (!head || shell.querySelector(".bao-shelf-toolbar")) return;
    const toolbar = document.createElement("div");
    toolbar.className = "bao-shelf-toolbar";
    toolbar.innerHTML = `
      <label class="bao-shelf-search">
        <span aria-hidden="true">⌕</span>
        <input type="search" autocomplete="off" placeholder="搜尋故事或角色">
      </label>
      <span class="bao-shelf-count" aria-live="polite"></span>`;
    const empty = document.createElement("div");
    empty.className = "bao-shelf-empty";
    empty.innerHTML = "<b>沒有找到這本故事。</b><br><span>換個故事名稱或角色名再試一次。</span>";
    head.insertAdjacentElement("afterend", toolbar);
    toolbar.insertAdjacentElement("afterend", empty);
    const input = toolbar.querySelector("input");
    const count = toolbar.querySelector(".bao-shelf-count");
    const apply = () => {
      const query = input.value.trim().toLocaleLowerCase("zh-Hant");
      let visible = 0;
      cards.forEach((card, index) => {
        const story = stories[index] || {};
        const hay = [story.title, story.characterName, card.textContent].filter(Boolean).join(" ").toLocaleLowerCase("zh-Hant");
        const match = !query || hay.includes(query);
        card.hidden = !match;
        if (match) visible += 1;
      });
      count.textContent = query ? `找到 ${visible} 本` : `${stories.length} 本故事 · 保存在這台裝置`;
      empty.dataset.visible = String(Boolean(query && visible === 0));
    };
    input.addEventListener("input", apply);
    apply();
  };

  const enhance = async shell => {
    if (!shell || shell.dataset.baoShelfRequested) return;
    const library = window.BAOStoryLibrary;
    if (!library?.listStories || !library?.listChapters) return;
    shell.dataset.baoShelfRequested = 'true';
    try {
      const stories = await library.listStories();
      const cards = [...shell.querySelectorAll('.story-library-story')];
      if (!shell.isConnected || stories.length !== cards.length) return;
      installToolbar(shell, stories, cards);
      await Promise.all(stories.map(async (story, index) => {
        const card = cards[index];
        const chapterRows = [...card.querySelectorAll('.story-library-chapter')];
        const chapters = await library.listChapters(story.storyId);
        if (!card.isConnected || chapters.length !== chapterRows.length || card.classList.contains('bao-shelf-enhanced')) return;
        const header = card.querySelector(':scope > header');
        const heading = header?.firstElementChild;
        if (!heading) return;
        const copy = document.createElement('div');
        copy.className = 'bao-shelf-copy';
        while (heading.firstChild) copy.append(heading.firstChild);
        heading.classList.add('bao-shelf-heading');
        const cover = document.createElement('div');
        cover.className = 'bao-shelf-cover';
        const name = String(story.characterName || story.title || '書').trim();
        cover.textContent = [...name][0] || '書';
        const character = findCharacter(story);
        const portrait = safePortrait(character?.avatar || character?.meta?.avatar || character?.cover);
        if (portrait) {
          const image = document.createElement('img');
          image.src = portrait;
          image.alt = `${name}的故事封面`;
          image.loading = 'lazy';
          image.referrerPolicy = 'no-referrer';
          image.addEventListener('error', () => image.remove());
          cover.append(image);
        }
        heading.append(cover, copy);
        const status = document.createElement('div');
        status.className = 'bao-shelf-status';
        status.innerHTML = `<span>${chapters.length} 個章節</span><span>本機保存</span>`;
        copy.append(status);
        if (card.querySelector('.story-library-active')) card.classList.add('bao-shelf-current');
        const active = chapters.find(item => item.chapterId === story.activeChapterId) || chapters.at(-1);
        if (active) {
          const progress = document.createElement('p');
          progress.className = 'bao-shelf-progress';
          progress.textContent = `上次閱讀：${active.label || '未命名章節'}`;
          header.after(progress);
          const chapterIndex = chapters.indexOf(active);
          const loadButton = chapterRows[chapterIndex]?.querySelector('[data-library-action="load"]');
          const actions = header.querySelector('.story-library-actions');
          if (loadButton && actions) {
            const continueButton = document.createElement('button');
            continueButton.type = 'button';
            continueButton.className = 'bao-shelf-continue';
            continueButton.textContent = '繼續閱讀 →';
            continueButton.addEventListener('click', () => loadButton.click());
            actions.prepend(continueButton);
          }
        }
        card.classList.add('bao-shelf-enhanced');
      }));
    } catch (error) {
      shell.dataset.baoShelfRequested = '';
      console.warn('BAO/LAB bookshelf presentation unavailable:', error);
    }
  };
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) for (const node of mutation.addedNodes) {
      if (node.nodeType !== 1) continue;
      const shell = node.classList?.contains('story-library-shell') ? node : node.querySelector?.('.story-library-shell');
      if (shell) void enhance(shell);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const existing = document.querySelector('.story-library-shell');
  if (existing) void enhance(existing);
  window.BAOBookshelfEnhance = { enhance };
})();
