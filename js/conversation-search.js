(() => {
  'use strict';
  if (window.BAOConversationSearch || !window.BAOConversationSearchCore || !window.App || !window.Chat) return;

  const core = window.BAOConversationSearchCore;
  let dialog = null;
  let queryTimer = 0;
  let returnFocus = null;

  const ensureStyles = () => {
    if (document.querySelector('link[href="css/conversation-search.css"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/conversation-search.css';
    document.head.append(link);
  };

  const roleLabel = role => role === 'user' ? '玩家' : 'AI';
  const turnLabel = result => result.index < 0 ? '故事開場' : `第 ${Math.max(1, result.turn)} 輪 · ${roleLabel(result.role)}`;

  const locateMessage = index => {
    const stream = document.getElementById('chat-stream');
    if (!stream) return null;
    const direct = stream.querySelector(`:scope > .message[data-message-index="${index}"]`);
    if (direct) return direct;
    const elements = [...stream.querySelectorAll(':scope > .message')];
    const offset = Math.max(0, elements.length - Chat.messages.length);
    return index < 0 ? elements[0] : elements[index + offset];
  };

  const jumpTo = index => {
    const target = locateMessage(index);
    close();
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

  const activeRole = () => dialog?.querySelector('[data-search-role].active')?.dataset.searchRole || 'all';

  const render = () => {
    if (!dialog) return;
    const query = dialog.querySelector('[data-search-input]').value;
    const status = dialog.querySelector('[data-search-status]');
    const list = dialog.querySelector('[data-search-results]');
    list.replaceChildren();
    if (!query.trim()) {
      status.textContent = '輸入人物、地點、台詞或事件關鍵字。';
      const empty = document.createElement('p');
      empty.className = 'conversation-search-empty';
      empty.textContent = '搜尋目前這一本故事的完整對話，不會把內容傳送出去。';
      list.append(empty);
      return;
    }
    const found = core.search({
      messages: Chat.messages,
      greeting: App.activeCharacter?.greeting || App.activeCharacter?.content?.greeting || '',
      query,
      role: activeRole(),
      limit: 100
    });
    status.textContent = found.total
      ? `找到 ${found.total} 則${found.truncated ? '，先顯示前 100 則' : ''}`
      : '沒有找到符合內容';
    if (!found.results.length) {
      const empty = document.createElement('p');
      empty.className = 'conversation-search-empty';
      empty.textContent = '換一個關鍵字，或切換「全部／玩家／AI」再找找看。';
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
      button.addEventListener('click', () => jumpTo(result.index));
      list.append(button);
    });
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
        <div class="conversation-search-filters" aria-label="搜尋範圍">
          <button type="button" class="active" data-search-role="all">全部</button>
          <button type="button" data-search-role="user">只看玩家</button>
          <button type="button" data-search-role="assistant">只看 AI</button>
        </div>
        <p class="conversation-search-status" data-search-status aria-live="polite"></p>
        <div class="conversation-search-results" data-search-results></div>
      </section>`;
    document.body.append(dialog);
    dialog.querySelector('[data-search-close]').addEventListener('click', close);
    dialog.querySelector('[data-search-input]').addEventListener('input', scheduleRender);
    dialog.querySelectorAll('[data-search-role]').forEach(button => button.addEventListener('click', () => {
      dialog.querySelectorAll('[data-search-role]').forEach(item => item.classList.toggle('active', item === button));
      render();
    }));
    dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
    dialog.addEventListener('close', () => {
      if (returnFocus?.isConnected) returnFocus.focus();
      returnFocus = null;
    });
    return dialog;
  };

  function open() {
    ensureStyles();
    const panel = ensureDialog();
    returnFocus = document.activeElement;
    if (!panel.open) panel.showModal();
    render();
    requestAnimationFrame(() => panel.querySelector('[data-search-input]')?.focus());
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
