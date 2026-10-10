/* Player-owned persona and AI actor editor. NEVER show or edit author-card fields. */
(() => {
  'use strict';
  if (window.BAOStoryActors || !window.App || !window.Storage) return;

  const KEY = 'bao-lab:persona-presets-v1';
  const ACTOR_KEY = 'bao-lab:actor-presets-v1';
  const DRAFT_KEY_PREFIX = 'bao-lab:persona-builder-draft-v1:';
  const DRAFT_SAVE_DELAY = 650;
  const ADULT_PACK_SRC = 'js/story-actors-adult-pack.js?v=1';
  const PLAYER_FIELDS = ['name', 'gender', 'age', 'identity', 'appearance', 'personality', 'background', 'abilities', 'relationship', 'extra'];
  const ACTOR_FIELDS = ['name', 'gender', 'identity', 'appearance', 'personality', 'background', 'voice', 'relationship', 'extra'];
  const packCore = window.BAOStoryActorPackCore || null;
  let adultPackPromise = null;
  const LABELS = {name:'名稱',gender:'性別',age:'年齡',identity:'身分',appearance:'外貌',personality:'個性',background:'背景',abilities:'能力',relationship:'與角色的關係',extra:'補充設定',voice:'說話風格'};
  const ACTOR_LABELS = {...LABELS, identity:'本世界身分', personality:'個性／這次怎麼演', relationship:'與玩家／其他人物的關係'};
  const MULTI = new Set(['appearance', 'personality', 'background', 'abilities', 'relationship', 'extra', 'voice']);
  const clone = value => Storage.clone(value);
  const esc = value => App.escapeHTML(String(value ?? ''));
  const id = () => globalThis.crypto?.randomUUID?.() || `actor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const trim = (value, limit = 12000) => String(value ?? '').trim().slice(0, limit);
  const clean = (input, fields) => Object.fromEntries(fields.map(key => [key, trim(input?.[key])]));
  const persona = input => clean(input, PLAYER_FIELDS);
  const adultEnabled = () => Boolean(window.BAOContentPreferences?.isAdultContentEnabled?.());
  const portableMeta = input => {
    if (packCore?.normalizePortableMeta) return packCore.normalizePortableMeta(input);
    const packId = trim(input?.packId, 100);
    if (!packId) return null;
    return {packId, label:trim(input?.label,160), rating:input?.rating === 'adult' ? 'adult' : 'general', core:trim(input?.core,16000), actorMode:input?.actorMode === true};
  };
  const actorTemplate = input => {
    const actor = {...clean(input, ACTOR_FIELDS), role: input?.role === 'primary' ? 'primary' : 'additional'};
    const portable = portableMeta(input?.portable);
    if (portable) actor.portable = portable;
    return actor;
  };
  const normalizeActor = input => ({id: trim(input?.id, 100) || id(), ...actorTemplate(input)});
  const actorAllowed = actor => actor?.portable?.rating !== 'adult' || adultEnabled();
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  let builderActors = [];
  let dialog = null;
  let draftTimer = null;

  const generalPortableCatalog = () => packCore?.sanitizeCatalog?.([...(window.BAOGeneralStoryActorPack?.actors || []), ...(window.BAOThreeRealmsStoryActorPack?.actors || [])]) || [];
  const adultPortableCatalog = () => packCore?.sanitizeCatalog?.(window.BAOAdultStoryActorPack?.actors || []) || [];
  const portableCatalog = () => packCore?.availableCatalog
    ? packCore.availableCatalog(generalPortableCatalog(), adultPortableCatalog(), {adultEnabled: adultEnabled()})
    : generalPortableCatalog();
  const loadAdultPack = () => {
    if (!adultEnabled()) return Promise.resolve([]);
    if (window.BAOAdultStoryActorPack?.actors) return Promise.resolve(adultPortableCatalog());
    if (adultPackPromise) return adultPackPromise;
    adultPackPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${ADULT_PACK_SRC}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve(adultPortableCatalog()), {once:true});
        existing.addEventListener('error', reject, {once:true});
        return;
      }
      const script = document.createElement('script');
      script.src = ADULT_PACK_SRC;
      script.onload = () => resolve(adultPortableCatalog());
      script.onerror = () => {adultPackPromise = null; reject(new Error('成人官方角色包載入失敗。'));};
      document.head.appendChild(script);
    });
    return adultPackPromise;
  };
  const portableOptions = () => {
    const catalog = portableCatalog();
    const groups = [
      ['一般可攜角色', item => item.rating !== 'adult' && !item.id.startsWith('three-realms-archetype-')],
      ['三界原創人物範本', item => item.id.startsWith('three-realms-archetype-')],
      ['成人可攜角色 · 18+', item => item.rating === 'adult']
    ];
    return '<option value="">選擇官方可攜角色…</option>' + groups.map(([label, matches]) => {
      const items = catalog.filter(matches);
      return items.length ? `<optgroup label="${esc(label)}">${items.map(item => `<option value="${esc(item.id)}">${esc(item.label)}${item.rating === 'adult' ? ' · 18+' : ''}</option>`).join('')}</optgroup>` : '';
    }).join('');
  };
  const portablePicker = () => `<section class="bao-portable-actor-picker"><b>官方可攜角色</b><span>把角色帶進目前世界；原作品人物不會被替換。</span><select data-portable-actor-select>${portableOptions()}</select><button type="button" class="secondary" data-portable-actor-apply>帶入這個角色</button></section>`;
  const refreshPortablePickers = () => document.querySelectorAll('[data-portable-actor-select]').forEach(select => {
    const chosen = select.value;
    select.innerHTML = portableOptions();
    if ([...select.options].some(option => option.value === chosen)) select.value = chosen;
  });

  function presets() {
    try {
      const list = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(list) ? list.filter(item => item?.id && item?.persona).slice(0, 100) : [];
    } catch { return []; }
  }
  function storePresets(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 100))); refreshPresetPickers(); return true; }
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
  // Keep the builder and in-story dropdowns in sync with the same local persona library.
  // Rebuilding options must not overwrite an existing valid selection or persona form.
  function refreshPresetPickers() {
    document.querySelectorAll('#bao-persona-presets > select, #bao-actor-preset').forEach(select => {
      const selectedId = select.value;
      select.innerHTML = presetOptions();
      if (selectedId && [...select.options].some(option => option.value === selectedId)) select.value = selectedId;
    });
  }
  const draftCharacterId = () => trim(App.activeCharacter?.id || 'global', 160) || 'global';
  const draftKey = characterId => `${DRAFT_KEY_PREFIX}${encodeURIComponent(trim(characterId, 160) || 'global')}`;
  const hasDraftContent = p => PLAYER_FIELDS.some(key => key === 'gender'
    ? Boolean(trim(p?.[key])) && trim(p?.[key]) !== '未指定'
    : Boolean(trim(p?.[key])));
  function setDraftStatus(message) {
    const node = document.getElementById('bao-persona-draft-status');
    if (node) node.textContent = message || '角色草稿會自動保存在這台裝置。';
  }
  function readBuilderDraft(characterId = draftCharacterId()) {
    try {
      const raw = JSON.parse(localStorage.getItem(draftKey(characterId)) || 'null');
      if (!raw || raw.version !== 1 || raw.characterId !== characterId || !raw.persona) return null;
      return {...raw, persona:persona(raw.persona)};
    } catch { return null; }
  }
  function writeBuilderDraft(p, characterId = draftCharacterId(), {quiet = false} = {}) {
    const cleaned = persona(p);
    if (!hasDraftContent(cleaned)) {
      try { localStorage.removeItem?.(draftKey(characterId)); } catch {}
      if (!quiet) setDraftStatus('角色草稿會自動保存在這台裝置。');
      return null;
    }
    try {
      const record = {version:1, characterId, persona:cleaned, savedAt:new Date().toISOString()};
      localStorage.setItem(draftKey(characterId), JSON.stringify(record));
      if (!quiet) setDraftStatus('草稿已自動保存。');
      return record;
    } catch {
      if (!quiet) setDraftStatus('草稿暫時無法保存，請檢查瀏覽器儲存空間。');
      return null;
    }
  }
  function queueBuilderDraftSave() {
    const characterId = draftCharacterId();
    const snapshot = readBuilder();
    if (draftTimer) window.clearTimeout?.(draftTimer);
    const save = () => {
      draftTimer = null;
      writeBuilderDraft(snapshot, characterId);
    };
    if (window.setTimeout) draftTimer = window.setTimeout(save, DRAFT_SAVE_DELAY);
    else save();
  }
  function clearBuilderDraft(characterId = draftCharacterId(), {resetForm = false, status = true} = {}) {
    if (draftTimer) window.clearTimeout?.(draftTimer);
    draftTimer = null;
    try { localStorage.removeItem?.(draftKey(characterId)); } catch {}
    if (resetForm) fillBuilder({gender:'未指定'});
    if (status) setDraftStatus(resetForm ? '已清除未完成草稿，可以重新填寫。' : '未完成草稿已清除。');
  }
  function restoreBuilderDraft() {
    const draft = readBuilderDraft();
    if (!draft) {
      setDraftStatus('角色草稿會自動保存在這台裝置。');
      return false;
    }
    fillBuilder(draft.persona);
    setDraftStatus('已恢復上次未完成的玩家資料。');
    return true;
  }
  function bindBuilderDraft() {
    const panel = document.querySelector('.builder-step[data-step-panel="3"]');
    if (!panel || panel.dataset.personaDraftBound === '1') return;
    panel.dataset.personaDraftBound = '1';
    const fieldIds = new Set(PLAYER_FIELDS.map(key => `persona-${key}`));
    const handle = event => {
      if (fieldIds.has(event.target?.id)) queueBuilderDraftSave();
    };
    panel.addEventListener('input', handle);
    panel.addEventListener('change', handle);
  }
  function actorPresets() {
    try {
      const list = JSON.parse(localStorage.getItem(ACTOR_KEY) || '[]');
      return Array.isArray(list)
        ? list.filter(item => item?.id && item?.actor).map(item => ({...item, actor:actorTemplate(item.actor)})).slice(0, 100)
        : [];
    } catch { return []; }
  }
  function storeActorPresets(list) {
    try { localStorage.setItem(ACTOR_KEY, JSON.stringify(list.slice(0, 100))); return true; }
    catch { alert('AI 人物庫未能寫入這台裝置，請檢查儲存空間。'); return false; }
  }
  function saveActorPreset(actor, proposedName) {
    const cleanActor = actorTemplate(actor);
    if (!trim(cleanActor.name)) { alert('請先為 AI 人物命名。'); return null; }
    const chosen = window.prompt('替這份 AI 人物取一個人物庫名稱：', trim(proposedName || cleanActor.name, 80) || '我的 AI 人物');
    if (chosen === null) return null;
    const record = {
      id:id(),
      label:trim(chosen, 80) || cleanActor.name || '未命名人物',
      actor:cleanActor,
      savedAt:new Date().toISOString()
    };
    if (!storeActorPresets([record, ...actorPresets()])) return null;
    refreshActorPresetPickers();
    return record;
  }
  function saveVisibleNpcPreset(input = {}) {
    const name = trim(input?.name, 160);
    const visibleRole = trim(input?.role, 240);
    if (!name) return {ok:false, created:false, reason:'missing-name'};
    const identity = visibleRole && visibleRole !== 'NPC' ? visibleRole : '';
    const existing = actorPresets().find(item => trim(item?.actor?.name, 160) === name && trim(item?.actor?.identity, 240) === identity);
    if (existing) return {ok:true, created:false, record:existing};
    const record = {
      id:id(),
      label:name,
      actor:actorTemplate({name, identity, role:'additional'}),
      source:'story-roster-visible-v1',
      savedAt:new Date().toISOString()
    };
    if (!storeActorPresets([record, ...actorPresets()])) return {ok:false, created:false, reason:'storage'};
    refreshActorPresetPickers();
    return {ok:true, created:true, record};
  }
  function actorPresetOptions() {
    return '<option value="">選擇我的 AI 人物…</option>' + actorPresets().map(item => `<option value="${esc(item.id)}">${esc(item.label)} · ${esc(item.actor.name)}</option>`).join('');
  }
  function refreshActorPresetPickers() {
    document.querySelectorAll('[data-actor-preset-select]').forEach(select => {
      const chosen = select.value;
      select.innerHTML = actorPresetOptions();
      if ([...select.options].some(option => option.value === chosen)) select.value = chosen;
    });
  }
  function actorPresetPicker() {
    return `<section class="bao-local-actor-picker"><b>我的 AI 人物庫（本機）</b><span>先捏好人物，再帶進不同故事；加入後是故事自己的副本，不會互相改動。</span><select data-actor-preset-select>${actorPresetOptions()}</select><div class="bao-actor-actions"><button type="button" class="secondary" data-actor-preset-apply>帶入人物設定</button><button type="button" class="secondary" data-actor-preset-save>存到我的人物庫</button></div></section>`;
  }
  function bindActorPresetPicker(root, form) {
    const select = root.querySelector('[data-actor-preset-select]');
    const apply = root.querySelector('[data-actor-preset-apply]');
    const save = root.querySelector('[data-actor-preset-save]');
    if (apply && select && form) apply.onclick = () => {
      const item = actorPresets().find(entry => entry.id === select.value);
      if (!item) return alert('先選擇我的 AI 人物。');
      fillActorForm(form, {...clone(item.actor), id:''});
      form.elements.namedItem('name')?.focus();
    };
    if (save && form) save.onclick = () => {
      const data = formData(form, ACTOR_FIELDS);
      const role = form.elements.namedItem('role')?.value || 'additional';
      saveActorPreset({...data, role, portable:form._portableMeta});
    };
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
    const primary = state.hostedCharacters.filter(actorAllowed).find(item => item.role === 'primary');
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
    const draftOwnerId = draftCharacterId();
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
          clearBuilderDraft(draftOwnerId, {status:false});
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
    bindBuilderDraft();
    restoreBuilderDraft();
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
      changes.push('【玩家角色｜controlled_by=user】', ...PLAYER_FIELDS.map(key => `${LABELS[key]}：${App.config.persona[key] || '未指定'}`), '此人物由玩家控制；AI 不得替玩家決定台詞、心理、選擇或行動。');
    }
    const activeHosted = state.hostedCharacters.filter(actorAllowed);
    if (activeHosted.length) {
      changes.push('【本故事 AI 人物｜玩家新增／官方可攜角色｜controlled_by=assistant】');
      const primary = activeHosted.find(actor => actor.role === 'primary');
      if (primary) changes.push(`目前 AI 的主要互動人物是「${primary.name}」；原作品角色、世界與既有 NPC 仍然存在，不得被自訂人物或可攜角色覆蓋。`);
      for (const actor of activeHosted) {
        const portablePrompt = packCore?.portablePrompt?.(actor);
        if (portablePrompt) changes.push(portablePrompt);
        changes.push(`角色：${actor.name}；類型：${actor.role === 'primary' ? 'AI 主角色' : 'NPC'}；controlled_by=assistant`);
        changes.push(...ACTOR_FIELDS.filter(key => key !== 'name').map(key => `${ACTOR_LABELS[key]}：${actor[key] || '未指定'}`));
      }
      changes.push('上述 AI 人物可以互相互動，也可以與原作品 NPC 建立自己的關係、合作、競爭、衝突或離場生活；不要讓所有人物只圍繞玩家。');
      changes.push(`AI 可以演繹上述 controlled_by=assistant 的人物，但不得代替玩家「${App.config.persona.name || '未命名玩家'}」（controlled_by=user）決定言行。`);
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
  function actorField(key, value = '') {
    const content = esc(value);
    return `<label>${esc(ACTOR_LABELS[key] || key)}${MULTI.has(key) ? `<textarea name="${key}" rows="3">${content}</textarea>` : `<input name="${key}" value="${content}">`}</label>`;
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
    const visible = builderActors.filter(actorAllowed);
    const pausedCount = builderActors.length - visible.length;
    const cards = visible.map(actor => `<div class="bao-actor-item"><span>${esc(actor.name)} · ${actor.role === 'primary' ? 'AI 主角' : '額外 NPC'}${actor.portable?.packId ? ' · 官方可攜' : ''}</span><button type="button" data-edit="${esc(actor.id)}">編輯</button><button type="button" data-remove="${esc(actor.id)}">移除</button></div>`).join('');
    const paused = pausedCount ? `<p class="note">有 ${pausedCount} 位成人官方角色因成人內容已關閉而暫停；重新開啟後會恢復，資料沒有刪除。</p>` : '';
    list.innerHTML = cards || paused || '<p class="note">目前沒有額外 AI 人物；可直接使用原作品開始故事。</p>';
    if (cards && paused) list.insertAdjacentHTML('beforeend', paused);
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
    form._portableMeta = portableMeta(actor.portable);
    ACTOR_FIELDS.forEach(key => { const node = form.elements.namedItem(key); if (node) node.value = actor[key] || ''; });
    form.elements.namedItem('role').value = actor.role || 'additional';
  }
  function applyPortableToForm(form, packId) {
    const pack = portableCatalog().find(item => item.id === packId);
    if (!pack || !packCore?.instantiate) return false;
    const actor = packCore.instantiate(pack, {role:form.elements.namedItem('role')?.value || 'additional'}, {id:id()});
    if (!actor) return false;
    fillActorForm(form, actor);
    form.elements.namedItem('identity')?.focus();
    return true;
  }
  function bindPortablePicker(root, form) {
    const select = root.querySelector('[data-portable-actor-select]');
    const button = root.querySelector('[data-portable-actor-apply]');
    if (!select || !button || !form) return;
    button.onclick = async () => {
      if (adultEnabled()) {
        try { await loadAdultPack(); refreshPortablePickers(); }
        catch (error) { console.warn('YoruBay adult story actor pack load failed:', error); }
      }
      if (!select.value) return alert('先選擇一位官方可攜角色。');
      if (!applyPortableToForm(form, select.value)) return alert('這個官方角色目前無法帶入。');
    };
  }
  function actorForm() {
    return `<form class="bao-actor-fields" id="bao-builder-actor-form" autocomplete="off"><p class="note">這裡新增的是由 AI 演繹的人物。你可以自己捏一位，也可以從官方可攜角色帶入後，再決定他／她在這個世界的身份、與玩家關係和這次怎麼演。</p><label>角色定位<select name="role"><option value="additional">增加 NPC（由 AI 演繹；保留原作品角色）</option><option value="primary">自訂 AI 主要互動人物（由 AI 演繹）</option></select></label>${ACTOR_FIELDS.map(key => actorField(key)).join('')}<div class="bao-actor-actions"><button type="submit" class="primary">加入／更新 AI 人物</button><button type="button" class="secondary" data-new>清空，捏另一位</button></div></form>`;
  }
  const librarySnippet = value => esc(trim(value, 110));
  function libraryCard(mode, record) {
    if (mode === 'actor') {
      const actor = record.actor || {};
      const meta = [actor.gender, actor.identity, actor.role === 'primary' ? 'AI 主角' : 'NPC'].filter(Boolean).join(' · ');
      const detail = actor.personality || actor.background || actor.relationship || '尚未填寫更多設定';
      return `<article class="bao-library-card"><div><b>${esc(record.label || actor.name || '未命名 AI 人物')}</b><span>${esc(actor.name || '未命名')} ${meta ? '· ' + esc(meta) : ''}</span><small>${librarySnippet(detail)}</small></div><div class="bao-library-card-actions"><button type="button" class="secondary" data-library-edit="${esc(record.id)}">編輯</button><button type="button" class="secondary" data-library-copy="${esc(record.id)}">複製</button><button type="button" class="secondary" data-library-delete="${esc(record.id)}">刪除</button></div></article>`;
    }
    const p = record.persona || {};
    const meta = [p.gender, p.identity].filter(Boolean).join(' · ');
    const detail = p.personality || p.background || p.relationship || '尚未填寫更多設定';
    return `<article class="bao-library-card"><div><b>${esc(record.label || p.name || '未命名玩家角色')}</b><span>${esc(p.name || '未命名')} ${meta ? '· ' + esc(meta) : ''}</span><small>${librarySnippet(detail)}</small></div><div class="bao-library-card-actions"><button type="button" class="secondary" data-library-edit="${esc(record.id)}">編輯</button><button type="button" class="secondary" data-library-copy="${esc(record.id)}">複製</button><button type="button" class="secondary" data-library-delete="${esc(record.id)}">刪除</button></div></article>`;
  }
  function openLibrary(mode = 'player') {
    close();
    dialog = document.createElement('div');
    dialog.id = 'bao-actor-backdrop';
    dialog.innerHTML = `<section class="bao-actor-dialog bao-library-dialog" role="dialog" aria-modal="true" aria-labelledby="bao-library-title"><header><div><h2 id="bao-library-title">我的人物庫</h2><p class="note">人物保存在這台裝置。先在這裡捏好，開始故事前或故事進行中都能帶入。</p></div><button type="button" data-close aria-label="關閉">×</button></header><nav class="bao-library-tabs" aria-label="人物庫分類"><button type="button" data-library-mode="player">我的玩家角色</button><button type="button" data-library-mode="actor">我的 AI 人物 / NPC</button></nav><div id="bao-persona-library-body"></div></section>`;
    document.body.appendChild(dialog);
    dialog.querySelectorAll('[data-close]').forEach(button => button.onclick = close);
    dialog.addEventListener('click', event => {if (event.target === dialog) close();});
    dialog.querySelectorAll('[data-library-mode]').forEach(button => button.onclick = () => renderLibrary(button.dataset.libraryMode));
    renderLibrary(mode === 'actor' ? 'actor' : 'player');
  }
  function renderLibrary(mode = 'player') {
    if (!dialog) return;
    const body = dialog.querySelector('#bao-persona-library-body');
    if (!body) return;
    dialog.querySelectorAll('[data-library-mode]').forEach(button => button.classList.toggle('active', button.dataset.libraryMode === mode));
    const items = mode === 'actor' ? actorPresets() : presets();
    const empty = mode === 'actor' ? '還沒有保存 AI 人物。你可以先在這裡捏好 NPC，再帶進任何故事。' : '還沒有保存玩家角色。你可以先建立常用 Persona，之後直接套用。';
    body.innerHTML = `<div class="bao-library-toolbar"><button type="button" class="primary" data-library-new>＋ ${mode === 'actor' ? '新增 AI 人物 / NPC' : '新增玩家角色'}</button><span>${items.length} 個本機人物</span></div><div class="bao-library-list">${items.length ? items.map(item => libraryCard(mode, item)).join('') : `<p class="note">${empty}</p>`}</div>`;
    body.querySelector('[data-library-new]')?.addEventListener('click', () => renderLibraryEditor(mode));
    body.querySelectorAll('[data-library-edit]').forEach(button => button.onclick = () => renderLibraryEditor(mode, button.dataset.libraryEdit));
    body.querySelectorAll('[data-library-copy]').forEach(button => button.onclick = () => {
      const now = new Date().toISOString();
      if (mode === 'actor') {
        const item = actorPresets().find(entry => entry.id === button.dataset.libraryCopy);
        if (!item) return;
        const copy = {id:id(), label:`${item.label || item.actor.name}（副本）`, actor:actorTemplate(item.actor), savedAt:now};
        if (storeActorPresets([copy, ...actorPresets()])) { refreshActorPresetPickers(); renderLibrary(mode); }
      } else {
        const item = presets().find(entry => entry.id === button.dataset.libraryCopy);
        if (!item) return;
        const copy = {id:id(), label:`${item.label || item.persona.name}（副本）`, persona:persona(item.persona), savedAt:now};
        if (storePresets([copy, ...presets()])) renderLibrary(mode);
      }
    });
    body.querySelectorAll('[data-library-delete]').forEach(button => button.onclick = () => {
      if (mode === 'actor') {
        const item = actorPresets().find(entry => entry.id === button.dataset.libraryDelete);
        if (!item || !confirm(`刪除 AI 人物「${item.label || item.actor.name}」？只會刪除人物庫模板，不影響已加入的故事。`)) return;
        if (storeActorPresets(actorPresets().filter(entry => entry.id !== item.id))) { refreshActorPresetPickers(); renderLibrary(mode); }
      } else {
        const item = presets().find(entry => entry.id === button.dataset.libraryDelete);
        if (!item || !confirm(`刪除玩家角色「${item.label || item.persona.name}」？只會刪除人物庫模板，不影響既有故事。`)) return;
        if (storePresets(presets().filter(entry => entry.id !== item.id))) renderLibrary(mode);
      }
    });
  }
  function renderLibraryEditor(mode, recordId = '') {
    if (!dialog) return;
    const body = dialog.querySelector('#bao-persona-library-body');
    if (!body) return;
    const record = mode === 'actor'
      ? actorPresets().find(item => item.id === recordId)
      : presets().find(item => item.id === recordId);
    const label = record?.label || '';
    const values = mode === 'actor' ? (record?.actor || {}) : (record?.persona || {});
    const fields = mode === 'actor'
      ? `<label>預設角色定位<select name="role"><option value="additional" ${values.role !== 'primary' ? 'selected' : ''}>NPC／額外人物</option><option value="primary" ${values.role === 'primary' ? 'selected' : ''}>AI 主要互動人物</option></select></label>${ACTOR_FIELDS.map(key => actorField(key, values[key])).join('')}`
      : PLAYER_FIELDS.map(key => field(key, values[key])).join('');
    body.innerHTML = `<form class="bao-actor-fields bao-library-editor" autocomplete="off"><label>人物庫名稱<input name="libraryLabel" maxlength="80" value="${esc(label)}" placeholder="例如：常用的我、青梅竹馬"></label>${fields}<div class="bao-actor-actions"><button type="submit" class="primary">儲存到我的人物庫</button><button type="button" class="secondary" data-library-cancel>取消</button></div></form>`;
    const form = body.querySelector('form');
    form.querySelector('[data-library-cancel]').onclick = () => renderLibrary(mode);
    form.onsubmit = event => {
      event.preventDefault();
      const now = new Date().toISOString();
      const libraryLabel = trim(form.elements.namedItem('libraryLabel')?.value, 80);
      if (mode === 'actor') {
        const data = formData(form, ACTOR_FIELDS);
        if (!trim(data.name)) return alert('請先為 AI 人物命名。');
        const actor = actorTemplate({...data, role:form.elements.namedItem('role')?.value || 'additional', portable:record?.actor?.portable});
        const next = {id:record?.id || id(), label:libraryLabel || actor.name, actor, savedAt:record?.savedAt || now, updatedAt:now};
        if (!storeActorPresets([next, ...actorPresets().filter(item => item.id !== next.id)])) return;
        refreshActorPresetPickers();
      } else {
        const p = persona(formData(form, PLAYER_FIELDS));
        if (!trim(p.name)) return alert('請先填寫玩家名稱。');
        const next = {id:record?.id || id(), label:libraryLabel || p.name, persona:p, savedAt:record?.savedAt || now, updatedAt:now};
        if (!storePresets([next, ...presets().filter(item => item.id !== next.id)])) return;
      }
      renderLibrary(mode);
    };
    form.elements.namedItem(mode === 'actor' ? 'name' : 'name')?.focus();
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
      box.innerHTML = `<h4>我的玩家人物庫（本機）</h4><p class="note">套用到不同故事時，各故事的人物資料互不連動。</p><p class="note" id="bao-persona-draft-status" aria-live="polite">角色草稿會自動保存在這台裝置。</p><select aria-label="玩家人物預設">${presetOptions()}</select><div class="bao-actor-actions"><button type="button" data-action="apply">套用玩家人物</button><button type="button" data-action="save">儲存目前玩家人物</button><button type="button" data-action="library">管理我的人物庫</button><button type="button" data-action="copy">複製預設</button><button type="button" data-action="delete">刪除預設</button><button type="button" data-action="clear-draft">重新填寫</button></div>`;
      panel.prepend(box);
      const select = box.querySelector('select');
      const refresh = chosen => {select.innerHTML = presetOptions(); if (chosen) select.value = chosen;};
      box.querySelector('[data-action="apply"]').onclick = () => {const item = presets().find(p => p.id === select.value); if (item) {fillBuilder(item.persona); queueBuilderDraftSave();} else alert('先選擇玩家人物。');};
      box.querySelector('[data-action="save"]').onclick = () => {const item = savePreset(readBuilder()); if (item) refresh(item.id);};
      box.querySelector('[data-action="library"]').onclick = () => openLibrary('player');
      box.querySelector('[data-action="copy"]').onclick = () => {const item = presets().find(p => p.id === select.value); if (!item) return alert('先選擇預設。'); const copy = savePreset(item.persona, `${item.label}（副本）`); if (copy) refresh(copy.id);};
      box.querySelector('[data-action="delete"]').onclick = () => {const item = presets().find(p => p.id === select.value); if (item && confirm(`刪除本機玩家預設「${item.label}」？`) && storePresets(presets().filter(p => p.id !== item.id))) refresh();};
      box.querySelector('[data-action="clear-draft"]').onclick = () => {if (confirm('確定清除目前尚未完成的玩家資料並重新填寫？本機人物預設不會被刪除。')) clearBuilderDraft(draftCharacterId(), {resetForm:true});};
    }
    // The builder may be reused across stories; always reload presets on entry.
    refreshPresetPickers();
    if (document.getElementById('bao-builder-actors')) return;
    const section = document.createElement('section');
    section.id = 'bao-builder-actors'; section.className = 'bao-actor-builder';
    section.innerHTML = `<h4>加入 AI 人物／補充 NPC（選填）</h4><p class="note">可以自己捏人物、從我的人物庫帶入，或使用官方可攜角色。帶入後會成為這個故事自己的副本。</p>${actorPresetPicker()}${portablePicker()}<div id="bao-builder-actor-list"></div>${actorForm()}`;
    panel.appendChild(section);
    const form = section.querySelector('form');
    form.onsubmit = event => {
      event.preventDefault();
      const data = formData(form, ACTOR_FIELDS);
      if (!trim(data.name)) return alert('請先為 AI 人物命名。');
      const actor = normalizeActor({...data, id:form.dataset.actorId || id(), role:form.elements.namedItem('role').value, portable:form._portableMeta});
      builderActors = addOrUpdate(builderActors, actor);
      fillActorForm(form);
      refreshBuilderActors();
    };
    form.querySelector('[data-new]').onclick = () => fillActorForm(form);
    bindActorPresetPicker(section, form);
    bindPortablePicker(section, form);
    refreshBuilderActors();
  }

  function open(target = 'player') {
    if (!actors()) return alert('請先進入一個故事。');
    close();
    dialog = document.createElement('div');
    dialog.id = 'bao-actor-backdrop';
    dialog.innerHTML = `<section class="bao-actor-dialog" role="dialog" aria-modal="true" aria-labelledby="bao-actor-title"><header><h2 id="bao-actor-title">本故事的人物設定</h2><div class="bao-actor-head-actions"><button type="button" class="bao-actor-help" data-actor-help aria-label="人物設定說明" aria-expanded="false" aria-controls="bao-actor-intro">?</button><button type="button" data-close aria-label="關閉">×</button></div></header><p class="note bao-actor-intro" id="bao-actor-intro">「我的玩家人物」永遠由玩家自己控制；「AI 人物／NPC」才由 AI 演繹。這裡可以管理自己新增的人物與官方可攜角色，但不會開放作者原始角色、世界規則或核心提示給玩家編輯。</p><label class="bao-actor-target-label">編輯對象<select id="bao-actor-target"><option value="player">我的玩家人物</option><option value="host">AI 人物／NPC／官方可攜角色</option></select></label><div id="bao-actor-form"></div><p id="bao-actor-feedback" class="note" role="status"></p><footer><button type="button" class="secondary" data-close>取消</button><button type="button" class="secondary" data-add-more hidden>儲存並新增下一位</button><button type="button" class="primary" data-apply>儲存至本故事</button></footer></section>`;
    document.body.appendChild(dialog);
    const selector = dialog.querySelector('#bao-actor-target');
    selector.value = target === 'host' ? 'host' : 'player';
    selector.onchange = renderDialog;
    dialog.querySelectorAll('[data-close]').forEach(button => button.onclick = close);
    dialog.querySelector('[data-actor-help]')?.addEventListener('click', event => {
      const panel = event.currentTarget.closest('.bao-actor-dialog');
      const open = !panel?.classList.contains('bao-actor-help-open');
      panel?.classList.toggle('bao-actor-help-open', open);
      event.currentTarget.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    dialog.addEventListener('click', event => {if (event.target === dialog) close();});
    dialog.querySelector('[data-add-more]').onclick = () => applyDialog(true);
    dialog.querySelector('[data-apply]').onclick = () => applyDialog(false);
    renderDialog();
  }
  function renderDialog() {
    if (!dialog) return;
    const box = dialog.querySelector('#bao-actor-form');
    const state = actors();
    dialog.querySelector('#bao-actor-feedback').textContent = '';
    const target = dialog.querySelector('#bao-actor-target').value;
    const addMore = dialog.querySelector('[data-add-more]');
    const apply = dialog.querySelector('[data-apply]');
    if (addMore) addMore.hidden = target !== 'host';
    if (apply) apply.textContent = target === 'host' ? '儲存並返回故事' : '儲存至本故事';
    if (target === 'player') {
      box.innerHTML = `<p class="note">這是你自己扮演的玩家角色。AI 不會因為此人物出現在設定中，就取得你的台詞、心理、選擇或行動控制權。</p><label>套用本機玩家預設<select id="bao-actor-preset">${presetOptions()}</select></label><div class="bao-actor-actions"><button type="button" data-load>載入預設</button><button type="button" data-save>另存玩家預設</button></div><form class="bao-actor-fields" autocomplete="off">${PLAYER_FIELDS.map(key => field(key, App.config.persona[key])).join('')}</form>`;
      box.querySelector('[data-load]').onclick = () => {const item = presets().find(p => p.id === box.querySelector('#bao-actor-preset').value); if (!item) return alert('先選擇預設。'); PLAYER_FIELDS.forEach(key => {box.querySelector('form').elements.namedItem(key).value = item.persona[key] || '';});};
      box.querySelector('[data-save]').onclick = () => {const item = savePreset(formData(box.querySelector('form'), PLAYER_FIELDS)); if (item) {const select = box.querySelector('#bao-actor-preset'); select.innerHTML = presetOptions(); select.value = item.id;}};
    } else {
      const visibleActors = state.hostedCharacters.filter(actorAllowed);
      box.innerHTML = `<p class="note">這裡新增的是 AI 人物／NPC，由 AI 演繹。可以直接從「我的 AI 人物庫」帶入已捏好的人物，再依這個世界調整身份與關係。</p>${actorPresetPicker()}${portablePicker()}<label>編輯已加入的角色<select id="bao-actor-existing"><option value="">新增一位 AI 人物</option>${visibleActors.map(actor => `<option value="${esc(actor.id)}">${esc(actor.name)} · ${actor.role === 'primary' ? 'AI 主角' : 'NPC'}${actor.portable?.packId ? ' · 官方可攜' : ''}</option>`).join('')}</select></label><form class="bao-actor-fields" autocomplete="off"><label>角色定位<select name="role"><option value="additional">新增 NPC（由 AI 演繹；保留原角色）</option><option value="primary">由自訂角色作為 AI 主要互動人物</option></select></label>${ACTOR_FIELDS.map(key => actorField(key)).join('')}</form><div class="bao-actor-actions"><button type="button" class="secondary" data-open-roster>NPC 名冊／場景參與者</button><button type="button" class="secondary" data-remove>移除選取的自訂人物</button></div>`;
      const select = box.querySelector('#bao-actor-existing');
      select.onchange = () => fillActorForm(box.querySelector('form'), state.hostedCharacters.find(actor => actor.id === select.value));
      bindActorPresetPicker(box, box.querySelector('form'));
      bindPortablePicker(box, box.querySelector('form'));
      box.querySelector('[data-open-roster]').onclick = () => {
        if (!window.BAOCharacterStatusUI?.openNpcRoster) return alert('NPC 名冊工具仍在載入，請稍後再試。');
        close();
        window.BAOCharacterStatusUI.openNpcRoster();
      };
      box.querySelector('[data-remove]').onclick = () => {if (!select.value) return; state.hostedCharacters = state.hostedCharacters.filter(actor => actor.id !== select.value); state.hostedCharacter = null; persist(); renderDialog();};
    }
    box.querySelector('form')?.addEventListener('submit', event => {event.preventDefault(); applyDialog(target === 'host');});
  }
  function applyDialog(keepOpen = false) {
    if (!dialog) return;
    const form = dialog.querySelector('#bao-actor-form form');
    const feedback = dialog.querySelector('#bao-actor-feedback');
    const target = dialog.querySelector('#bao-actor-target').value;
    if (target === 'player') {
      const p = persona(formData(form, PLAYER_FIELDS));
      if (!p.name) return void (feedback.textContent = '請填寫玩家名稱。');
      App.config.persona = p;
      persist();
      close();
      return;
    }

    const data = formData(form, ACTOR_FIELDS);
    const hasDraft = ACTOR_FIELDS.some(key => trim(data[key])) || Boolean(form._portableMeta);
    if (!trim(data.name)) {
      if (!keepOpen && !hasDraft) {
        close();
        return;
      }
      feedback.textContent = '請填寫 AI 人物名稱。';
      return;
    }

    const select = dialog.querySelector('#bao-actor-existing');
    const state = actors();
    const existing = state.hostedCharacters.find(item => item.id === select.value);
    const actor = normalizeActor({...data, id:select.value || form.dataset.actorId || id(), role:form.elements.namedItem('role').value, portable:form._portableMeta || existing?.portable});
    state.hostedCharacters = addOrUpdate(state.hostedCharacters, actor);
    state.hostedCharacter = null;
    persist();

    if (!keepOpen) {
      close();
      return;
    }

    const savedName = actor.name;
    renderDialog();
    if (!dialog) return;
    const nextForm = dialog.querySelector('#bao-actor-form form');
    const nextSelect = dialog.querySelector('#bao-actor-existing');
    if (nextSelect) nextSelect.value = '';
    if (nextForm) {
      fillActorForm(nextForm);
      nextForm.elements.namedItem('name')?.focus();
    }
    dialog.querySelector('#bao-actor-feedback').textContent = `已儲存「${savedName}」。可以繼續新增下一位 AI 人物。`;
  }
  function close() {dialog?.remove(); dialog = null;}
  function installChatEntry() {
    const aside = document.querySelector('#chat-view aside');
    if (!aside || document.getElementById('bao-actor-entry')) return;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'secondary'; button.id = 'bao-actor-entry';
    button.textContent = '我的人物／加入 AI 人物';
    button.onclick = () => open('player');
    aside.querySelector('#save-slot-button')?.before(button);
  }
  if (!document.getElementById('bao-actor-styles')) {
    const style = document.createElement('style');
    style.id = 'bao-actor-styles';
    style.textContent = `.bao-portable-actor-picker,.bao-local-actor-picker{display:grid;gap:7px;margin:10px 0 14px;padding:12px;border:1px solid #6a6074;border-radius:11px;background:#282432}.bao-portable-actor-picker b,.bao-local-actor-picker b{color:#eee6f1}.bao-portable-actor-picker span,.bao-local-actor-picker span{color:#aaa3b0;font-size:12px;line-height:1.5}.bao-portable-actor-picker select,.bao-local-actor-picker select{width:100%;padding:9px}.bao-portable-actor-picker button,.bao-local-actor-picker button{min-height:38px}.bao-actor-builder{margin:16px 0;padding:14px;border:1px solid #5d6279;border-radius:12px;background:#232634}.bao-actor-builder h4{margin:0 0 6px}.bao-actor-builder select{width:100%;max-width:100%;margin:8px 0;padding:10px}.bao-actor-actions{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.bao-actor-actions button{min-height:38px;flex:1 1 145px}.bao-persona-more{display:grid;gap:10px;margin-top:10px}.bao-actor-item{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px;border-bottom:1px solid #555}.bao-actor-item span{flex:1 1 160px}.bao-actor-item button{width:auto}#bao-actor-backdrop{position:fixed;inset:0;z-index:10030;display:flex;align-items:center;justify-content:center;overflow:auto;padding:14px;background:rgba(0,0,0,.78)}.bao-actor-dialog{box-sizing:border-box;width:min(100%,700px);max-height:calc(100dvh - 28px);overflow:auto;padding:clamp(16px,3vw,26px);border:1px solid #686d81;border-radius:16px;background:#222632;color:#f4f4f8;box-shadow:0 18px 60px #0009}.bao-actor-dialog header{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.bao-actor-dialog footer{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;align-items:stretch}.bao-actor-dialog header h2{margin:0;font-size:21px}.bao-actor-head-actions{display:flex;align-items:center;gap:8px}.bao-actor-help{display:none}.bao-actor-dialog header button{font-size:26px;border:0;background:none;color:inherit;cursor:pointer}.bao-actor-dialog label{display:grid;gap:5px;margin:8px 0;font-size:14px}.bao-actor-dialog input,.bao-actor-dialog textarea,.bao-actor-dialog select{box-sizing:border-box;width:100%;min-width:0;padding:10px;border:1px solid #6a7184;border-radius:8px;background:#141821;color:#fff;font:inherit}.bao-actor-dialog textarea{resize:vertical}.bao-actor-fields{display:grid;gap:6px}.bao-actor-dialog footer button{width:100%;min-width:0;min-height:44px;margin:0}#bao-actor-feedback{min-height:1.4em;color:#ffcc93}.bao-library-dialog{width:min(100%,820px)}.bao-library-dialog header>div{min-width:0}.bao-library-dialog header .note{margin:5px 0 0;max-width:620px}.bao-library-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.bao-library-tabs button{min-height:40px;padding:8px 12px;border:1px solid #62697c;border-radius:10px;background:#191d27;color:#d9dce6;cursor:pointer}.bao-library-tabs button.active{background:#353a4c;color:#fff;border-color:#8e94aa}.bao-library-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:8px 0 12px}.bao-library-toolbar span{color:#aaa3b0;font-size:12px}.bao-library-list{display:grid;gap:9px}.bao-library-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px;border:1px solid #555d70;border-radius:12px;background:#191d27}.bao-library-card>div:first-child{display:grid;gap:4px;min-width:0}.bao-library-card b{font-size:15px}.bao-library-card span,.bao-library-card small{color:#b2b6c3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bao-library-card small{font-size:12px}.bao-library-card-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.bao-library-card-actions button{min-height:36px;width:auto}.bao-library-editor{padding-top:4px}@media(max-width:700px){#bao-actor-backdrop{align-items:flex-end;padding:0}.bao-actor-dialog{width:100%;max-height:96dvh;border-radius:18px 18px 0 0;padding:10px 12px max(12px,env(safe-area-inset-bottom))}.bao-actor-dialog header{position:sticky;top:-10px;z-index:2;margin:-10px -12px 8px;padding:10px 12px;background:#222632f2;backdrop-filter:blur(10px)}.bao-actor-dialog header h2{font-size:20px}.bao-actor-head-actions{display:flex;align-items:center;gap:6px}.bao-actor-help{display:inline-grid!important;place-items:center;width:34px;height:34px!important;border:1px solid #686d81!important;border-radius:10px!important;background:#191d27!important;color:#d8dbe5!important;font-size:15px!important;font-weight:800}.bao-actor-dialog header [data-close]{width:34px;height:34px;font-size:22px}.bao-actor-intro{display:none;margin:6px 0 8px;font-size:11px;line-height:1.5}.bao-actor-dialog.bao-actor-help-open>.bao-actor-intro{display:block}.bao-actor-target-label{margin:4px 0 8px!important;font-size:12px!important}.bao-actor-target-label select{padding:8px!important}.bao-actor-dialog #bao-actor-form>.note{display:none}.bao-actor-dialog label{margin:6px 0;font-size:13px}.bao-actor-dialog input,.bao-actor-dialog textarea,.bao-actor-dialog select{padding:9px}.bao-actor-fields{gap:4px}.bao-actor-actions{gap:6px;margin:6px 0}.bao-actor-actions button{flex:1 1 calc(50% - 6px);min-height:38px}.bao-library-card{grid-template-columns:1fr}.bao-library-card-actions{justify-content:flex-start}.bao-library-card-actions button{flex:1 1 88px}.bao-actor-dialog footer{position:sticky;bottom:0;z-index:2;margin:8px -12px -12px;padding:8px 12px max(12px,env(safe-area-inset-bottom));background:#222632f2;backdrop-filter:blur(10px);gap:7px}.bao-actor-dialog footer button{min-height:40px}}`;
    document.head.appendChild(style);
  }
  // Changes made in another tab do not trigger storage events in the source tab.
  // Local writes refresh via storePresets(); external writes use this event.
  window.addEventListener?.('storage', event => {
    if (event.key === KEY) refreshPresetPickers();
  });
  window.addEventListener?.('pagehide', () => {
    const builderView = document.getElementById('builder-view');
    if (!builderView?.classList?.contains('active')) return;
    if (draftTimer) window.clearTimeout?.(draftTimer);
    draftTimer = null;
    writeBuilderDraft(readBuilder(), draftCharacterId(), {quiet:true});
  });
  window.addEventListener?.('yorubay:content-preferences-changed', event => {
    if (event.detail?.adultContentEnabled) {
      loadAdultPack().then(() => {refreshPortablePickers(); refreshBuilderActors(); updateLabels();}).catch(error => console.warn('YoruBay adult story actor pack preload failed:', error));
    } else {
      refreshPortablePickers();
      refreshBuilderActors();
      updateLabels();
      if (dialog && dialog.querySelector('#bao-actor-target')?.value === 'host') renderDialog();
    }
  });
  if (adultEnabled()) loadAdultPack().then(refreshPortablePickers).catch(error => console.warn('YoruBay adult story actor pack preload failed:', error));

  installChatEntry();
  window.BAOStoryActors = {open, openLibrary, close, actors, readPresets:presets, savePreset, readActorPresets:actorPresets, saveActorPreset, saveVisibleNpcPreset, readBuilderDraft, clearBuilderDraft, installBuilder, updateLabels, portableCatalog, loadAdultPack};
})();