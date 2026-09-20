/* BAO/LAB data-only, story-local MOD packs. No third-party code is executed. */
(() => {
  'use strict';
  const SCHEMA = 'bao-lab-world-mod-pack';
  const VERSION = 1;
  const IDENT = /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/;
  const TYPES = new Set(['text', 'number', 'meter', 'boolean']);
  const reserved = new Set(['__proto__', 'constructor', 'prototype']);
  const fail = message => { throw new Error(message); };
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const identifier = (value, name) => {
    if (typeof value !== 'string' || !IDENT.test(value) || reserved.has(value)) fail(`${name} 必須以英文字母開頭，且僅使用英數、底線或連字號（最多 40 字）。`);
    return value;
  };
  const numberBound = (value, name) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${name} 必須是有效數字。`);
    return value;
  };
  const fieldValue = (field, value, name) => {
    if (field.type === 'text') {
      if (typeof value !== 'string' || value.length > 800) fail(`${name} 必須是 800 字以內的文字。`);
      return value;
    }
    if (field.type === 'boolean') {
      if (typeof value !== 'boolean') fail(`${name} 必須是 true 或 false。`);
      return value;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${name} 必須是有效數字。`);
    if (field.min !== undefined && value < field.min || field.max !== undefined && value > field.max) fail(`${name} 超出設定範圍。`);
    return value;
  };
  const normalizePack = (input, occupied = []) => {
    if (!record(input) || input.schema !== SCHEMA || input.version !== VERSION) fail('檔案不是支援的 BAO/LAB MOD v1 格式。');
    if (JSON.stringify(input).length > 131072) fail('MOD 檔案過大（上限約 128 KB）。');
    if (!record(input.meta) || !text(input.meta.name, 80)) fail('MOD 缺少名稱。');
    if (!Array.isArray(input.modules) || !input.modules.length || input.modules.length > 12) fail('每包 MOD 需包含 1～12 個模組。');
    const used = new Set(occupied);
    const modules = input.modules.map(raw => {
      if (!record(raw)) fail('模組資料格式錯誤。');
      const id = identifier(raw.id, '模組 ID');
      if (used.has(id)) fail(`模組 ID「${id}」重複或與既有模組衝突。`);
      used.add(id);
      if (!['object', 'collection'].includes(raw.kind)) fail(`模組「${id}」的資料形式不支援。`);
      if (!['high', 'medium', 'low', 'manual'].includes(raw.tracking)) fail(`模組「${id}」的追蹤頻率不支援。`);
      if (!['core', 'relevant', 'ui_only'].includes(raw.context)) fail(`模組「${id}」的 Context 設定不支援。`);
      if (!Array.isArray(raw.fields) || raw.fields.length > 24) fail(`模組「${id}」最多只能有 24 個欄位。`);
      if (!Array.isArray(raw.triggers) || raw.triggers.length > 40 || raw.triggers.some(t => typeof t !== 'string' || t.length > 80)) fail(`模組「${id}」觸發詞格式錯誤。`);
      const fieldIds = new Set();
      const fields = raw.fields.map(f => {
        if (!record(f)) fail(`模組「${id}」的欄位格式錯誤。`);
        const key = identifier(f.key, '欄位 ID');
        if (fieldIds.has(key)) fail(`模組「${id}」有重複欄位「${key}」。`);
        fieldIds.add(key);
        if (!TYPES.has(f.type)) fail(`欄位「${key}」的類型不支援。`);
        const min = numberBound(f.min, `${key} 最小值`), max = numberBound(f.max, `${key} 最大值`);
        if (min !== undefined && max !== undefined && min > max) fail(`欄位「${key}」的最小值不能大於最大值。`);
        const field = { key, label: text(f.label, 40) || key, type: f.type };
        if (['number', 'meter'].includes(f.type)) {
          if (min !== undefined) field.min = min;
          if (max !== undefined) field.max = max;
        }
        return field;
      });
      const initial = {};
      if (raw.initial !== undefined && !record(raw.initial)) fail(`模組「${id}」的初始值必須是物件。`);
      if (raw.kind === 'object') Object.entries(raw.initial || {}).forEach(([key, value]) => {
        const field = fields.find(f => f.key === key);
        if (!field || reserved.has(key)) fail(`模組「${id}」的初始值欄位「${key}」不存在。`);
        initial[key] = fieldValue(field, value, `${id}.${key}`);
      });
      else if (raw.initial && Object.keys(raw.initial).length) fail(`清單模組「${id}」不能設定物件初始值。`);
      return {
        id, label: text(raw.label, 40) || id, icon: text(raw.icon, 4) || '•',
        description: text(raw.description, 500), kind: raw.kind, tracking: raw.tracking,
        context: raw.context, triggers: raw.triggers.map(t => t.trim()).filter(Boolean), fields, initial
      };
    });
    return {
      schema: SCHEMA, version: VERSION,
      meta: { name: text(input.meta.name, 80), author: text(input.meta.author, 80), release: text(input.meta.release, 32) || '1.0.0' },
      modules
    };
  };
  const buildPack = (meta, modules, defaults = {}) => normalizePack({
    schema: SCHEMA, version: VERSION, meta,
    modules: modules.map(module => ({
      id: module.id, label: module.label, icon: module.icon, description: module.description,
      kind: module.kind, tracking: module.tracking, context: module.context,
      triggers: module.triggers || [], fields: module.fields || [], initial: defaults[module.id] || {}
    }))
  });
  const core = { SCHEMA, VERSION, normalizePack, buildPack };
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  window.BAOModPacks = core;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const editors = new Map();
  let currentModal = null;
  const getDefaults = () => window.GameState?.current?.modPackDefaults || {};
  const active = () => window.GameState?.current && window.BAOWorldModules && window.App?.activeCharacter;
  const initialRows = id => {
    const definition = window.BAOWorldModules.getCustomization(window.App.activeCharacter).customModules.find(m => m.id === id);
    const defaults = getDefaults()[id] || {};
    return (definition?.fields || []).map(f => ({ ...f, defaultRaw: Object.hasOwn(defaults, f.key) ? String(defaults[f.key]) : '' }));
  };
  const getRows = id => {
    if (!editors.has(id)) editors.set(id, initialRows(id));
    return editors.get(id);
  };
  const valueForRow = row => {
    const raw = String(row.defaultRaw ?? '');
    if (raw === '') return undefined;
    if (row.type === 'boolean') {
      if (raw !== 'true' && raw !== 'false') fail(`欄位「${row.key}」的預設值請填 true、false 或留空。`);
      return raw === 'true';
    }
    if (row.type === 'number' || row.type === 'meter') {
      const value = Number(raw);
      if (!Number.isFinite(value)) fail(`欄位「${row.key}」的預設值必須是數字。`);
      return value;
    }
    return raw;
  };
  const parseEditor = (id, kind) => {
    const rows = getRows(id);
    const fields = rows.map(row => {
      const field = { key: row.key, label: row.label, type: row.type };
      if (['number', 'meter'].includes(row.type)) {
        if (row.min !== '' && row.min !== undefined) field.min = Number(row.min);
        if (row.max !== '' && row.max !== undefined) field.max = Number(row.max);
      }
      return field;
    });
    const initial = {};
    if (kind === 'object') rows.forEach(row => {
      const value = valueForRow(row);
      if (value !== undefined) initial[row.key] = value;
    });
    const checked = normalizePack({ schema: SCHEMA, version: VERSION, meta: { name: '欄位檢查' }, modules: [{
      id, label: id, kind, tracking: 'manual', context: 'ui_only', triggers: [], fields, initial
    }] });
    return { fields: checked.modules[0].fields, initial: checked.modules[0].initial };
  };
  const renderRows = (card, panel) => {
    const id = card.dataset.customId, rows = getRows(id);
    const isCollection = card.querySelector('[data-custom-prop="kind"]')?.value === 'collection';
    panel.querySelector('[data-mod-fields]').innerHTML = rows.map((row, i) => `<div class="bao-mod-field" data-mod-index="${i}">
      <label>欄位 ID<input maxlength="40" data-mod-prop="key" value="${esc(row.key)}" placeholder="affinity"></label>
      <label>顯示名稱<input maxlength="40" data-mod-prop="label" value="${esc(row.label)}" placeholder="好感度"></label>
      <label>類型<select data-mod-prop="type">${[...TYPES].map(t => `<option value="${t}" ${row.type === t ? 'selected' : ''}>${({text:'文字',number:'數字',meter:'數值條',boolean:'是／否'})[t]}</option>`).join('')}</select></label>
      <label>最小值<input type="number" data-mod-prop="min" value="${esc(row.min ?? '')}" ${['number','meter'].includes(row.type) ? '' : 'disabled'}></label>
      <label>最大值<input type="number" data-mod-prop="max" value="${esc(row.max ?? '')}" ${['number','meter'].includes(row.type) ? '' : 'disabled'}></label>
      <label>初始值<input data-mod-prop="defaultRaw" maxlength="800" value="${esc(row.defaultRaw ?? '')}" placeholder="留空表示未設定" ${isCollection ? 'disabled title="清單欄位沒有個別初始值"' : ''}></label>
      <button type="button" class="secondary" data-mod-remove="${i}">移除欄位</button>
    </div>`).join('') || '<p class="note">尚未建立欄位；自訂空白模組的 AI 狀態追蹤需要欄位。</p>';
    panel.querySelectorAll('[data-mod-prop]').forEach(input => input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => {
      const row = rows[Number(input.closest('[data-mod-index]').dataset.modIndex)];
      row[input.dataset.modProp] = input.value;
      if (input.dataset.modProp === 'type') renderRows(card, panel);
    }));
    panel.querySelectorAll('[data-mod-remove]').forEach(button => button.addEventListener('click', () => {
      rows.splice(Number(button.dataset.modRemove), 1); renderRows(card, panel);
    }));
  };
  const attachFields = card => {
    if (card.querySelector('.bao-mod-fields')) return;
    const panel = document.createElement('section');
    panel.className = 'bao-mod-fields';
    panel.innerHTML = '<div class="bao-mod-title"><b>自訂欄位</b><button type="button" class="secondary" data-mod-add>＋ 新增欄位</button></div><p class="note">欄位 ID 用英文；數值範圍和初始值可選填。清單模組的欄位屬於每一筆項目。</p><div data-mod-fields></div>';
    card.appendChild(panel);
    renderRows(card, panel);
    panel.querySelector('[data-mod-add]').addEventListener('click', () => {
      const rows = getRows(card.dataset.customId);
      if (rows.length >= 24) { alert('每個模組最多 24 個欄位。'); return; }
      const used = new Set(rows.map(row => row.key));
      let id = 'field', n = 2;
      while (used.has(id)) id = `field_${n++}`;
      rows.push({ key: id, label: '新欄位', type: 'text', defaultRaw: '' });
      renderRows(card, panel);
    });
    card.querySelector('[data-custom-prop="kind"]')?.addEventListener('change', () => renderRows(card, panel));
  };
  const install = pack => {
    if (!active()) fail('請先開始或讀取一個故事。');
    const state = GameState.current;
    const current = BAOWorldModules.getCustomization(App.activeCharacter);
    const occupied = [ ...Object.keys(BAOWorldModules.BUILT_INS),
      ...BAOWorldModules.baseDefinitions(App.activeCharacter).map(m => m.id),
      ...current.customModules.map(m => m.id) ];
    const checked = normalizePack(pack, occupied);
    // Deleting a module intentionally retains its story data. Never reuse that ID for
    // another pack: ensureState() would otherwise attach the old values to a new schema.
    const retainedIds = new Set([...Object.keys(state.modules || {}), ...Object.keys(getDefaults())]);
    const stale = checked.modules.find(m => retainedIds.has(m.id));
    if (stale) fail(`模組 ID「${stale.id}」仍保有舊故事資料；為避免混用，請在新故事匯入或改用不同的模組 ID。`);
    if (current.customModules.length + checked.modules.length > 12) fail('目前故事最多有 12 個玩家自訂模組；請先移除不用的模組。');
    const draft = { ...current, customModules: [...current.customModules, ...checked.modules.map(({initial, ...m}) => m)],
      order: [...current.order, ...checked.modules.map(m => m.id)] };
    BAOWorldModules.applyCustomization(draft, App.activeCharacter);
    state.modPackDefaults = { ...getDefaults() };
    checked.modules.forEach(m => {
      state.modPackDefaults[m.id] = m.initial;
      const data = state.modules[m.id];
      if (m.kind === 'object' && data && !Array.isArray(data)) Object.entries(m.initial).forEach(([key, value]) => {
        if (!Object.hasOwn(data, key)) data[key] = value;
      });
    });
    state.modPackInstallations = [...(Array.isArray(state.modPackInstallations) ? state.modPackInstallations : []),
      { ...checked.meta, moduleIds: checked.modules.map(m => m.id), schemaVersion: checked.version }].slice(-12);
    App.saveStory(false);
    window.BAOWorldModuleUI?.injectTabs?.();
    App.renderUIPanel?.('npc');
    return checked;
  };
  core.install = install;
  const saveFile = pack => {
    const filename = (pack.meta.name || 'world-mod').replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 60) || 'world-mod';
    const url = URL.createObjectURL(new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = `${filename}.bao-mod.json`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const attachTools = modal => {
    if (modal.querySelector('.bao-mod-tools')) return;
    const target = modal.querySelector('.world-manager-foot');
    if (!target) return;
    const box = document.createElement('div');
    box.className = 'bao-mod-tools';
    box.innerHTML = '<button type="button" class="secondary" data-mod-export>匯出自訂 MOD</button><button type="button" class="secondary" data-mod-import>匯入 MOD JSON</button><input type="file" accept=".json,application/json" data-mod-file hidden><span class="note">僅資料設定，不執行第三方程式；安裝內容會提供給玩家自選的 AI。</span>';
    target.before(box);
    box.querySelector('[data-mod-export]').addEventListener('click', () => {
      const mods = BAOWorldModules.getCustomization(App.activeCharacter).customModules;
      if (!mods.length) { alert('目前故事沒有可匯出的玩家自訂模組。請先儲存模組設定。'); return; }
      const name = prompt('MOD 名稱：', `${App.activeCharacter?.name || 'BAO/LAB'} 世界擴充`);
      if (name === null) return;
      const author = prompt('作者名稱（可留空）：', '');
      if (author === null) return;
      try { saveFile(buildPack({ name: name.trim() || '我的世界模組', author, release: '1.0.0' }, mods, getDefaults())); }
      catch (err) { alert(err.message); }
    });
    const picker = box.querySelector('[data-mod-file]');
    box.querySelector('[data-mod-import]').addEventListener('click', () => { picker.value = ''; picker.click(); });
    picker.addEventListener('change', async () => {
      const file = picker.files?.[0];
      if (!file) return;
      try {
        if (file.size > 131072) fail('MOD 檔案不可超過 128 KB。');
        const pack = normalizePack(JSON.parse(await file.text()));
        const details = pack.modules.map(m => `${m.label}（${m.fields.length} 欄位）`).join('、');
        const agreed = confirm(`匯入 MOD「${pack.meta.name}」\n作者：${pack.meta.author || '未署名'}｜版本：${pack.meta.release}\n模組：${details}\n\n這會直接安裝至目前故事，且會放棄此視窗尚未套用的修改。模組規則會在需要時送至你選用的 AI。確定繼續？`);
        if (!agreed) return;
        install(pack);
        modal.remove();
        BAOWorldModuleManager.open();
      } catch (err) { alert(`MOD 匯入失敗：${err.message || '無法解析檔案'}`); }
      finally { picker.value = ''; }
    });
    modal.querySelector('[data-world-save]')?.addEventListener('click', event => {
      const cards = [...modal.querySelectorAll('.world-custom-card')];
      const parsed = new Map();
      try { cards.forEach(card => parsed.set(card.dataset.customId,
        parseEditor(card.dataset.customId, card.querySelector('[data-custom-prop="kind"]')?.value || 'object'))); }
      catch (err) { event.stopImmediatePropagation(); alert(`欄位設定無法儲存：${err.message}`); return; }
      // The original manager's save handler applies its own draft first.
      // Amend the same story state after that handler without mutating its closure.
      setTimeout(() => {
        if (!active()) return;
        const state = GameState.current;
        const saved = BAOWorldModules.getCustomization(App.activeCharacter);
        saved.customModules = saved.customModules.map(m => ({ ...m, fields: parsed.get(m.id)?.fields || m.fields }));
        BAOWorldModules.applyCustomization(saved, App.activeCharacter);
        state.modPackDefaults = { ...getDefaults() };
        for (const [id, data] of parsed) {
          state.modPackDefaults[id] = data.initial;
          const module = saved.customModules.find(m => m.id === id);
          const values = state.modules[id];
          if (module?.kind === 'object' && values && !Array.isArray(values)) Object.entries(data.initial).forEach(([key, value]) => {
            if (!Object.hasOwn(values, key)) values[key] = value;
          });
        }
        App.saveStory(false);
      }, 0);
    }, { capture: true });
  };
  const enhance = () => {
    const modal = document.querySelector('.world-manager-backdrop');
    if (!modal) { currentModal = null; return; }
    if (modal !== currentModal) { currentModal = modal; editors.clear(); }
    attachTools(modal);
    modal.querySelectorAll('.world-custom-card').forEach(attachFields);
  };
  const style = document.createElement('style');
  style.textContent = '.bao-mod-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:12px;border-top:1px solid #8884}.bao-mod-fields{margin-top:14px;border-top:1px solid #8885;padding-top:12px}.bao-mod-title{display:flex;align-items:center;justify-content:space-between;gap:8px}.bao-mod-field{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;padding:10px 0;border-top:1px dashed #8885}.bao-mod-field label{min-width:0}.bao-mod-field input,.bao-mod-field select{width:100%;box-sizing:border-box}.bao-mod-field button{align-self:end}@media(max-width:600px){.bao-mod-tools>*{max-width:100%}.bao-mod-field{grid-template-columns:repeat(2,minmax(0,1fr))}}';
  document.head.appendChild(style);
  const observer = new MutationObserver(enhance);
  observer.observe(document.body, { childList: true, subtree: true });
  enhance();
})();