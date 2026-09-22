/* Presentation-only bookshelf: reuse existing IndexedDB entries and restore buttons. */
(() => {
  'use strict';
  if (window.BAOBookshelfEnhance) return;
  const style = document.createElement('style');
  style.id = 'bao-bookshelf-style';
  style.textContent = `
    .story-library-story.bao-shelf-enhanced{background:linear-gradient(135deg,#1b2634,#171820 62%);border-color:#3c5262}
    .bao-shelf-heading{display:flex;align-items:flex-start;gap:14px;min-width:0;flex:1 1 auto}
    .bao-shelf-copy{flex:1 1 auto;min-width:0}
    .bao-shelf-cover{position:relative;display:flex;flex:0 0 78px;width:78px;aspect-ratio:3/4;align-items:center;justify-content:center;overflow:hidden;border:1px solid #667487;border-radius:10px;background:linear-gradient(145deg,#253d51,#252334);color:#f5e2b8;font-size:27px;font-family:serif;box-shadow:0 5px 16px #0006}
    .bao-shelf-cover img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
    .bao-shelf-progress{margin:12px 0 0;color:#e4d5b6;font-size:13px;line-height:1.5}
    .story-library-story .bao-shelf-continue{background:#25403e;color:#e4fff6;border:1px solid #5da898}
    @media(max-width:430px){.bao-shelf-heading{gap:10px}.bao-shelf-cover{flex-basis:64px;width:64px}.story-library-story>header{gap:10px}}
  `;
  document.head.append(style);
  const safePortrait = value => {
    const url = String(value || '').trim();
    return /^(?:https:\/\/|assets\/|\.\/assets\/)/i.test(url) ? url : '';
  };
  const findCharacter = story => (window.App?.characters || []).find(card =>
    String(card?.id || card?.meta?.id || '') === String(story.characterId || ''));
  const enhance = async shell => {
    if (!shell || shell.dataset.baoShelfRequested) return;
    const library = window.BAOStoryLibrary;
    if (!library?.listStories || !library?.listChapters) return;
    shell.dataset.baoShelfRequested = 'true';
    try {
      const stories = await library.listStories();
      const cards = [...shell.querySelectorAll('.story-library-story')];
      if (!shell.isConnected || stories.length !== cards.length) return;
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
            continueButton.textContent = '▶ 繼續此故事';
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
