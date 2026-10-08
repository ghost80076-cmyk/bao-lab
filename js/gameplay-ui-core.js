/* BAO/LAB Gameplay UI Engine core. Pure helpers: no DOM, storage, network, or model calls. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BAOGameplayUICore = api;
})(typeof self !== 'undefined' ? self : null, function() {
  'use strict';

  const MAX_PANELS = 8;
  const MAX_SECTIONS = 10;
  const MAX_ITEMS = 24;
  const MAX_ATTRIBUTES = 16;
  const MAX_FIELDS = 20;
  const MAX_OPTIONS = 40;
  const THEME_PRESETS = Object.freeze(['default', 'arcane-night', 'stage-neon', 'parchment', 'noir']);
  const THEME_DENSITIES = Object.freeze(['comfortable', 'compact']);
  const THEME_RADII = Object.freeze(['round', 'soft', 'sharp']);
  const THEME_METERS = Object.freeze(['soft', 'solid', 'glow']);
  const LAYOUT_PRESETS = Object.freeze(['standard', 'rpg-dashboard', 'scene-rpg']);
  const SCENE_SOURCES = Object.freeze(['story-gallery', 'reading-background', 'avatar']);
  const SCENE_FITS = Object.freeze(['cover', 'contain']);
  const SAFE_KEY = /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/;
  const SAFE_COLOR = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;
  const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

  const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const clone = value => {
    try { return structuredClone(value); }
    catch (_) { return JSON.parse(JSON.stringify(value ?? null)); }
  };
  const key = value => {
    const text = String(value ?? '').trim();
    return SAFE_KEY.test(text) && !BLOCKED_KEYS.has(text) ? text : '';
  };
  const label = (value, fallback = '') => String(value ?? fallback).trim().slice(0, 60);
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const enumValue = (value, allowed, fallback) => allowed.includes(String(value || '')) ? String(value) : fallback;
  const themeColor = value => {
    const text = String(value || '').trim();
    if (!SAFE_COLOR.test(text)) return '';
    if (text.length === 4) return ('#' + [...text.slice(1)].map(ch => ch + ch).join('')).toLowerCase();
    return text.toLowerCase();
  };

  function normalizeTheme(raw) {
    const source = typeof raw === 'string' ? { preset: raw } : (isObject(raw) ? raw : {});
    const result = {
      preset: enumValue(source.preset, THEME_PRESETS, 'default'),
      density: enumValue(source.density, THEME_DENSITIES, 'comfortable'),
      radius: enumValue(source.radius, THEME_RADII, 'round'),
      meter: enumValue(source.meter, THEME_METERS, 'soft')
    };
    for (const name of ['accent', 'surface', 'surface_alt', 'text', 'border', 'muted']) {
      const value = themeColor(source[name]);
      if (value) result[name] = value;
    }
    return result;
  }

  function splitPath(path) {
    const parts = String(path ?? '').trim().split('.').filter(Boolean);
    if (!parts.length || parts.some(part => !key(part))) return [];
    return parts;
  }

  function isTargetPath(path) {
    const parts = splitPath(path);
    return parts.length >= 2 && parts.length <= 6 && parts[0] === 'modules';
  }

  function isDisplayPath(path) {
    const text = String(path ?? '').trim();
    if (['time', 'location', 'events', 'npcs'].includes(text)) return true;
    return isTargetPath(text);
  }

  function getPath(source, path) {
    if (!isDisplayPath(path)) return undefined;
    const parts = splitPath(path);
    if (!parts.length) return source?.[String(path || '')];
    let cursor = source;
    for (const part of parts) {
      if (!isObject(cursor) && !Array.isArray(cursor)) return undefined;
      cursor = cursor?.[part];
    }
    return cursor;
  }

  function setPath(source, path, value) {
    if (!isObject(source) || !isTargetPath(path)) return false;
    const parts = splitPath(path);
    let cursor = source;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const part = parts[index];
      if (!isObject(cursor[part])) cursor[part] = {};
      cursor = cursor[part];
    }
    cursor[parts.at(-1)] = clone(value);
    return true;
  }

  function normalizeAttribute(raw, index) {
    if (!isObject(raw)) return null;
    const attrKey = key(raw.key || `stat_${index + 1}`);
    const targetPath = String(raw.target_path || raw.path || '').trim();
    if (!attrKey || !isTargetPath(targetPath)) return null;
    let min = finite(raw.min, 0);
    let max = finite(raw.max, Math.max(min, 100));
    if (min > max) [min, max] = [max, min];
    const base = Math.max(min, Math.min(max, finite(raw.base, min)));
    return {
      key: attrKey,
      label: label(raw.label, attrKey),
      min,
      max,
      base,
      step: Math.max(1, Math.min(100, finite(raw.step, 1))),
      target_path: targetPath,
      description: String(raw.description || '').trim().slice(0, 180)
    };
  }

  function normalizeField(raw, index) {
    if (!isObject(raw)) return null;
    const fieldKey = key(raw.key || `field_${index + 1}`);
    const targetPath = String(raw.target_path || raw.path || '').trim();
    if (!fieldKey || !isTargetPath(targetPath)) return null;
    const type = ['text', 'select', 'number', 'boolean'].includes(raw.type) ? raw.type : 'text';
    const options = type === 'select'
      ? (Array.isArray(raw.options) ? raw.options : []).map(value => String(value ?? '').trim()).filter(Boolean).slice(0, MAX_OPTIONS)
      : [];
    let defaultValue = raw.default;
    if (type === 'select') defaultValue = options.includes(String(defaultValue)) ? String(defaultValue) : (options[0] || '');
    else if (type === 'number') defaultValue = finite(defaultValue, finite(raw.min, 0));
    else if (type === 'boolean') defaultValue = Boolean(defaultValue);
    else defaultValue = String(defaultValue ?? '').slice(0, 240);
    return {
      key: fieldKey,
      label: label(raw.label, fieldKey),
      type,
      target_path: targetPath,
      options,
      default: defaultValue,
      min: type === 'number' && Number.isFinite(Number(raw.min)) ? Number(raw.min) : undefined,
      max: type === 'number' && Number.isFinite(Number(raw.max)) ? Number(raw.max) : undefined,
      placeholder: String(raw.placeholder || '').slice(0, 120)
    };
  }

  function normalizePanelItem(raw, sectionType, index) {
    if (!isObject(raw)) return null;
    if (sectionType === 'actions') {
      const draft = String(raw.draft || '').trim().slice(0, 500);
      if (!draft) return null;
      return { label: label(raw.label, `行動 ${index + 1}`), draft, hint: String(raw.hint || '').trim().slice(0, 120) };
    }
    if (sectionType === 'meters') {
      const valuePath = String(raw.value_path || raw.path || '').trim();
      const maxPath = String(raw.max_path || '').trim();
      if (!isDisplayPath(valuePath) || (maxPath && !isDisplayPath(maxPath))) return null;
      return {
        label: label(raw.label, `數值 ${index + 1}`),
        value_path: valuePath,
        max_path: maxPath,
        min: finite(raw.min, 0),
        max: maxPath ? undefined : finite(raw.max, 100),
        suffix: String(raw.suffix || '').slice(0, 20)
      };
    }
    const path = String(raw.path || '').trim();
    if (!isDisplayPath(path)) return null;
    return { label: label(raw.label, `項目 ${index + 1}`), path, suffix: String(raw.suffix || '').slice(0, 20) };
  }

  function normalizeSection(raw, index) {
    if (!isObject(raw)) return null;
    const type = ['meters', 'stats', 'list', 'actions'].includes(raw.type) ? raw.type : 'stats';
    if (type === 'list') {
      const path = String(raw.path || '').trim();
      if (!isDisplayPath(path)) return null;
      return { type, title: label(raw.title, ''), path, empty: String(raw.empty || '目前沒有資料。').slice(0, 120), limit: Math.max(1, Math.min(30, finite(raw.limit, 8))) };
    }
    const items = (Array.isArray(raw.items) ? raw.items : [])
      .map((item, itemIndex) => normalizePanelItem(item, type, itemIndex))
      .filter(Boolean)
      .slice(0, MAX_ITEMS);
    if (!items.length) return null;
    return { type, title: label(raw.title, ''), items };
  }

  function normalizePanel(raw, index) {
    if (!isObject(raw)) return null;
    const id = key(raw.id || `panel_${index + 1}`);
    if (!id) return null;
    const sections = (Array.isArray(raw.sections) ? raw.sections : [])
      .map((section, sectionIndex) => normalizeSection(section, sectionIndex))
      .filter(Boolean)
      .slice(0, MAX_SECTIONS);
    if (!sections.length) return null;
    return { id, label: label(raw.label, id), sections };
  }

  function normalizeLayout(raw, panels = []) {
    const source = isObject(raw) ? raw : {};
    const preset = enumValue(source.preset, LAYOUT_PRESETS, 'standard');
    if (preset === 'standard') return { preset: 'standard', left_panel: '', right_panel: '', scene_source: 'story-gallery', scene_fit: 'cover' };
    const ids = new Set((Array.isArray(panels) ? panels : []).map(panel => panel.id));
    const panelId = value => {
      const id = key(value);
      return id && ids.has(id) ? id : '';
    };
    const left = panelId(source.left_panel || source.left);
    const rightCandidate = panelId(source.right_panel || source.right);
    if (preset === 'scene-rpg') {
      return {
        preset,
        left_panel: '',
        right_panel: rightCandidate,
        scene_source: enumValue(source.scene_source, SCENE_SOURCES, 'story-gallery'),
        scene_fit: enumValue(source.scene_fit, SCENE_FITS, 'cover')
      };
    }
    return {
      preset,
      left_panel: left,
      right_panel: rightCandidate && rightCandidate !== left ? rightCandidate : '',
      scene_source: 'story-gallery',
      scene_fit: 'cover'
    };
  }

  function normalize(raw) {
    if (!isObject(raw) || raw.enabled === false) return null;
    const version = finite(raw.version, 1);
    if (version !== 1) return null;
    const builderRaw = isObject(raw.builder) ? raw.builder : {};
    const attributes = (Array.isArray(builderRaw.attributes) ? builderRaw.attributes : [])
      .map((item, index) => normalizeAttribute(item, index)).filter(Boolean).slice(0, MAX_ATTRIBUTES);
    const fields = (Array.isArray(builderRaw.fields) ? builderRaw.fields : [])
      .map((item, index) => normalizeField(item, index)).filter(Boolean).slice(0, MAX_FIELDS);
    const panels = (Array.isArray(raw.panels) ? raw.panels : [])
      .map((item, index) => normalizePanel(item, index)).filter(Boolean).slice(0, MAX_PANELS);
    const seenPanel = new Set();
    const uniquePanels = panels.filter(panel => !seenPanel.has(panel.id) && seenPanel.add(panel.id));
    const seenBuilder = new Set();
    const uniqueAttributes = attributes.filter(item => !seenBuilder.has(item.key) && seenBuilder.add(item.key));
    const uniqueFields = fields.filter(item => !seenBuilder.has(item.key) && seenBuilder.add(item.key));
    if (!uniqueAttributes.length && !uniqueFields.length && !uniquePanels.length) return null;
    const layout = normalizeLayout(raw.layout, uniquePanels);
    return {
      version: 1,
      enabled: true,
      theme: normalizeTheme(raw.theme),
      layout,
      builder: {
        title: label(builderRaw.title, '角色設定'),
        description: String(builderRaw.description || '').trim().slice(0, 300),
        point_pool: Math.max(0, Math.min(999, finite(builderRaw.point_pool, 0))),
        attributes: uniqueAttributes,
        fields: uniqueFields
      },
      panels: uniquePanels
    };
  }

  function builderDefaults(schema) {
    const s = normalize(schema);
    if (!s) return {};
    const values = {};
    s.builder.attributes.forEach(attr => { values[attr.key] = attr.base; });
    s.builder.fields.forEach(field => { values[field.key] = clone(field.default); });
    return values;
  }

  function attributeCost(schema, values) {
    const s = normalize(schema);
    if (!s) return 0;
    return s.builder.attributes.reduce((sum, attr) => {
      const current = Math.max(attr.base, Math.min(attr.max, finite(values?.[attr.key], attr.base)));
      return sum + Math.ceil((current - attr.base) / attr.step);
    }, 0);
  }

  function remainingPoints(schema, values) {
    const s = normalize(schema);
    if (!s) return 0;
    return Math.max(0, s.builder.point_pool - attributeCost(s, values));
  }

  function normalizeBuilderValues(schema, rawValues) {
    const s = normalize(schema);
    if (!s) return {};
    const input = isObject(rawValues) ? rawValues : {};
    const values = builderDefaults(s);
    let available = s.builder.point_pool;
    s.builder.attributes.forEach(attr => {
      const requested = Math.max(attr.base, Math.min(attr.max, finite(input[attr.key], attr.base)));
      const requestedSteps = Math.ceil((requested - attr.base) / attr.step);
      const grantedSteps = Math.max(0, Math.min(requestedSteps, available));
      values[attr.key] = Math.min(attr.max, attr.base + grantedSteps * attr.step);
      available -= grantedSteps;
    });
    s.builder.fields.forEach(field => {
      const value = input[field.key];
      if (field.type === 'select') values[field.key] = field.options.includes(String(value)) ? String(value) : field.default;
      else if (field.type === 'number') {
        let n = finite(value, field.default);
        if (Number.isFinite(field.min)) n = Math.max(field.min, n);
        if (Number.isFinite(field.max)) n = Math.min(field.max, n);
        values[field.key] = n;
      } else if (field.type === 'boolean') values[field.key] = Boolean(value);
      else values[field.key] = String(value ?? field.default).slice(0, 240);
    });
    return values;
  }

  function applyBuilderValues(schema, rawValues, state) {
    const s = normalize(schema);
    if (!s || !isObject(state)) return false;
    const values = normalizeBuilderValues(s, rawValues);
    let changed = false;
    s.builder.attributes.forEach(attr => { changed = setPath(state, attr.target_path, values[attr.key]) || changed; });
    s.builder.fields.forEach(field => { changed = setPath(state, field.target_path, values[field.key]) || changed; });
    return changed;
  }

  return Object.freeze({
    MAX_PANELS, MAX_SECTIONS, MAX_ITEMS, MAX_ATTRIBUTES, MAX_FIELDS,
    THEME_PRESETS, THEME_DENSITIES, THEME_RADII, THEME_METERS, LAYOUT_PRESETS, SCENE_SOURCES, SCENE_FITS,
    normalize, normalizeTheme, normalizeLayout, builderDefaults, attributeCost, remainingPoints, normalizeBuilderValues,
    applyBuilderValues, getPath, setPath, isTargetPath, isDisplayPath
  });
});
