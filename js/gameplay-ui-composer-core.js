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
  const api = factory(root && root.BAOGameplayUICore);
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
    INVALID: 'invalid'            // schema-level or enum-level rejection
  });

  const node = (path, kind, status, reason = '') => ({ path, kind, status, reason });

  /** Section list (panel sections, or the sections of one tab). `depth` is 0 for panels, 1 inside tabs. */
  function analyzeSections(core, rawSections, basePath, depth, nodes) {
    let valid = 0;
    rawSections.forEach((section, index) => {
      const path = basePath.concat(index);
      const normalized = core.normalizeSection(section, index, depth);
      if (!normalized) {
        const nested = depth >= 1 && isObject(section) && section.type === 'tabs';
        nodes.push(node(path, 'section', STATUS.INCOMPLETE, nested ? 'nested_tabs_not_allowed' : 'section_invalid_or_empty'));
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
      const trimmed = Array.isArray(rawItems) && Array.isArray(normalized.items) && normalized.items.length < rawItems.length;
      nodes.push(node(path, 'section', trimmed ? STATUS.TRIMMED : STATUS.OK, trimmed ? 'items_dropped_or_over_limit' : ''));
      if (normalized.type === 'tabs') analyzeTabs(core, section, path, nodes);
    });
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
      nodes.push(node(path, 'builder', STATUS.TRIMMED, 'builder_value_normalized'));
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
  function analyzeDraft(raw, core = defaultCore) {
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
        nodes.push(node(path, 'panel', STATUS.INCOMPLETE, rawSections.length ? 'panel_has_no_valid_section' : 'panel_empty'));
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

    const problems = nodes.filter(n => n.status !== STATUS.OK);
    const count = status => problems.filter(n => n.status === status).length;
    return {
      schema,
      nodes,
      summary: {
        total: nodes.length,
        problems: problems.length,
        incomplete: count(STATUS.INCOMPLETE),
        duplicates: count(STATUS.DUPLICATE),
        overLimit: count(STATUS.OVER_LIMIT),
        schemaValid: Boolean(schema)
      }
    };
  }

  return Object.freeze({ STATUS, cloneDraft, analyzeDraft });
});
