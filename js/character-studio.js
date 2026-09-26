/* BAO/LAB local character studio. Cards are text data, never executable markup. */
(() => {
  'use strict';
  const engine = window.CharacterEngine;
  const importer = window.BAOCharacterImport;
  const form = document.getElementById('studio-form');
  if (!engine || !importer || !form) return;
  const $ = id => document.getElementById(id);
  const field = name => form.elements.namedItem(name);
  const status = message => { $('studio-status').textContent = message; };
  const DB_NAME = 'bao-lab-character-studio';
  const STORE = 'drafts';
  const DEFAULT_IMAGE = 'assets/bao-bun.svg';
  const MAX_DRAFTS = 100;
  let dbPromise;
  let draftId = null;
  let base = {};
  let dirty = false;
  let loading = false;
  let builtInIds = null;

  const id = () => `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const safeImage = value => /^(https:\/\/[^\s]+|assets\/[a-zA-Z0-9_./-]+)$/.test(String(value || '')) ? value : DEFAULT_IMAGE;
  const text = name => String(field(name).value || '').trim();

  function openDB() {
    if (!('indexedDB' in window)) return Promise.reject(new Error('這個瀏覽器未提供 IndexedDB，請先匯出 JSON 備份。'));
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'draftId' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('無法開啟本機草稿資料庫。'));
      req.onblocked = () => reject(new Error('草稿資料庫被其他分頁佔用，請關閉其他 BAO/LAB 分頁後重試。'));
    }).catch(error => { dbPromise = null; throw error; });
    return dbPromise;
  }
  async function database(action, payload) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      let result;
      const tx = db.transaction(STORE, action === 'get' || action === 'list' ? 'readonly' : 'readwrite');
      const store = tx.objectStore(STORE);
      const request = action === 'get' ? store.get(payload) : action === 'list' ? store.getAll() : action === 'delete' ? store.delete(payload) : store.put(payload);
      request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error('草稿儲存失敗。'));
      tx.onabort = () => reject(tx.error || new Error('草稿儲存被中止。'));
    });
  }
  const confirmDiscard = () => !dirty || window.confirm('目前的變更還沒儲存為草稿。確定離開這張卡嗎？');

  function readCard() {
    const name = text('name');
    const world = text('mode') === 'world';
    const profileText = text('profile');
    const avatar = text('avatar');
    const tags = text('tags').split(/[,，\n]+/).map(s => s.trim()).filter(Boolean).slice(0, 24);
    return {
      ...base,
      id: text('id'), name, title: name,
      category: text('category'), rating: text('category') === 'r18' ? 'adult' : 'general',
      description: text('description'), avatar: avatar || DEFAULT_IMAGE,
      tags, quote: text('quote'), greeting: text('greeting'),
      system_prompt: text('system_prompt'),
      profile: profileText ? { '人物設定': profileText } : {},
      world: text('world'), lore: text('lore'), npc_rules: text('npc_rules'),
      author_instructions: text('author_instructions'), creator_notes: text('creator_notes'),
      supported_modes: { immersive: true, world },
      supported_display: base.supported_display || { text: true, ui: false },
      source: 'local-import', schema_version: '1.5'
    };
  }
  function showCard(card, chosenDraftId = null) {
    const c = engine.normalize(card || {});
    loading = true;
    base = c;
    draftId = chosenDraftId;
    for (const key of ['id', 'name', 'category', 'description', 'quote', 'greeting', 'system_prompt', 'world', 'lore', 'npc_rules', 'author_instructions', 'creator_notes']) field(key).value = c[key] || '';
    field('avatar').value = c.avatar === DEFAULT_IMAGE || c.avatar.includes('picsum.photos/seed/bao-character') ? '' : c.avatar;
    field('tags').value = (c.tags || []).join(', ');
    field('mode').value = c.supported_modes?.world ? 'world' : 'immersive';
    field('profile').value = typeof c.profile === 'object' ? (c.profile['人物設定'] || engine.profilePrompt(c.profile)) : String(c.profile || '');
    $('studio-preview').classList.add('hidden');
    loading = false;
    dirty = false;
    status(chosenDraftId ? '已載入本機草稿' : '新草稿尚未儲存');
  }
  async function refreshList() {
    const list = $('studio-drafts');
    const records = (await database('list')).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    list.replaceChildren();
    if (!records.length) { const p = document.createElement('p'); p.className = 'note'; p.textContent = '尚無草稿。按「新建角色卡」開始。'; list.append(p); }
    for (const item of records) {
      const row = document.createElement('div'); row.className = 'studio-draft-row';
      const button = document.createElement('button'); button.type = 'button'; button.className = 'studio-draft' + (item.draftId === draftId ? ' active' : '');
      const title = document.createElement('strong'); title.textContent = item.card?.name || '未命名角色';
      const desc = document.createElement('small'); desc.textContent = item.card?.id || '尚未指定 ID';
      const date = document.createElement('span'); date.textContent = new Date(item.updatedAt).toLocaleString('zh-TW');
      button.append(title, desc, date);
      button.addEventListener('click', async () => {
        if (item.draftId === draftId || !confirmDiscard()) return;
        try { const record = await database('get', item.draftId); if (!record) throw new Error('這份草稿已不存在。'); showCard(record.card, record.draftId); await refreshList(); }
        catch (error) { status(error.message); }
      });
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'studio-delete'; remove.textContent = '刪除草稿';
      remove.setAttribute('aria-label', `刪除草稿 ${item.card?.name || '未命名角色'}`);
      remove.addEventListener('click', async () => {
        if (!window.confirm(`確定刪除「${item.card?.name || '未命名角色'}」的創作草稿？已加入角色庫的版本不受影響。`)) return;
        try { await database('delete', item.draftId); if (draftId === item.draftId) showCard({ id: id(), name: '', avatar: DEFAULT_IMAGE }, null); await refreshList(); status('草稿已刪除；角色庫與故事存檔沒有改動。'); }
        catch (error) { status(error.message); }
      });
      row.append(button, remove); list.append(row);
    }
    return records;
  }
  async function saveDraft() {
    const card = readCard();
    const records = await database('list');
    if (!draftId && records.length >= MAX_DRAFTS) throw new Error('本機草稿已達 100 張，請先匯出備份並刪除舊草稿。');
    const chosenId = draftId || id();
    const updatedAt = Date.now();
    await database('put', { draftId: chosenId, card, updatedAt });
    const verify = await database('get', chosenId);
    if (!verify || JSON.stringify(verify.card) !== JSON.stringify(card)) throw new Error('草稿寫入後驗證失敗，請立即匯出 JSON 備份。');
    draftId = chosenId;
    dirty = JSON.stringify(readCard()) !== JSON.stringify(card);
    await refreshList();
    status(dirty ? '已儲存先前版本；請再儲存最新修改' : '✓ 草稿已儲存在這台瀏覽器');
    return card;
  }
  function check(card) {
    if (!card.name || !card.id || !card.greeting || !card.system_prompt) throw new Error('請填寫名稱、角色 ID、核心設定與初始訊息。');
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(card.id)) throw new Error('角色 ID 請使用英數、底線與連字號，最多 64 字元。');
    if (card.avatar !== DEFAULT_IMAGE && !/^https:\/\/[^\s]+$/i.test(card.avatar) && !/^assets\/[a-zA-Z0-9_./-]+$/.test(card.avatar)) throw new Error('圖片請使用 HTTPS 網址，或留白使用預設圖片。');
    return importer.inspect(toExport(card, true));
  }
  function toExport(card, includeMetadata = false) {
    const c = engine.normalize(card);
    const obj = {
      schema_version: '1.5',
      meta: { id: c.id, name: c.name, title: c.title, category: c.category, rating: c.rating, avatar: c.avatar, description: c.description, tags: c.tags, gender: c.gender, audience: c.audience, categories: c.categories },
      content: { greeting: c.greeting, system_prompt: c.system_prompt, quote: c.quote, profile: c.profile, world: c.world, lore: c.lore, npc_rules: c.npc_rules, author_instructions: c.author_instructions, creator_notes: c.creator_notes, world_focus: c.world_focus, dynamic_prompts: c.dynamic_prompts },
      gameplay: { supported_modes: c.supported_modes, initial_state: c.initial_state, world_modules: c.world_modules, character_status: c.character_status, prompt: c.prompt_options },
      presentation: { supported_display: c.supported_display, ui: c.ui, narrative: c.narrative_profile }
    };
    if (includeMetadata && c.import_metadata) obj.import_metadata = c.import_metadata;
    return obj;
  }
  async function builtinIds() {
    if (builtInIds) return builtInIds;
    const response = await fetch('data/characters.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('無法確認內建角色 ID，為避免覆蓋原作品，本次加入已取消。');
    builtInIds = new Set((await response.json()).map(entry => entry.id));
    return builtInIds;
  }
  async function install() {
    const card = readCard();
    check(card);
    if ((await builtinIds()).has(card.id)) throw new Error('角色 ID 與網站內建作品重複，請先更換 ID。');
    const existing = engine.loadCustom();
    if (existing.some(x => x.id === card.id) && !window.confirm(`本機角色「${card.id}」已存在。確定更新角色設定嗎？已有的故事存檔不會被改寫。`)) return;
    if (!existing.some(x => x.id === card.id) && existing.length >= 100) throw new Error('本機角色庫已達 100 張上限，請先備份並移除舊角色。');
    await saveDraft();
    engine.saveCustom(card);
    const saved = engine.loadCustom().find(x => x.id === card.id);
    if (!saved || saved.system_prompt !== card.system_prompt || saved.greeting !== card.greeting) throw new Error('本機角色庫寫入未通過驗證，請先匯出備份。');
    status('✓ 已加入這台裝置的角色庫。回首頁 → 探索角色即可試玩；沒有公開到 GitHub。');
  }
  function preview() {
    const c = readCard();
    $('studio-preview-name').textContent = c.name || '未命名角色';
    $('studio-preview-description').textContent = c.description || '尚未填寫簡介';
    $('studio-preview-greeting').textContent = c.greeting || '尚未填寫初始訊息';
    $('studio-preview-prompt').textContent = c.system_prompt || '尚未填寫核心設定';
    $('studio-preview-image').src = safeImage(c.avatar);
    $('studio-preview').classList.remove('hidden');
    $('studio-preview').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    status('預覽只顯示純文字，不會執行角色卡內的 HTML／JavaScript，也不會呼叫 AI。');
  }
  function download() {
    const card = readCard();
    check(card);
    const json = JSON.stringify(toExport(card), null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `${card.id}.bao-character.json`; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status('✓ 已產生 BAO/LAB JSON。請自行保管檔案；酒館 V2 的未對應來源欄位不包含在這份匯出中。');
  }
  async function importDraft(file) {
    if (!confirmDiscard()) return;
    const result = await importer.prepareFile(file);
    const normalized = engine.normalize(result.character);
    const existing = await database('list');
    if (existing.length >= MAX_DRAFTS) throw new Error('本機草稿已達 100 張，請先備份並清理。');
    showCard(normalized, null);
    dirty = true;
    const details = result.converted ? '酒館 V2 已轉換；來源進階功能未必能在本站使用，請檢查內容後再加入角色庫。' : 'BAO/LAB 角色卡已載入，請確認後儲存草稿。';
    status(details);
  }
  function run(buttonId, action) {
    $(buttonId).addEventListener('click', async () => {
      const button = $(buttonId); button.disabled = true;
      try { await action(); } catch (error) { status('✕ ' + (error?.message || '操作失敗')); }
      finally { button.disabled = false; }
    });
  }
  form.addEventListener('input', () => { if (!loading) { dirty = true; status('尚未儲存修改'); } });
  form.addEventListener('change', () => { if (!loading) { dirty = true; status('尚未儲存修改'); } });
  form.addEventListener('submit', event => event.preventDefault());
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  run('studio-new', async () => { if (!confirmDiscard()) return; showCard({ id: id(), name: '', avatar: DEFAULT_IMAGE }, null); await refreshList(); });
  run('studio-save-draft', saveDraft);
  run('studio-preview-button', preview);
  run('studio-export', download);
  run('studio-install', install);
  $('studio-import').addEventListener('click', () => $('studio-file').click());
  $('studio-file').addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try { await importDraft(file); await refreshList(); } catch (error) { status('✕ ' + (error?.message || '匯入失敗')); }
    finally { event.target.value = ''; }
  });
  $('studio-preview-image').addEventListener('error', () => { $('studio-preview-image').src = DEFAULT_IMAGE; });
  (async () => {
    showCard({ id: id(), name: '', avatar: DEFAULT_IMAGE });
    try { await refreshList(); status('可以開始建立角色卡，記得儲存草稿與匯出備份。'); }
    catch (error) { status('✕ ' + error.message + ' 仍可編輯並匯出 JSON。'); }
  })();
})();
