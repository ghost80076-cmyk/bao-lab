(() => {
  if (!window.App || !window.Chat || !window.BAOChatMarkup) return;
  const KEY = 'bao-lab:scene-html-preferences';
  const modes = new Set(['native', 'efficient', 'free']);
  const statuses = new Set(['native', 'author', 'hidden']);
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
  const saved = read();
  const prefs = { mode: modes.has(saved.mode) ? saved.mode : 'efficient', status: statuses.has(saved.status) ? saved.status : 'native' };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (_) {} };
  const strip = text => String(text || '').replace(/<[^>]*>/g, '').replace(/\[\/?(?:SCENE|NARRATION|STATUS|CHOICE)(?::[^\]]+)?\]/gi, '').trim();
  const sceneTemplates = {
    forum: { label: '匿名論壇', background: '#182433', accent: '#b9d8ff' },
    realistic: { label: '現實敘事', background: '#29251f', accent: '#f0d5a9' },
    dramatic: { label: '劇情轉折', background: '#1b1b24', accent: '#e5d9f4' }
  };
  const scenePattern = /\[SCENE:([a-z-]+)\]/i;
  const render = (raw, greeting = false) => {
    const text = String(raw || '');
    if (prefs.mode === 'native') return App.formatMessage(strip(text));
    if (prefs.mode === 'free') return window.BAOChatMarkup.sanitize(text);
    const scene = text.match(scenePattern)?.[1]?.toLowerCase();
    const narration = text.match(/\[NARRATION\]([\s\S]*?)\[\/NARRATION\]/i)?.[1];
    if (scene && sceneTemplates[scene] && narration !== undefined) {
      const theme = sceneTemplates[scene];
      return `<section class="bao-scene-card" style="background:${theme.background};color:${theme.accent};padding:18px;border-radius:12px;line-height:1.8"><small>${theme.label}</small><div style="margin-top:10px;white-space:pre-wrap">${App.escapeHTML(narration.trim())}</div></section>`;
    }
    // Existing authored greetings remain available without asking the model to regenerate their HTML.
    return greeting ? window.BAOChatMarkup.sanitize(text) : App.formatMessage(strip(text));
  };
  const refresh = () => {
    const stream = document.getElementById('chat-stream');
    if (!stream || !App.activeCharacter) return;
    const messages = Chat.messages.length ? Chat.messages : [{ role: 'assistant', content: App.activeCharacter.greeting || '', greeting: true }];
    stream.querySelectorAll('.message .bubble').forEach((bubble, index) => {
      const msg = messages[index];
      if (!msg || (msg.role !== 'assistant' && !msg.greeting)) return;
      bubble.innerHTML = render(msg.content, Boolean(msg.greeting));
      bubble.classList.toggle('authored-rich-message', prefs.mode !== 'native');
    });
    const native = document.getElementById('bao-scene-native-status');
    if (native) {
      native.hidden = prefs.status !== 'native';
      if (prefs.status === 'native') {
        const s = window.GameState?.current;
        native.textContent = s ? `時間：${s.time || '未知'}　地點：${s.location || '未知'}` : '尚無世界狀態';
      }
    }
    stream.querySelectorAll('.bao-scene-author-status').forEach(el => { el.hidden = prefs.status !== 'author'; });
  };
  const originalPrompt = App.buildSystemPrompt.bind(App);
  App.buildSystemPrompt = function(...args) {
    const base = originalPrompt(...args);
    const instructions = {
      native: '【玩家排版偏好】只輸出純文字敘事及對話。不要產生 HTML、CSS、JavaScript、場景標籤或視覺狀態欄。角色卡原有的 HTML 排版要求若與此衝突，以本項玩家選擇為準。',
      efficient: '【玩家排版偏好】優先輸出純文字敘事。需要場景排版時，只能使用 [SCENE:forum]、[SCENE:realistic] 或 [SCENE:dramatic]，並將正文放在 [NARRATION]...[/NARRATION] 中；場景未變更時可以只輸出一般文字。不要重複輸出 HTML、CSS 或 JavaScript。',
      free: '【玩家排版偏好】允許依劇情產生 HTML 視覺排版，但不得輸出 JavaScript、事件處理器、iframe 或可執行程式碼；不需要華麗排版時直接輸出一般文字。'
    };
    return `${base}\n\n${instructions[prefs.mode]}\n${prefs.status === 'native' ? '使用平台原生狀態欄，不要重複生成 HTML 狀態欄。' : prefs.status === 'hidden' ? '玩家已隱藏狀態欄，不要生成視覺狀態欄。' : '只有角色卡有作者狀態欄時才輸出相關狀態內容。'}`;
  };
  const originalShell = App.renderChatShell.bind(App);
  App.renderChatShell = function(...args) { const result = originalShell(...args); refresh(); mount(); return result; };
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
    const note = document.createElement('small'); note.textContent = '設定從下一輪 API 請求生效；既有回覆可切換閱讀。場景模板在本機渲染，不需重複生成 HTML。'; panel.append(note);
    const status = document.createElement('div'); status.id = 'bao-scene-native-status'; status.setAttribute('role','status'); panel.append(status);
    aside.append(panel); refresh();
  };
  window.BAOSceneHTML = { prefs, render, refresh, sceneTemplates };
  mount();
  // Repaint completed replies; do not overwrite an in-progress streaming bubble.
  const stream = document.getElementById('chat-stream');
  if (stream) {
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => { queued = false; if (!stream.querySelector('.message.assistant .bubble')) return; refresh(); });
    }).observe(stream, { childList: true });
  }
})();
