/* Player-owned persona and AI actor editor. NEVER show or edit author-card fields. */
(() => {
  'use strict';
  if (window.BAOStoryActors || !window.App || !window.Storage) return;

  const KEY = 'bao-lab:persona-presets-v1';
  const PLAYER_FIELDS = ['name', 'gender', 'age', 'identity', 'appearance', 'personality', 'background', 'abilities', 'relationship', 'extra'];
  const ACTOR_FIELDS = ['name', 'gender', 'identity', 'appearance', 'personality', 'background', 'voice', 'extra'];
  const LABELS = {name:'名稱',gender:'性別',age:'年齡',identity:'身分',appearance:'外貌',personality:'個性',background:'背景',abilities:'能力',relationship:'與角色的關係',extra:'補充設定',voice:'說話風格'};
  const MULTI = new Set(['appearance', 'personality', 'background', 'abilities', 'relationship', 'extra', 'voice']);
  const clone = value => Storage.clone(value);
  const esc = value => App.escapeHTML(String(value ?? ''));
  const id = () => globalThis.crypto?.randomUUID?.() || `actor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const trim = (value, limit = 12000) => String(value ?? '').trim().slice(0, limit);
  const clean = (input, fields) => Object.fromEntries(fields.map(key => [key, trim(input?.[key])]));
  const persona = input => clean(input, PLAYER_FIELDS);
  const normalizeActor = input => ({id: trim(input?.id, 100) || id(), ...clean(input, ACTOR_FIELDS), role: input?.role === 'primary' ? 'primary' : 'additional'});
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  let builderActors = [];
  let dialog = null;

  function presets() {
    try {
      const list = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(list) ? list.filter(item => item?.id && item?.persona).slice(0, 100) : [];
    } catch { return []; }
  }
  function storePresets(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 100))); return true; }
    catch { alert('人物預設未能寫入這台裝置，請檢查儲存空間。'); return false; }
  }
  function savePreset(p, proposedName) {
    const chosen = window.prompt('替這份玩家人物預設取名：', trim(proposedName || p.name, 80) || '我的人物');
    if (chosen === null) return null;
    const record = {id:id(), label:trim(chosen,80) || '未命名人物', persona:persona(p), savedAt:new Date().toISOString()};
    return storePresets([record, ...presets()]) ? record : null;
  }
  function presetOptions() {
    return '<option value="">選擇本機玩家人物…</option>' + presets().map(p => `<option value="${esc(p.id)}">${esc(p.label)} · ${esc(p.persona.name)}</option>`).join('');
  }
  function actorList(raw) {
    const list = Array.isArray(raw?.hostedCharacters) ? raw.hostedCharacters : (raw?.hostedCharacter ? [raw.hostedCharacter] : []);
    return list.filter(item => item && typeof item === 'object').map(normalizeActor);
  }
  function actors() {
    const current = window.GameState?.current;
    if (!current || !App.activeCharacter || !App.config?.persona) return null;
    if (!current.storyActors) current.storyActors = {};
    const state = current.storyActors;
    if (!state.basePersona) state.basePersona = persona(App.config.persona);
    if (!Array.isArray(state.hostedCharacters)) state.hostedCharacters = actorList(state);
    return state;
  }
  function addOrUpdate(list, actor) {
    const next = list.filter(item => item.id !== actor.id);
    if (actor.role === 'primary') next.forEach(item => { item.role = 'additional'; });
    next.push(actor);
    return next;
  }
  function updateLabels() {
    const state = actors();
    if (!state) return;
    const primary = state.hostedCharacters.find(item => item.role === 'primary');
    const name = primary?.name || App.activeCharacter.name;
    const player = document.getElementById('chat-persona');
    const title = document.getElementById('chat-title');
    if (player) player.textContent = App.config.persona.name || '未命名玩家';
    if (title) title.textContent = name;
    const heading = document.querySelector('#chat-character-card h3');
    if (heading) heading.textContent = name;
  }
  function persist() {
    const state = actors();
    if (!state) return;
    state.updatedAt = new Date().toISOString();
    GameState.current.config = App.config;
    updateLabels();
    App.saveStory?.(false);
  }

  const start = App.startStory.bind(App);
  App.startStory = function(...args) {
    const pending = builderActors.map(actor => normalizeActor(clone(actor)));
    if (this.activeCharacter) this.activeCharacter = clone(this.activeCharacter);
    const previous = window.GameState?.current;
    const result = start(...args);
    const finish = () => {
      if (window.GameState?.current && GameState.current !== previous) {
        const state = actors();
        if (state) {
          state.hostedCharacters = pending;
          state.hostedCharacter = null;
          persist();
        }
      }
    };
    if (result?.then) return result.then(value => { finish(); return value; });
    finish();
    return result;
  };
  const restore = Storage.restoreStory.bind(Storage);
  Storage.restoreStory = function(save, ...args) {
    const library = Array.isArray(App.characters) ? App.characters.slice() : [];
    const result = restore(save, ...args);
    if (result && save?.character) {
      App.activeCharacter = window.CharacterEngine?.normalize?.(clone(save.character)) || clone(save.character);
      App.characters = library;
    }
    if (result) { actors(); updateLabels(); }
    return result;
  };
  const collect = App.collectConfig.bind(App);
  App.collectConfig = function(...args) {
    const config = collect(...args);
    const additional = Object.fromEntries(['age','appearance','background','abilities'].map(key => [key, document.getElementById(`persona-${key}`)?.value || '']));
    config.persona = persona({...config.persona, ...additional});
    return config;
  };
  const openBuilder = App.openBuilder.bind(App);
  App.openBuilder = function(...args) {
    builderActors = [];
    const result = openBuilder(...args);
    installBuilder();
    refreshBuilderActors();
    return result;
  };
  const renderChat = App.renderChatShell.bind(App);
  App.renderChatShell = function(...args) {
    const result = renderChat(...args);
    installChatEntry();
    updateLabels();
    return result;
  };

  const buildPrompt = App.buildSystemPrompt.bind(App);
  App.buildSystemPrompt = function(...args) {
    const stable = buildPrompt(...args);
    const state = actors();
    if (!state) return stable;
    const changes = [];
    if (!same(persona(App.config.persona), persona(state.basePersona))) {
      changes.push('【目前玩家人物設定】', ...PLAYER_FIELDS.map(key => `${LABELS[key]}：${App.config.persona[key] || '未指定'}`), '玩家的台詞、行動與心理均由玩家自己決定。');
    }
    if (state.hostedCharacters.length) {
      changes.push('【玩家自訂的 AI 扮演人物】');
      const primary = state.hostedCharacters.find(actor => actor.role === 'primary');
      if (primary) changes.push(`目前 AI 的主要互動人物是「${primary.name}」；原作品的角色及世界仍作背景與既有 NPC，不得覆蓋玩家的自訂人物。`);
      for (const actor of state.hostedCharacters) {
        changes.push(`角色：${actor.name}；定位：${actor.role === 'primary' ? '主要 AI 互動人物' : '新增 NPC'}`);
        changes.push(...ACTOR_FIELDS.filter(key => key !== 'name').map(key => `${LABELS[key]}：${actor[key] || '未指定'}`));
      }
      changes.push(`AI 可以演繹上述人物，但不得代替玩家「${App.config.persona.name || '未命名玩家'}」決定言行。`);
    }
    return changes.length ? `${stable}\n\n【本輪人物覆寫】\n${changes.join('\n')}` : stable;
  };
  const buildMessages = typeof App.buildMessages === 'function' ? App.buildMessages.bind(App) : null;
  if (buildMessages) App.buildMessages = async function(...args) {
    const messages = await buildMessages(...args);
    const first = messages?.[0];
    if (!first || first.role !== 'system' || typeof first.content !== 'string') return messages;
    const marker = '\n\n【本輪人物覆寫】\n';
    const index = first.content.lastIndexOf(marker);
    if (index < 0) return messages;
    const override = first.content.slice(index + 2);
    first.content = first.content.slice(0, index);
    const last = messages[messages.length - 1];
    if (last?.role === 'user') last.content = `${override}\n\n${String(last.content || '')}`;
    else messages.push({role:'user', content:override});
    return messages;
  };

  function field(key, value = '') {
    const content = esc(value);
    return `<label>${esc(LABELS[key] || key)}${MULTI.has(key) ? `<textarea name="${key}" rows="3">${content}</textarea>` : `<input name="${key}" value="${content}">`}</label>`;
  }
  const formData = (form, fields) => Object.fromEntries(fields.map(key => [key, form.elements.namedItem(key)?.value || '']));
  function readBuilder() {
    return persona(Object.fromEntries(PLAYER_FIELDS.map(key => [key, document.getElementById(`persona-${key}`)?.value || ''])));
  }
  function fillBuilder(p) {
    PLAYER_FIELDS.forEach(key => {
      const node = document.getElementById(`persona-${key}`);
      if (!node) return;
      if (key === 'gender' && ![...node.options].some(option => option.value === p[key])) {
        const option = document.createElement('option'); option.value = p[key] || '未指定'; option.textContent = option.value; node.appendChild(option);
      }
      node.value = p[key] || (key === 'gender' ? '未指定' : '');
    });
  }
  function refreshBuilderActors() {
    const list = document.getElementById('bao-builder-actor-list');
    if (!list) return;
    list.innerHTML = builderActors.length ? builderActors.map(actor => `<div class="bao-actor-item"><span>${esc(actor.name)} · ${actor.role === 'primary' ? 'AI 主角' : '額外 NPC'}</span><button type="button" data-edit="${esc(actor.id)}">編輯</button><button type="button" data-remove="${esc(actor.id)}">移除</button></div>`).join('') : '<p class="note">目前沒有自訂 AI 人物；可直接使用原作品開始故事。</p>';
    list.querySelectorAll('[data-edit]').forEach(button => button.onclick = () => {
      const actor = builderActors.find(item => item.id === button.dataset.edit);
      if (actor) fillActorForm(document.getElementById('bao-builder-actor-form'), actor);
    });
    list.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => {
      builderActors = builderActors.filter(item => item.id !== button.dataset.remove);
      refreshBuilderActors();
    });
  }
  function fillActorForm(form, actor = {}) {
    form.dataset.actorId = actor.id || '';
    ACTOR_FIELDS.forEach(key => { form.elements.namedItem(key).value = actor[key] || ''; });
    form.elements.namedItem('role').value = actor.role || 'additional';
  }
  function actorForm() {
    return `<form class="bao-actor-fields" id="bao-builder-actor-form" autocomplete="off"><label>角色定位<select name="role"><option value="additional">增加 NPC（保留原作品角色）</option><option value="primary">自訂 AI 主要互動人物</option></select></label>${ACTOR_FIELDS.map(key => field(key)).join('')}<div class="bao-actor-actions"><button type="submit" class="primary">加入／更新 AI 人物</button><button type="button" class="secondary" data-new>清空，捏另一位</button></div></form>`;
  }
  function installBuilder() {
    const panel = document.querySelector('.builder-step[data-step-panel="3"]');
    if (!panel) return;
    if (!document.getElementById('persona-age')) {
      const more = document.createElement('div');
      more.className = 'bao-persona-more';
      more.innerHTML = '<div class="form-grid"><label>年齡<input id="persona-age" placeholder="玩家年齡"></label><label>外貌<textarea id="persona-appearance" rows="2"></textarea></label></div><label>背景<textarea id="persona-background" rows="2"></textarea></label><label>能力<textarea id="persona-abilities" rows="2"></textarea></label>';
      panel.appendChild(more);
    }
    if (!document.getElementById('bao-persona-presets')) {
      const box = document.createElement('section');
      box.id = 'bao-persona-presets'; box.className = 'bao-actor-builder';
      box.innerHTML = `<h4>我的玩家人物庫（本機）</h4><p class="note">套用到不同故事時，各故事的人物資料互不連動。</p><select aria-label="玩家人物預設">${presetOptions()}</select><div class="bao-actor-actions"><button type="button" data-action="apply">套用玩家人物</button><button type="button" data-action="save">儲存目前玩家人物</button><button type="button" data-action="copy">複製預設</button><button type="button" data-action="delete">刪除預設</button></div>`;
      panel.prepend(box);
      const select = box.querySelector('select');
      const refresh = chosen => {select.innerHTML = presetOptions(); if (chosen) select.value = chosen;};
      box.querySelector('[data-action="apply"]').onclick = () => {const item = presets().find(p => p.id === select.value); if (item) fillBuilder(item.persona); else alert('先選擇玩家人物。');};
      box.querySelector('[data-action="save"]').onclick = () => {const item = savePreset(readBuilder()); if (item) refresh(item.id);};
      box.querySelector('[data-action="copy"]').onclick = () => {const item = presets().find(p => p.id === select.value); if (!item) return alert('先選擇預設。'); const copy = savePreset(item.persona, `${item.label}（副本）`); if (copy) refresh(copy.id);};
      box.querySelector('[data-action="delete"]').onclick = () => {const item = presets().find(p => p.id === select.value); if (item && confirm(`刪除本機玩家預設「${item.label}」？`) && storePresets(presets().filter(p => p.id !== item.id))) refresh();};
    }
    if (document.getElementById('bao-builder-actors')) return;
    const section = document.createElement('section');
    section.id = 'bao-builder-actors'; section.className = 'bao-actor-builder';
    section.innerHTML = `<h4>捏一位 AI 人物／補充 NPC（選填）</h4><p class="note">以下只收集你自己新增的角色，不提供作者原始設定的瀏覽或編輯。可新增多位 NPC，或指定一位 AI 主角；設定只進入這份故事。</p><div id="bao-builder-actor-list"></div>${actorForm()}`;
    panel.appendChild(section);
    const form = section.querySelector('form');
    form.onsubmit = event => {
      event.preventDefault();
      const data = formData(form, ACTOR_FIELDS);
      if (!trim(data.name)) return alert('請先為 AI 人物命名。');
      const actor = normalizeActor({...data, id:form.dataset.actorId || id(), role:form.elements.namedItem('role').value});
      builderActors = addOrUpdate(builderActors, actor);
      fillActorForm(form);
      refreshBuilderActors();
    };
    form.querySelector('[data-new]').onclick = () => fillActorForm(form);
    refreshBuilderActors();
  }

  function open(target = 'player') {
    if (!actors()) return alert('請先進入一個故事。');
    close();
    dialog = document.createElement('div');
    dialog.id = 'bao-actor-backdrop';
    dialog.innerHTML = `<section class="bao-actor-dialog" role="dialog" aria-modal="true" aria-labelledby="bao-actor-title"><header><h2 id="bao-actor-title">本故事的人物設定</h2><button type="button" data-close aria-label="關閉">×</button></header><p class="note">僅可修改自己的玩家 Persona，以及自己新增的 AI 人物；不能查看或編輯作者原始角色、世界規則或核心提示。</p><label>編輯對象<select id="bao-actor-target"><option value="player">我的玩家人物</option><option value="host">自己新增的 AI 人物／NPC</option></select></label><div id="bao-actor-form"></div><p id="bao-actor-feedback" class="note" role="status"></p><footer><button type="button" class="secondary" data-close>取消</button><button type="button" class="primary" data-apply>儲存至本故事</button></footer></section>`;
    document.body.appendChild(dialog);
    const selector = dialog.querySelector('#bao-actor-target');
    selector.value = target === 'host' ? 'host' : 'player';
    selector.onchange = renderDialog;
    dialog.querySelectorAll('[data-close]').forEach(button => button.onclick = close);
    dialog.addEventListener('click', event => {if (event.target === dialog) close();});
    dialog.querySelector('[data-apply]').onclick = applyDialog;
    renderDialog();
  }
  function renderDialog() {
    if (!dialog) return;
    const box = dialog.querySelector('#bao-actor-form');
    const state = actors();
    dialog.querySelector('#bao-actor-feedback').textContent = '';
    if (dialog.querySelector('#bao-actor-target').value === 'player') {
      box.innerHTML = `<label>套用本機玩家預設<select id="bao-actor-preset">${presetOptions()}</select></label><div class="bao-actor-actions"><button type="button" data-load>載入預設</button><button type="button" data-save>另存玩家預設</button></div><form class="bao-actor-fields" autocomplete="off">${PLAYER_FIELDS.map(key => field(key, App.config.persona[key])).join('')}</form>`;
      box.querySelector('[data-load]').onclick = () => {const item = presets().find(p => p.id === box.querySelector('#bao-actor-preset').value); if (!item) return alert('先選擇預設。'); PLAYER_FIELDS.forEach(key => {box.querySelector('form').elements.namedItem(key).value = item.persona[key] || '';});};
      box.querySelector('[data-save]').onclick = () => {const item = savePreset(formData(box.querySelector('form'), PLAYER_FIELDS)); if (item) {const select = box.querySelector('#bao-actor-preset'); select.innerHTML = presetOptions(); select.value = item.id;}};
    } else {
      box.innerHTML = `<label>編輯自己新增的角色<select id="bao-actor-existing"><option value="">新增一位 AI 人物</option>${state.hostedCharacters.map(actor => `<option value="${esc(actor.id)}">${esc(actor.name)} · ${actor.role === 'primary' ? 'AI 主角' : 'NPC'}</option>`).join('')}</select></label><form class="bao-actor-fields" autocomplete="off"><label>角色定位<select name="role"><option value="additional">新增 NPC（保留原角色）</option><option value="primary">由自訂角色作為 AI 主要互動人物</option></select></label>${ACTOR_FIELDS.map(key => field(key)).join('')}</form><button type="button" class="secondary" data-remove>移除選取的自訂人物</button>`;
      const select = box.querySelector('#bao-actor-existing');
      select.onchange = () => fillActorForm(box.querySelector('form'), state.hostedCharacters.find(actor => actor.id === select.value));
      box.querySelector('[data-remove]').onclick = () => {if (!select.value) return; state.hostedCharacters = state.hostedCharacters.filter(actor => actor.id !== select.value); state.hostedCharacter = null; persist(); renderDialog();};
    }
    box.querySelector('form')?.addEventListener('submit', event => {event.preventDefault(); applyDialog();});
  }
  function applyDialog() {
    if (!dialog) return;
    const form = dialog.querySelector('#bao-actor-form form');
    const feedback = dialog.querySelector('#bao-actor-feedback');
    if (dialog.querySelector('#bao-actor-target').value === 'player') {
      const p = persona(formData(form, PLAYER_FIELDS));
      if (!p.name) return void (feedback.textContent = '請填寫玩家名稱。');
      App.config.persona = p;
    } else {
      const data = formData(form, ACTOR_FIELDS);
      if (!trim(data.name)) return void (feedback.textContent = '請填寫 AI 人物名稱。');
      const select = dialog.querySelector('#bao-actor-existing');
      const actor = normalizeActor({...data, id:select.value || id(), role:form.elements.namedItem('role').value});
      const state = actors();
      state.hostedCharacters = addOrUpdate(state.hostedCharacters, actor);
      state.hostedCharacter = null;
    }
    persist();
    close();
  }
  function close() {dialog?.remove(); dialog = null;}
  function installChatEntry() {
    const aside = document.querySelector('#chat-view aside');
    if (!aside || document.getElementById('bao-actor-entry')) return;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'secondary'; button.id = 'bao-actor-entry';
    button.textContent = '我的人物／新增 AI 人物';
    button.onclick = () => open('player');
    aside.querySelector('#save-slot-button')?.before(button);
  }
  if (!document.getElementById('bao-actor-styles')) {
    const style = document.createElement('style');
    style.id = 'bao-actor-styles';
    style.textContent = `.bao-actor-builder{margin:16px 0;padding:14px;border:1px solid #5d6279;border-radius:12px;background:#232634}.bao-actor-builder h4{margin:0 0 6px}.bao-actor-builder select{width:100%;max-width:100%;margin:8px 0;padding:10px}.bao-actor-actions{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.bao-actor-actions button{min-height:38px;flex:1 1 145px}.bao-persona-more{display:grid;gap:10px;margin-top:10px}.bao-actor-item{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px;border-bottom:1px solid #555}.bao-actor-item span{flex:1 1 160px}.bao-actor-item button{width:auto}#bao-actor-backdrop{position:fixed;inset:0;z-index:10030;display:flex;align-items:center;justify-content:center;overflow:auto;padding:14px;background:rgba(0,0,0,.78)}.bao-actor-dialog{box-sizing:border-box;width:min(100%,700px);max-height:calc(100dvh - 28px);overflow:auto;padding:clamp(16px,3vw,26px);border:1px solid #686d81;border-radius:16px;background:#222632;color:#f4f4f8;box-shadow:0 18px 60px #0009}.bao-actor-dialog header,.bao-actor-dialog footer{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.bao-actor-dialog header h2{margin:0;font-size:21px}.bao-actor-dialog header button{font-size:26px;border:0;background:none;color:inherit;cursor:pointer}.bao-actor-dialog label{display:grid;gap:5px;margin:8px 0;font-size:14px}.bao-actor-dialog input,.bao-actor-dialog textarea,.bao-actor-dialog select{box-sizing:border-box;width:100%;min-width:0;padding:10px;border:1px solid #6a7184;border-radius:8px;background:#141821;color:#fff;font:inherit}.bao-actor-dialog textarea{resize:vertical}.bao-actor-fields{display:grid;gap:6px}.bao-actor-dialog footer button{flex:1 1 150px;min-height:40px}#bao-actor-feedback{min-height:1.4em;color:#ffcc93}@media(max-width:700px){.bao-actor-dialog{max-height:calc(100dvh - 16px);padding:14px}.bao-actor-actions button{flex:1 1 100%}}`;
    document.head.appendChild(style);
  }
  installChatEntry();
  window.BAOStoryActors = {open, close, actors, readPresets:presets, savePreset, installBuilder, updateLabels};
})();