/* BAO/LAB Gameplay UI composer core. Pure helpers: no DOM, storage, network, or model calls.
 *
 * The composer edits a RAW draft. BAOGameplayUICore.normalize() is only used to
 * preview and diagnose that draft; its result must never replace the draft,
 * because normalize() fills defaults, trims content and silently drops incomplete,
 * duplicate, over-limit or unknown nodes.
 *
 * analyzeDraft() reports, per raw node, what normalize() would do to it. It mirrors the
 * order in which the core filters, caps and de-duplicates, so a node is flagged exactly
 * when the preview would not show it. Builder and theme diagnostics also use the
 * runtime normalizer; diagnosis never changes the editable draft.
 */
(function(root, factory) {
  const api = factory(root && root.BAOGameplayUICore || (typeof module === 'object' && module.exports ? require('./gameplay-ui-core.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BAOGameplayUIComposerCore = api;
})(typeof self !== 'undefined' ? self : null, function(defaultCore) {
  'use strict';

  const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
  const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

  /** Deep clone of JSON-compatible data; drops prototype-pollution keys. */
  function cloneDraft(value) {
    if (Array.isArray(value)) return value.map(cloneDraft);
    if (isObject(value)) {
      const out = {};
      for (const k of Object.keys(value)) if (!BLOCKED_KEYS.has(k)) out[k] = cloneDraft(value[k]);
      return out;
    }
    return value;
  }

  const STATUS = Object.freeze({
    OK: 'ok',
    INCOMPLETE: 'incomplete',     // normalize() drops it because it is empty or invalid
    TRIMMED: 'trimmed',           // kept, but some of its items are dropped
    OVER_LIMIT: 'over_limit',     // beyond a platform cap, dropped
    DUPLICATE: 'duplicate',       // same id as an earlier node, dropped
    UNRESOLVED: 'unresolved',     // a layout reference that normalize() clears
    WARNING: 'warning',
    INVALID: 'invalid'            // schema-level or enum-level rejection
  });

  const node = (path, kind, status, reason = '') => ({ path, kind, status, reason });

  const ITEM_SECTIONS = ['meters', 'stats', 'actions'];
  /** Sections whose `items` the composer inspects: meters, stats, actions, and timelines in round_diff mode. */
  const hasItems = section => isObject(section) && (ITEM_SECTIONS.includes(section.type) || (section.type === 'timeline' && section.mode === 'round_diff'));
  const text = value => String(value ?? '').trim();

  /**
   * Item-level diagnosis for `meters`, `stats` and `actions` sections: which raw items the core would drop and why.
   * Validity is asked of the core itself (a one-item probe), so the rules are never copied here;
   * only the *reason* is derived. Order mirrors the core: map → filter → cap.
   */
  function analyzeItems(core, section, sectionPath, nodes) {
    const type = section.type;
    // round_diff timelines read their items exactly like `stats` items, so ask the core about them as stats.
    const probeType = type === 'timeline' ? 'stats' : type;
    const rawItems = Array.isArray(section.items) ? section.items : [];
    let valid = 0;
    const seenPaths = new Set();
    rawItems.forEach((item, itemIndex) => {
      const path = sectionPath.concat('items', itemIndex);
      const probe = core.normalizeSection({ type: probeType, items: [item] }, 0);
      if (!probe) {
        nodes.push(node(path, 'item', STATUS.INCOMPLETE, itemReason(core, probeType, item)));
        if (type === 'actions' && isObject(item) && isObject(item.effect)) analyzeEffect(core, item.effect, path.concat('effect'), nodes);
        return;
      }
      const overLimit = valid >= core.MAX_ITEMS;
      valid += 1;
      if (overLimit) { nodes.push(node(path, 'item', STATUS.OVER_LIMIT, 'item_over_limit')); return; }
      if (type === 'timeline') { // the core drops a repeated path after the cap
        const p = text(item.path);
        if (seenPaths.has(p)) { nodes.push(node(path, 'item', STATUS.DUPLICATE, 'timeline_item_duplicate_path')); return; }
        seenPaths.add(p);
      }
      const ignoresFixedMax = type === 'meters' && isObject(item) && text(item.max_path) && item.max !== undefined && item.max !== '';
      nodes.push(node(path, 'item', ignoresFixedMax ? STATUS.TRIMMED : STATUS.OK, ignoresFixedMax ? 'meter_fixed_max_ignored' : ''));
      if (type === 'actions' && isObject(item) && isObject(item.effect)) analyzeEffect(core, item.effect, path.concat('effect'), nodes);
    });
  }

  function itemReason(core, type, item) {
    if (!isObject(item)) return 'item_not_object';
    if (type === 'meters') {
      const valuePath = text(item.value_path || item.path);
      const maxPath = text(item.max_path);
      if (!valuePath) return 'meter_value_path_missing';
      if (!core.isDisplayPath(valuePath)) return 'meter_value_path_invalid';
      if (maxPath && !core.isDisplayPath(maxPath)) return 'meter_max_path_invalid';
      return 'meter_item_invalid';
    }
    if (type === 'stats') {
      const p = text(item.path);
      return !p ? 'stat_path_missing' : !core.isDisplayPath(p) ? 'stat_path_invalid' : 'stat_item_invalid';
    }
    // actions fail closed: a bad effect is never silently turned into a text-only action
    if (item.effect !== undefined) return 'action_effect_invalid';
    return 'action_needs_draft_or_effect';
  }

  /** Pin down which part of an invalid effect the core rejects, by probing each entry on its own. */
  function analyzeEffect(core, effect, effectPath, nodes) {
    const valid = entry => Boolean(core.normalizeSection({ type: 'actions', items: [{ label: 'probe', effect: entry }] }, 0));
    const changes = Array.isArray(effect.changes) ? effect.changes : [];
    const items = Array.isArray(effect.items) ? effect.items : [];
    if (!changes.length && !items.length) { nodes.push(node(effectPath, 'effect', STATUS.INVALID, 'effect_empty')); return; }
    if (changes.length > core.MAX_EFFECT_ENTRIES || items.length > core.MAX_EFFECT_ENTRIES) nodes.push(node(effectPath, 'effect', STATUS.INVALID, 'effect_too_many_entries'));
    const seen = new Set();
    changes.forEach((change, i) => {
      const where = effectPath.concat('changes', i);
      const p = isObject(change) ? text(change.path) : '';
      if (!valid({ changes: [change] })) nodes.push(node(where, 'effect_change', STATUS.INVALID, 'effect_change_invalid'));
      else if (seen.has(p)) nodes.push(node(where, 'effect_change', STATUS.DUPLICATE, 'effect_change_duplicate_path'));
      else seen.add(p); // only a valid entry claims its path
    });
    const seenItems = new Set();
    items.forEach((it, i) => {
      const where = effectPath.concat('items', i);
      const key = isObject(it) ? `${text(it.path)}:${text(it.id)}` : '';
      if (!valid({ items: [it] })) nodes.push(node(where, 'effect_item', STATUS.INVALID, 'effect_item_invalid'));
      else if (seenItems.has(key)) nodes.push(node(where, 'effect_item', STATUS.DUPLICATE, 'effect_item_duplicate'));
      else if (changes.some(c => isObject(c) && isObject(it) && text(c.path).startsWith(text(it.path) + '.'))) nodes.push(node(where, 'effect_item', STATUS.INVALID, 'effect_item_conflicts_with_change'));
      else seenItems.add(key);
    });
  }

  /** Section list (panel sections, or the sections of one tab). `depth` is 0 for panels, 1 inside tabs. */
  function analyzeSections(core, rawSections, basePath, depth, nodes) {
    let valid = 0;
    rawSections.forEach((section, index) => {
      const path = basePath.concat(index);
      const normalized = core.normalizeSection(section, index, depth);
      if (!normalized) {
        const nested = depth >= 1 && isObject(section) && section.type === 'tabs';
        let why = nested ? 'nested_tabs_not_allowed' : 'section_invalid_or_empty';
        if (isObject(section) && (section.type === 'list' || section.type === 'cards' || (section.type === 'timeline' && section.mode !== 'round_diff'))) {
          const p = text(section.path);
          why = !p ? 'section_path_missing' : 'section_path_invalid';
        }
        nodes.push(node(path, 'section', STATUS.INCOMPLETE, why));
        if (hasItems(section)) analyzeItems(core, section, path, nodes);
        if (depth === 0 && section?.type === 'tabs') analyzeTabs(core, section, path, nodes);
        return;
      }
      const overLimit = valid >= core.MAX_SECTIONS;
      valid += 1;
      if (overLimit) {
        nodes.push(node(path, 'section', STATUS.OVER_LIMIT, 'section_over_limit'));
        return;
      }
      const rawItems = isObject(section) ? section.items : null;
      const wasTrimmed = Array.isArray(rawItems) && Array.isArray(normalized.items) && normalized.items.length < rawItems.length;
      nodes.push(node(path, 'section', wasTrimmed ? STATUS.TRIMMED : STATUS.OK, wasTrimmed ? 'items_dropped_or_over_limit' : ''));
      if (normalized.type === 'tabs') analyzeTabs(core, section, path, nodes);
      if (hasItems(section)) analyzeItems(core, section, path, nodes);
      analyzeFields(core, section, normalized, path, nodes);
    });
  }

  /** Enum fields the core silently replaces with a default, per section type. */
  const enumChecks = core => ({
    cards: { variant: core.CARD_VARIANTS },
    timeline: { mode: core.TIMELINE_MODES },
    location_archive: { scene_source: core.SCENE_SOURCES, scene_fit: core.SCENE_FITS }
  });
  const ARCHIVE_PATH_FIELDS = [['time_path', 'archive_time_path_reset'], ['location_path', 'archive_location_path_reset'], ['area_path', 'archive_path_cleared'], ['status_path', 'archive_path_cleared'], ['destinations_path', 'archive_path_cleared']];

  /** Field-level problems of a kept section: unknown enum values, paths the core resets, a missing default tab. */
  function analyzeFields(core, section, normalized, sectionPath, nodes) {
    if (!isObject(section)) return;
    const checks = (enumChecks(core)[section.type]) || {};
    Object.entries(checks).forEach(([field, allowed]) => {
      const v = text(section[field]);
      if (v && !allowed.includes(v)) nodes.push(node(sectionPath.concat(field), 'field', STATUS.INVALID, 'enum_value_unknown'));
    });
    if (section.type === 'location_archive') {
      ARCHIVE_PATH_FIELDS.forEach(([field, reason]) => {
        const v = text(section[field]);
        if (v && !core.isDisplayPath(v)) nodes.push(node(sectionPath.concat(field), 'field', STATUS.UNRESOLVED, reason));
      });
    }
    if (section.type === 'tabs' && normalized && Array.isArray(normalized.tabs)) {
      const wanted = text(section.default_tab);
      if (wanted && !normalized.tabs.some(t => t.id === wanted)) nodes.push(node(sectionPath.concat('default_tab'), 'field', STATUS.UNRESOLVED, 'tabs_default_not_found'));
    }
  }

  function analyzeTabs(core, section, sectionPath, nodes) {
    const rawTabs = Array.isArray(section.tabs) ? section.tabs : [];
    const seen = new Set();
    let valid = 0;
    rawTabs.forEach((tab, tabIndex) => {
      const path = sectionPath.concat('tabs', tabIndex);
      // Ask the core about this single tab, so tab id / emptiness rules are never re-implemented here.
      const probe = core.normalizeSection({ type: 'tabs', id: 'probe', tabs: [tab] }, 0);
      const normalizedTab = probe && probe.tabs && probe.tabs[0];
      const rawChildren = isObject(tab) && Array.isArray(tab.sections) ? tab.sections : [];
      if (!normalizedTab) {
        nodes.push(node(path, 'tab', STATUS.INCOMPLETE, rawChildren.length ? 'tab_has_no_valid_section_or_id' : 'tab_empty'));
      } else {
        const overLimit = valid >= core.MAX_TABS;
        valid += 1;
        if (overLimit) nodes.push(node(path, 'tab', STATUS.OVER_LIMIT, 'tab_over_limit'));
        else if (seen.has(normalizedTab.id)) nodes.push(node(path, 'tab', STATUS.DUPLICATE, 'tab_duplicate_id'));
        else { seen.add(normalizedTab.id); nodes.push(node(path, 'tab', STATUS.OK)); }
      }
      analyzeSections(core, rawChildren, path.concat('sections'), 1, nodes);
    });
  }

  function schemaReason(raw, schema) {
    if (!isObject(raw)) return 'schema_not_object';
    if (raw.enabled === false) return 'schema_disabled';
    const version = Number.isFinite(Number(raw.version)) ? Number(raw.version) : 1; // same rule as the core
    if (version !== 1) return 'schema_version_unsupported';
    return schema ? '' : 'schema_has_no_usable_content';
  }

  function analyzeLayout(core, raw, schema, nodes) {
    const rawLayout = isObject(raw) && isObject(raw.layout) ? raw.layout : null;
    if (!rawLayout || !schema) return;
    const requested = String(rawLayout.preset || '').trim();
    if (requested && !core.LAYOUT_PRESETS.includes(requested)) {
      nodes.push(node(['layout', 'preset'], 'layout', STATUS.INVALID, 'layout_preset_unknown'));
      return;
    }
    [['scene_source',core.SCENE_SOURCES],['scene_fit',core.SCENE_FITS]].forEach(([field,allowed])=>{const v=text(rawLayout[field]);if(v&&!allowed.includes(v))nodes.push(node(['layout',field],'layout',STATUS.INVALID,'enum_value_unknown'));});
    const preset = schema.layout.preset;
    if (preset === 'standard') return;
    // [schema field, raw aliases the core reads, presets that use it]
    const refs = [
      ['left_panel', ['left_panel', 'left'], ['rpg-dashboard']],
      ['right_panel', ['right_panel', 'right'], ['rpg-dashboard', 'scene-rpg']],
      ['primary_panel', ['primary_panel', 'panel', 'left_panel'], ['terminal']]
    ];
    refs.forEach(([field, aliases, presets]) => {
      if (!presets.includes(preset)) return;
      const wanted = aliases.map(name => String(rawLayout[name] || '').trim()).find(Boolean) || '';
      if (!wanted || schema.layout[field]) return;
      const sameAsLeft = field === 'right_panel' && preset === 'rpg-dashboard' && wanted === schema.layout.left_panel;
      nodes.push(node(['layout', field], 'layout', STATUS.UNRESOLVED, sameAsLeft ? 'layout_right_same_as_left' : 'layout_panel_not_found'));
    });
  }

  // Compare only authored fields understood by the normalizer. Future fields stay
  // in the draft without being mistaken for invalid runtime data.
  function analyzeChanges(raw, normalized, path, nodes) {
    if (Array.isArray(raw) && Array.isArray(normalized)) {
      if (raw.length !== normalized.length) {
        nodes.push(node(path, 'builder', STATUS.TRIMMED, 'builder_items_filtered_or_limited'));
      } else raw.forEach((value, i) => analyzeChanges(value, normalized[i], path.concat(i), nodes));
    } else if (isObject(raw) && isObject(normalized)) {
      Object.keys(raw).forEach(key => {
        if (Object.prototype.hasOwnProperty.call(normalized, key)) analyzeChanges(raw[key], normalized[key], path.concat(key), nodes);
      });
    } else if (raw !== normalized) {
      const code=path.join('.')==='builder.kind'?'builder_kind_unknown':path.join('.')==='builder.points_path'?'builder_points_path_invalid':'builder_value_normalized';
      nodes.push(node(path,'builder',code==='builder_kind_unknown'?STATUS.INVALID:code==='builder_points_path_invalid'?STATUS.UNRESOLVED:STATUS.TRIMMED,code));
    }
  }

  function analyzeBuilder(core, raw, nodes) {
    if (!isObject(raw) || raw.builder === undefined) return;
    const builder = raw.builder;
    if (!isObject(builder)) {
      nodes.push(node(['builder'], 'builder', STATUS.INVALID, 'builder_not_object'));
      return;
    }
    // A harmless panel keeps the probe usable even when a builder node is invalid.
    // Individual probes delegate every field/option rule to the existing runtime.
    const probe = value => core.normalize({ version: 1, builder: value, panels: [{
      id: 'probe', sections: [{type:'stats', items:[{path:'time'}]}]
    }] }).builder;
    const whole = probe(builder);
    const seen = new Set(); // attributes, then fields, then groups: runtime priority
    const lists = [
      ['attributes', core.MAX_ATTRIBUTES, 'stat_'],
      ['fields', core.MAX_FIELDS, 'field_'],
      ['choice_groups', core.MAX_CHOICE_GROUPS, '']
    ];
    for (const [name, limit, prefix] of lists) {
      if (builder[name] === undefined) continue;
      if (!Array.isArray(builder[name])) {
        nodes.push(node(['builder', name], 'builder', STATUS.INVALID, 'builder_collection_not_array'));
        continue;
      }
      let valid = 0;
      builder[name].forEach((entry, index) => {
        const path = ['builder', name, index];
        // Choice groups are sliced before filtering; attributes/fields after it.
        if (name === 'choice_groups' && index >= limit) {
          nodes.push(node(path, 'builder', STATUS.OVER_LIMIT, 'builder_over_limit'));
          return;
        }
        const candidate = isObject(entry) && prefix
          ? { ...entry, key: entry.key || `${prefix}${index + 1}` } : entry;
        const normalized = probe({ [name]: [candidate] })[name][0];
        if (!normalized) {
          nodes.push(node(path, 'builder', STATUS.INCOMPLETE, 'builder_node_invalid'));
          return;
        }
        if (valid++ >= limit) {
          nodes.push(node(path, 'builder', STATUS.OVER_LIMIT, 'builder_over_limit'));
          return;
        }
        if (seen.has(normalized.key)) {
          nodes.push(node(path, 'builder', STATUS.DUPLICATE, 'builder_duplicate_key'));
          return;
        }
        seen.add(normalized.key);
        nodes.push(node(path, 'builder', STATUS.OK));
        analyzeChanges(entry, normalized, path, nodes);
      });
    }
    const header = {};
    for (const key of ['kind','title','description','point_pool','randomize_choices','points_path']) {
      if (Object.prototype.hasOwnProperty.call(builder, key)) header[key] = builder[key];
    }
    analyzeChanges(header, whole, ['builder'], nodes);
  }

  function analyzeTheme(core, raw, nodes) {
    if (!isObject(raw) || raw.theme === undefined) return;
    const theme = raw.theme;
    if (typeof theme !== 'string' && !isObject(theme)) {
      nodes.push(node(['theme'], 'theme', STATUS.INVALID, 'theme_not_object_or_preset'));
      return;
    }
    const source = typeof theme === 'string' ? {preset: theme} : theme;
    const normalized = core.normalizeTheme(theme);
    const enums = {
      preset: core.THEME_PRESETS, density: core.THEME_DENSITIES,
      radius: core.THEME_RADII, meter: core.THEME_METERS
    };
    for (const [key, allowed] of Object.entries(enums)) {
      if (source[key] !== undefined && !allowed.includes(String(source[key] || ''))) {
        nodes.push(node(['theme', key], 'theme', STATUS.INVALID, 'theme_enum_invalid'));
      }
    }
    for (const key of ['accent','surface','surface_alt','text','border','muted']) {
      if (source[key] !== undefined && source[key] !== '' && normalized[key] === undefined) {
        nodes.push(node(['theme', key], 'theme', STATUS.INVALID, 'theme_color_invalid'));
      }
    }
  }

  /**
   * Diagnose a raw draft against the platform normalizer without modifying it.
   * Returns { schema, nodes, summary }:
   *  - schema:  normalize(raw) for preview (may be null; never written back to the draft)
   *  - nodes:   [{ path, kind, status, reason }]; `path` addresses the raw draft ([] = whole schema)
   *  - summary: counts, and schemaValid (false when normalize() rejects the whole schema)
   * A node that normalize() would drop is reported, never removed.
   */
  function parseColor(value) {
    const m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?\s*\)$/i.exec(String(value || '').trim());
    if (!m) return null;
    const a = m[4] === undefined ? 1 : (m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]));
    const rgb = [m[1], m[2], m[3]].map(Number);
    return rgb.every(Number.isFinite) && Number.isFinite(a) ? { r: rgb[0], g: rgb[1], b: rgb[2], a: Math.max(0, Math.min(1, a)) } : null;
  }
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const luminance = c => {
    const ch = v => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  };
  /** Contrast ratio of `fg` drawn over an opaque `bg` (a translucent fg is composited first). */
  function contrastRatio(fg, bg) {
    const f = parseColor(fg); const b = parseColor(bg);
    if (!f || !b) return null;
    const background = over(b, {r:0,g:0,b:0,a:1});
    const l1 = luminance(over(f, background)); const l2 = luminance(background);
    const hi = Math.max(l1, l2); const lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }
  const CONTRAST_RULES = [['text', 4.5, 'theme_contrast_text'], ['muted', 4.5, 'theme_contrast_muted'], ['accent', 4.5, 'theme_contrast_accent']];
  /** `colors` = the preview's resolved { accent, surface, text, muted }. Returns warning nodes, never problems. */
  function analyzeContrast(colors) {
    if (!isObject(colors)) return [];
    return CONTRAST_RULES.flatMap(([name, min, reason]) => {
      const ratio = contrastRatio(colors[name], colors.surface);
      return ratio !== null && ratio < min ? [{ ...node(['theme', name], 'theme', STATUS.WARNING, reason), ratio: Math.round(ratio * 100) / 100, min }] : [];
    });
  }

  function analyzeDraft(raw, core = defaultCore, options = {}) {
    if (!core) throw new Error('BAOGameplayUICore is required');
    const nodes = [];
    const schema = core.normalize(raw);

    const reason = schemaReason(raw, schema);
    if (reason) nodes.push(node([], 'schema', STATUS.INVALID, reason));

    const rawPanels = isObject(raw) && Array.isArray(raw.panels) ? raw.panels : [];
    const seen = new Set();
    let valid = 0;
    rawPanels.forEach((panel, panelIndex) => {
      const path = ['panels', panelIndex];
      const normalized = core.normalizePanel(panel, panelIndex);
      const rawSections = isObject(panel) && Array.isArray(panel.sections) ? panel.sections : [];
      if (!normalized) {
        const idRejected = isObject(panel) && panel.id !== undefined && panel.id !== '' && !core.normalizePanel({id:panel.id,sections:[{type:'stats',items:[{path:'time'}]}]},panelIndex);
        nodes.push(node(path, 'panel', STATUS.INCOMPLETE, idRejected ? 'panel_id_invalid' : rawSections.length ? 'panel_has_no_valid_section' : 'panel_empty'));
      } else {
        // Same order as the core: drop invalid panels, keep the first MAX_PANELS, then de-duplicate ids.
        const overLimit = valid >= core.MAX_PANELS;
        valid += 1;
        if (overLimit) nodes.push(node(path, 'panel', STATUS.OVER_LIMIT, 'panel_over_limit'));
        else if (seen.has(normalized.id)) nodes.push(node(path, 'panel', STATUS.DUPLICATE, 'panel_duplicate_id'));
        else { seen.add(normalized.id); nodes.push(node(path, 'panel', STATUS.OK)); }
      }
      analyzeSections(core, rawSections, path.concat('sections'), 0, nodes);
    });

    analyzeLayout(core, raw, schema, nodes);
    analyzeBuilder(core, raw, nodes);
    analyzeTheme(core, raw, nodes);

    if(options?.colors)nodes.push(...analyzeContrast(options.colors));
    const problems = nodes.filter(n => n.status !== STATUS.OK && n.status !== STATUS.WARNING);
    const count = status => problems.filter(n => n.status === status).length;
    return {
      schema,
      nodes,
      summary: {
        total: nodes.length,
        problems: problems.length,
        warnings: nodes.filter(n=>n.status===STATUS.WARNING).length,
        incomplete: count(STATUS.INCOMPLETE),
        duplicates: count(STATUS.DUPLICATE),
        overLimit: count(STATUS.OVER_LIMIT),
        schemaValid: Boolean(schema)
      }
    };
  }

  const done = (draft, extra = {}) => ({ ok: true, draft, ...extra });
  const refuse = reason => ({ ok: false, reason });
  const inRange = (list, index) => Array.isArray(list) && Number.isInteger(index) && index >= 0 && index < list.length;

  function working(raw) {
    return isObject(raw) ? cloneDraft(raw) : { version: 1, panels: [] };
  }
  function panelsOf(draft) {
    if (!Array.isArray(draft.panels)) draft.panels = [];
    return draft.panels;
  }
  /**
   * A section is addressed by `ref`: a number (index in the panel) or [sectionIndex, tabIndex, childIndex]
   * for a section inside a tabs section. Targets use { panel, section, tab?, child?, item? }.
   */
  function sectionAt(draft, panelIndex, ref) {
    const panel = panelsOf(draft)[panelIndex];
    if (!isObject(panel) || !Array.isArray(panel.sections)) return null;
    const path = Array.isArray(ref) ? ref : [ref];
    let section = panel.sections[path[0]];
    if (!isObject(section)) return null;
    if (path.length === 1) return section;
    if (section.type !== 'tabs' || !Array.isArray(section.tabs)) return null;
    const tab = section.tabs[path[1]];
    if (!isObject(tab) || !Array.isArray(tab.sections)) return null;
    section = tab.sections[path[2]];
    return isObject(section) ? section : null;
  }
  const refOf = t => (t && t.tab === undefined ? t && t.section : [t.section, t.tab, t.child]);
  function itemSectionAt(draft, panelIndex, ref) {
    const section = sectionAt(draft, panelIndex, ref);
    return hasItems(section) ? section : null;
  }
  function relocate(list, from, to) {
    if (!inRange(list, from) || !Number.isInteger(to) || to < 0 || to >= list.length) return false;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    return true;
  }
  function freshId(prefix, taken) {
    let n = 1;
    while (taken.has(`${prefix}_${n}`)) n += 1;
    return `${prefix}_${n}`;
  }

  const LAYOUT_PANEL_KEYS = ['left_panel', 'left', 'right_panel', 'right', 'primary_panel', 'panel'];
  function rewriteLayoutRefs(draft, oldId, newId) {
    const changed = [];
    if (!isObject(draft.layout) || !oldId) return changed;
    for (const k of LAYOUT_PANEL_KEYS) {
      if (typeof draft.layout[k] === 'string' && draft.layout[k].trim() === oldId) {
        if (newId) draft.layout[k] = newId; else delete draft.layout[k];
        changed.push(k);
      }
    }
    return changed;
  }

  /** A small valid draft: one panel with one meter. Used when the author turns the composer on. */
  const meterItems = () => [
    { label: 'HP', value_path: 'modules.player.hp', max_path: 'modules.player.max_hp' },
    { label: 'MP', value_path: 'modules.player.mp', max_path: 'modules.player.max_mp' }
  ];
  const TEMPLATE_BUILDERS = {
    blank: () => ({ version: 1, panels: [{ id: 'panel_1', label: '面板 1', sections: [] }] }),
    'rpg-status': () => ({ version: 1, panels: [{ id: 'status', label: '狀態', sections: [
      { type: 'meters', title: '角色狀態', items: meterItems() },
      { type: 'stats', title: '資訊', items: [{ label: '金幣', path: 'modules.player.gold' }, { label: '地點', path: 'location' }, { label: '時間', path: 'time' }] },
      { type: 'list', title: '近期事件', path: 'events', limit: 5 }
    ] }] }),
    shop: () => ({ version: 1, panels: [
      { id: 'status', label: '狀態', sections: [
        { type: 'meters', title: '角色狀態', items: [meterItems()[0]] },
        { type: 'stats', title: '錢包', items: [{ label: '金幣', path: 'modules.player.gold' }] }
      ] },
      { id: 'shop', label: '商店', sections: [
        { type: 'list', title: '背包', path: 'modules.inventory', limit: 8 },
        { type: 'actions', title: '購買', items: [
          { label: '買藥水（5 金幣）', draft: '我買了一瓶藥水。', hint: '扣 5 金幣，背包 +1 藥水', effect: {
            changes: [{ path: 'modules.player.gold', delta: -5 }],
            items: [{ path: 'modules.inventory', id: 'potion', name: '藥水', delta: 1 }],
            event: '買了一瓶藥水'
          } },
          { label: '詢問店員', draft: '我向店員打聽最近的消息。' }
        ] }
      ] }
    ] }),
    codex: () => ({ version: 1, panels: [{ id: 'codex', label: '圖鑑', sections: [{ type: 'tabs', title: '資料庫', tabs: [
      { id: 'entries', label: '圖鑑', sections: [{ type: 'cards', variant: 'codex', path: 'modules.codex.entries' }] },
      { id: 'quests', label: '任務', sections: [{ type: 'cards', variant: 'quest', path: 'modules.quest.entries' }] },
      { id: 'log', label: '紀錄', sections: [{ type: 'timeline', mode: 'history', path: 'events', limit: 10 }] }
    ] }] }] }),
    'rpg-dashboard': () => ({ version: 1,
      layout: { preset: 'rpg-dashboard', left_panel: 'status', right_panel: 'world' },
      panels: [
        { id: 'status', label: '狀態', sections: [
          { type: 'meters', title: '角色狀態', items: meterItems() },
          { type: 'stats', items: [{ label: '金幣', path: 'modules.player.gold' }] }
        ] },
        { id: 'world', label: '世界', sections: [
          { type: 'location_archive', title: '目前位置', area_path: 'modules.map.area', destinations_path: 'modules.map.destinations' },
          { type: 'list', title: '近期事件', path: 'events', limit: 5 }
        ] }
      ] }),
    terminal: () => ({ version: 1,
      layout: { preset: 'terminal', primary_panel: 'console' },
      panels: [{ id: 'console', label: '終端', sections: [
        { type: 'stats', title: '狀態', items: [{ label: '地點', path: 'location' }, { label: '時間', path: 'time' }] },
        { type: 'list', title: '紀錄', path: 'events', limit: 8 },
        { type: 'actions', title: '指令', items: [{ label: '查看周圍', draft: '我仔細查看周圍。' }, { label: '整理行囊', draft: '我整理一下行囊。' }] }
      ] }] })
  };
  const TEMPLATES = Object.freeze([
    { id: 'blank', label: '空白（只有一個空面板）', description: '從零開始，自行新增區塊。' },
    { id: 'rpg-status', label: 'RPG 狀態面板', description: 'HP／MP 狀態條、金幣與地點、近期事件。' },
    { id: 'shop', label: '商店與背包', description: '買藥水的行動：扣金幣、背包 +1，含自動結算。' },
    { id: 'codex', label: '圖鑑與任務（分頁）', description: '圖鑑卡片、任務卡片、事件時間軸三個分頁。' },
    { id: 'rpg-dashboard', label: 'RPG 儀表板（左右面板）', description: '左側狀態、右側世界與地點檔案。' },
    { id: 'terminal', label: '終端機', description: '單一終端面板：狀態、紀錄、指令按鈕。' }
  ]);
  /** A fresh raw draft for a template id; null for an unknown id. Every call returns a new object. */
  function templateDraft(id) {
    const build = Object.prototype.hasOwnProperty.call(TEMPLATE_BUILDERS, id) ? TEMPLATE_BUILDERS[id] : null;
    return build ? build() : null;
  }
  /** True when a draft holds nothing worth protecting from a template (no sections anywhere). */
  function isEmptyDraft(raw) {
    if (!isObject(raw)) return true;
    const panels = Array.isArray(raw.panels) ? raw.panels : [];
    return panels.every(p => !isObject(p) || !Array.isArray(p.sections) || p.sections.length === 0) && !Object.keys(raw).some(k => !['version', 'panels', 'layout', 'theme', 'enabled'].includes(k));
  }

  function createStarterDraft() {
    return {
      version: 1,
      panels: [{
        id: 'status',
        label: '狀態',
        sections: [{ type: 'meters', title: '狀態條', items: [
          { label: 'HP', value_path: 'modules.player.hp', max_path: 'modules.player.max_hp' }
        ] }]
      }]
    };
  }

  function addPanel(raw, core = defaultCore) {
    const draft = working(raw);
    const panels = panelsOf(draft);
    if (panels.length >= core.MAX_PANELS) return refuse('panel_limit');
    const taken = new Set(panels.map(panel => isObject(panel) ? String(panel.id || '').trim() : ''));
    const id = freshId('panel', taken);
    panels.push({ id, label: `面板 ${panels.length + 1}`, sections: [] });
    return done(draft, { index: panels.length - 1, id });
  }
  function removePanel(raw, panelIndex) {
    const draft = working(raw);
    const panels = panelsOf(draft);
    if (!inRange(panels, panelIndex)) return refuse('out_of_range');
    const [removed] = panels.splice(panelIndex, 1);
    const removedId = isObject(removed) ? String(removed.id || '').trim() : '';
    // Another panel may still use this id (a duplicate); only clear references when none is left.
    const stillUsed = panels.some(panel => isObject(panel) && String(panel.id || '').trim() === removedId);
    const clearedLayout = stillUsed ? [] : rewriteLayoutRefs(draft, removedId, '');
    return done(draft, { clearedLayout });
  }
  function movePanel(raw, from, to) {
    const draft = working(raw);
    return relocate(panelsOf(draft), from, to) ? done(draft) : refuse('out_of_range');
  }

  /** Section types the composer can create and edit. Others are preserved but not editable yet. */
  const EDITABLE_SECTIONS = Object.freeze(['meters', 'stats', 'list', 'actions', 'cards', 'timeline', 'location_archive', 'tabs']);
  /** Section types allowed inside a tab (the core does not allow tabs inside tabs). */
  const CHILD_SECTIONS = Object.freeze(EDITABLE_SECTIONS.filter(t => t !== 'tabs'));
  const newSection = type => ({
    meters: () => ({ type: 'meters', title: '', items: [{ label: '數值 1', value_path: '', max_path: '' }] }),
    stats: () => ({ type: 'stats', title: '', items: [{ label: '項目 1', path: '' }] }),
    list: () => ({ type: 'list', title: '', path: '' }),
    actions: () => ({ type: 'actions', title: '', items: [{ label: '行動 1', draft: '', hint: '' }] }),
    cards: () => ({ type: 'cards', title: '', path: '', variant: 'codex' }),
    timeline: () => ({ type: 'timeline', mode: 'history', title: '', path: '' }),
    location_archive: () => ({ type: 'location_archive', title: '' }),
    tabs: () => ({ type: 'tabs', title: '', tabs: [{ id: 'tab_1', label: '分頁 1', sections: [] }] })
  }[type]());
  const newItem = (type, n) => ({
    meters: () => ({ label: `數值 ${n}`, value_path: '', max_path: '' }),
    stats: () => ({ label: `項目 ${n}`, path: '' }),
    actions: () => ({ label: `行動 ${n}`, draft: '', hint: '' }),
    timeline: () => ({ label: `項目 ${n}`, path: '' })
  }[type]());

  function addSection(raw, panelIndex, type, core = defaultCore) {
    if (!EDITABLE_SECTIONS.includes(type)) return refuse('section_type_not_supported');
    const draft = working(raw);
    const panel = panelsOf(draft)[panelIndex];
    if (!isObject(panel)) return refuse('out_of_range');
    if (!Array.isArray(panel.sections)) panel.sections = [];
    if (panel.sections.length >= core.MAX_SECTIONS) return refuse('section_limit');
    panel.sections.push(newSection(type));
    return done(draft, { index: panel.sections.length - 1 });
  }
  const addMeterSection = (raw, panelIndex, core = defaultCore) => addSection(raw, panelIndex, 'meters', core);
  function removeSection(raw, panelIndex, sectionIndex) {
    const draft = working(raw);
    const panel = panelsOf(draft)[panelIndex];
    if (!isObject(panel) || !inRange(panel.sections, sectionIndex)) return refuse('out_of_range');
    panel.sections.splice(sectionIndex, 1);
    return done(draft);
  }
  function moveSection(raw, panelIndex, from, to) {
    const draft = working(raw);
    const panel = panelsOf(draft)[panelIndex];
    if (!isObject(panel) || !relocate(panel.sections, from, to)) return refuse('out_of_range');
    return done(draft);
  }

  function addItem(raw, panelIndex, sectionIndex, core = defaultCore) {
    const draft = working(raw);
    const section = itemSectionAt(draft, panelIndex, sectionIndex);
    if (!section) return refuse('section_has_no_items');
    if (!Array.isArray(section.items)) section.items = [];
    if (section.items.length >= core.MAX_ITEMS) return refuse('item_limit');
    section.items.push(newItem(section.type, section.items.length + 1));
    return done(draft, { index: section.items.length - 1 });
  }
  const addMeterItem = addItem;
  function removeItem(raw, panelIndex, sectionIndex, itemIndex) {
    const draft = working(raw);
    const section = itemSectionAt(draft, panelIndex, sectionIndex);
    if (!section || !inRange(section.items, itemIndex)) return refuse('out_of_range');
    section.items.splice(itemIndex, 1);
    return done(draft);
  }
  function moveItem(raw, panelIndex, sectionIndex, from, to) {
    const draft = working(raw);
    const section = itemSectionAt(draft, panelIndex, sectionIndex);
    if (!section || !relocate(section.items, from, to)) return refuse('out_of_range');
    return done(draft);
  }

  // Editable fields. Text keeps exactly what was typed (the core trims on read); numbers are stored as numbers,
  // or the key is removed when emptied.
  const FIELDS = {
    panel: { text: ['id', 'label'], number: [] },
    section: { text: ['title'], number: [] },
    'section:list': { text: ['title', 'path', 'empty'], number: ['limit'] },
    'section:cards': { text: ['title', 'path', 'empty', 'variant'], number: ['limit'] },
    'section:timeline': { text: ['title', 'path', 'empty', 'mode'], number: ['limit'] },
    'section:location_archive': { text: ['title', 'time_path', 'location_path', 'area_path', 'status_path', 'destinations_path', 'empty', 'scene_source', 'scene_fit'], number: ['limit'] },
    'section:tabs': { text: ['title', 'id', 'default_tab'], number: [] },
    'item:timeline': { text: ['label', 'path', 'suffix'], number: [] },
    'item:meters': { text: ['label', 'value_path', 'max_path', 'suffix'], number: ['min', 'max'] },
    'item:stats': { text: ['label', 'path', 'suffix'], number: [] },
    'item:actions': { text: ['label', 'draft', 'hint'], number: [] }
  };

  /**
   * Set one editable field. `target` = { panel, section?, item? } (indexes).
   * Renaming a panel id also rewrites layout references to it.
   */
  /** Values the core accepts for an enum field; others silently fall back to a default, so refuse them here. */
  function allowedValues(nodeType, fieldName) {
    const c = defaultCore || {};
    return ({ 'cards.variant': c.CARD_VARIANTS, 'timeline.mode': c.TIMELINE_MODES, 'location_archive.scene_source': c.SCENE_SOURCES, 'location_archive.scene_fit': c.SCENE_FITS, 'layout.preset': c.LAYOUT_PRESETS })[`${nodeType}.${fieldName}`] || null;
  }

  function setField(raw, target, fieldName, value) {
    const draft = working(raw);
    const panel = panelsOf(draft)[target && target.panel];
    if (!isObject(panel)) return refuse('out_of_range');
    let node; let rule;
    if (target.item !== undefined) {
      const section = itemSectionAt(draft, target.panel, refOf(target));
      node = section && Array.isArray(section.items) ? section.items[target.item] : null;
      rule = section && FIELDS[`item:${section.type}`];
    } else if (target.section !== undefined) {
      node = sectionAt(draft, target.panel, refOf(target));
      rule = node && (FIELDS[`section:${node.type}`] || FIELDS.section);
    } else { node = panel; rule = FIELDS.panel; }
    if (!isObject(node) || !rule) return refuse('out_of_range');
    if (rule.text.includes(fieldName)) {
      const next = String(value ?? '');
      const allowed = target.item === undefined && target.section !== undefined ? allowedValues(node.type, fieldName) : null;
      if (allowed) {
        if (next.trim() === '') { delete node[fieldName]; return done(draft); }
        if (!allowed.includes(next.trim())) return refuse('value_not_allowed');
      }
      const before = typeof node[fieldName] === 'string' ? node[fieldName].trim() : '';
      node[fieldName] = next;
      const rewritten = target.section === undefined && fieldName === 'id' && before && next.trim() !== before ? rewriteLayoutRefs(draft, before, next.trim()) : [];
      return done(draft, { rewrittenLayout: rewritten });
    }
    if (rule.number.includes(fieldName)) {
      const text = String(value ?? '').trim();
      if (text === '') delete node[fieldName];
      else if (Number.isFinite(Number(text))) node[fieldName] = Number(text);
      else return refuse('not_a_number');
      return done(draft);
    }
    return refuse('field_not_editable');
  }

  // ---- tabs and the sections inside them ------------------------------------------------------------
  function tabsAt(draft, panelIndex, sectionIndex) {
    const section = sectionAt(draft, panelIndex, sectionIndex);
    return section && section.type === 'tabs' ? section : null;
  }
  function addTab(raw, panelIndex, sectionIndex, core = defaultCore) {
    const draft = working(raw);
    const section = tabsAt(draft, panelIndex, sectionIndex);
    if (!section) return refuse('not_a_tabs_section');
    if (!Array.isArray(section.tabs)) section.tabs = [];
    if (section.tabs.length >= core.MAX_TABS) return refuse('tab_limit');
    const taken = new Set(section.tabs.map(t => (isObject(t) ? text(t.id) : '')));
    const id = freshId('tab', taken);
    section.tabs.push({ id, label: `分頁 ${section.tabs.length + 1}`, sections: [] });
    return done(draft, { index: section.tabs.length - 1, id });
  }
  function removeTab(raw, panelIndex, sectionIndex, tabIndex) {
    const draft = working(raw);
    const section = tabsAt(draft, panelIndex, sectionIndex);
    if (!section || !inRange(section.tabs, tabIndex)) return refuse('out_of_range');
    const [gone] = section.tabs.splice(tabIndex, 1);
    const goneId = isObject(gone) ? text(gone.id) : '';
    // the core falls back to the first tab, but a stale name is confusing: drop it with the tab it named
    if (goneId && text(section.default_tab) === goneId && !section.tabs.some(t => isObject(t) && text(t.id) === goneId)) delete section.default_tab;
    return done(draft);
  }
  function moveTab(raw, panelIndex, sectionIndex, from, to) {
    const draft = working(raw);
    const section = tabsAt(draft, panelIndex, sectionIndex);
    return section && relocate(section.tabs, from, to) ? done(draft) : refuse('out_of_range');
  }
  /** Edit a tab's `id` or `label`. Renaming the id keeps `default_tab` pointing at the same tab. */
  function setTabField(raw, panelIndex, sectionIndex, tabIndex, fieldName, value) {
    if (!['id', 'label'].includes(fieldName)) return refuse('field_not_editable');
    const draft = working(raw);
    const section = tabsAt(draft, panelIndex, sectionIndex);
    const tab = section && Array.isArray(section.tabs) ? section.tabs[tabIndex] : null;
    if (!isObject(tab)) return refuse('out_of_range');
    const before = text(tab.id);
    tab[fieldName] = String(value ?? '');
    if (fieldName === 'id' && before && text(section.default_tab) === before && text(value) !== before) section.default_tab = text(value);
    return done(draft);
  }
  function addChildSection(raw, panelIndex, sectionIndex, tabIndex, type, core = defaultCore) {
    if (!CHILD_SECTIONS.includes(type)) return refuse('section_type_not_supported');
    const draft = working(raw);
    const section = tabsAt(draft, panelIndex, sectionIndex);
    const tab = section && Array.isArray(section.tabs) ? section.tabs[tabIndex] : null;
    if (!isObject(tab)) return refuse('out_of_range');
    if (!Array.isArray(tab.sections)) tab.sections = [];
    if (tab.sections.length >= core.MAX_SECTIONS) return refuse('section_limit');
    tab.sections.push(newSection(type));
    return done(draft, { index: tab.sections.length - 1 });
  }
  function childSections(draft, panelIndex, sectionIndex, tabIndex) {
    const section = tabsAt(draft, panelIndex, sectionIndex);
    const tab = section && Array.isArray(section.tabs) ? section.tabs[tabIndex] : null;
    return isObject(tab) && Array.isArray(tab.sections) ? tab.sections : null;
  }
  function removeChildSection(raw, panelIndex, sectionIndex, tabIndex, childIndex) {
    const draft = working(raw);
    const list = childSections(draft, panelIndex, sectionIndex, tabIndex);
    if (!list || !inRange(list, childIndex)) return refuse('out_of_range');
    list.splice(childIndex, 1);
    return done(draft);
  }
  function moveChildSection(raw, panelIndex, sectionIndex, tabIndex, from, to) {
    const draft = working(raw);
    const list = childSections(draft, panelIndex, sectionIndex, tabIndex);
    return list && relocate(list, from, to) ? done(draft) : refuse('out_of_range');
  }

  // ---- layout --------------------------------------------------------------------------------------
  const LAYOUT_FIELDS = ['preset', 'left_panel', 'right_panel', 'primary_panel', 'scene_source', 'scene_fit'];
  // Aliases the core also reads; setting the canonical field removes the alias so the new value is not shadowed.
  const LAYOUT_ALIASES = { left_panel: ['left'], right_panel: ['right'], primary_panel: ['panel'] };
  /**
   * Set one layout field (preset, left_panel, right_panel, primary_panel, scene_source, scene_fit).
   * An empty value removes the key. Unknown layout keys are kept. Enum fields refuse unknown values.
   */
  function setLayoutField(raw, fieldName, value) {
    if (!LAYOUT_FIELDS.includes(fieldName)) return refuse('field_not_editable');
    const draft = working(raw);
    const next = String(value ?? '').trim();
    const c = defaultCore || {};
    const allowed = ({ preset: c.LAYOUT_PRESETS, scene_source: c.SCENE_SOURCES, scene_fit: c.SCENE_FITS })[fieldName];
    if (next && allowed && !allowed.includes(next)) return refuse('value_not_allowed');
    if (draft.layout !== undefined && !isObject(draft.layout)) return refuse('layout_not_object');
    if (!draft.layout) draft.layout = {};
    if (next) draft.layout[fieldName] = next; else delete draft.layout[fieldName];
    (LAYOUT_ALIASES[fieldName] || []).forEach(alias => { delete draft.layout[alias]; });
    if (!Object.keys(draft.layout).length) delete draft.layout;
    return done(draft);
  }

  // ---- action effects ----------------------------------------------------------------------------
  const EFFECT_PARTS = { changes: { text: ['path'], number: ['delta'] }, items: { text: ['path', 'id', 'name'], number: ['delta'] } };
  function actionItemAt(draft, t) {
    const section = sectionAt(draft, t && t.panel, refOf(t || {}));
    const item = section && section.type === 'actions' && Array.isArray(section.items) ? section.items[t.item] : null;
    return isObject(item) ? item : null;
  }
  function effectOp(raw, target, run) {
    const draft = working(raw);
    const item = actionItemAt(draft, target);
    if (!item) return refuse('out_of_range');
    return run(draft, item);
  }
  /** Add an empty entry to effect.changes (numeric resource) or effect.items (collection item), creating the effect if needed. */
  function addEffectEntry(raw, target, part) {
    if (!EFFECT_PARTS[part]) return refuse('field_not_editable');
    return effectOp(raw, target, (draft, item) => {
      if (item.effect !== undefined && !isObject(item.effect)) return refuse('effect_not_object');
      if (!item.effect) item.effect = {};
      const list = Array.isArray(item.effect[part]) ? item.effect[part] : (item.effect[part] = []);
      if (list.length >= defaultCore.MAX_EFFECT_ENTRIES) return refuse('effect_limit');
      list.push(part === 'changes' ? { path: '', delta: -1 } : { path: 'modules.inventory', id: '', name: '', delta: 1 });
      return done(draft, { index: list.length - 1 });
    });
  }
  /** Remove one entry; when the effect is left with no entries at all, the effect itself is removed. */
  function removeEffectEntry(raw, target, part, index) {
    if (!EFFECT_PARTS[part]) return refuse('field_not_editable');
    return effectOp(raw, target, (draft, item) => {
      const list = isObject(item.effect) ? item.effect[part] : null;
      if (!inRange(list, index)) return refuse('out_of_range');
      list.splice(index, 1);
      if (!list.length) delete item.effect[part];
      const other = part === 'changes' ? 'items' : 'changes';
      const empty = !(Array.isArray(item.effect.changes) && item.effect.changes.length) && !(Array.isArray(item.effect.items) && item.effect.items.length);
      if (empty) delete item.effect; // the event text alone is not an effect
      return done(draft, { effectRemoved: empty, other });
    });
  }
  function setEffectEntryField(raw, target, part, index, fieldName, value) {
    const rule = EFFECT_PARTS[part];
    if (!rule) return refuse('field_not_editable');
    return effectOp(raw, target, (draft, item) => {
      const entry = isObject(item.effect) && Array.isArray(item.effect[part]) ? item.effect[part][index] : null;
      if (!isObject(entry)) return refuse('out_of_range');
      if (rule.text.includes(fieldName)) { entry[fieldName] = String(value ?? ''); return done(draft); }
      if (rule.number.includes(fieldName)) {
        const text = String(value ?? '').trim();
        if (text === '' || !Number.isFinite(Number(text))) return refuse('not_a_number');
        entry[fieldName] = Number(text);
        return done(draft);
      }
      return refuse('field_not_editable');
    });
  }
  function setEffectEvent(raw, target, value) {
    return effectOp(raw, target, (draft, item) => {
      if (!isObject(item.effect)) return refuse('no_effect');
      item.effect.event = String(value ?? '');
      return done(draft);
    });
  }
  /** Remove the whole effect from an action. The action is then a plain "send this text" button. */
  function removeEffect(raw, target) {
    return effectOp(raw, target, (draft, item) => { delete item.effect; return done(draft); });
  }

  // ---- preview test state ------------------------------------------------------------------------
  const TEXT_SAMPLE = '範例';
  const LIST_SAMPLE = ['範例 1', '範例 2', '範例 3'];
  const EFFECT_START = 20;
  const cardSample = (prefix, key = 'name') => [1, 2, 3].map(n => ({ [key]: `${prefix} ${n}`, summary: '範例說明' }));

  /**
   * Preview test state for every path the draft reads or writes.
   *  - meters: value at 60% of its maximum; stats: sample text; list: sample rows
   *  - action effects: numeric resources start at 20; item collections start empty;
   *    `moduleDefinitions` is filled in so the production effect executor works on the test state
   * `overrides` ({ path: number|string }) wins, so the author can try the extremes.
   * Returns { state, entries } where entries lists the adjustable test values.
   */
  function seedState(seed) {
    const state = { modules: {}, moduleDefinitions: [] };
    if (!isObject(seed)) return state;
    const initial = isObject(seed.initial_state) ? seed.initial_state : {};
    if (isObject(initial.modules)) state.modules = cloneDraft(initial.modules);
    if (typeof initial.time === 'string') state.time = initial.time;
    if (typeof initial.location === 'string') state.location = initial.location;
    if (Array.isArray(initial.events)) state.events = cloneDraft(initial.events);
    if (Array.isArray(initial.npcs)) state.npcs = cloneDraft(initial.npcs);
    if (Array.isArray(seed.world_modules)) state.moduleDefinitions = seed.world_modules.filter(d=>isObject(d)&&typeof d.id==='string').map(d=>({id:d.id,...(typeof d.kind==='string'?{kind:d.kind}:{}),enabled:d.enabled!==false}));
    return state;
  }

  function buildTestState(raw, overrides = {}, core = defaultCore, seed = null) {
    const state = seedState(seed);
    const existing = path => (core.isTargetPath(path) ? core.getPath(state, path) : (['time', 'location', 'events', 'npcs'].includes(path) ? state[path] : undefined));
    const entries = [];
    const seen = new Set();
    const pick = (path, fallback) => (Object.prototype.hasOwnProperty.call(overrides, path) && overrides[path] !== '' && overrides[path] !== undefined ? overrides[path] : fallback);
    const writePath = (path, value) => {
      if (core.isTargetPath(path)) return core.setPath(state, path, value);
      if (['time', 'location', 'events', 'npcs'].includes(path)) { state[path] = value; return true; }
      return false;
    };
    const put = (path, value, label, role) => {
      if (!core.isDisplayPath(path) || seen.has(path)) return;
      const have = existing(path);
      const chosen = pick(path, have !== undefined ? have : value);
      if (!writePath(path, chosen)) return;
      seen.add(path);
      entries.push({ path, label, role, value: chosen });
    };
    const define = (id, kind) => { if (id && !state.moduleDefinitions.some(d => d.id === id)) state.moduleDefinitions.push({ id, kind }); };
    const sections = [];
    const collect = list => (Array.isArray(list) ? list : []).forEach(section => {
      if (!isObject(section)) return;
      sections.push(section);
      if (section.type === 'tabs') (Array.isArray(section.tabs) ? section.tabs : []).forEach(tab => { if (isObject(tab)) collect(tab.sections); });
    });
    (isObject(raw) && Array.isArray(raw.panels) ? raw.panels : []).forEach(panel => { if (isObject(panel)) collect(panel.sections); });
    const itemsOf = section => (Array.isArray(section.items) ? section.items.filter(isObject) : []);
    const num = v => (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

    sections.filter(s => s.type === 'meters').forEach(section => itemsOf(section).forEach(item => {
      const valuePath = text(item.value_path || item.path);
      const maxPath = text(item.max_path);
      const label = String(item.label || valuePath).slice(0, 60);
      if (maxPath) put(maxPath, 100, `${label}（最大值）`, 'max');
      const maxEntry = maxPath ? entries.find(e => e.path === maxPath) : null;
      const maxForValue = maxEntry ? Number(maxEntry.value) : (num(item.max) ?? 100);
      put(valuePath, Math.round((Number.isFinite(maxForValue) ? maxForValue : 100) * 0.6), label, 'value');
    }));
    sections.filter(s => s.type === 'actions').forEach(section => itemsOf(section).forEach(item => {
      const effect = isObject(item.effect) ? item.effect : null;
      if (!effect) return;
      const label = String(item.label || '行動').slice(0, 40);
      (Array.isArray(effect.changes) ? effect.changes : []).filter(isObject).forEach(change => {
        const path = text(change.path);
        if (!core.isTargetPath(path) || path.split('.').length < 3) return;
        define(path.split('.')[1], 'object');
        put(path, EFFECT_START, `${label}：${path}`, 'effect');
      });
      (Array.isArray(effect.items) ? effect.items : []).filter(isObject).forEach(entry => {
        const path = text(entry.path);
        const parts = path.split('.');
        if (!core.isTargetPath(path) || parts.length !== 2) return;
        define(parts[1], 'collection');
        if (!seen.has(path)) { seen.add(path); if (existing(path) === undefined) core.setPath(state, path, []); }
      });
    }));
    sections.filter(s => s.type === 'stats' || (s.type === 'timeline' && s.mode === 'round_diff')).forEach(section => itemsOf(section).forEach(item => {
      const path = text(item.path);
      put(path, TEXT_SAMPLE, String(item.label || path).slice(0, 60), 'text');
    }));
    const putList = (path, rows) => {
      if (!core.isDisplayPath(path) || seen.has(path)) return;
      const have = existing(path);
      if (Array.isArray(have)) { seen.add(path); return; }   // the card's own rows win over sample rows
      if (writePath(path, rows)) seen.add(path);
    };
    sections.filter(s => s.type === 'list').forEach(section => putList(text(section.path), LIST_SAMPLE.slice()));
    sections.filter(s => s.type === 'cards').forEach(section => putList(text(section.path), cardSample('範例')));
    sections.filter(s => s.type === 'timeline' && s.mode !== 'round_diff').forEach(section => putList(text(section.path), cardSample('範例事件', 'title')));
    sections.filter(s => s.type === 'location_archive').forEach(section => {
      put(text(section.time_path) || 'time', TEXT_SAMPLE, '時間', 'text');
      put(text(section.location_path) || 'location', TEXT_SAMPLE, '地點', 'text');
      ['area_path', 'status_path'].forEach(field => put(text(section[field]), TEXT_SAMPLE, field === 'area_path' ? '區域' : '狀態', 'text'));
      putList(text(section.destinations_path), cardSample('範例地點'));
    });
    // an object module defined only for effects must exist as an object even if no value was written
    state.moduleDefinitions.filter(d => d.kind === 'object').forEach(d => { if (!isObject(state.modules[d.id])) state.modules[d.id] = {}; });
    return { state, entries };
  }
  const buildMeterTestState = buildTestState;

  /**
   * Try one action's effect on a COPY of the test state, with the production executor.
   * Nothing is written anywhere; returns { ok, reason, changes:[{path,from,to}], items:[{path,id,from,to}] }.
   * `scenario: 'empty'` sets every resource the action spends to 0, to show the failure case.
   */
  function trialAction(raw, target, overrides = {}, core = defaultCore, scenario = 'current', seed = null) {
    const draft = isObject(raw) ? raw : {};
    const section = sectionAt(draft, target.panel, refOf(target));
    const item = isObject(section) && section.type === 'actions' && Array.isArray(section.items) ? section.items[target.item] : null;
    if (!isObject(item) || !isObject(item.effect)) return { ok: false, reason: '這個行動沒有自動結算（effect），按下後只會送出文字。', changes: [], items: [] };
    const { state } = buildTestState(draft, overrides, core, seed);
    const work = cloneDraft(state);
    const changes = (Array.isArray(item.effect.changes) ? item.effect.changes : []).filter(isObject);
    if (scenario === 'empty') changes.forEach(c => { const p = text(c.path); if (core.isTargetPath(p) && Number(c.delta) < 0) core.setPath(work, p, 0); });
    const before = cloneDraft(work);
    const result = core.executeActionEffect(work, item.effect);
    if (!result.ok) return { ok: false, reason: result.reason || '無法執行。', changes: [], items: [] };
    return {
      ok: true,
      reason: '',
      changes: changes.map(c => { const p = text(c.path); return { path: p, from: core.getPath(before, p), to: core.getPath(work, p) }; }),
      items: (Array.isArray(item.effect.items) ? item.effect.items : []).filter(isObject).map(it => {
        const rows = core.getPath(work, text(it.path)) || [];
        const prev = (core.getPath(before, text(it.path)) || []).find(r => r.id === text(it.id));
        const next = rows.find(r => r.id === text(it.id));
        return { path: text(it.path), id: text(it.id), from: prev ? prev.quantity : 0, to: next ? next.quantity : 0 };
      })
    };
  }

  return Object.freeze({
    STATUS, EDITABLE_SECTIONS, CHILD_SECTIONS, cloneDraft, analyzeDraft, contrastRatio, analyzeContrast, TEMPLATES, templateDraft, isEmptyDraft, createStarterDraft, buildTestState, buildMeterTestState, trialAction,
    addPanel, removePanel, movePanel, addSection, addMeterSection, removeSection, moveSection,
    addItem, addMeterItem, removeItem, moveItem, setField,
    addTab, removeTab, moveTab, setTabField, addChildSection, removeChildSection, moveChildSection, setLayoutField,
    addEffectEntry, removeEffectEntry, setEffectEntryField, setEffectEvent, removeEffect
  });
});
