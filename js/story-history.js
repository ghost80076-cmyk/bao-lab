(() => {
  'use strict';
  if (window.BAOStoryHistory || !window.BAOStoryHistoryCore) return;
  const core = window.BAOStoryHistoryCore;
  const open = () => {
    if (!GameState.current) return;
    document.querySelector('.story-history-backdrop')?.remove();
    const state = GameState.current;
    const previous = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'story-history-backdrop';
    wrap.innerHTML = `<section class="story-history-panel" role="dialog" aria-modal="true" aria-labelledby="story-history-title">
      <header><h2 id="story-history-title">故事歷程</h2><button type="button" data-close aria-label="關閉故事歷程">×</button></header>
      <p>本條故事線的事件，留下你想收藏的片刻。</p>
      <div class="story-history-tools"><input type="search" aria-label="搜尋故事歷程" placeholder="搜尋事件、時間或地點"><label><input type="checkbox"> 只看收藏</label></div>
      <p data-count aria-live="polite"></p><div class="story-history-list"></div>
      <details><summary>記錄方式</summary><p>沿用世界狀態的事件紀錄及作者明確啟用的公開事件模組，不新增 AI 呼叫。未啟用事件追蹤的作品不會自動生成回憶。舊紀錄只保留當時已有的事件；不補猜時間、地點或秘密。最多保留 500 則，收藏優先保留；全部收藏後暫停新增。分支繼承分岔點以前的紀錄，之後各自保存。</p></details>
    </section>`;
    if (!document.querySelector('link[href^="css/story-history.css"]')) {
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'css/story-history.css?v=1'; document.head.append(link);
    }
    const close = () => { wrap.remove(); if (previous?.isConnected) previous.focus(); };
    const list = wrap.querySelector('.story-history-list');
    const search = wrap.querySelector('[type=search]');
    const filter = wrap.querySelector('[type=checkbox]');
    const render = () => {
      if (GameState.current !== state) { close(); return; }
      const entries = core.read(state).entries;
      const query = search.value.trim().toLocaleLowerCase();
      const shown = entries.filter(item => (!filter.checked || item.starred) && [item.text, item.time, item.location].join(' ').toLocaleLowerCase().includes(query));
      wrap.querySelector('[data-count]').textContent = `${shown.length} / ${entries.length} 則 · ${entries.filter(item => item.starred).length} 則收藏`;
      list.replaceChildren();
      if (!shown.length) { const p = document.createElement('p'); p.textContent = entries.length ? '沒有符合條件的事件。' : '故事尚未留下事件紀錄。'; list.append(p); }
      shown.forEach(item => {
        const card = document.createElement('article');
        const body = document.createElement('div');
        const meta = document.createElement('small'); meta.textContent = [item.time, item.location].filter(Boolean).join(' · ') || (item.source === 'module' ? '作品公開紀錄' : '既有事件');
        const content = document.createElement('p'); content.textContent = item.text;
        const button = document.createElement('button'); button.type = 'button'; button.textContent = item.starred ? '★ 已收藏' : '☆ 收藏'; button.setAttribute('aria-pressed', String(item.starred));
        button.addEventListener('click', () => {
          if (GameState.current !== state) { close(); return; }
          core.toggle(state, item.id); App.saveStory?.(false); render();
          list.querySelector(`[data-event-id="${item.id}"] button`)?.focus();
        });
        card.dataset.eventId = item.id; body.append(meta, content); card.append(body, button); list.append(card);
      });
    };
    wrap.querySelector('[data-close]').addEventListener('click', close);
    wrap.addEventListener('click', event => { if (event.target === wrap) close(); });
    wrap.addEventListener('keydown', event => {
      if (event.key === 'Escape') { close(); return; }
      if (event.key !== 'Tab') return;
      const nodes = [...wrap.querySelectorAll('button,input,summary')].filter(node => node.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    search.addEventListener('input', render); filter.addEventListener('change', render);
    document.body.append(wrap); render(); search.focus();
  };
  window.BAOStoryHistory = { open };
})();
