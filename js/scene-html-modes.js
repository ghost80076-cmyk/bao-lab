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
  // A presentation adapter only: never parse a displayed [STATUS] block back into game state.
  const sharedStatus = () => {
    const state = window.GameState?.current;
    if (!state) return null;
    const statusAPI = window.BAOCharacterStatus;
    const config = statusAPI?.configFor?.(App.activeCharacter);
    const names = Object.keys(state.characterStatuses || {});
    const preferred = state.uiContextCharacter || App.activeCharacter?.name;
    const name = names.includes(preferred) ? preferred : names[0];
    const fields = config?.fields?.filter(field => !config.customization?.hidden?.includes(field.key)) || [];
    const values = name ? state.characterStatuses[name] || {} : {};
    return { state, name, fields, values, labels: config?.customization?.labels || {} };
  };
  const valueText = value => Array.isArray(value) ? value.join('、') : typeof value === 'boolean' ? (value ? '是' : '否') : String(value ?? '');
  const paintStatus = () => {
    const native = document.getElementById('bao-scene-native-status');
    const author = document.getElementById('bao-scene-author-status');
    const shared = sharedStatus();
    if (native) {
      native.hidden = prefs.status !== 'native';
      const label = shared ? `時間：${shared.state.time || '未知'}　地點：${shared.state.location || '未知'}` : '尚無世界狀態';
      if (native.textContent !== label) native.textContent = label;
    }
    if (!author) return;
    author.hidden = prefs.status !== 'author';
    if (prefs.status !== 'author') return;
    // Author-supplied presentation can opt in via character.author_status_html.
    // Only known field keys are substituted, as text nodes, never as executable markup.
    const template = App.activeCharacter?.author_status_html;
    const fingerprint = JSON.stringify({ template, name: shared?.name, values: shared?.values, fields: shared?.fields, labels: shared?.labels, time: shared?.state.time, location: shared?.state.location });
    if (author.dataset.fingerprint === fingerprint) return;
    author.dataset.fingerprint = fingerprint;
    if (!shared) { author.textContent = '尚無世界狀態。'; return; }
    if (typeof template === 'string' && template.trim()) {
      const safe = window.BAOChatMarkup.sanitize(template);
      const doc = new DOMParser().parseFromString(`<div id="bao-author-status-root">${safe}</div>`, 'text/html');
      const root = doc.getElementById('bao-author-status-root');
      const values = { time: shared.state.time, location: shared.state.location, character: shared.name };
      shared.fields.forEach(field => { values[field.key] = shared.values[field.key]; });
      const substitute = node => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent || '';
          if (!/{{\s*[a-zA-Z0-9_-]{1,40}\s*}}/.test(text)) return;
          const fragment = document.createDocumentFragment();
          let start = 0;
          const pattern = /{{\s*([a-zA-Z0-9_-]{1,40})\s*}}/g;
          for (const match of text.matchAll(pattern)) {
            fragment.append(document.createTextNode(text.slice(start, match.index)));
            fragment.append(document.createTextNode(Object.prototype.hasOwnProperty.call(values, match[1]) ? valueText(values[match[1]]) : '—'));
            start = match.index + match[0].length;
          }
          fragment.append(document.createTextNode(text.slice(start)));
          node.replaceWith(fragment);
        } else if (node.nodeType === Node.ELEMENT_NODE) [...node.childNodes].forEach(substitute);
      };
      substitute(root);
      author.replaceChildren(...root.childNodes);
      return;
    }
    const heading = document.createElement('strong'); heading.textContent = shared.name || '世界狀態';
    const rows = shared.fields.map(field => {
      const line = document.createElement('div');
      line.textContent = `${shared.labels[field.key] || field.label}：${valueText(shared.values[field.key]) || '—'}`;
      return line;
    });
    if (!rows.length) {
      const line = document.createElement('div'); line.textContent = `時間：${shared.state.time || '未知'}　地點：${shared.state.location || '未知'}`;
      rows.push(line);
    }
    author.replaceChildren(heading, ...rows);
  };
  const refresh = () => {
    const stream = document.getElementById('chat-stream');
    if (!stream || !App.activeCharacter) return;
    const messages = Chat.messages.length ? Chat.messages : [{ role: 'assistant', content: App.activeCharacter.greeting || '', greeting: true }];
    [...stream.querySelectorAll('.message .bubble')].forEach((bubble, index) => {
      const msg = messages[index];
      if (!msg || msg.role !== 'assistant') return;
      const html = render(msg.content, Boolean(msg.greeting));
      if (bubble.innerHTML !== html) bubble.innerHTML = html;
      bubble.classList.toggle('authored-rich-message', prefs.mode !== 'native');
    });
    paintStatus();
  };
  const originalPrompt = App.buildSystemPrompt.bind(App);
  App.buildSystemPrompt = function(...args) {
    const base = originalPrompt(...args);
    const instructions = {
      native: '【玩家排版偏好】只輸出純文字敘事及對話。不要產生 HTML、CSS、JavaScript、場景標籤或視覺狀態欄。角色卡原有的 HTML 排版要求若與此衝突，以本項玩家選擇為準。',
      efficient: '【玩家排版偏好】優先輸出純文字敘事。需要場景排版時，只能使用 [SCENE:forum]、[SCENE:realistic] 或 [SCENE:dramatic]，並將正文放在 [NARRATION]...[/NARRATION] 中；場景未變更時可以只輸出一般文字。不要重複輸出 HTML、CSS 或 JavaScript。',
      free: '【玩家排版偏好】允許依劇情產生 HTML 視覺排版，但不得輸出 JavaScript、事件處理器、iframe 或可執行程式碼；不需要華麗排版時直接輸出一般文字。'
    };
    return `${base}\n\n${instructions[prefs.mode]}\n狀態資料由世界狀態追蹤器更新；不要為視覺狀態欄重複生成 HTML 或 [STATUS] 區塊。`;
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
    const note = document.createElement('small'); note.textContent = '設定從下一輪 API 請求生效；作者狀態欄僅讀取世界狀態，不會修改它。'; panel.append(note);
    const native = document.createElement('div'); native.id = 'bao-scene-native-status'; native.setAttribute('role','status'); panel.append(native);
    const author = document.createElement('div'); author.id = 'bao-scene-author-status'; author.style.whiteSpace = 'pre-wrap'; author.setAttribute('role','status'); panel.append(author);
    aside.append(panel); refresh();
  };
  const originalShell = App.renderChatShell.bind(App);
  App.renderChatShell = function(...args) { const result = originalShell(...args); mount(); refresh(); return result; };
  window.BAOSceneHTML = { prefs, render, refresh, sceneTemplates, sharedStatus, paintStatus };
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