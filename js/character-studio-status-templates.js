/* Author-side templates and initial values; no duplicate runtime state or model requests. */
(() => {
  'use strict';
  const studio = window.BAOCharacterStudio;
  const core = window.BAOStudioStatusTemplatesCore;
  const anchor = document.getElementById('studio-npc-editor') || document.getElementById('studio-npc-personality');
  if (!studio || !core || !anchor || window.BAOStudioStatusTemplates) return;

  const panel = document.createElement('details');
  panel.id = 'studio-status-templates';
  panel.className = 'studio-status-templates';
  panel.innerHTML = [
    '<summary>人物數值模板與初始值（選填）</summary>',
    '<p class="note">使用夜灣原生人物狀態欄。模板只建立欄位定義，不會增加 AI 請求、修改已存在故事，或保證每輪一定變動數值。</p>',
    '<div data-status-presets class="studio-status-presets"></div>',
    '<div data-status-field-list class="studio-status-field-list"></div>',
    '<button type="button" class="secondary" data-status-add>＋ 自訂欄位</button>',
    '<section data-status-field-editor hidden aria-label="編輯狀態欄位">',
    '<div class="studio-status-grid">',
    '<label>欄位 key *<input data-status-field="key" maxlength="40" placeholder="例：morale"></label>',
    '<label>顯示名稱 *<input data-status-field="label" maxlength="40" placeholder="例：士氣"></label>',
    '<label>欄位類型<select data-status-field="type">',
    '<option value="meter">數值條</option><option value="number">數字</option><option value="text">文字</option>',
    '<option value="boolean">是／否</option><option value="tags">標籤清單</option></select></label>',
    '<label>模型上下文<select data-status-field="context">',
    '<option value="relevant">相關時提供</option><option value="core">核心常駐</option><option value="ui_only">僅 UI 顯示</option></select></label>',
    '<label data-status-range>最小值<input data-status-field="min" type="number" step="any" placeholder="選填"></label>',
    '<label data-status-range>最大值<input data-status-field="max" type="number" step="any" placeholder="選填"></label>',
    '<label>預設值<input data-status-field="default" maxlength="800"></label>',
    '<label class="studio-status-track"><input data-status-field="track" type="checkbox" checked>追蹤故事變更</label>',
    '</div>',
    '<label>數值變更依據<textarea data-status-field="description" rows="2" maxlength="240"></textarea></label>',
    '<p class="note">既有欄位不可直接改 key；修改上下限不會悄悄覆寫舊人物資料。布林預設值用 true／false，標籤使用逗號分隔。</p>',
    '<div class="studio-status-actions"><button type="button" class="primary" data-status-save-field>套用欄位</button>',
    '<button type="button" class="secondary" data-status-cancel-field>取消欄位編輯</button></div>',
    '</section>',
    '<section class="studio-status-initial" aria-label="人物初始數值">',
    '<h4>人物初始值</h4>',
    '<p class="note">選擇已在初始 NPC 名冊或現有初始狀態中的人物；單角色作品且沒有 NPC 時，可明確使用作品主角色名稱。世界作品標題不會自動當成 NPC。</p>',
    '<label>設定對象<select data-status-subject></select></label>',
    '<div data-status-values></div>',
    '<div class="studio-status-actions"><button type="button" class="primary" data-status-save-values>儲存初始值</button>',
    '<button type="button" class="secondary" data-status-reset-values>取消數值編輯</button></div>',
    '</section>',
    '<p data-status-message role="status" aria-live="polite" class="note"></p>'
  ].join('');
  anchor.after(panel);
  const $ = selector => panel.querySelector(selector);
  const defsArea = $('[data-status-field-list]');
  const editor = $('[data-status-field-editor]');
  const presets = $('[data-status-presets]');
  const subjectSelect = $('[data-status-subject]');
  const valuesArea = $('[data-status-values]');
  const saveValues = $('[data-status-save-values]');
  const resetValues = $('[data-status-reset-values]');
  const message = value => { $('[data-status-message]').textContent = value; };
  const attr = name => $('[data-status-field="' + name + '"]');
  const names = ['key', 'label', 'type', 'context', 'min', 'max', 'default', 'description'];
  let editKey = '';
  let fieldPending = false;
  let valuesPending = false;
  let selectedSubject = '';
  const read = () => studio.getAuthorStatusData();
  const fieldDraft = () => Object.fromEntries(names.map(name => [name, attr(name).value]));
  function resetEditor() {
    fieldPending = false;
    editKey = '';
    editor.hidden = true;
    attr('key').readOnly = false;
  }
  function updateFieldMode() {
    const isNumber = ['meter', 'number'].includes(attr('type').value);
    panel.querySelectorAll('[data-status-range]').forEach(el => { el.hidden = !isNumber; });
    attr('default').placeholder = attr('type').value === 'boolean'
      ? 'true 或 false' : attr('type').value === 'tags'
        ? '以逗號分隔的標籤' : isNumber ? '例如：50' : '選填預設文字';
  }
  function beginEdit(item = null) {
    if (!canDiscardField()) return;
    editKey = item?.key || '';
    const def = item || {key:'', label:'', type:'meter', context:'relevant', min:0, max:100, default:0, track:true, description:''};
    names.forEach(name => {
      const raw = def[name] ?? '';
      attr(name).value = Array.isArray(raw) ? raw.join('、') : String(raw);
    });
    attr('track').checked = def.track !== false;
    attr('key').readOnly = Boolean(editKey);
    editor.hidden = false;
    fieldPending = false;
    updateFieldMode();
    panel.open = true;
    attr(editKey ? 'label' : 'key').focus();
  }
  function canDiscardField() {
    if (!fieldPending || editor.hidden) return true;
    if (!window.confirm('欄位設定尚未套用，要放棄這些修改嗎？')) return false;
    resetEditor();
    return true;
  }
  function canDiscardValues() {
    if (!valuesPending) return true;
    if (!window.confirm('人物初始值尚未儲存，要放棄這些修改嗎？')) return false;
    valuesPending = false;
    return true;
  }
  function canChange() {
    if (fieldPending && !editor.hidden) { message('請先套用或取消正在編輯的欄位。'); return false; }
    if (valuesPending) { message('請先儲存或取消人物初始值。'); return false; }
    return true;
  }
  function update(next, notice) {
    studio.setAuthorStatusData(next);
    message(notice + '；請再儲存作品草稿或匯出 JSON。');
    render();
  }
  Object.entries(core.PRESETS).forEach(([key, preset]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary';
    button.dataset.preset = key;
    button.textContent = '＋ ' + preset.label;
    button.addEventListener('click', () => {
      if (!canChange()) return;
      try { update(core.addPreset(read(), key), '已新增 ' + preset.label); }
      catch (error) { message('無法新增：' + error.message); }
    });
    presets.append(button);
  });
  function renderFields(data) {
    defsArea.replaceChildren();
    const items = core.fields(data);
    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'studio-status-field-row';
      const info = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = (item.label || item.key) + ' · ' + item.key;
      const detail = document.createElement('small');
      detail.textContent = [item.type || 'text', item.context || 'relevant',
        item.type === 'meter' || item.type === 'number' ? String(item.min ?? '—') + '～' + String(item.max ?? '—') : ''].filter(Boolean).join(' · ');
      info.append(name,detail);
      const controls = document.createElement('div');
      const modify = document.createElement('button');
      modify.type = 'button'; modify.className = 'secondary'; modify.textContent = '編輯';
      modify.setAttribute('aria-label', '編輯數值欄位 ' + item.label);
      modify.addEventListener('click', () => beginEdit(item));
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'secondary'; remove.textContent = '移除';
      remove.setAttribute('aria-label', '移除數值欄位 ' + item.label);
      remove.addEventListener('click', () => {
        if (!canChange()) return;
        if (!window.confirm('只移除「' + item.label + '」欄位定義？既有各人物初始值會保留在 JSON 中，其他欄位不變。')) return;
        try { update(core.removeField(read(), item.key), '已移除 ' + item.label + ' 的欄位定義'); }
        catch (error) { message('移除失敗：' + error.message); }
      });
      controls.append(modify, remove);
      row.append(info, controls);
      defsArea.append(row);
    }
    if (!items.length) {
      const text = document.createElement('p'); text.className = 'note';
      text.textContent = '尚無人物狀態欄。可按上方模板或新增自訂欄位。';
      defsArea.append(text);
    }
    presets.querySelectorAll('[data-preset]').forEach(button => {
      const template = core.PRESETS[button.dataset.preset];
      button.disabled = items.length >= core.MAX_FIELDS || items.some(f => f.key === template.key);
      button.title = button.disabled ? '欄位已存在或已達 24 個上限' : '';
    });
  }
  function renderSubjects(data) {
    const valid = core.subjects(data);
    if (!valid.includes(selectedSubject)) selectedSubject = valid[0] || '';
    subjectSelect.replaceChildren();
    if (!valid.length) {
      const option = document.createElement('option');
      option.value = ''; option.textContent = '請先在初始 NPC 編輯器加入人物';
      subjectSelect.append(option);
    } else valid.forEach(name => {
      const option = document.createElement('option');
      option.value = name; option.textContent = name; subjectSelect.append(option);
    });
    subjectSelect.value = selectedSubject;
    subjectSelect.disabled = !valid.length;
  }
  function renderValues(data) {
    valuesArea.replaceChildren();
    saveValues.disabled = !selectedSubject || !core.fields(data).length;
    resetValues.disabled = saveValues.disabled;
    if (!selectedSubject || !core.fields(data).length) {
      const hint = document.createElement('p'); hint.className = 'note';
      hint.textContent = !selectedSubject ? '目前沒有可指定的初始人物。' : '請先新增一個數值欄位。';
      valuesArea.append(hint); return;
    }
    const current = core.initialValues(data, selectedSubject);
    core.fields(data).forEach(item => {
      const label = document.createElement('label');
      label.className = 'studio-status-value-row';
      const heading = document.createElement('span');
      heading.textContent = (item.label || item.key) + '（' + item.key + '）';
      let input;
      if (item.type === 'boolean') {
        input = document.createElement('select');
        for (const [value, title] of [['true','是'],['false','否']]) {
          const option = document.createElement('option');
          option.value = value; option.textContent = title; input.append(option);
        }
        input.value = String(current[item.key] === true);
      } else {
        input = document.createElement('input');
        input.type = ['meter','number'].includes(item.type) ? 'number' : 'text';
        if (input.type === 'number') {
          input.step = 'any';
          if (Number.isFinite(Number(item.min)) && item.min !== undefined) input.min = String(item.min);
          if (Number.isFinite(Number(item.max)) && item.max !== undefined) input.max = String(item.max);
        }
        input.maxLength = item.type === 'text' ? 800 : 1200;
        input.value = Array.isArray(current[item.key]) ? current[item.key].join('、') : String(current[item.key] ?? '');
      }
      input.dataset.valueKey = item.key;
      const detail = document.createElement('small');
      detail.textContent = item.description || '預設值只在新故事開始時使用；玩家故事中的後續變更不受影響。';
      label.append(heading,input,detail);
      valuesArea.append(label);
    });
    valuesPending = false;
  }
  function render() {
    try {
      const data = read();
      renderFields(data);
      renderSubjects(data);
      renderValues(data);
    } catch(error) { message('無法讀取狀態設定：' + error.message); }
  }
  function resetAll() {
    resetEditor(); valuesPending = false; selectedSubject = ''; render();
  }
  $('[data-status-add]').addEventListener('click', () => beginEdit());
  $('[data-status-cancel-field]').addEventListener('click', () => { resetEditor(); message('已取消欄位編輯。'); });
  attr('type').addEventListener('change', updateFieldMode);
  editor.addEventListener('input', () => { fieldPending = true; });
  editor.addEventListener('change', () => { fieldPending = true; });
  $('[data-status-save-field]').addEventListener('click', () => {
    if (valuesPending) { message('請先儲存或取消人物初始值。'); return; }
    try {
      const draft = {...fieldDraft(), track:attr('track').checked};
      update(core.upsertField(read(), draft, editKey), editKey ? '已更新欄位' : '已新增自訂欄位');
      resetEditor();
    } catch(error) { message('無法套用欄位：' + error.message); }
  });
  subjectSelect.addEventListener('change', () => {
    const next = subjectSelect.value;
    if (!canDiscardValues()) { subjectSelect.value = selectedSubject; return; }
    selectedSubject = next; renderValues(read());
  });
  valuesArea.addEventListener('input', () => { valuesPending = true; });
  valuesArea.addEventListener('change', () => { valuesPending = true; });
  $('[data-status-save-values]').addEventListener('click', () => {
    if (fieldPending && !editor.hidden) { message('請先套用或取消正在編輯的欄位。'); return; }
    try {
      const values = Object.fromEntries([...valuesArea.querySelectorAll('[data-value-key]')].map(input => [input.dataset.valueKey,input.value]));
      const next = core.setInitialValues(read(), selectedSubject, values);
      valuesPending = false;
      update(next, '已儲存「' + selectedSubject + '」的初始值');
    } catch(error) { message('無法儲存初始值：' + error.message); }
  });
  $('[data-status-reset-values]').addEventListener('click', () => {
    valuesPending = false; renderValues(read()); message('已取消未儲存的初始值修改。');
  });
  window.addEventListener('bao:character-studio-card-shown', resetAll);
  window.addEventListener('bao:studio-npcs-changed', () => {
    if (!fieldPending && !valuesPending) render();
    else message('初始 NPC 名冊已更新；請先完成或取消目前數值編輯。');
  });
  const studioForm = document.getElementById('studio-form');
  const refreshSubject = () => {
    if (fieldPending || valuesPending) return;
    try {
      const data = read();
      renderSubjects(data);
      renderValues(data);
    } catch (error) { message('無法更新人物清單：' + error.message); }
  };
  studioForm?.elements.namedItem('name')?.addEventListener('input', refreshSubject);
  studioForm?.elements.namedItem('mode')?.addEventListener('change', refreshSubject);
  window.BAOStudioStatusTemplates = Object.freeze({
    assertCommitted() {
      if (fieldPending && !editor.hidden || valuesPending)
        throw new Error('人物數值仍有未儲存的編輯，請先套用欄位／儲存初始值，或取消修改。');
    },
    render
  });
  render();
})();
