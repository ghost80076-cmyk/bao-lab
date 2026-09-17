/* Author-only local JSON editor. No model calls and no automatic overwrite of the character library. */
(() => {
  if (!window.BAOChatMarkup || !window.BAOCharacterStatus) return;
  const isObject = v => v && typeof v === 'object' && !Array.isArray(v);
  const keyPattern = /^[a-zA-Z0-9_-]{1,40}$/;
  const valueText = v => Array.isArray(v) ? v.join('、') : typeof v === 'boolean' ? (v ? '是' : '否') : String(v ?? '');
  const definitions = card => {
    const status = card?.character_status || card?.gameplay?.character_status;
    const fields = Array.isArray(status?.fields) ? status.fields : [];
    const result = [{ key: 'time', label: '時間' }, { key: 'location', label: '地點' }, { key: 'character', label: '角色名稱' }];
    fields.forEach(f => { if (keyPattern.test(f?.key || '') && !result.some(x => x.key === f.key)) result.push({ key: f.key, label: String(f.label || f.key) }); });
    return result;
  };
  const preview = (html, fields, values) => {
    const safe = window.BAOChatMarkup.sanitize(html);
    const doc = new DOMParser().parseFromString(`<div id="bao-binding-preview-root">${safe}</div>`, 'text/html');
    const root = doc.getElementById('bao-binding-preview-root');
    if (!root) return document.createDocumentFragment();
    const substitute = node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        const pattern = /{{\s*([a-zA-Z0-9_-]{1,40})\s*}}/g;
        if (!pattern.test(text)) return;
        pattern.lastIndex = 0;
        const fragment = document.createDocumentFragment();
        let start = 0;
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
    const fragment = document.createDocumentFragment();
    fragment.append(...root.childNodes);
    return fragment;
  };
  const open = () => {
    document.getElementById('bao-author-binding-dialog')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'bao-author-binding-dialog';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10001;background:#000b;display:grid;place-items:center;padding:12px';
    const panel = document.createElement('section');
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', '作者狀態欄欄位綁定');
    panel.style.cssText = 'width:min(900px,100%);max-height:92vh;overflow:auto;background:var(--panel,#202027);color:var(--text,#eee);padding:20px;border-radius:14px;display:grid;gap:12px';
    const heading = document.createElement('h2'); heading.textContent = '作者狀態欄 · 欄位綁定';
    const help = document.createElement('p'); help.textContent = '匯入 BAO/LAB 角色 JSON，選擇欄位插入 HTML。預覽使用本機示例值，不會呼叫 AI；下載修改後的 JSON，再自行匯入角色庫。';
    const file = document.createElement('input'); file.type = 'file'; file.accept = '.json,application/json'; file.setAttribute('aria-label', '匯入角色 JSON');
    const selector = document.createElement('select'); selector.setAttribute('aria-label', '選擇世界狀態欄位');
    const insert = document.createElement('button'); insert.type = 'button'; insert.textContent = '在游標處插入欄位';
    const editor = document.createElement('textarea'); editor.rows = 9; editor.placeholder = '<div>時間：{{time}}</div>'; editor.style.cssText = 'width:100%;box-sizing:border-box;font-family:monospace';
    const issues = document.createElement('p'); issues.setAttribute('role', 'status');
    const output = document.createElement('div'); output.style.cssText = 'border:1px solid #8886;border-radius:8px;padding:14px;min-height:50px;overflow-wrap:anywhere';
    const download = document.createElement('button'); download.type = 'button'; download.textContent = '下載修改後的角色 JSON'; download.disabled = true;
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '關閉';
    const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap'; row.append(selector, insert);
    panel.append(heading, help, file, row, editor, issues, output, download, close); overlay.append(panel); document.body.append(overlay);
    let raw = null; let fields = definitions(null); let caret = 0;
    const populate = () => { selector.replaceChildren(...fields.map(f => { const option = document.createElement('option'); option.value = f.key; option.textContent = `${f.label} (${f.key})`; return option; })); };
    const update = () => {
      const values = Object.fromEntries(fields.map(f => [f.key, f.key === 'time' ? '第 1 天 08:00' : f.key === 'location' ? '城鎮' : f.key === 'character' ? (raw?.meta?.name || raw?.name || '角色') : '示例值']));
      const unknown = [...editor.value.matchAll(/{{\s*([^{}]+?)\s*}}/g)].map(m => m[1].trim()).filter(k => !fields.some(f => f.key === k));
      issues.textContent = unknown.length ? `找不到欄位：${[...new Set(unknown)].join('、')}。請從選單插入，或檢查角色卡欄位定義。` : raw ? '欄位名稱檢查通過；預覽為示例值，實際遊戲會讀取世界狀態。' : '請先匯入角色 JSON；目前只顯示內建欄位示例。';
      output.replaceChildren(preview(editor.value, fields, values));
      download.disabled = !raw || Boolean(unknown.length);
    };
    populate(); update();
    file.addEventListener('change', async () => {
      try {
        const selected = file.files?.[0]; if (!selected) return;
        if (selected.size > 1024 * 1024) throw new Error('角色 JSON 不可超過 1 MB。');
        const next = JSON.parse(await selected.text());
        if (!isObject(next) || !(next.meta?.id || next.id) || !(next.meta?.name || next.name)) throw new Error('請選擇包含角色 ID 與名稱的 BAO/LAB 角色 JSON。');
        raw = next; fields = definitions(raw); populate();
        editor.value = typeof raw.author_status_html === 'string' ? raw.author_status_html : typeof raw.presentation?.author_status_html === 'string' ? raw.presentation.author_status_html : '';
        update();
      } catch (error) { raw = null; fields = definitions(null); populate(); update(); issues.textContent = error.message || 'JSON 無法讀取。'; }
    });
    editor.addEventListener('input', update);
    editor.addEventListener('click', () => { caret = editor.selectionStart; });
    editor.addEventListener('keyup', () => { caret = editor.selectionStart; });
    insert.addEventListener('click', () => {
      const token = `{{${selector.value}}}`;
      const start = document.activeElement === editor ? editor.selectionStart : caret;
      const end = document.activeElement === editor ? editor.selectionEnd : caret;
      editor.setRangeText(token, start, end, 'end'); caret = editor.selectionStart; editor.focus(); update();
    });
    download.addEventListener('click', () => {
      if (!raw || download.disabled) return;
      const card = JSON.parse(JSON.stringify(raw));
      if (isObject(card.presentation) && Object.prototype.hasOwnProperty.call(card.presentation, 'author_status_html')) card.presentation.author_status_html = editor.value;
      else card.author_status_html = editor.value;
      const url = URL.createObjectURL(new Blob([JSON.stringify(card, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${String(card.meta?.id || card.id).replace(/[^a-zA-Z0-9_-]/g, '') || 'character'}-status.json`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    const dismiss = () => overlay.remove(); close.addEventListener('click', dismiss); overlay.addEventListener('click', e => { if (e.target === overlay) dismiss(); });
  };
  const mount = () => {
    const tools = document.querySelector('.character-tools');
    if (!tools || tools.querySelector('[data-author-status-binding]')) return false;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary'; button.dataset.authorStatusBinding = '1'; button.textContent = '作者狀態欄編輯／欄位綁定';
    button.addEventListener('click', open); tools.append(button); return true;
  };
  if (!mount()) {
    let attempts = 0;
    const timer = setInterval(() => { if (mount() || ++attempts > 60) clearInterval(timer); }, 150);
  }
  window.BAOAuthorStatusBinding = { definitions, preview, open, mount };
})();