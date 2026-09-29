const assert = require('node:assert/strict');
const fs = require('node:fs');
const Core = require('../js/gameplay-ui-core.js');

const card = JSON.parse(fs.readFileSync('tests/fixtures/gameplay-ui-demo-character.json', 'utf8'));
const schema = Core.normalize(card.gameplay_ui);
assert.ok(schema, 'demo schema should normalize');
assert.equal(schema.version, 1);
assert.equal(schema.builder.point_pool, 6);
assert.equal(schema.builder.attributes.length, 2);
assert.equal(schema.panels.length, 2);
assert.equal(schema.panels[0].id, 'status');
assert.equal(schema.theme.preset, 'stage-neon');
assert.equal(schema.theme.accent, '#c78cff');
assert.equal(schema.theme.density, 'compact');
assert.equal(schema.theme.radius, 'soft');
assert.equal(schema.theme.meter, 'glow');

const defaults = Core.builderDefaults(schema);
assert.deepEqual(defaults, { strength: 8, agility: 8, origin: '散修' });
assert.equal(Core.remainingPoints(schema, defaults), 6);

const requested = Core.normalizeBuilderValues(schema, { strength: 14, agility: 14, origin: '宗門弟子' });
assert.equal(requested.strength, 14);
assert.equal(requested.agility, 8, 'second attribute must not overspend the shared point pool');
assert.equal(requested.origin, '宗門弟子');
assert.equal(Core.remainingPoints(schema, requested), 0);

const state = JSON.parse(JSON.stringify(card.initial_state));
assert.equal(Core.applyBuilderValues(schema, { strength: 11, agility: 10, origin: '世家子弟' }, state), true);
assert.equal(state.modules.player.strength, 11);
assert.equal(state.modules.player.agility, 10);
assert.equal(state.modules.player.origin, '世家子弟');
assert.equal(Core.getPath(state, 'modules.player.hp'), 700);
assert.equal(Core.getPath(state, 'time'), '玄曆 30 年 春 三月初三');

assert.equal(Core.isTargetPath('modules.player.hp'), true);
assert.equal(Core.isTargetPath('modules.__proto__.polluted'), false);
assert.equal(Core.isDisplayPath('events'), true);
assert.equal(Core.isDisplayPath('config.api.key'), false);
const cleanTheme = Core.normalizeTheme({ preset: 'arcane-night', accent: '#ABC', surface: 'red;background:url(x)', density: 'dense', radius: '999px', meter: 'glow' });
assert.equal(cleanTheme.preset, 'arcane-night');
assert.equal(cleanTheme.accent, '#aabbcc');
assert.equal(cleanTheme.surface, undefined);
assert.equal(cleanTheme.density, 'comfortable');
assert.equal(cleanTheme.radius, 'round');
assert.equal(cleanTheme.meter, 'glow');
const rejectedTheme = Core.normalizeTheme({ preset: 'url(javascript:1)', accent: '#123456;position:fixed' });
assert.equal(rejectedTheme.preset, 'default');
assert.equal(rejectedTheme.accent, undefined);
const unsafe = JSON.parse(JSON.stringify(card.gameplay_ui));
unsafe.builder.fields.push({ key: 'bad', label: 'bad', type: 'text', target_path: 'config.api.key' });
unsafe.panels.push({ id: 'secret', label: 'secret', sections: [{ type: 'stats', items: [{ label: 'key', path: 'config.api.key' }] }] });
const cleaned = Core.normalize(unsafe);
assert.equal(cleaned.builder.fields.some(field => field.key === 'bad'), false);
assert.equal(cleaned.panels.some(panel => panel.id === 'secret'), false);

assert.equal(Core.normalize(null), null);
assert.equal(Core.normalize({ version: 2, panels: [] }), null);
console.log('Gameplay UI Engine core PASS: opt-in schema, bounded point allocation, safe module paths, state binding');
