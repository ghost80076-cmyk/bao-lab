(() => {
  if (!window.App || !window.Chat || !window.BAOChatMarkup) return;
  const KEY = 'bao-lab:scene-html-preferences';
  const modes = new Set(['native', 'efficient', 'free']);
  const statuses = new Set(['native', 'author', 'hidden']);
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
  const saved = read();
  const prefs = { mode: modes.has(saved.mode) ? saved.mode : 'efficient', status: statuses.has(saved.status) ? saved.status : 'native' };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (_) {} };
  const sceneTemplates = {
    forum: { label: '匿名論壇', background: '#182433', accent: '#b9d8ff' },
    realistic: { label: '現實敘事', background: '#29251f', accent: '#f0d5a9' },
    dramatic: { label: '劇情轉折', background: '#1b1b24', accent: '#e5d9f4' }
  };
  const statusBlock = text => String(text || '').match(/\[STATUS\]([\s\S]*?)\[\/STATUS\]/i)?.[1]?.trim() || '';
  const withoutMetadata = text => String(text || '')
    .replace(/\[STATUS\][\s\S]*?\[\/STATUS\]/gi, '')
    .replace(/\[SCENE:[a-z-]+\]/gi, '')
    .replace(/\[\/?(?:NARRATION|CHOICE)\]/gi, '').trim();
  const plain = text => {
    const doc = new DOMParser().parseFromString(String(text || ''), 'text/html');
    doc.querySelectorAll('script,style,iframe,object,embed,template,svg,math').forEach(el => el.remove());
    return (doc.body.textContent || '').trim();
  };
  const render = (raw, greeting = false) => {
    const text = String(raw || '');
    const body = withoutMetadata(text);
    if (prefs.mode === 'native') return App.formatMessage(plain(body));
    if (prefs.mode === 'free') return window.BAOChatMarkup.sanitize(body);
    const scene = text.match(/\[SCENE:([a-z-]+)\]/i)?.[1]?.toLowerCase();
    const narration = text.match(/\[NARRATION\]([\s\S]*?)\[\/NARRATION\]/i)?.[1];
    if (scene && sceneTemplates[scene] && narration !== undefined) {
      const theme = sceneTemplates[scene];
      return `<section class="bao-scene-card" style="background:${theme.background};color:${theme.accent};padding:18px;border-radius:12px;line-height:1.8"><small>${theme.label}</small><div style="margin-top:10px;white-space:pre-wrap">${App.escapeHTML(narration.trim())}</div></section>`;
    }
    return greeting ? window.BAOChatMarkup.sanitize(body) : App.formatMessage(plain(body));
  };
  const refresh = () => {
    const stream = document.getElementById('chat-stream');
    if (!stream || !App.activeCharacter) return;
    const messages = Chat.messages.length ? Chat.messages : [{ role: 'assistant', content: App.activeCharacter.greeting || '', greeting: true }];
    const bubbles = [...stream.querySelectorAll('.message .bubble')];
    bubbles.forEach((bubble, index) => {
      const msg = messages[index];
      if (!msg || msg.role !== 'assistant') return; // Ignore pending streaming and error bubbles.
      const html = render(msg.content, Boolean(msg.greeting));
      if (bubble.innerHTML !== html) bubble.innerHTML = html;
      bubble.classList.toggle('authored-rich-message', prefs.mode !== 'native');
    });
    const native = document.getElementById('bao-scene-native-status');
    const author = document.getElementById('bao-scene-author-status');
    if (native) {
      native.hidden = prefs.status !== 'native';
      if (prefs.status === 'native') {
        const s = window.GameState?.current;
        const label = s ? `時間：${s.time || '未知'}　地點：${s.location || '未知'}` : '尚無世界狀態';
        if (native.textContent !== label) native.textContent = label;
      }
    }
    if (author) {
      const last = [...messages].reverse().find(m => m.role === 'assistant' && statusBlock(m.content));
      const content = last ? statusBlock(last.content) : '';
      author.hidden = prefs.status !== 'author';
      const label = content ? `作者狀態（僅顯示，未同步世界狀態）\n${plain(content)}` : '此故事尚無可辨識的 [STATUS] 作者狀態資料。';
      if (author.textContent !== label) author.textContent = label;
    }
  };
  const originalPrompt = App.buildSystemPrompt.bind(App);
  App.buildSystemPrompt = function(...args) {
    const base = originalPrompt(...args);
    const instructions = {
      native: '【玩家排版偏好】只輸出純文字敘事及對話。不要產生 HTML、CSS、JavaScript、場景標籤或視覺狀態欄。角色卡原有的 HTML 排版要求若與此衝突，以本項玩家選擇為準。',
      efficient: '【玩家排版偏好】優先輸出純文字敘事。需要場景排版時，只能使用 [SCENE:forum]、[SCENE:realistic] 或 [SCENE:dramatic]，並將正文放在 [NARRATION]...[/NARRATION] 中；場景未變更時可以只輸出一般文字。不要重複輸出 HTML、CSS 或 JavaScript。',
      free: '【玩家排版偏好】允許依劇情產生 HTML 視覺排版，但不得輸出 JavaScript、事件處理器、iframe 或可執行程式碼；不需要華麗排版時直接輸出一般文字。'
    };
    const statusInstruction = prefs.status === 'author'
      ? '若角色卡定義作者狀態，請將狀態資料放在 [STATUS]...[/STATUS]；這是展示資料，不會自動寫入世界狀態。'
      : '使用平台原生狀態或隱藏狀態欄；不要生成 [STATUS] 區塊或 HTML 視覺狀態欄。';
    return `${base}\n\n${instructions[prefs.mode]}\n${statusInstruction}`;
  };
  const mount = () => {
    const aside = document.querySelector('#chat-view aside');
    if (!aside || document.getElementById('bao-scene-controls')) return;
    const panel = document.createElement('section');
    panel.id = 'bao-scene-controls';
    panel.style.cssText = 'padding:12px;border:1px solid #5555;border-radius:10px;margin:12px 0;display:grid;gap:8px';
    const heading = document.createElement('strong'); heading.textContent = '場景 HTML 與狀態欄'; panel.append(heading);
    const addSelect = (label, values, value, onChange) => {
      const wrap = document.createElement('label'); wrap.style.cssText = 'display:grid;gap:4px;font-size:13px';
      wrap.append(document.createTextNode(label));
      const select = document.createElement('select');
      values.forEach(([id, name]) => { const option = document.createElement('option'); option.value = id; option.textContent = name; select.append(option); });
      select.value = value;
      select.addEventListener('change', () => { onChange(select.value); save(); refresh(); });
      wrap.append(select); panel.append(wrap);
    };
    addSelect('閱讀模式', [['native','原生閱讀（不生成 HTML）'],['efficient','節省 Token 的場景排版'],['free','自由安全 HTML']], prefs.mode, value => { prefs.mode = value; });
    addSelect('狀態欄', [['native','BAO/LAB 原生狀態'],['author','作者狀態欄'],['hidden','隱藏狀態欄']], prefs.status, value => { prefs.status = value; });
    const note = document.createElement('small'); note.textContent = '設定從下一輪 API 請求生效；既有回覆可切換閱讀。作者狀態目前僅展示，不會修改世界狀態。'; panel.append(note);
    const native = document.createElement('div'); native.id = 'bao-scene-native-status'; native.setAttribute('role','status'); panel.append(native);
    const author = document.createElement('div'); author.id = 'bao-scene-author-status'; author.style.whiteSpace = 'pre-wrap'; author.setAttribute('role','status'); panel.append(author);
    aside.append(panel); refresh();
  };
  const originalShell = App.renderChatShell.bind(App);
  App.renderChatShell = function(...args) { const result = originalShell(...args); mount(); refresh(); return result; };
  window.BAOSceneHTML = { prefs, render, refresh, sceneTemplates };
  mount();
  const stream = document.getElementById('chat-stream');
  if (stream) {
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => { queued = false; refresh(); });
    }).observe(stream, { childList: true });
  }
})();