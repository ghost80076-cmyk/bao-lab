/* Story-scoped actor editing. Never edit the source card or place API keys in presets. */
(() => {
  'use strict';
  if (window.BAOStoryActors || !window.App || !window.Storage || !window.CharacterEngine) return;

  const KEY = 'bao-lab:persona-presets-v1';
  const PLAYER_FIELDS = ['name', 'gender', 'age', 'identity', 'appearance', 'personality', 'background', 'abilities', 'relationship', 'extra'];
  const HOST_FIELDS = ['name', 'gender', 'identity', 'appearance', 'personality', 'background', 'voice', 'extra'];
  const CARD_FIELDS = ['name', 'gender', 'description', 'system_prompt', 'profile', 'lore', 'world', 'npc_rules', 'author_instructions'];
  const labels = { name: '名稱', gender: '性別', age: '年齡', identity: '身分', appearance: '外貌', personality: '個性', background: '背景', abilities: '能力', relationship: '與角色的關係', extra: '補充設定', description: '簡介', system_prompt: '角色核心指示', profile: '完整人物資料（JSON 物件）', lore: '背景與 Lore', world: '世界觀', npc_rules: 'NPC 規則', author_instructions: '敘事指示', voice: '說話風格' };
  const multiline = new Set(['appearance', 'personality', 'background', 'abilities', 'extra', 'description', 'system_prompt', 'profile', 'lore', 'world', 'npc_rules', 'author_instructions', 'voice']);
  const clone = value => Storage.clone(value);
  const escape = value => App.escapeHTML(String(value ?? ''));
  const cleanPersona = input => Object.fromEntries(PLAYER_FIELDS.map(key => [key, String(input?.[key] ?? '').trim().slice(0, 12000)]));
  const freshId = () => globalThis.crypto?.randomUUID?.() || `persona-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  let dialog = null;

  function readPresets() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(value) ? value.filter(item => item && item.id && item.persona).slice(0, 100) : [];
    } catch { return []; }
  }
  function writePresets(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 100))); return true; }
    catch (error) { console.warn('BAO/LAB persona preset save failed:', error); alert('人物預設未能寫入此瀏覽器，請檢查儲存空間。'); return false; }
  }
  function savePreset(persona, proposedName) {
    const name = window.prompt('替這份人物預設取名：', String(proposedName || persona.name || '我的人物'));
    if (name === null) return null;
    const preset = { id: freshId(), label: name.trim().slice(0, 80) || '未命名人物', persona: cleanPersona(persona), savedAt: new Date().toISOString() };
    return writePresets([preset, ...readPresets()]) ? preset : null;
  }
  function actors() {
    const state = window.GameState?.current;
    if (!state || !App.activeCharacter || !App.config?.persona) return null;
    if (!state.storyActors || !state.storyActors.baseCharacter || !state.storyActors.basePersona) {
      state.storyActors = {
        version: 1,
        baseCharacter: clone(App.activeCharacter),
        basePersona: cleanPersona(App.config.persona),
        hostedCharacter: null,
        updatedAt: ''
      };
    }
    return state.storyActors;
  }
  function updateLabels() {
    const state = actors();
    if (!state) return;
    const persona = App.config.persona;
    const name = state.hostedCharacter?.role === 'primary' ? state.hostedCharacter.name : App.activeCharacter.name;
    const title = document.getElementById('chat-title');
    const player = document.getElementById('chat-persona');
    if (title) title.textContent = name || App.activeCharacter.name;
    if (player) player.textContent = persona.name || '未命名玩家';
    const heading = document.querySelector('#chat-character-card h3');
    if (heading) heading.textContent = name || App.activeCharacter.name;
  }
  function updateStory() {
    const state = actors();
    if (!state) return;
    state.updatedAt = new Date().toISOString();
    if (window.GameState?.current) GameState.current.config = App.config;
    updateLabels();
    App.saveStory?.(false);
  }

  const originalStart = App.startStory.bind(App);
  App.startStory = function(...args) {
    // A story owns a copy; edits never mutate App.characters / the author's source card.
    if (this.activeCharacter) this.activeCharacter = clone(this.activeCharacter);
    const before = window.GameState?.current;
    const result = originalStart(...args);
    const finish = () => {
      if (window.GameState?.current && GameState.current !== before) { actors(); App.saveStory?.(false); }
    };
    if (result && typeof result.then === 'function') return result.then(value => { finish(); return value; });
    finish();
    return result;
  };

  const originalRestore = Storage.restoreStory.bind(Storage);
  Storage.restoreStory = function(save, ...args) {
    const originalLibrary = Array.isArray(App.characters) ? App.characters.slice() : [];
    const result = originalRestore(save, ...args);
    if (!result) return result;
    // Older restore logic prefers a library ID even when a save embeds its own snapshot.
    if (save?.character) {
      App.activeCharacter = CharacterEngine.normalize(clone(save.character));
      App.characters = originalLibrary;
    } else if (App.activeCharacter) App.activeCharacter = clone(App.activeCharacter);
    actors();
    updateLabels();
    return result;
  };

  const originalCollect = App.collectConfig.bind(App);
  App.collectConfig = function(...args) {
    const config = originalCollect(...args);
    config.persona = cleanPersona({ ...config.persona, ...Object.fromEntries(['age', 'appearance', 'background', 'abilities'].map(key => [key, document.getElementById(`persona-${key}`)?.value || ''])) });
    return config;
  };

  const originalOpenBuilder = App.openBuilder.bind(App);
  App.openBuilder = function(...args) {
    const result = originalOpenBuilder(...args);
    installBuilder();
    return result;
  };

  const originalRender = App.renderChatShell.bind(App);
  App.renderChatShell = function(...args) {
    const result = originalRender(...args);
    installChatEntry();
    updateLabels();
    return result;
  };

  const originalPrompt = App.buildSystemPrompt.bind(App);
  App.buildSystemPrompt = function(...args) {
    const state = actors();
    if (!state) return originalPrompt(...args);
    const currentCard = this.activeCharacter;
    const currentPersona = this.config.persona;
    let stable;
    try {
      this.activeCharacter = state.baseCharacter;
      this.config.persona = state.basePersona;
      stable = originalPrompt(...args);
    } finally {
      this.activeCharacter = currentCard;
      this.config.persona = currentPersona;
    }
    const changes = [];
    if (!same(cleanPersona(currentPersona), cleanPersona(state.basePersona))) {
      changes.push('【目前玩家人物（優先於上方開局 Persona）】', ...PLAYER_FIELDS.map(key => `${labels[key]}：${String(currentPersona?.[key] || '未指定')}`), '這是玩家本人；AI 不得代替玩家說話、決定心理或行動。');
    }
    const changedCard = CARD_FIELDS.filter(key => !same(currentCard?.[key], state.baseCharacter?.[key]));
    if (changedCard.length) {
      changes.push('【目前 AI 原卡設定（優先於上方開局角色）】');
      changedCard.forEach(key => {
        const value = currentCard?.[key];
        const body = key === 'profile' ? JSON.stringify(value || {}, null, 2) : String(value ?? '');
        changes.push(`${labels[key]}：${body || '（已清空，忽略舊版設定）'}`);
      });
    }
    if (state.hostedCharacter?.name) {
      const host = state.hostedCharacter;
      changes.push('【本故事的 AI 託管人物】', `角色定位：${host.role === 'primary' ? 'AI 主要扮演此自訂角色；原作品角色設定只作為世界參考，不再強制扮演原作品主角。' : '此自訂人物是額外 NPC；保留原作品角色與世界。'}`,
        ...HOST_FIELDS.map(key => `${labels[key]}：${String(host[key] || '未指定')}`),
        `AI 可扮演「${host.name}」，但不得代替玩家「${currentPersona.name || '未命名玩家'}」說話、行動或決定心理。`);
    }
    return changes.length ? `${stable}\n\n【本輪人物覆寫】\n${changes.join('\n')}` : stable;
  };

  // prompt-cache.js stores unknown headers in its stable prefix. Move ONLY our final
  // story override to the last user turn so changing personas retains the cached prefix.
  const originalBuildMessages = typeof App.buildMessages === 'function' ? App.buildMessages.bind(App) : null;
  if (originalBuildMessages) App.buildMessages = async function(...args) {
    const messages = await originalBuildMessages(...args);
    const first = messages?.[0];
    if (!first || first.role !== 'system' || typeof first.content !== 'string') return messages;
    const marker = '\n\n【本輪人物覆寫】\n';
    const index = first.content.lastIndexOf(marker);
    if (index < 0) return messages;
    const override = first.content.slice(index + 2);
    first.content = first.content.slice(0, index);
    const last = messages[messages.length - 1];
    if (last?.role === 'user') last.content = `${override}\n\n${String(last.content || '')}`;
    else messages.push({ role: 'user', content: override });
    return messages;
  };

  function readBuilder() {
    return cleanPersona(Object.fromEntries(PLAYER_FIELDS.map(key => [key, document.getElementById(`persona-${key}`)?.value || ''])));
  }
  function fillBuilder(persona) {
    PLAYER_FIELDS.forEach(key => {
      const node = document.getElementById(`persona-${key}`);
      if (!node) return;
      if (key === 'gender' && ![...node.options].some(opt => opt.value === persona[key])) {
        const option = document.createElement('option'); option.value = persona[key] || '未指定'; option.textContent = option.value; node.appendChild(option);
      }
      node.value = persona[key] || (key === 'gender' ? '未指定' : '');
    });
  }
  function presetOptions() {
    return '<option value="">選擇本機人物預設…</option>' + readPresets().map(item => `<option value="${escape(item.id)}">${escape(item.label)} · ${escape(item.persona.name || '未命名')}</option>`).join('');
  }
  function installBuilder() {
    const panel = document.querySelector('.builder-step[data-step-panel="3"]');
    if (!panel) return;
    if (!document.getElementById('persona-age')) {
      const more = document.createElement('div');
      more.className = 'bao-persona-more';
      more.innerHTML = '<div class="form-grid"><label>年齡<input id="persona-age" placeholder="年齡／年齡設定"></label><label>外貌<textarea id="persona-appearance" rows="2" placeholder="外觀、穿著與辨識特徵"></textarea></label></div><label>背景<textarea id="persona-background" rows="2"></textarea></label><label>能力<textarea id="persona-abilities" rows="2"></textarea></label>';
      panel.appendChild(more);
    }
    if (document.getElementById('bao-persona-presets')) return;
    const box = document.createElement('section');
    box.id = 'bao-persona-presets';
    box.className = 'bao-actor-builder';
    box.innerHTML = '<h4>我的人物庫（本機）</h4><p class="note">同一份人物可以套用到不同故事；每個故事獨立保存，修改不會連動其他故事。</p><select aria-label="選擇人物預設">' + presetOptions() + '</select><div class="bao-actor-actions"><button type="button" class="secondary" data-action="apply">套用人物</button><button type="button" class="secondary" data-action="save">將目前人物存為新預設</button><button type="button" class="secondary" data-action="copy">複製所選預設</button><button type="button" class="text-button" data-action="delete">刪除所選預設</button></div>';
    panel.prepend(box);
    const select = box.querySelector('select');
    const refresh = selected => { select.innerHTML = presetOptions(); if (selected) select.value = selected; };
    box.querySelector('[data-action="apply"]').onclick = () => {
      const item = readPresets().find(p => p.id === select.value);
      if (item) fillBuilder(item.persona); else alert('請先選擇人物預設。');
    };
    box.querySelector('[data-action="save"]').onclick = () => { const item = savePreset(readBuilder()); if (item) refresh(item.id); };
    box.querySelector('[data-action="copy"]').onclick = () => {
      const item = readPresets().find(p => p.id === select.value);
      if (!item) return alert('請先選擇要複製的人物。');
      const copy = savePreset(item.persona, `${item.label}（副本）`);
      if (copy) refresh(copy.id);
    };
    box.querySelector('[data-action="delete"]').onclick = () => {
      const item = readPresets().find(p => p.id === select.value);
      if (!item || !confirm(`刪除本機人物預設「${item.label}」？已開始的故事不受影響。`)) return;
      if (writePresets(readPresets().filter(p => p.id !== item.id))) refresh();
    };
  }

  function inputField(key, value, isText = multiline.has(key)) {
    const safe = escape(value);
    return `<label>${escape(labels[key] || key)}${isText ? `<textarea name="${key}" rows="${key === 'system_prompt' || key === 'world' ? 5 : 3}">${safe}</textarea>` : `<input name="${key}" value="${safe}">`}</label>`;
  }
  function open(target = 'player') {
    if (!actors()) return alert('請先進入一個故事。');
    close();
    dialog = document.createElement('div');
    dialog.id = 'bao-actor-backdrop';
    dialog.innerHTML = `<section class="bao-actor-dialog" role="dialog" aria-modal="true" aria-labelledby="bao-actor-title"><header><h2 id="bao-actor-title">角色與世界 · 本故事</h2><button type="button" data-close aria-label="關閉">×</button></header><p class="note">修改只影響這份故事，下一輪開始生效；不會改寫既有對話。玩家仍自行決定自己的言行。</p><label>編輯對象<select id="bao-actor-target"><option value="player">我的人物（玩家 Persona）</option><option value="card">AI 原作品角色／世界</option><option value="host">自訂 AI 託管角色</option></select></label><div id="bao-actor-form"></div><p id="bao-actor-feedback" class="note" role="status"></p><footer><button type="button" class="secondary" data-close>取消</button><button type="button" class="primary" data-apply>套用至本故事</button></footer></section>`;
    document.body.appendChild(dialog);
    const selector = dialog.querySelector('#bao-actor-target');
    selector.value = target;
    selector.onchange = renderDialogForm;
    dialog.querySelectorAll('[data-close]').forEach(button => button.onclick = close);
    dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
    dialog.querySelector('[data-apply]').onclick = applyDialog;
    renderDialogForm();
  }
  function renderDialogForm() {
    if (!dialog) return;
    const kind = dialog.querySelector('#bao-actor-target').value;
    const box = dialog.querySelector('#bao-actor-form');
    dialog.querySelector('#bao-actor-feedback').textContent = '';
    if (kind === 'player') {
      box.innerHTML = `<label>套用人物庫中的預設<select id="bao-actor-preset">${presetOptions()}</select></label><div class="bao-actor-actions"><button type="button" class="secondary" data-load>套用預設到下方</button><button type="button" class="secondary" data-save>另存下方人物為預設</button></div><form class="bao-actor-fields" autocomplete="off">${PLAYER_FIELDS.map(key => inputField(key, App.config.persona?.[key])).join('')}</form>`;
      box.querySelector('[data-load]').onclick = () => {
        const item = readPresets().find(p => p.id === box.querySelector('#bao-actor-preset').value);
        if (!item) return alert('請先選擇人物預設。');
        const form = box.querySelector('form');
        PLAYER_FIELDS.forEach(key => { form.elements.namedItem(key).value = item.persona[key] || ''; });
      };
      box.querySelector('[data-save]').onclick = () => {
        const form = box.querySelector('form');
        const item = savePreset(Object.fromEntries(PLAYER_FIELDS.map(key => [key, form.elements.namedItem(key).value])));
        if (item) { const select = box.querySelector('#bao-actor-preset'); select.innerHTML = presetOptions(); select.value = item.id; }
      };
    } else if (kind === 'card') {
      box.innerHTML = `<p class="note">這裡編輯的是目前故事的角色副本；作者原卡與其他存檔不會改動。完整人物資料請填有效 JSON 物件。</p><form class="bao-actor-fields" autocomplete="off">${CARD_FIELDS.map(key => inputField(key, key === 'profile' ? JSON.stringify(App.activeCharacter.profile || {}, null, 2) : App.activeCharacter[key])).join('')}</form>`;
    } else {
      const host = actors()?.hostedCharacter || {};
      box.innerHTML = `<p class="note">在既有角色卡或世界觀裡新增你自己捏的 AI 人物。玩家 Persona 仍由玩家操作。</p><form class="bao-actor-fields" autocomplete="off"><label>扮演方式<select name="role"><option value="additional">新增為世界 NPC（保留原角色）</option><option value="primary">由自訂人物擔任 AI 主角</option></select></label>${HOST_FIELDS.map(key => inputField(key, host[key])).join('')}</form><button type="button" class="text-button" data-remove-host>移除本故事的託管人物</button>`;
      box.querySelector('[name="role"]').value = host.role || 'additional';
      box.querySelector('[data-remove-host]').onclick = () => { const state = actors(); if (state) { state.hostedCharacter = null; updateStory(); close(); } };
    }
    box.querySelector('form')?.addEventListener('submit', event => { event.preventDefault(); applyDialog(); });
  }
  function applyDialog() {
    if (!dialog) return;
    const kind = dialog.querySelector('#bao-actor-target').value;
    const form = dialog.querySelector('#bao-actor-form form');
    const feedback = dialog.querySelector('#bao-actor-feedback');
    const get = key => String(form.elements.namedItem(key)?.value || '').trim();
    try {
      if (kind === 'player') {
        const persona = cleanPersona(Object.fromEntries(PLAYER_FIELDS.map(key => [key, get(key)])));
        if (!persona.name) throw new Error('玩家人物必須填寫名稱。');
        App.config.persona = persona;
      } else if (kind === 'card') {
        const profile = JSON.parse(get('profile') || '{}');
        if (!profile || Array.isArray(profile) || typeof profile !== 'object') throw new Error('完整人物資料必須是 JSON 物件，例如 {"外貌":"黑髮"}。');
        if (!get('name')) throw new Error('AI 角色名稱不可留空。');
        // Preserve the story's id, author assets and other schema fields.
        const next = clone(App.activeCharacter);
        CARD_FIELDS.forEach(key => { next[key] = key === 'profile' ? profile : get(key); });
        App.activeCharacter = next;
      } else {
        if (!get('name')) throw new Error('請填寫 AI 託管人物名稱。');
        const host = Object.fromEntries(HOST_FIELDS.map(key => [key, get(key)]));
        host.role = get('role') === 'primary' ? 'primary' : 'additional';
        actors().hostedCharacter = host;
      }
      updateStory();
      close();
    } catch (error) { feedback.textContent = error.message || '人物設定未能套用。'; }
  }
  function close() { dialog?.remove(); dialog = null; }
  function installChatEntry() {
    const aside = document.querySelector('#chat-view aside');
    if (!aside || document.getElementById('bao-actor-entry')) return;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'secondary'; button.id = 'bao-actor-entry'; button.textContent = '角色與世界 · 隨時編輯';
    button.onclick = () => open('player');
    aside.querySelector('#save-slot-button')?.before(button);
  }

  if (!document.getElementById('bao-actor-styles')) {
    const style = document.createElement('style'); style.id = 'bao-actor-styles';
    style.textContent = `
      .bao-actor-builder{margin:0 0 18px;padding:14px;border:1px solid #5d6279;border-radius:12px;background:#232634}
      .bao-actor-builder h4{margin:0 0 6px}.bao-actor-builder select{width:100%;max-width:100%;margin:8px 0;padding:10px}
      .bao-actor-actions{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.bao-actor-actions button{min-height:38px;width:auto;flex:1 1 145px}
      .bao-persona-more{display:grid;gap:10px;margin-top:10px}
      #bao-actor-backdrop{position:fixed;inset:0;z-index:10030;display:flex;align-items:center;justify-content:center;overflow:auto;padding:14px;background:rgba(0,0,0,.78)}
      .bao-actor-dialog{box-sizing:border-box;width:min(100%,700px);max-height:calc(100dvh - 28px);overflow:auto;padding:clamp(16px,3vw,26px);border:1px solid #686d81;border-radius:16px;background:#222632;color:#f4f4f8;box-shadow:0 18px 60px #0009}
      .bao-actor-dialog header,.bao-actor-dialog footer{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
      .bao-actor-dialog header h2{margin:0;font-size:21px}.bao-actor-dialog header button{font-size:26px;border:0;background:none;color:inherit;cursor:pointer}
      .bao-actor-dialog label{display:grid;gap:5px;margin:8px 0;font-size:14px}
      .bao-actor-dialog input,.bao-actor-dialog textarea,.bao-actor-dialog select{box-sizing:border-box;width:100%;min-width:0;padding:10px;border:1px solid #6a7184;border-radius:8px;background:#141821;color:#fff;font:inherit}
      .bao-actor-dialog textarea{resize:vertical}.bao-actor-fields{display:grid;gap:6px}.bao-actor-dialog footer button{flex:1 1 150px;min-height:40px}
      #bao-actor-feedback{min-height:1.4em;color:#ffcc93}@media(max-width:700px){.bao-actor-dialog{max-height:calc(100dvh - 16px);padding:14px}.bao-actor-actions button{flex:1 1 100%}}
    `;
    document.head.appendChild(style);
  }
  installChatEntry();
  window.BAOStoryActors = { open, close, actors, readPresets, savePreset, installBuilder, updateLabels };
})();