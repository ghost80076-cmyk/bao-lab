const assert = require('node:assert/strict');
const fs = require('node:fs');
const Core = require('../js/gameplay-ui-core.js');

const card = JSON.parse(fs.readFileSync('tests/fixtures/gameplay-ui-demo-character.json', 'utf8'));
const schema = Core.normalize(card.gameplay_ui);
assert.ok(schema, 'demo schema should normalize');
assert.equal(schema.version, 1);
assert.equal(schema.builder.point_pool, 6);
assert.equal(schema.builder.attributes.length, 2);
assert.equal(schema.panels.length, 4);
assert.equal(schema.panels[0].id, 'status');
const adventure = schema.panels.find(panel => panel.id === 'adventure');
assert.ok(adventure, 'adventure panel should normalize');
assert.deepEqual(adventure.sections.map(section => section.variant).filter(Boolean), ['codex', 'quest', 'party', 'skill']);
assert.equal(adventure.sections[0].path, 'npcs');
assert.equal(adventure.sections[1].path, 'modules.quest_log.quests');
assert.equal(schema.layout.preset, 'rpg-dashboard');
assert.equal(schema.layout.left_panel, 'status');
assert.equal(schema.layout.right_panel, 'world');
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
const badLayout = Core.normalizeLayout({ preset: 'rpg-dashboard', left_panel: 'missing', right_panel: '__proto__' }, schema.panels);
assert.equal(badLayout.preset, 'rpg-dashboard');
assert.equal(badLayout.left_panel, '');
assert.equal(badLayout.right_panel, '');
assert.equal(Core.normalizeLayout({ preset: 'javascript:alert(1)' }, schema.panels).preset, 'standard');
const sceneLayout = Core.normalizeLayout({
  preset: 'scene-rpg',
  right_panel: 'world',
  scene_source: 'reading-background',
  scene_fit: 'contain'
}, schema.panels);
assert.equal(sceneLayout.preset, 'scene-rpg');
assert.equal(sceneLayout.left_panel, '');
assert.equal(sceneLayout.right_panel, 'world');
assert.equal(sceneLayout.scene_source, 'reading-background');
assert.equal(sceneLayout.scene_fit, 'contain');
assert.deepEqual(Core.CARD_VARIANTS, ['codex', 'quest', 'party', 'skill']);
const badCards = Core.normalize({version:1,panels:[{id:'bad_cards',label:'bad',sections:[{type:'cards',variant:'quest',path:'config.api.key'}]}]});
assert.equal(badCards, null, 'cards must not read unsafe paths');
const fallbackCards = Core.normalize({version:1,panels:[{id:'cards',label:'cards',sections:[{type:'cards',variant:'javascript:1',path:'npcs'}]}]});
assert.equal(fallbackCards.panels[0].sections[0].variant, 'codex');
const safeSceneDefaults = Core.normalizeLayout({ preset: 'scene-rpg', scene_source: 'javascript:1', scene_fit: 'stretch' }, schema.panels);
assert.equal(safeSceneDefaults.scene_source, 'story-gallery');
assert.equal(safeSceneDefaults.scene_fit, 'cover');
const unsafe = JSON.parse(JSON.stringify(card.gameplay_ui));
unsafe.builder.fields.push({ key: 'bad', label: 'bad', type: 'text', target_path: 'config.api.key' });
unsafe.panels.push({ id: 'secret', label: 'secret', sections: [{ type: 'stats', items: [{ label: 'key', path: 'config.api.key' }] }] });
const cleaned = Core.normalize(unsafe);
assert.equal(cleaned.builder.fields.some(field => field.key === 'bad'), false);
assert.equal(cleaned.panels.some(panel => panel.id === 'secret'), false);

assert.equal(Core.normalize(null), null);
assert.equal(Core.normalize({ version: 2, panels: [] }), null);
console.log('Gameplay UI Engine core PASS: opt-in schema, bounded point allocation, safe module paths, state binding');
