'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const Core = require('../js/gameplay-ui-core.js');
const audit = require('../docs/native-archive-catalog-audit.json');
const catalog = [...require('../data/characters.json'), ...require('../data/character-catalog/community/page-0001.json')];
const stable = v => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
const hash = v => crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
const leaves = sections => sections.flatMap(s => s.type === 'tabs' ? s.tabs.flatMap(t => leaves(t.sections)) : [s]);
const changed = audit.works.filter(w => w.changed);
assert.equal(changed.length, 44);
for (const work of changed) {
  const card = JSON.parse(fs.readFileSync(work.file, 'utf8'));
  const g = card.gameplay;
  const raw = g.ui_schema || g.gameplay_ui;
  const ui = Core.normalize(raw);
  assert.ok(ui, work.id);
  const originalContent = structuredClone(card.content);
  for (const edit of [...(work.rule_deduplication || [])].reverse()) {
    const text = originalContent[edit.field];
    assert.equal(text.slice(edit.index, edit.index + edit.after.length), edit.after);
    originalContent[edit.field] = text.slice(0, edit.index) + edit.before + text.slice(edit.index + edit.after.length);
  }
  if (work.world_relocation) {
    const relocation = work.world_relocation;
    assert.equal(card.content.world, relocation.block);
    assert.ok(!card.content[relocation.field].includes(relocation.block), 'world rules moved, not duplicated');
    const text = originalContent[relocation.field];
    originalContent[relocation.field] = text.slice(0, relocation.index) + relocation.block + relocation.trailing + text.slice(relocation.index);
    if (!relocation.original_world_present) delete originalContent.world;
  }
  assert.equal(hash(originalContent), work.preserved.content, `${work.id}: only reviewed global-rule removals/world relocation; preserve creative content, greeting and Dynamic Prompts`);
  assert.equal(hash(g.initial_state || {}), work.preserved.initial_state, `${work.id}: preserve initial state`);
  assert.equal(hash(Object.fromEntries(Object.entries(g).filter(([k]) => !['ui_schema','gameplay_ui'].includes(k)))), work.preserved.gameplay_rules, `${work.id}: preserve rules and world_modules`);
  assert.equal(hash(raw.builder || null), work.preserved.builder, `${work.id}: preserve Builder`);
  if (work.original_panel_ids.length) assert.deepEqual(ui.panels.map(p => p.id), work.original_panel_ids);
  assert.equal(ui.panels[0].sections[0].type, 'tabs');
  const sections = ui.panels.flatMap(p => leaves(p.sections));
  assert.ok(sections.some(s => s.mode === 'round_diff'), work.id);
  for (const section of sections) {
    if (section.type === 'timeline' && section.mode === 'round_diff') {
      assert.ok(section.items.length <= 24);
      for (const item of section.items) {
        assert.ok(Core.isDisplayPath(item.path), `${work.id}: ${item.path}`);
        assert.doesNotMatch(item.path, /private|hidden|secret|truth|notes|offscreen/i);
        const value = Core.getPath(g.initial_state, item.path);
        assert.ok(['string','number','boolean'].includes(typeof value), `${work.id}: scalar watch path must exist ${item.path}`);
      }
    }
    if (section.type === 'timeline' && section.mode === 'history') assert.ok(Array.isArray(Core.getPath(g.initial_state, section.path)), `${work.id}: existing history array`);
    if (section.type === 'location_archive') for (const key of ['time_path','location_path','area_path','status_path','destinations_path']) {
      if (section[key]) assert.notEqual(Core.getPath(g.initial_state, section[key]), undefined, `${work.id}: ${key}`);
    }
  }
  const state = structuredClone(g.initial_state);
  Core.applyBuilderValues(ui, Core.builderDefaults(ui), state);
  for (const field of [...ui.builder.fields, ...ui.builder.attributes]) assert.notEqual(Core.getPath(state, field.target_path), undefined, `${work.id}: Builder binds ${field.key}`);
  for (const entry of catalog.filter(e => e.id === work.id)) {
    assert.equal(entry.author, '班長'); assert.equal(entry.author_id, 'banzhang');
    assert.ok(entry.published_version >= 2);
  }
  assert.equal(card.meta.author_id, 'banzhang');
}
console.log('PASS 44 native archives: creative integrity, Builder, safe scalar diffs, existing history and catalog authors');
