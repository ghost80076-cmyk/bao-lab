/* BAO/LAB opt-in Gameplay UI Engine. Cards without gameplay_ui keep the legacy path unchanged. */
(() => {
  'use strict';
  if (typeof App === 'undefined' || typeof GameState === 'undefined' || !window.BAOGameplayUICore || window.BAOGameplayUI) return;

  const Core = window.BAOGameplayUICore;
  const builderDrafts = new Map();
  let cacheCharacter = null;
  let cacheRaw = null;
  let cacheSchema = null;

  const esc = value => App.escapeHTML(String(value ?? ''));
  const displayValue = value => {
    const mod = window.BAOPlayerTextReplace;
    return mod?.applyStatus ? mod.applyStatus(String(value ?? ''), mod.get?.()) : String(value ?? '');
  };
  const clone = value => {
    try { return structuredClone(value); }
    catch (_) { return JSON.parse(JSON.stringify(value ?? null)); }
  };
  const THEME_VARS = Object.freeze({
    accent: '--gameplay-accent',
    surface: '--gameplay-surface',
    surface_alt: '--gameplay-surface-alt',
    text: '--gameplay-text',
    border: '--gameplay-border',
    muted: '--gameplay-muted'
  });
  const clearTheme = node => {
    if (!node) return;
    delete node.dataset.gameplayTheme;
    delete node.dataset.gameplayDensity;
    delete node.dataset.gameplayRadius;
    delete node.dataset.gameplayMeter;
    Object.values(THEME_VARS).forEach(name => node.style.removeProperty(name));
  };
  const applyTheme = (node, schema) => {
    if (!node) return;
    clearTheme(node);
    const theme = schema?.theme;
    if (!theme) return;
    node.dataset.gameplayTheme = theme.preset || 'default';
    node.dataset.gameplayDensity = theme.density || 'comfortable';
    node.dataset.gameplayRadius = theme.radius || 'round';
    node.dataset.gameplayMeter = theme.meter || 'soft';
    Object.entries(THEME_VARS).forEach(([key, cssName]) => {
      if (theme[key]) node.style.setProperty(cssName, theme[key]);
    });
  };
  const mergeInitialModules = (state, character) => {
    const initial = character?.initial_state?.modules;
    if (!state || !initial || typeof initial !== 'object' || Array.isArray(initial)) return;
    if (!state.modules || typeof state.modules !== 'object' || Array.isArray(state.modules)) state.modules = {};
    Object.entries(initial).forEach(([moduleId, value]) => {
      if (!Core.isTargetPath(`modules.${moduleId}.value`)) return;
      if (state.modules[moduleId] === undefined) state.modules[moduleId] = clone(value);
      else if (value && typeof value === 'object' && !Array.isArray(value) && state.modules[moduleId] && typeof state.modules[moduleId] === 'object' && !Array.isArray(state.modules[moduleId])) {
        state.modules[moduleId] = { ...clone(value), ...state.modules[moduleId] };
      }
    });
  };
  const schemaFor = character => {
    const c = character || App.activeCharacter;
    const raw = c?.gameplay_ui || c?.gameplay?.ui_schema || null;
    if (c === cacheCharacter && raw === cacheRaw) return cacheSchema;
    cacheCharacter = c;
    cacheRaw = raw;
    cacheSchema = Core.normalize(raw);
    return cacheSchema;
  };

  const syncPlayerIdentityLabel = () => {
    const node = document.getElementById('chat-persona');
    const spec = App.activeCharacter?.gameplay_ui?.player_identity;
    const sourcePath = String(spec?.source_path || '').trim();
    if (!node || !Core.isTargetPath(sourcePath)) return false;
    const current = Core.getPath(GameState.current || {}, sourcePath);
    const variants = Array.isArray(spec?.variants) ? spec.variants.slice(0, 8) : [];
    const rule = variants.find(item => item && String(item.value || '').slice(0, 80) === String(current));
    const defaultLabel = String(spec?.default_label || '').trim().slice(0, 80);
    let label = String(rule?.label || '').trim().slice(0, 80) || defaultLabel;
    if (rule?.use_persona) {
      const personaName = String(App.config?.persona?.name || '').trim();
      label = personaName && personaName !== '未命名玩家'
        ? personaName
        : (String(rule?.fallback || '').trim().slice(0, 80) || defaultLabel || '玩家');
    }
    if (!label) return false;
    node.textContent = label;
    return true;
  };

  const formatValue = value => {
    if (value === undefined || value === null || value === '') return '—';
    if (typeof value === 'boolean') return value ? '是' : '否';
    if (Array.isArray(value)) return value.length ? value.map(item => typeof item === 'object' ? JSON.stringify(item) : String(item)).join('、') : '—';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const builderValue = (schema, reset = false) => {
    const id = String(App.activeCharacter?.id || '');
    if (!id) return {};
    if (reset || !builderDrafts.has(id)) builderDrafts.set(id, Core.builderDefaults(schema));
    return builderDrafts.get(id);
  };

  const fieldControl = (field, value) => {
    const common = `data-gameplay-field="${esc(field.key)}"`;
    if (field.type === 'select') {
      return `<select ${common}>${field.options.map(option => `<option value="${esc(option)}" ${String(value) === option ? 'selected' : ''}>${esc(option)}</option>`).join('')}</select>`;
    }
    if (field.type === 'number') {
      const min = Number.isFinite(field.min) ? ` min="${field.min}"` : '';
      const max = Number.isFinite(field.max) ? ` max="${field.max}"` : '';
      return `<input ${common} type="number" value="${esc(value)}"${min}${max}>`;
    }
    if (field.type === 'boolean') return `<input ${common} type="checkbox" ${value ? 'checked' : ''}>`;
    return `<input ${common} type="text" maxlength="240" value="${esc(value)}" placeholder="${esc(field.placeholder)}">`;
  };

  const renderBuilder = (box, schema, values) => {
    applyTheme(box, schema);
    const builder = schema.builder;
    const remaining = Core.remainingPoints(schema, values);
    const attributes = builder.attributes.map(attr => {
      const current = Number(values[attr.key] ?? attr.base);
      return `<div class="gameplay-builder-attribute" data-gameplay-attribute="${esc(attr.key)}">
        <div><b>${esc(attr.label)}</b>${attr.description ? `<small>${esc(attr.description)}</small>` : ''}</div>
        <div class="gameplay-stepper"><button type="button" data-gameplay-step="minus" data-key="${esc(attr.key)}" ${current <= attr.base ? 'disabled' : ''}>−</button><strong>${esc(current)}</strong><button type="button" data-gameplay-step="plus" data-key="${esc(attr.key)}" ${current >= attr.max || remaining <= 0 ? 'disabled' : ''}>＋</button></div>
        <span>${esc(attr.base)}～${esc(attr.max)}</span>
      </div>`;
    }).join('');
    const fields = builder.fields.map(field => `<label class="gameplay-builder-field"><span>${esc(field.label)}</span>${fieldControl(field, values[field.key])}</label>`).join('');
    box.innerHTML = `<div class="gameplay-builder-head"><div><span>GAMEPLAY SETUP</span><h4>${esc(builder.title || '角色設定')}</h4>${builder.description ? `<p>${esc(builder.description)}</p>` : ''}</div>${builder.attributes.length ? `<b class="gameplay-points">剩餘 ${remaining} / ${builder.point_pool}</b>` : ''}</div>${attributes ? `<div class="gameplay-builder-attributes">${attributes}</div>` : ''}${fields ? `<div class="gameplay-builder-fields">${fields}</div>` : ''}`;
  };

  const mountBuilder = (reset = false) => {
    const step = document.querySelector('.builder-step[data-step-panel="3"]');
    if (!step) return;
    let box = document.getElementById('bao-gameplay-builder');
    const schema = schemaFor(App.activeCharacter);
    if (!schema || (!schema.builder.attributes.length && !schema.builder.fields.length)) {
      box?.remove();
      return;
    }
    if (!box) {
      box = document.createElement('section');
      box.id = 'bao-gameplay-builder';
      box.className = 'gameplay-builder';
      step.appendChild(box);
      box.addEventListener('click', event => {
        const button = event.target.closest?.('[data-gameplay-step]');
        if (!button) return;
        const activeSchema = schemaFor(App.activeCharacter);
        if (!activeSchema) return;
        const values = builderValue(activeSchema);
        const attr = activeSchema.builder.attributes.find(item => item.key === button.dataset.key);
        if (!attr) return;
        const current = Number(values[attr.key] ?? attr.base);
        if (button.dataset.gameplayStep === 'minus') values[attr.key] = Math.max(attr.base, current - attr.step);
        else if (Core.remainingPoints(activeSchema, values) > 0) values[attr.key] = Math.min(attr.max, current + attr.step);
        Object.assign(values, Core.normalizeBuilderValues(activeSchema, values));
        renderBuilder(box, activeSchema, values);
      });
      const updateField = event => {
        const input = event.target.closest?.('[data-gameplay-field]');
        if (!input) return;
        const activeSchema = schemaFor(App.activeCharacter);
        if (!activeSchema) return;
        const field = activeSchema.builder.fields.find(item => item.key === input.dataset.gameplayField);
        if (!field) return;
        const values = builderValue(activeSchema);
        values[field.key] = field.type === 'boolean' ? input.checked : input.value;
      };
      box.addEventListener('input', updateField);
      box.addEventListener('change', updateField);
    }
    const values = builderValue(schema, reset);
    renderBuilder(box, schema, values);
  };

  const meterHTML = (item, state) => {
    const raw = Number(Core.getPath(state, item.value_path));
    const min = Number.isFinite(item.min) ? item.min : 0;
    const maxRaw = item.max_path ? Number(Core.getPath(state, item.max_path)) : Number(item.max);
    const max = Number.isFinite(maxRaw) && maxRaw > min ? maxRaw : Math.max(min + 1, 100);
    const value = Number.isFinite(raw) ? raw : min;
    const ratio = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
    return `<div class="gameplay-meter"><div><span>${esc(item.label)}</span><b>${esc(displayValue(value))} / ${esc(displayValue(max))}${item.suffix ? ` ${esc(displayValue(item.suffix))}` : ''}</b></div><i><em style="width:${ratio}%"></em></i></div>`;
  };

  const sectionHTML = (section, state) => {
    const heading = section.title ? `<h4>${esc(section.title)}</h4>` : '';
    if (section.type === 'meters') return `<section class="gameplay-ui-section">${heading}<div class="gameplay-meter-grid">${section.items.map(item => meterHTML(item, state)).join('')}</div></section>`;
    if (section.type === 'stats') return `<section class="gameplay-ui-section">${heading}<div class="gameplay-stat-grid">${section.items.map(item => `<div><small>${esc(item.label)}</small><b>${esc(displayValue(formatValue(Core.getPath(state, item.path))))}${item.suffix ? ` ${esc(displayValue(item.suffix))}` : ''}</b></div>`).join('')}</div></section>`;
    if (section.type === 'list') {
      const value = Core.getPath(state, section.path);
      const list = Array.isArray(value) ? value.slice(0, section.limit) : [];
      return `<section class="gameplay-ui-section">${heading}<div class="gameplay-list">${list.length ? list.map(item => `<div>• ${esc(displayValue(formatValue(item)))}</div>`).join('') : `<span>${esc(displayValue(section.empty))}</span>`}</div></section>`;
    }
    if (section.type === 'actions') return `<section class="gameplay-ui-section">${heading}<div class="gameplay-actions">${section.items.map((item, index) => `<button type="button" class="secondary" data-gameplay-draft="${index}" data-gameplay-draft-text="${esc(item.draft)}">${esc(item.label)}</button>${item.hint ? `<small>${esc(item.hint)}</small>` : ''}`).join('')}</div></section>`;
    return '';
  };

  const renderPanel = panelId => {
    const schema = schemaFor(App.activeCharacter);
    const panel = schema?.panels.find(item => item.id === panelId);
    const ui = document.getElementById('ui-panel');
    applyTheme(document.getElementById('game-ui'), schema);
    if (!panel || !ui || !GameState.current) return false;
    ui.innerHTML = `<div class="gameplay-ui-panel" data-gameplay-panel="${esc(panel.id)}">${panel.sections.map(section => sectionHTML(section, GameState.current)).join('')}</div>`;
    ui.querySelectorAll('[data-gameplay-draft-text]').forEach(button => button.addEventListener('click', () => {
      const input = document.getElementById('user-input');
      if (!input) return;
      input.value = button.dataset.gameplayDraftText || '';
      input.focus();
      input.setSelectionRange?.(input.value.length, input.value.length);
    }));
    return true;
  };

  const cleanupTabs = () => {
    const tabs = document.querySelector('#game-ui .ui-tabs');
    if (!tabs) return;
    tabs.querySelectorAll('.gameplay-ui-tab').forEach(button => button.remove());
    tabs.querySelectorAll('[data-gameplay-original-label]').forEach(button => {
      button.textContent = button.dataset.gameplayOriginalLabel || button.textContent;
      delete button.dataset.gameplayOriginalLabel;
    });
  };

  const syncTabs = () => {
    const tabs = document.querySelector('#game-ui .ui-tabs');
    if (!tabs) return;
    cleanupTabs();
    const schema = schemaFor(App.activeCharacter);
    applyTheme(document.getElementById('game-ui'), schema);
    if (!schema || App.config?.displayMode !== 'ui' || !schema.panels.length) return;
    schema.panels.forEach(panel => {
      let button = [...tabs.querySelectorAll('.ui-tab')].find(item => item.dataset.panel === panel.id);
      if (button) {
        if (!button.dataset.gameplayOriginalLabel) button.dataset.gameplayOriginalLabel = button.textContent || '';
        button.textContent = panel.label;
        return;
      }
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'ui-tab gameplay-ui-tab';
      button.dataset.panel = panel.id;
      button.textContent = panel.label;
      button.addEventListener('click', () => {
        tabs.querySelectorAll('.ui-tab').forEach(item => item.classList.remove('active'));
        button.classList.add('active');
        App.renderUIPanel(panel.id);
      });
      const memory = tabs.querySelector('.ui-tab[data-panel="memory"]');
      if (memory) tabs.insertBefore(button, memory); else tabs.appendChild(button);
    });
  };

  const activateInitialPanel = () => {
    const schema = schemaFor(App.activeCharacter);
    const first = schema?.panels?.[0];
    const tabs = document.querySelector('#game-ui .ui-tabs');
    if (!first || !tabs || App.config?.displayMode !== 'ui') return;
    tabs.querySelectorAll('.ui-tab').forEach(item => item.classList.toggle('active', item.dataset.panel === first.id));
    App.renderUIPanel(first.id);
  };

  const originalOpenBuilder = App.openBuilder.bind(App);
  App.openBuilder = function(...args) {
    const result = originalOpenBuilder(...args);
    mountBuilder(true);
    return result;
  };

  const originalCollectConfig = App.collectConfig.bind(App);
  App.collectConfig = function(...args) {
    const config = originalCollectConfig(...args);
    const schema = schemaFor(this.activeCharacter);
    if (schema && (schema.builder.attributes.length || schema.builder.fields.length)) {
      config.gameplaySetup = Core.normalizeBuilderValues(schema, builderValue(schema));
    }
    return config;
  };

  const originalCreate = GameState.create.bind(GameState);
  GameState.create = function(character, config) {
    const state = originalCreate(character, config);
    const schema = schemaFor(character);
    if (schema) {
      mergeInitialModules(state, character);
      if (config?.gameplaySetup) Core.applyBuilderValues(schema, config.gameplaySetup, state);
      state.gameplayUIVersion = 1;
    }
    return state;
  };

  const originalPanel = App.renderUIPanel.bind(App);
  App.renderUIPanel = function(panel, ...args) {
    if (renderPanel(String(panel || ''))) return;
    return originalPanel(panel, ...args);
  };

  const originalRenderChat = App.renderChatShell.bind(App);
  App.renderChatShell = function(...args) {
    const result = originalRenderChat(...args);
    syncTabs();
    activateInitialPanel();
    syncPlayerIdentityLabel();
    return result;
  };

  const originalApplyUpdate = typeof GameState.applyUpdate === 'function' ? GameState.applyUpdate.bind(GameState) : null;
  if (originalApplyUpdate) {
    GameState.applyUpdate = function(...args) {
      const result = originalApplyUpdate(...args);
      queueMicrotask(syncPlayerIdentityLabel);
      return result;
    };
  }

  window.BAOGameplayUI = Object.freeze({ schemaFor, mountBuilder, renderPanel, syncTabs, activateInitialPanel, syncPlayerIdentityLabel, applyTheme, clearTheme });
})();
