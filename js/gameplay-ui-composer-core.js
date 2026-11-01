/* BAO/LAB Gameplay UI composer core. Pure helpers: no DOM, storage, network, or model calls.
 *
 * The composer edits a RAW draft. BAOGameplayUICore.normalize() is only used to
 * preview and diagnose that draft; its result must never replace the draft,
 * because normalize() fills defaults, trims content and drops incomplete or
 * unknown nodes.
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

  const STATUS = Object.freeze({ OK: 'ok', INCOMPLETE: 'incomplete', TRIMMED: 'trimmed', OVER_LIMIT: 'over_limit' });

  function itemStatus(rawItems, normItems) {
    if (!Array.isArray(rawItems)) return null;
    return normItems && normItems.length < rawItems.length ? STATUS.TRIMMED : null;
  }

  /**
   * Diagnose a raw draft against the platform normalizer without modifying it.
   * Returns { schema, nodes, summary }:
   *  - schema: normalize(raw) result for preview (may be null; never written back)
   *  - nodes:  one entry per raw panel / section, addressed by index path
   *  - A node that normalize() would drop is reported as "incomplete", never removed.
   */
  function analyzeDraft(raw, core = defaultCore) {
    if (!core) throw new Error('BAOGameplayUICore is required');
    const schema = core.normalize(raw);
    const nodes = [];
    if (!schema) nodes.push({ path: [], kind: 'schema', status: STATUS.INCOMPLETE, reason:
      !isObject(raw) ? 'schema_not_object' : raw.enabled === false ? 'schema_disabled' :
      raw.version !== undefined && Number(raw.version) !== 1 ? 'unsupported_version' : 'schema_has_no_valid_content' });
    const add = (path, kind, status, reason = '') => nodes.push({ path, kind, status, reason });
    const visitSections = (sections, parentPath, depth = 0) => {
      (Array.isArray(sections) ? sections : []).forEach((section, index) => {
        const path = [...parentPath, 'sections', index];
        if (index >= core.MAX_SECTIONS) {
          add(path, 'section', STATUS.OVER_LIMIT, 'section_over_limit');
          return;
        }
        const normalized = core.normalizeSection(section, index, depth);
        if (!normalized) {
          add(path, 'section', STATUS.INCOMPLETE, 'section_invalid_or_empty');
          return;
        }
        const trimmed = itemStatus(isObject(section) ? section.items : null, normalized.items);
        add(path, 'section', trimmed || STATUS.OK, trimmed ? 'items_dropped_or_over_limit' : '');
        if (section.type !== 'tabs') return;
        const seen = new Set();
        (Array.isArray(section.tabs) ? section.tabs : []).forEach((tab, tabIndex) => {
          const tabPath = [...path, 'tabs', tabIndex];
          // Normalize each tab through its owning section, preserving runtime depth rules.
          const single = core.normalizeSection({ ...section, tabs: [tab] }, index, depth)?.tabs?.[0];
          let status = STATUS.OK;
          let reason = '';
          if (!single) { status = STATUS.INCOMPLETE; reason = 'tab_invalid_or_empty'; }
          else if (seen.has(single.id)) { status = STATUS.TRIMMED; reason = 'duplicate_tab_id'; }
          else if (tabIndex >= core.MAX_TABS) { status = STATUS.OVER_LIMIT; reason = 'tab_over_limit'; }
          if (single) seen.add(single.id);
          add(tabPath, 'tab', status, reason);
          visitSections(tab?.sections, tabPath, depth + 1);
        });
      });
    };
    const rawPanels = isObject(raw) && Array.isArray(raw.panels) ? raw.panels : [];
    const seenPanels = new Set();
    rawPanels.forEach((panel, panelIndex) => {
      const panelPath = ['panels', panelIndex];
      if (panelIndex >= core.MAX_PANELS) {
        add(panelPath, 'panel', STATUS.OVER_LIMIT, 'panel_over_limit');
        return;
      }
      const normalized = core.normalizePanel(panel, panelIndex);
      if (!normalized) add(panelPath, 'panel', STATUS.INCOMPLETE, 'panel_has_no_valid_section');
      else if (seenPanels.has(normalized.id)) add(panelPath, 'panel', STATUS.TRIMMED, 'duplicate_panel_id');
      else add(panelPath, 'panel', STATUS.OK);
      if (normalized) seenPanels.add(normalized.id);
      visitSections(panel?.sections, panelPath);
    });
    const problems = nodes.filter(node => node.status !== STATUS.OK);
    return {
      schema,
      nodes,
      summary: { total: nodes.length, problems: problems.length, incomplete: problems.filter(n => n.status === STATUS.INCOMPLETE).length }
    };
  }

  return Object.freeze({ STATUS, cloneDraft, analyzeDraft });
});
