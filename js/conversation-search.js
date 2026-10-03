(() => {
  'use strict';
  if (window.BAOConversationSearch || !window.BAOConversationSearchCore || !window.App || !window.Chat) return;

  const core = window.BAOConversationSearchCore;
  let dialog = null;
  let queryTimer = 0;
  let returnFocus = null;
  let storyIndex = null;
  let scopeLoading = false;

  const ensureStyles = () => {
    if (document.querySelector('link[href^="css/conversation-search.css"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/conversation-search.css?v=4';
    document.head.append(link);
  };

  const roleLabel = role => role === 'user' ? '玩家' : 'AI';
  const dateLabel = value => {
    const date = new Date(value || '');
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' });
  };
  const turnLabel = result => {
    const turn = result.index < 0 ? '故事開場' : `第 ${Math.max(1, result.turn)} 輪 · ${roleLabel(result.role)}`;
    const date = dateLabel(result.createdAt);
    const changes = (result.changes || []).map(value => value === 'memory' ? '記憶更新' : '狀態更新');
    return [result.chapterLabel, turn, date, ...changes].filter(Boolean).join(' · ');
  };

  const sameConnection = (left = {}, right = {}) => {
    const url = value => String(value || '').trim().replace(/\/+$/, '').toLowerCase();
    return String(left.protocol || '') === String(right.protocol || '')
      && url(left.baseUrl) === url(right.baseUrl)
      && String(left.model || '') === String(right.model || '');
  };

  const locateMessage = index => {
    const stream = document.getElementById('chat-stream');
    if (!stream) return null;
    const direct = stream.querySelector(`:scope > .message[data-message-index="${index}"]`);
    if (direct) return direct;
    const elements = [...stream.querySelectorAll(':scope > .message')];
    const offset = Math.max(0, elements.length - Chat.messages.length);
    return index < 0 ? elements[0] : elements[index + offset];
  };

  const highlight = index => {
    const target = locateMessage(index);
    if (!target) {
      window.BAOFeedback?.notify?.('找得到內容，但目前畫面尚未載入這一輪。', 'error');
      return false;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.remove('bao-search-target');
    requestAnimationFrame(() => target.classList.add('bao-search-target'));
    window.setTimeout(() => target.classList.remove('bao-search-target'), 2400);
    return true;
  };

  const jumpTo = async input => {
    const result = typeof input === 'number' ? { index: input } : input || {};
    const Library = window.BAOStoryLibrary;
    const refs = Library?.refs?.() || {};
    close();
    if (!result.chapterId || !refs.storyId || result.chapterId === refs.chapterId) return highlight(result.index);
    try {
      App.saveStory?.(false);
      await Library.flush?.();
      const save = await Library.reconstruct(refs.storyId, result.chapterId);
      if (!save) throw new Error('找不到這個章節的完整資料。');
      const previousApi = { ...(App.config?.api || {}) };
      const canReuseKey = sameConnection(previousApi, save.config?.api || {});
      if (!window.Storage?.restoreStory?.(save)) throw new Error('無法切換到這個章節。');
      App.config.api = { ...(App.config.api || {}), key: canReuseKey ? String(previousApi.key || '') : '' };
      if (window.GameState?.current) GameState.current.config = App.config;
      App.renderChatShell(false);
      App.showView('chat');
      App.saveStory?.(false);
      storyIndex = null;
      if (!canReuseKey) window.BAOFeedback?.notify?.('已切換章節；模型連線不同，繼續故事前請重新連線。', 'info');
      return highlight(result.index);
    } catch (error) {
      window.BAOFeedback?.notify?.(error?.message || '章節切換失敗。', 'error');
      return false;
    }
  };

  const activeRole = () => dialog?.querySelector('[data-search-role].active')?.dataset.searchRole || 'all';
  const activeDate = () => dialog?.querySelector('[data-search-date].active')?.dataset.searchDate || 'all';
  const activeChapter = () => dialog?.querySelector('[data-search-chapter]')?.value || 'all';
  const activeChange = () => dialog?.querySelector('[data-search-change].active')?.dataset.searchChange || 'all';

  const render = () => {
    if (!dialog) return;
    const query = dialog.querySelector('[data-search-input]').value;
    const status = dialog.querySelector('[data-search-status]');
    const list = dialog.querySelector('[data-search-results]');
    list.replaceChildren();
    if (scopeLoading) {
      status.textContent = '正在整理這本故事的章節…';
      return;
    }
    if (!query.trim() && activeChange() === 'all') {
      status.textContent = '輸入人物、地點、台詞或事件關鍵字。';
      const empty = document.createElement('p');
      empty.className = 'conversation-search-empty';
      empty.textContent = '搜尋目前這一本故事的完整對話，不會把內容傳送出去。';
      list.append(empty);
      return;
    }
    const refs = window.BAOStoryLibrary?.refs?.() || {};
    const source = storyIndex
      ? { records: storyIndex.records }
      : {
          messages: Chat.messages,
          greeting: App.activeCharacter?.greeting || App.activeCharacter?.content?.greeting || '',
          greetingCreatedAt: refs.chapterCreatedAt || '',
          chapterId: refs.chapterId || '',
          chapterLabel: refs.chapterLabel || ''
        };
    const found = core.search({
      ...source,
      query,
      role: activeRole(),
      date: activeDate(),
      chapter: activeChapter(),
      change: activeChange(),
      limit: 100
    });
    status.textContent = found.total
      ? `找到 ${found.total} 則${found.truncated ? '，先顯示前 100 則' : ''}`
      : '沒有找到符合內容';
    if (!found.results.length) {
      const empty = document.createElement('p');
      empty.className = 'conversation-search-empty';
      empty.textContent = '換一個關鍵字，或調整角色、日期與章節範圍再找找看。';
      list.append(empty);
      return;
    }
    found.results.forEach(result => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'conversation-search-result';
      const meta = document.createElement('span');
      meta.className = 'conversation-search-result-meta';
      meta.textContent = turnLabel(result);
      const snippet = document.createElement('span');
      snippet.className = 'conversation-search-result-snippet';
      snippet.textContent = result.snippet;
      button.append(meta, snippet);
      button.addEventListener('click', () => { void jumpTo(result); });
      list.append(button);
    });
  };

  const updateChapterOptions = (chapters = [], currentChapterId = '') => {
    const select = dialog?.querySelector('[data-search-chapter]');
    const field = dialog?.querySelector('[data-search-chapter-field]');
    if (!select || !field) return;
    select.replaceChildren(new Option('全部章節', 'all'));
    chapters.forEach(chapter => select.append(new Option(chapter.label || '章節', chapter.chapterId)));
    select.value = 'all';
    field.hidden = chapters.length < 2;
    field.dataset.currentChapter = currentChapterId;
  };

  const loadStoryIndex = async () => {
    const Library = window.BAOStoryLibrary;
    const refs = Library?.refs?.() || {};
    scopeLoading = true;
    render();
    try {
      if (!refs.storyId || !Library?.conversationSearchIndex) {
        storyIndex = null;
        updateChapterOptions([], refs.chapterId || '');
        return;
      }
      App.saveStory?.(false);
      await Library.flush?.();
      storyIndex = await Library.conversationSearchIndex(refs.storyId);
      updateChapterOptions(storyIndex.chapters, refs.chapterId || '');
    } catch (error) {
      console.warn('YoruBay conversation chapter index failed:', error);
      storyIndex = null;
      updateChapterOptions([], refs.chapterId || '');
    } finally {
      scopeLoading = false;
      render();
    }
  };

  const scheduleRender = () => {
    window.clearTimeout(queryTimer);
    queryTimer = window.setTimeout(render, 120);
  };

  const ensureDialog = () => {
    if (dialog?.isConnected) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'bao-conversation-search';
    dialog.className = 'conversation-search-dialog';
    dialog.setAttribute('aria-labelledby', 'conversation-search-title');
    dialog.innerHTML = `
      <section class="conversation-search-panel">
        <header>
          <div><span class="eyebrow">CURRENT STORY</span><h2 id="conversation-search-title">搜尋這個對話</h2></div>
          <button type="button" class="conversation-search-close" data-search-close aria-label="關閉搜尋">×</button>
        </header>
        <label class="conversation-search-field"><span>關鍵字</span><input type="search" data-search-input autocomplete="off" placeholder="例如：港口、雨夜、那封信"></label>
        <label class="conversation-search-field conversation-search-chapter-field" data-search-chapter-field hidden><span>章節</span><select data-search-chapter><option value="all">全部章節</option></select></label>
        <div class="conversation-search-filters" aria-label="搜尋範圍">
          <button type="button" class="active" data-search-role="all">全部</button>
          <button type="button" data-search-role="user">只看玩家</button>
          <button type="button" data-search-role="assistant">只看 AI</button>
        </div>
        <div class="conversation-search-filters conversation-search-date-filters" aria-label="搜尋日期">
          <button type="button" class="active" data-search-date="all">全部日期</button>
          <button type="button" data-search-date="today">今天</button>
          <button type="button" data-search-date="7d">近 7 天</button>
          <button type="button" data-search-date="30d">近 30 天</button>
        </div>
        <div class="conversation-search-filters conversation-search-date-filters" aria-label="變化類型">
          <button type="button" class="active" data-search-change="all">全部內容</button>
          <button type="button" data-search-change="memory">記憶更新</button>
          <button type="button" data-search-change="state">狀態更新</button>
        </div>
        <p class="conversation-search-status" data-search-status aria-live="polite"></p>
        <div class="conversation-search-results" data-search-results></div>
      </section>`;
    document.body.append(dialog);
    dialog.querySelector('[data-search-close]').addEventListener('click', close);
    dialog.querySelector('[data-search-input]').addEventListener('input', scheduleRender);
    dialog.querySelector('[data-search-chapter]').addEventListener('change', render);
    dialog.querySelectorAll('[data-search-role]').forEach(button => button.addEventListener('click', () => {
      dialog.querySelectorAll('[data-search-role]').forEach(item => item.classList.toggle('active', item === button));
      render();
    }));
    dialog.querySelectorAll('[data-search-date]').forEach(button => button.addEventListener('click', () => {
      dialog.querySelectorAll('[data-search-date]').forEach(item => item.classList.toggle('active', item === button));
      render();
    }));
    dialog.querySelectorAll('[data-search-change]').forEach(button => button.addEventListener('click', () => {
      dialog.querySelectorAll('[data-search-change]').forEach(item => item.classList.toggle('active', item === button));
      render();
    }));
    dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
    dialog.addEventListener('close', () => {
      if (returnFocus?.isConnected) returnFocus.focus();
      returnFocus = null;
    });
    return dialog;
  };

  async function open() {
    ensureStyles();
    const panel = ensureDialog();
    returnFocus = document.activeElement;
    if (!panel.open) panel.showModal();
    storyIndex = null;
    void loadStoryIndex();
    requestAnimationFrame(() => panel.querySelector('[data-search-input]')?.focus());
    return panel;
  }

  function close() {
    if (dialog?.open) dialog.close();
  }

  const mountButton = () => {
    const header = document.querySelector('#chat-view .chat-topline');
    if (!header || document.getElementById('bao-conversation-search-open')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'bao-conversation-search-open';
    button.className = 'secondary';
    button.textContent = '⌕ 搜尋對話';
    button.title = '搜尋目前故事的完整對話';
    button.addEventListener('click', open);
    const statusButton = document.getElementById('bao-reading-status-toggle');
    header.insertBefore(button, statusButton || null);
  };

  const originalRender = App.renderChatShell.bind(App);
  App.renderChatShell = function(...args) {
    const result = originalRender(...args);
    mountButton();
    return result;
  };

  ensureStyles();
  mountButton();
  window.BAOConversationSearch = Object.freeze({ open, close, render, jumpTo });
})();
