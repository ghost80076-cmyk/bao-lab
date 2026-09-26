/* Player-triggered scene illustration prompts and private, device-local image album.
 * No image generation service or platform credits are used. */
(() => {
  'use strict';
  if (window.BAOStoryImageMoments || !window.App || !window.Chat) return;
  const trim = (value, length = 6000) => String(value ?? '').slice(0, length);
  const profileOf = card => card?.image_prompt_profile || card?.presentation?.image_prompt_profile || '';
  const action = (label, callback) => {
    const el = document.createElement('button'); el.type = 'button'; el.textContent = label;
    el.addEventListener('click', callback); return el;
  };
  const field = (label, text, rows = 5) => {
    const wrapper = document.createElement('label'); wrapper.style.cssText = 'display:grid;gap:6px;font-size:13px';
    const title = document.createElement('span'); title.textContent = label;
    const input = document.createElement('textarea'); input.value = trim(text); input.rows = rows;
    input.style.cssText = 'width:100%;box-sizing:border-box;resize:vertical;background:#10141d;color:#f5f6fb;border:1px solid #647082;border-radius:10px;padding:10px;line-height:1.6';
    wrapper.append(title, input); return { wrapper, input };
  };
  const openDialog = (title, info) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'bao-scene-image-backdrop';
    backdrop.style.cssText = 'position:fixed;inset:0;z-index:10070;display:grid;place-items:center;padding:10px;background:#000d';
    const panel = document.createElement('section'); panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', title);
    panel.style.cssText = 'display:grid;gap:12px;width:min(680px,100%);max-height:94dvh;overflow:auto;box-sizing:border-box;padding:18px;border:1px solid #667285;border-radius:16px;background:#1b202c;color:#f4f4f9';
    const heading = document.createElement('h2'); heading.textContent = title; heading.style.margin = '0';
    const note = document.createElement('p'); note.textContent = info; note.style.cssText = 'margin:0;font-size:13px;line-height:1.6';
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    status.style.cssText = 'min-height:18px;margin:0;font-size:13px;line-height:1.5';
    const previousFocus = document.activeElement;
    const urls = new Set();
    const close = () => {
      if (!backdrop.isConnected) return;
      urls.forEach(url => URL.revokeObjectURL(url)); urls.clear();
      backdrop.remove(); previousFocus?.isConnected && previousFocus.focus?.();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = event => { if (event.key === 'Escape') close(); };
    const closeButton = action('關閉', close);
    panel.append(heading, note); backdrop.append(panel); document.body.append(backdrop);
    backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
    document.addEventListener('keydown', onKey); closeButton.style.justifySelf = 'end';
    return { backdrop, panel, status, closeButton, urls, close };
  };
  const copy = async (text, status) => {
    try { await navigator.clipboard.writeText(text); status.textContent = '已複製。'; }
    catch { status.textContent = '目前無法自動複製，請長按文字欄位手動複製。'; }
  };
  const album = {
    ready: null,
    open() {
      if (this.ready) return this.ready;
      this.ready = new Promise((resolve, reject) => {
        if (!window.indexedDB) return reject(new Error('瀏覽器未提供圖片資料庫。'));
        const request = indexedDB.open('bao-lab-scene-images', 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          const store = db.createObjectStore('images', { keyPath: 'id' });
          store.createIndex('storyId', 'storyId', { unique: false });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('無法開啟圖片資料庫。'));
      }).catch(error => { this.ready = null; throw error; });
      return this.ready;
    },
    async query(mode, callback) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('images', mode);
        let value;
        try { value = callback(tx.objectStore('images')); }
        catch (error) { reject(error); return; }
        tx.oncomplete = () => resolve(value?.result);
        tx.onerror = () => reject(tx.error || new Error('圖片資料庫操作失敗。'));
        tx.onabort = () => reject(tx.error || new Error('圖片資料庫寫入中止。'));
      });
    },
    list: storyId => album.query('readonly', store => store.index('storyId').getAll(storyId)),
    add: record => album.query('readwrite', store => store.put(record)),
    delete: id => album.query('readwrite', store => store.delete(id))
  };
  const refs = () => window.BAOStoryLibrary?.refs?.() || {};
  const addGallery = (view, target) => {
    const { panel, status, urls, backdrop } = view;
    const container = document.createElement('section'); container.style.cssText = 'display:grid;gap:9px;padding-top:10px;border-top:1px solid #596171';
    const head = document.createElement('b'); head.textContent = '本機劇情圖集';
    const note = document.createElement('small'); note.textContent = '僅儲存在目前瀏覽器；不會自動上傳，也不包含在故事 JSON／Google Drive 備份中。請自行備份重要圖片。';
    const picker = document.createElement('input'); picker.type = 'file'; picker.accept = 'image/png,image/jpeg,image/webp';
    picker.setAttribute('aria-label', '選擇要存入本機圖集的圖片');
    const grid = document.createElement('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:9px';
    const current = refs();
    if (!current.storyId || !current.chapterId) {
      picker.disabled = true; note.textContent += ' 目前沒有已建立的故事章節，暫不能收藏。';
    }
    const paint = async () => {
      urls.forEach(url => URL.revokeObjectURL(url)); urls.clear();
      grid.replaceChildren();
      if (!current.storyId) return;
      const records = (await album.list(current.storyId)).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      for (const item of records) {
        if (!backdrop.isConnected) return;
        const card = document.createElement('div'); card.style.cssText = 'min-width:0;display:grid;gap:6px;padding:6px;border:1px solid #566072;border-radius:9px';
        const image = document.createElement('img');
        const url = URL.createObjectURL(item.file); urls.add(url);
        image.src = url; image.alt = trim(item.name || '故事圖片', 100);
        image.style.cssText = 'width:100%;height:115px;object-fit:cover;border-radius:6px';
        const label = document.createElement('small'); label.textContent = `${item.chapterLabel || '章節'} · ${item.messageLabel || '場景'}`;
        label.style.cssText = 'overflow-wrap:anywhere';
        const remove = action('刪除圖片', async () => {
          if (!window.confirm('確定從這台裝置刪除這張圖片？無法復原。')) return;
          try { await album.delete(item.id); await paint(); status.textContent = '圖片已從本機圖集刪除。'; }
          catch (error) { status.textContent = `刪除失敗：${error.message}`; }
        });
        card.append(image, label, remove); grid.append(card);
      }
      if (!records.length) grid.textContent = '這個故事還沒有收藏圖片。';
    };
    picker.addEventListener('change', async () => {
      const image = picker.files?.[0]; picker.value = '';
      if (!image) return;
      if (!['image/png','image/jpeg','image/webp'].includes(image.type) || image.size > 5*1024*1024 || image.size === 0) {
        status.textContent = '只支援 PNG／JPG／WebP，單張不超過 5 MB。'; return;
      }
      try {
        await album.add({
          id: window.crypto?.randomUUID?.() || `image-${Date.now()}-${Math.random()}`,
          storyId: current.storyId, chapterId: current.chapterId,
          messageId: target.id || `legacy-${target.index}`,
          chapterLabel: current.chapterLabel || '章節', messageLabel: `訊息 ${target.index + 1}`,
          characterId: String(window.App?.activeCharacter?.id || ''),
          name: trim(image.name, 120), file: image, createdAt: new Date().toISOString()
        });
        await paint(); status.textContent = '圖片已存入這台裝置的本機圖集。';
      } catch (error) { status.textContent = `圖片儲存失敗：${error?.message || '儲存空間可能不足'}`; }
    });
    container.append(head, note, picker, grid); panel.append(container);
    void paint().catch(error => { grid.textContent = '圖片庫目前無法使用。'; status.textContent = error.message; });
  };
  const openPlayer = (index = null) => {
    const character = App.activeCharacter;
    if (!character) return;
    const list = Chat.messages || [];
    const fallback = list.findLastIndex(message => message.role === 'assistant');
    const position = Number.isInteger(index) && list[index]?.role === 'assistant' ? index : fallback;
    const selected = position >= 0 ? list[position] : null;
    const context = selected ? list.slice(Math.max(0, position - 7), position + 1)
      .map(m => `${m.role === 'user' ? '玩家' : '敘事'}：${trim(m.content,1400)}`).join('\n').slice(0,9000) : '';
    const scene = selected ? { index: position, id: String(selected.id || ''), context } : { index: -1, id: '', context: '' };
    const view = openDialog('劇情配圖', '作者外觀設定可免費複製；只有你主動按「文字模型分析」才會使用自己的 API，可能產生服務商費用。本站不會自動生圖。');
    const { panel, status, closeButton } = view;
    const positionInfo = document.createElement('small');
    positionInfo.textContent = selected ? `指定場景：第 ${position + 1} 則訊息（只分析截至這則的劇情，不帶入後面的故事）` : '尚無 AI 回覆，可先複製作者視覺設定。';
    const profile = field('角色固定外觀、畫風及世界視覺設定', profileOf(character), 5);
    const result = field('可修改的生圖提示詞（複製到自己的生圖服務使用）', '', 7);
    const row = document.createElement('div'); row.style.cssText = 'display:flex;flex-wrap:wrap;gap:9px';
    row.append(action('複製作者設定', () => copy(profile.input.value, status)));
    const generate = action('用我的文字模型分析此場景', async () => {
      const config = App.config?.api;
      if (!config?.key || !config?.model || !config?.baseUrl || !window.API?.send) {
        status.textContent = '請先連接自己的文字模型 API；複製作者設定不需 API。'; return;
      }
      if (!scene.context) { status.textContent = '目前沒有可分析的 AI 劇情。'; return; }
      generate.disabled = true; status.textContent = '正在分析所選劇情……';
      try {
        const prompt = [
          { role:'system',content:'你是圖片提示詞編輯。只根據提供的劇情及角色視覺設定，生成一段可複製的生圖提示詞。保留固定外觀、時間和地點，只描繪選中的場景，不增加人物、受傷或情節事實。不要輸出 JSON、HTML 或額外說明。' },
          { role:'user',content:`角色：${trim(character.name,180)}\n固定外觀：${trim(profile.input.value,6000) || '未提供'}\n\n截至指定回覆的劇情：\n${scene.context}\n\n只生成指定回覆當下的畫面提示詞。` }
        ];
        const settings = typeof App.applyProviderContext === 'function' ? App.applyProviderContext(config) : config;
        const response = await API.send(settings, prompt);
        result.input.value = trim(response?.text,6000);
        status.textContent = result.input.value ? '提示詞已生成。可修改並複製，不會更動故事。' : '文字模型沒有回傳提示詞。';
      } catch (error) { status.textContent = `分析失敗：${error?.message || '未知錯誤'}`; }
      finally { generate.disabled = false; }
    });
    row.append(generate, action('複製圖片提示詞', () => copy(result.input.value,status)));
    panel.append(positionInfo, profile.wrapper, result.wrapper, row);
    addGallery(view, scene);
    panel.append(status, closeButton);
  };
  const mount = () => {
    const root = document.getElementById('chat-view');
    if (!root) return;
    const aside = root.querySelector('.chat-layout > aside');
    if (aside && !aside.querySelector('[data-bao-image-latest]')) {
      const latest = action('▣ 劇情配圖／圖集', () => openPlayer());
      latest.dataset.baoImageLatest = '1'; aside.append(latest);
    }
    const stream = document.getElementById('chat-stream');
    const nodes = [...(stream?.querySelectorAll(':scope > .message') || [])];
    const messages = Chat.messages || [];
    const offset = nodes.length - messages.length;
    if (offset !== 0 && offset !== 1) return;
    for (let i=0;i<messages.length;i++) {
      const item = messages[i]; const node = nodes[i + offset];
      if (item?.role !== 'assistant' || !node?.classList.contains('assistant') || node.querySelector('[data-bao-scene-image]')) continue;
      const button = action('▣ 配圖', () => openPlayer(i)); button.dataset.baoSceneImage = '1';
      button.className = 'bao-scene-image-action';
      button.style.cssText = 'margin:5px 8px;padding:5px 9px;border:1px solid #53687b;border-radius:9px;background:#21303c;color:#eaf9f6;font-size:12px';
      node.append(button);
    }
  };
  let pending = false;
  const schedule = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; mount(); });
  };
  const stream = document.getElementById('chat-stream');
  if (stream) new MutationObserver(mutations => {
    if (mutations.some(m => [...m.addedNodes,...m.removedNodes].some(node => node.nodeType===1 && node.classList?.contains('message')))) schedule();
  }).observe(stream, {childList:true});
  const previous = App.renderChatShell?.bind(App);
  if (previous) App.renderChatShell = (...args) => { const result = previous(...args); schedule(); return result; };
  window.BAOStoryImageMoments = { openPlayer, mount, profileOf, album };
  schedule();
})();
