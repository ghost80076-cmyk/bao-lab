/* BAO/LAB opt-in Gameplay UI Engine. Cards without gameplay_ui keep the legacy path unchanged. */
(() => {
  'use strict';
  if (typeof App === 'undefined' || typeof GameState === 'undefined' || !window.BAOGameplayUICore || window.BAOGameplayUI) return;

  const Core = window.BAOGameplayUICore;
  const builderDrafts = new Map();
  let cacheCharacter = null;
  let cacheRaw = null;
  let cacheSchema = null;
  let sceneObjectURL = '';
  let sceneSyncToken = 0;
  const archiveTabSelection = new Map();
  const roundDiffByState = new WeakMap();
  const locationObjectURLs = new Map();
  let locationHydrateToken = 0;

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
    if (node.textContent !== label) node.textContent = label;
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
      const selected = typeof value === 'object' ? value.option : value;
      const custom = typeof value === 'object' ? value.custom || '' : '';
      return `<select ${common}>${field.options.map(option => `<option value="${esc(option)}" ${String(selected) === option ? 'selected' : ''}>${esc(option)}</option>`).join('')}</select>${field.custom_option ? `<input data-gameplay-custom="${esc(field.key)}" type="text" maxlength="240" value="${esc(custom)}" placeholder="${esc(field.placeholder || '請輸入自訂' + field.label)}" aria-label="${esc('自訂' + field.label)}" ${selected === field.custom_option ? '' : 'hidden'}>` : ''}`;
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
        const normalized = Core.normalizeBuilderValues(activeSchema, values);
        activeSchema.builder.attributes.forEach(item => { values[item.key] = normalized[item.key]; });
        renderBuilder(box, activeSchema, values);
      });
      const updateField = event => {
        const input = event.target.closest?.('[data-gameplay-field], [data-gameplay-custom]');
        if (!input) return;
        const activeSchema = schemaFor(App.activeCharacter);
        if (!activeSchema) return;
        const field = activeSchema.builder.fields.find(item => item.key === (input.dataset.gameplayField || input.dataset.gameplayCustom));
        if (!field) return;
        const values = builderValue(activeSchema);
        if (field.custom_option) {
          const previous = values[field.key];
          const draft = typeof previous === 'object' ? previous : { option: previous, custom: '' };
          if (input.dataset.gameplayCustom) draft.custom = input.value;
          else {
            draft.option = input.value;
            const customInput = Array.from(box.querySelectorAll('[data-gameplay-custom]')).find(node => node.dataset.gameplayCustom === field.key);
            if (customInput) customInput.hidden = draft.option !== field.custom_option;
          }
          values[field.key] = draft;
        } else values[field.key] = field.type === 'boolean' ? input.checked : input.value;
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

  const cardText = value => {
    if (value === undefined || value === null || value === '') return '';
    if (Array.isArray(value)) return value.map(item => cardText(item)).filter(Boolean).join('、');
    if (typeof value === 'object') return '';
    return displayValue(String(value));
  };

  const gameplayCardHTML = (entry, variant, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      const text = cardText(entry);
      return text ? `<article class="gameplay-data-card" data-card-variant="${esc(variant)}"><strong>${esc(text)}</strong></article>` : '';
    }
    const first = (...keys) => {
      for (const key of keys) {
        const value = cardText(entry[key]);
        if (value) return value;
      }
      return '';
    };
    const presence = first('presence', 'status', 'state');
    if (variant === 'codex') {
      const title = first('name', 'title') || `人物 ${index + 1}`;
      const role = first('role', 'identity', 'class');
      const mood = first('mood');
      const location = first('location');
      const relation = first('relationship', 'relation');
      return `<article class="gameplay-data-card" data-card-variant="codex"><header><strong>${esc(title)}</strong>${presence ? `<span>${esc(presence)}</span>` : ''}</header>${role ? `<p class="gameplay-card-lead">${esc(role)}</p>` : ''}<div class="gameplay-card-tags">${location ? `<small>📍 ${esc(location)}</small>` : ''}${mood ? `<small>情緒 · ${esc(mood)}</small>` : ''}${relation ? `<small>關係 · ${esc(relation)}</small>` : ''}</div></article>`;
    }
    if (variant === 'quest') {
      const title = first('title', 'name', 'quest') || `任務 ${index + 1}`;
      const summary = first('summary', 'description', 'objective');
      const progress = first('progress');
      const reward = first('reward');
      return `<article class="gameplay-data-card" data-card-variant="quest"><header><strong>${esc(title)}</strong>${presence ? `<span>${esc(presence)}</span>` : ''}</header>${summary ? `<p>${esc(summary)}</p>` : ''}<div class="gameplay-card-tags">${progress ? `<small>進度 · ${esc(progress)}</small>` : ''}${reward ? `<small>報酬 · ${esc(reward)}</small>` : ''}</div></article>`;
    }
    if (variant === 'party') {
      const title = first('name', 'title') || `成員 ${index + 1}`;
      const role = first('role', 'class', 'job');
      const hp = first('hp');
      const maxHp = first('max_hp', 'maxHp');
      const note = first('notes', 'summary', 'condition');
      return `<article class="gameplay-data-card" data-card-variant="party"><header><strong>${esc(title)}</strong>${presence ? `<span>${esc(presence)}</span>` : ''}</header>${role ? `<p class="gameplay-card-lead">${esc(role)}</p>` : ''}<div class="gameplay-card-tags">${hp ? `<small>HP · ${esc(hp)}${maxHp ? ` / ${esc(maxHp)}` : ''}</small>` : ''}</div>${note ? `<p>${esc(note)}</p>` : ''}</article>`;
    }
    const title = first('name', 'title') || `技能 ${index + 1}`;
    const level = first('level', 'rank');
    const cost = first('cost', 'mp_cost', 'energy_cost');
    const cooldown = first('cooldown');
    const description = first('description', 'summary', 'effect');
    return `<article class="gameplay-data-card" data-card-variant="skill"><header><strong>${esc(title)}</strong>${level ? `<span>${esc(level)}</span>` : ''}</header>${description ? `<p>${esc(description)}</p>` : ''}<div class="gameplay-card-tags">${cost ? `<small>消耗 · ${esc(cost)}</small>` : ''}${cooldown ? `<small>冷卻 · ${esc(cooldown)}</small>` : ''}</div></article>`;
  };

  const timelineEntryHTML = (entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      const text = cardText(entry);
      return text ? `<article class="gameplay-timeline-entry"><i></i><div><strong>紀錄 ${index + 1}</strong><p>${esc(text)}</p></div></article>` : '';
    }
    const first = (...keys) => {
      for (const key of keys) {
        const value = cardText(entry[key]);
        if (value) return value;
      }
      return '';
    };
    const title = first('title', 'name', 'label') || `紀錄 ${index + 1}`;
    const summary = first('summary', 'description', 'text', 'event');
    const tag = first('tag', 'status', 'type');
    const time = first('time', 'date', 'chapter');
    return `<article class="gameplay-timeline-entry"><i></i><div><header><strong>${esc(title)}</strong>${tag ? `<span>${esc(tag)}</span>` : ''}</header>${time ? `<small>${esc(time)}</small>` : ''}${summary ? `<p>${esc(summary)}</p>` : ''}</div></article>`;
  };

  const summarizeDiffValue = value => {
    if (value === undefined || value === null || value === '') return '—';
    if (Array.isArray(value)) {
      if (!value.length) return '—';
      return value.slice(0, 8).map(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return cardText(item);
        const title = cardText(item.name || item.title || item.label || item.id);
        const state = cardText(item.status || item.progress || item.relationship || item.state);
        return [title, state ? `（${state}）` : ''].join('') || '項目';
      }).filter(Boolean).join('、');
    }
    if (typeof value === 'object') {
      const title = cardText(value.name || value.title || value.label || value.status || value.state || value.value);
      if (title) return title;
      try {
        const json = JSON.stringify(value);
        return json.length > 180 ? `${json.slice(0, 180)}…` : json;
      } catch (_) { return '已更新'; }
    }
    return displayValue(String(value));
  };

  const roundDiffWatchItems = schema => {
    const out = [];
    const seen = new Set();
    const visit = sections => (Array.isArray(sections) ? sections : []).forEach(section => {
      if (section?.type === 'timeline' && section.mode === 'round_diff') {
        (section.items || []).forEach(item => {
          if (!item?.path || seen.has(item.path)) return;
          seen.add(item.path);
          out.push({ label: item.label || item.path, path: item.path });
        });
      }
      if (section?.type === 'tabs') (section.tabs || []).forEach(tab => visit(tab.sections));
    });
    (schema?.panels || []).forEach(panel => visit(panel.sections));
    return out;
  };

  const snapshotRoundDiff = (state, items) => {
    const values = new Map();
    (items || []).forEach(item => values.set(item.path, clone(Core.getPath(state || {}, item.path))));
    return values;
  };

  const computeRoundDiff = (before, after, items) => (items || []).flatMap(item => {
    const previous = before?.get(item.path);
    const current = after?.get(item.path);
    let same = false;
    try { same = JSON.stringify(previous) === JSON.stringify(current); } catch (_) { same = previous === current; }
    return same ? [] : [{ path: item.path, label: item.label, before: previous, after: current }];
  });

  const locationArchiveHTML = (section, state) => {
    const time = displayValue(formatValue(Core.getPath(state, section.time_path)));
    const location = displayValue(formatValue(Core.getPath(state, section.location_path)));
    const area = section.area_path ? displayValue(formatValue(Core.getPath(state, section.area_path))) : '';
    const status = section.status_path ? displayValue(formatValue(Core.getPath(state, section.status_path))) : '';
    const rawDestinations = section.destinations_path ? Core.getPath(state, section.destinations_path) : [];
    const destinations = Array.isArray(rawDestinations) ? rawDestinations.slice(0, section.limit) : [];
    const cards = destinations.map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        const name = cardText(entry) || `地點 ${index + 1}`;
        return `<article class="gameplay-destination-card"><header><strong>${esc(name)}</strong></header></article>`;
      }
      const name = cardText(entry.name || entry.title || entry.label) || `地點 ${index + 1}`;
      const summary = cardText(entry.summary || entry.description);
      const current = entry.current === true || String(entry.status || '').toLowerCase() === 'current';
      const draft = cardText(entry.draft);
      return `<article class="gameplay-destination-card${current ? ' is-current' : ''}"><header><strong>${esc(name)}</strong>${current ? '<span>目前</span>' : ''}</header>${summary ? `<p>${esc(summary)}</p>` : ''}${draft ? `<button type="button" class="secondary" data-gameplay-draft-text="${esc(draft)}">前往</button>` : ''}</article>`;
    }).join('');
    return `<section class="gameplay-ui-section gameplay-location-archive" data-gameplay-location-archive data-scene-source="${esc(section.scene_source)}" data-scene-fit="${esc(section.scene_fit)}"><div class="gameplay-location-title"><span>STORY LOCATION</span><h4>${esc(section.title)}</h4></div><div class="gameplay-location-media"><img alt=""><div class="gameplay-location-placeholder">SCENE</div></div><div class="gameplay-location-facts"><div><small>TIME</small><b>${esc(time)}</b></div><div><small>LOCATION</small><b>${esc(location)}</b></div>${section.area_path ? `<div><small>AREA</small><b>${esc(area)}</b></div>` : ''}${section.status_path ? `<div><small>STATUS</small><b>${esc(status)}</b></div>` : ''}</div><div class="gameplay-location-index"><h5>LOCATION INDEX</h5><div class="gameplay-destination-list">${cards || `<span class="gameplay-card-empty">${esc(displayValue(section.empty))}</span>`}</div></div></section>`;
  };

  const sectionHTML = (section, state, contextKey = 'panel') => {
    const heading = section.title ? `<h4>${esc(section.title)}</h4>` : '';
    if (section.type === 'meters') return `<section class="gameplay-ui-section">${heading}<div class="gameplay-meter-grid">${section.items.map(item => meterHTML(item, state)).join('')}</div></section>`;
    if (section.type === 'stats') return `<section class="gameplay-ui-section">${heading}<div class="gameplay-stat-grid">${section.items.map(item => `<div><small>${esc(item.label)}</small><b>${esc(displayValue(formatValue(Core.getPath(state, item.path))))}${item.suffix ? ` ${esc(displayValue(item.suffix))}` : ''}</b></div>`).join('')}</div></section>`;
    if (section.type === 'list') {
      const value = Core.getPath(state, section.path);
      const list = Array.isArray(value) ? value.slice(0, section.limit) : [];
      return `<section class="gameplay-ui-section">${heading}<div class="gameplay-list">${list.length ? list.map(item => `<div>• ${esc(displayValue(formatValue(item)))}</div>`).join('') : `<span>${esc(displayValue(section.empty))}</span>`}</div></section>`;
    }
    if (section.type === 'cards') {
      const value = Core.getPath(state, section.path);
      const list = Array.isArray(value) ? value.slice(0, section.limit) : [];
      const cards = list.map((item, index) => gameplayCardHTML(item, section.variant, index)).filter(Boolean).join('');
      return `<section class="gameplay-ui-section">${heading}<div class="gameplay-card-grid" data-card-variant="${esc(section.variant)}">${cards || `<span class="gameplay-card-empty">${esc(displayValue(section.empty))}</span>`}</div></section>`;
    }
    if (section.type === 'tabs') {
      const selectionKey = `${contextKey}:${section.id}`;
      const remembered = archiveTabSelection.get(selectionKey);
      const active = section.tabs.some(tab => tab.id === remembered) ? remembered : section.default_tab;
      const buttons = section.tabs.map(tab => `<button type="button" class="gameplay-archive-tab${tab.id === active ? ' active' : ''}" role="tab" aria-selected="${tab.id === active ? 'true' : 'false'}" data-gameplay-archive-tab="${esc(tab.id)}">${esc(tab.label)}</button>`).join('');
      const panes = section.tabs.map(tab => `<div class="gameplay-archive-pane" data-gameplay-archive-pane="${esc(tab.id)}" ${tab.id === active ? '' : 'hidden'}>${tab.sections.map(child => sectionHTML(child, state, `${selectionKey}:${tab.id}`)).join('')}</div>`).join('');
      return `<section class="gameplay-ui-section gameplay-tabbed-archive" data-gameplay-tabset="${esc(selectionKey)}">${heading}<div class="gameplay-archive-tabs" role="tablist">${buttons}</div>${panes}</section>`;
    }
    if (section.type === 'location_archive') return locationArchiveHTML(section, state);
    if (section.type === 'timeline') {
      if (section.mode === 'history') {
        const value = Core.getPath(state, section.path);
        const list = Array.isArray(value) ? value.slice(0, section.limit) : [];
        const entries = list.map((entry, index) => timelineEntryHTML(entry, index)).filter(Boolean).join('');
        return `<section class="gameplay-ui-section gameplay-timeline">${heading}<div class="gameplay-timeline-list">${entries || `<span class="gameplay-card-empty">${esc(displayValue(section.empty))}</span>`}</div></section>`;
      }
      const allowed = new Set((section.items || []).map(item => item.path));
      const diffs = (roundDiffByState.get(state) || []).filter(item => allowed.has(item.path));
      const entries = diffs.map(item => `<article class="gameplay-timeline-entry is-diff"><i></i><div><strong>${esc(item.label)}</strong><p><span>${esc(summarizeDiffValue(item.before))}</span><b>→</b><span>${esc(summarizeDiffValue(item.after))}</span></p></div></article>`).join('');
      return `<section class="gameplay-ui-section gameplay-timeline" data-timeline-mode="round_diff">${heading}<div class="gameplay-timeline-list">${entries || `<span class="gameplay-card-empty">${esc(displayValue(section.empty))}</span>`}</div></section>`;
    }
    if (section.type === 'actions') return `<section class="gameplay-ui-section">${heading}<div class="gameplay-actions">${section.items.map((item, index) => `<button type="button" class="secondary" ${item.effect ? `data-gameplay-effect="${esc(JSON.stringify(item.effect))}"` : `data-gameplay-draft="${index}" data-gameplay-draft-text="${esc(item.draft)}"`}>${esc(item.label)}</button>${item.hint ? `<small>${esc(item.hint)}</small>` : ''}`).join('')}</div></section>`;
    return '';
  };

  const panelHTML = (panel, state) => `<div class="gameplay-ui-panel" data-gameplay-panel="${esc(panel.id)}">${panel.sections.map(section => sectionHTML(section, state, panel.id)).join('')}</div>`;

  const bindDraftActions = root => {
    root?.querySelectorAll?.('[data-gameplay-draft-text]').forEach(button => button.addEventListener('click', () => {
      const input = document.getElementById('user-input');
      if (!input) return;
      input.value = button.dataset.gameplayDraftText || '';
      input.focus();
      input.setSelectionRange?.(input.value.length, input.value.length);
    }));
  };

  const bindEffectActions = root => {
    root?.querySelectorAll?.('[data-gameplay-effect]').forEach(button => button.addEventListener('click', () => {
      if (button.disabled || button.dataset.gameplayEffectBusy === '1') return;
      button.dataset.gameplayEffectBusy = '1';
      const notify = message => {
        if (window.BAOFeedback?.notify) window.BAOFeedback.notify(message);
        else window.alert(message);
      };
      try {
        if (App.config?.displayMode !== 'ui' || !GameState.current || !App.activeCharacter) {
          notify('目前沒有可以操作的遊戲狀態。');
          return;
        }
        window.BAOWorldModules?.ensureState?.(App.activeCharacter);
        const effect = JSON.parse(button.dataset.gameplayEffect || 'null');
        const result = Core.executeActionEffect(GameState.current, effect);
        if (!result.ok) {
          notify(result.reason);
          return;
        }
        button.disabled = true; // No repeated purchase from the same visible button.
        if (result.effect.event) GameState.addEvent('【遊戲操作】' + result.effect.event);
        App.saveStory(false);
        const activePanel = document.querySelector('#game-ui .ui-tab.active')?.dataset.panel || '';
        if (activePanel) App.renderUIPanel(activePanel);
        scheduleDashboardSync();
        notify(result.effect.event || '遊戲操作已完成。');
      } catch (error) {
        console.warn('BAO/LAB gameplay action failed:', error);
        notify('遊戲操作失敗，請重新整理狀態後再試。');
      } finally {
        delete button.dataset.gameplayEffectBusy;
      }
    }));
  };

  const bindArchiveTabs = root => {
    root?.querySelectorAll?.('[data-gameplay-tabset]').forEach(tabset => {
      const key = tabset.dataset.gameplayTabset || '';
      tabset.querySelectorAll(':scope > .gameplay-archive-tabs [data-gameplay-archive-tab]').forEach(button => {
        button.addEventListener('click', () => {
          const id = button.dataset.gameplayArchiveTab || '';
          if (!id) return;
          archiveTabSelection.set(key, id);
          tabset.querySelectorAll(':scope > .gameplay-archive-tabs [data-gameplay-archive-tab]').forEach(item => {
            const active = item.dataset.gameplayArchiveTab === id;
            item.classList.toggle('active', active);
            item.setAttribute('aria-selected', active ? 'true' : 'false');
          });
          tabset.querySelectorAll(':scope > .gameplay-archive-pane').forEach(pane => {
            pane.hidden = pane.dataset.gameplayArchivePane !== id;
          });
          void hydrateLocationArchives(tabset);
        });
      });
    });
  };

  const bindGameplayInteractions = root => {
    bindDraftActions(root);
    bindEffectActions(root);
    bindArchiveTabs(root);
    void hydrateLocationArchives(root);
  };

  const renderPanel = panelId => {
    const schema = schemaFor(App.activeCharacter);
    const panel = schema?.panels.find(item => item.id === panelId);
    const ui = document.getElementById('ui-panel');
    applyTheme(document.getElementById('game-ui'), schema);
    if (!panel || !ui || !GameState.current) return false;
    ui.innerHTML = panelHTML(panel, GameState.current);
    bindGameplayInteractions(ui);
    return true;
  };

  const dashboardPanelHTML = (panel, state) => `<div class="gameplay-dashboard-panel-head"><span>GAMEPLAY</span><b>${esc(panel.label)}</b></div>${panelHTML(panel, state)}`;

  const removeDashboardHost = id => document.getElementById(id)?.remove();

  const renderDashboardHost = (host, panel, schema) => {
    if (!host || !panel || !GameState.current) return false;
    applyTheme(host, schema);
    host.innerHTML = dashboardPanelHTML(panel, GameState.current);
    bindGameplayInteractions(host);
    return true;
  };

  const releaseSceneObjectURL = () => {
    if (!sceneObjectURL) return;
    try { URL.revokeObjectURL(sceneObjectURL); } catch (_) {}
    sceneObjectURL = '';
  };

  const removeSceneStage = () => {
    releaseSceneObjectURL();
    sceneSyncToken += 1;
    document.getElementById('bao-gameplay-scene-stage')?.remove();
  };

  const fallbackSceneURL = source => {
    const character = App.activeCharacter || {};
    if (source === 'avatar') return String(character.avatar || '');
    return String(character.reading_background || character.avatar || '');
  };

  const cleanupLocationObjectURLs = () => {
    for (const [node, url] of locationObjectURLs.entries()) {
      if (node?.isConnected) continue;
      try { URL.revokeObjectURL(url); } catch (_) {}
      locationObjectURLs.delete(node);
    }
  };

  const hydrateLocationArchives = async root => {
    if (!root) return;
    cleanupLocationObjectURLs();
    const nodes = [];
    if (root.matches?.('[data-gameplay-location-archive]')) nodes.push(root);
    root.querySelectorAll?.('[data-gameplay-location-archive]').forEach(node => nodes.push(node));
    if (!nodes.length) return;
    const token = ++locationHydrateToken;
    for (const node of nodes) {
      if (!node?.isConnected) continue;
      const image = node.querySelector('.gameplay-location-media img');
      if (!image) continue;
      const source = node.dataset.sceneSource || 'story-gallery';
      let src = '';
      let alt = '目前場景';
      let localURL = '';
      if (source === 'story-gallery') {
        try {
          const latest = await window.BAOStoryImageMoments?.latestForCurrentStory?.();
          if (token !== locationHydrateToken || !node.isConnected) {
            if (localURL) URL.revokeObjectURL(localURL);
            return;
          }
          if (latest?.file instanceof Blob) {
            localURL = URL.createObjectURL(latest.file);
            src = localURL;
            alt = String(latest.name || latest.messageLabel || '本機故事場景');
          }
        } catch (_) {}
      }
      if (!src) src = fallbackSceneURL(source);
      if (token !== locationHydrateToken || !node.isConnected) {
        if (localURL) URL.revokeObjectURL(localURL);
        return;
      }
      const previous = locationObjectURLs.get(node);
      if (previous && previous !== localURL) {
        try { URL.revokeObjectURL(previous); } catch (_) {}
        locationObjectURLs.delete(node);
      }
      if (localURL) locationObjectURLs.set(node, localURL);
      if (src) {
        image.src = src;
        image.alt = alt;
        node.classList.remove('is-empty');
      } else {
        image.removeAttribute('src');
        image.alt = '';
        node.classList.add('is-empty');
      }
    }
  };

  const ensureSceneStage = (layout, schema) => {
    const main = layout.querySelector(':scope > .chat-main');
    if (!main) return null;
    let stage = document.getElementById('bao-gameplay-scene-stage');
    if (!stage) {
      stage = document.createElement('section');
      stage.id = 'bao-gameplay-scene-stage';
      stage.className = 'gameplay-scene-stage';
      stage.innerHTML = '<div class="gameplay-scene-visual"><img alt=""><div class="gameplay-scene-placeholder"><b>SCENE</b><span>尚未加入場景圖片</span></div><div class="gameplay-scene-shade"></div><div class="gameplay-scene-meta"><span data-scene-time>—</span><strong data-scene-location>—</strong></div></div>';
      layout.insertBefore(stage, main);
    }
    applyTheme(stage, schema);
    stage.dataset.sceneFit = schema?.layout?.scene_fit || 'cover';
    const time = stage.querySelector('[data-scene-time]');
    const location = stage.querySelector('[data-scene-location]');
    if (time) time.textContent = displayValue(formatValue(GameState.current?.time));
    if (location) location.textContent = displayValue(formatValue(GameState.current?.location));
    return stage;
  };

  const paintSceneStage = async (stage, spec) => {
    if (!stage) return;
    const token = ++sceneSyncToken;
    const image = stage.querySelector('img');
    if (!image) return;
    let src = '';
    let alt = '目前場景';
    let localURL = '';

    if (spec?.scene_source === 'story-gallery') {
      try {
        const latest = await window.BAOStoryImageMoments?.latestForCurrentStory?.();
        if (token !== sceneSyncToken || !stage.isConnected) return;
        if (latest?.file instanceof Blob) {
          localURL = URL.createObjectURL(latest.file);
          src = localURL;
          alt = String(latest.name || latest.messageLabel || '本機故事場景');
        }
      } catch (_) {}
    }
    if (!src) src = fallbackSceneURL(spec?.scene_source);
    if (token !== sceneSyncToken || !stage.isConnected) {
      if (localURL) URL.revokeObjectURL(localURL);
      return;
    }
    releaseSceneObjectURL();
    if (localURL) sceneObjectURL = localURL;
    if (src) {
      image.src = src;
      image.alt = alt;
      stage.classList.remove('is-empty');
    } else {
      image.removeAttribute('src');
      image.alt = '';
      stage.classList.add('is-empty');
    }
  };

  const clearLayoutChrome = () => {
    removeDashboardHost('bao-gameplay-dashboard-left');
    removeDashboardHost('bao-gameplay-dashboard-right');
    removeSceneStage();
  };

  const syncGameplayLayout = () => {
    const root = document.getElementById('chat-view');
    const layout = root?.querySelector('.chat-layout');
    const schema = schemaFor(App.activeCharacter);
    const spec = schema?.layout;
    const enabled = Boolean(root && layout && App.config?.displayMode === 'ui' && spec);
    if (!root || !layout) return false;
    if (!enabled || spec.preset === 'standard') {
      delete root.dataset.gameplayLayout;
      clearLayoutChrome();
      return false;
    }

    if (spec.preset === 'scene-rpg') {
      removeDashboardHost('bao-gameplay-dashboard-left');
      removeDashboardHost('bao-gameplay-dashboard-right');
      root.dataset.gameplayLayout = 'scene-rpg';
      const stage = ensureSceneStage(layout, schema);
      void paintSceneStage(stage, spec);
      return true;
    }

    removeSceneStage();
    if (spec.preset !== 'rpg-dashboard') {
      delete root.dataset.gameplayLayout;
      removeDashboardHost('bao-gameplay-dashboard-left');
      removeDashboardHost('bao-gameplay-dashboard-right');
      return false;
    }

    root.dataset.gameplayLayout = 'rpg-dashboard';
    const leftPanel = schema.panels.find(panel => panel.id === spec.left_panel);
    const rightPanel = schema.panels.find(panel => panel.id === spec.right_panel);
    const leftAside = layout.querySelector(':scope > aside:not(.bao-status-rail)');

    if (leftAside && leftPanel) {
      let host = document.getElementById('bao-gameplay-dashboard-left');
      if (!host) {
        host = document.createElement('section');
        host.id = 'bao-gameplay-dashboard-left';
        host.className = 'gameplay-dashboard-panel gameplay-dashboard-left';
        const anchor = leftAside.querySelector('#chat-character-card');
        if (anchor) anchor.insertAdjacentElement('afterend', host);
        else leftAside.prepend(host);
      }
      renderDashboardHost(host, leftPanel, schema);
    } else removeDashboardHost('bao-gameplay-dashboard-left');

    const statusHost = document.querySelector('#bao-reading-status .bao-rail-status-host');
    if (statusHost && rightPanel) {
      let host = document.getElementById('bao-gameplay-dashboard-right');
      if (!host) {
        host = document.createElement('section');
        host.id = 'bao-gameplay-dashboard-right';
        host.className = 'gameplay-dashboard-panel gameplay-dashboard-right';
        statusHost.prepend(host);
      }
      renderDashboardHost(host, rightPanel, schema);
    } else removeDashboardHost('bao-gameplay-dashboard-right');

    return true;
  };

  const syncDashboardLayout = syncGameplayLayout;

  let dashboardSyncQueued = false;
  const scheduleDashboardSync = () => {
    if (dashboardSyncQueued) return;
    dashboardSyncQueued = true;
    requestAnimationFrame(() => {
      dashboardSyncQueued = false;
      syncGameplayLayout();
    });
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
    const preferredId = schema?.layout?.preset === 'scene-rpg' ? schema.layout.right_panel : '';
    const first = schema?.panels?.find(panel => panel.id === preferredId) || schema?.panels?.[0];
    const tabs = document.querySelector('#game-ui .ui-tabs');
    if (!first || !tabs || App.config?.displayMode !== 'ui') return;
    tabs.querySelectorAll('.ui-tab').forEach(item => item.classList.toggle('active', item.dataset.panel === first.id));
    App.renderUIPanel(first.id);
  };

  const originalOpenBuilder = App.openBuilder.bind(App);
  App.openBuilder = function(...args) {
    const result = originalOpenBuilder(...args);
    mountBuilder();
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
    scheduleDashboardSync();
    return result;
  };

  const personaMeta = document.getElementById('chat-persona');
  if (personaMeta) {
    let personaSyncQueued = false;
    new MutationObserver(() => {
      if (personaSyncQueued) return;
      personaSyncQueued = true;
      queueMicrotask(() => {
        personaSyncQueued = false;
        syncPlayerIdentityLabel();
      });
    }).observe(personaMeta, { childList: true, subtree: true, characterData: true });
  }

  const originalApplyUpdate = typeof GameState.applyUpdate === 'function' ? GameState.applyUpdate.bind(GameState) : null;
  if (originalApplyUpdate) {
    GameState.applyUpdate = function(...args) {
      const owner = this.current;
      const schema = schemaFor(App.activeCharacter);
      const watchItems = roundDiffWatchItems(schema);
      const before = owner && watchItems.length ? snapshotRoundDiff(owner, watchItems) : null;
      const result = originalApplyUpdate(...args);
      queueMicrotask(() => {
        if (owner && GameState.current === owner && before && watchItems.length) {
          const after = snapshotRoundDiff(owner, watchItems);
          roundDiffByState.set(owner, computeRoundDiff(before, after, watchItems));
        }
        syncPlayerIdentityLabel();
        const activePanel = document.querySelector('#game-ui .ui-tab.active')?.dataset.panel || '';
        if (activePanel) renderPanel(activePanel);
        scheduleDashboardSync();
      });
      return result;
    };
  }

  const dashboardLayout = document.querySelector('#chat-view .chat-layout');
  if (dashboardLayout) new MutationObserver(scheduleDashboardSync).observe(dashboardLayout, { childList: true });
  window.addEventListener('bao:story-image-album-changed', () => { scheduleDashboardSync(); void hydrateLocationArchives(document); });
  window.addEventListener('bao:story-image-module-ready', () => { scheduleDashboardSync(); void hydrateLocationArchives(document); });
  scheduleDashboardSync();

  window.BAOGameplayUI = Object.freeze({ schemaFor, mountBuilder, renderPanel, syncTabs, activateInitialPanel, syncPlayerIdentityLabel, syncGameplayLayout, syncDashboardLayout, scheduleDashboardSync, applyTheme, clearTheme, hydrateLocationArchives });
})();
