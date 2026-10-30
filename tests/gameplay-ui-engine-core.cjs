const assert = require('node:assert/strict');
const fs = require('node:fs');
const Core = require('../js/gameplay-ui-core.js');

const card = JSON.parse(fs.readFileSync('tests/fixtures/gameplay-ui-demo-character.json', 'utf8'));
const schema = Core.normalize(card.gameplay_ui);
assert.ok(schema, 'demo schema should normalize');
assert.equal(schema.version, 1);
assert.equal(schema.builder.point_pool, 6);
assert.equal(schema.builder.kind, 'gameplay');
assert.equal(schema.builder.attributes.length, 2);
assert.equal(schema.panels.length, 5);
assert.equal(schema.panels[0].id, 'status');
const adventure = schema.panels.find(panel => panel.id === 'adventure');
assert.ok(adventure, 'adventure panel should normalize');
assert.deepEqual(adventure.sections.map(section => section.variant).filter(Boolean), ['codex', 'quest', 'party', 'skill']);
assert.equal(adventure.sections[0].path, 'npcs');
assert.equal(adventure.sections[1].path, 'modules.quest_log.quests');
const archive = schema.panels.find(panel => panel.id === 'archive');
assert.ok(archive, 'archive panel should normalize');
const tabbedArchive = archive.sections[0];
assert.equal(tabbedArchive.type, 'tabs');
assert.equal(tabbedArchive.default_tab, 'live');
assert.deepEqual(tabbedArchive.tabs.map(tab => tab.id), ['live', 'relation', 'changes', 'history']);
const liveArchive = tabbedArchive.tabs.find(tab => tab.id === 'live').sections[0];
assert.equal(liveArchive.type, 'location_archive');
assert.equal(liveArchive.scene_source, 'reading-background');
assert.equal(liveArchive.destinations_path, 'modules.scene.destinations');
const diffTimeline = tabbedArchive.tabs.find(tab => tab.id === 'changes').sections[0];
assert.equal(diffTimeline.type, 'timeline');
assert.equal(diffTimeline.mode, 'round_diff');
assert.deepEqual(diffTimeline.items.map(item => item.path), ['location', 'modules.relationship.status']);
const historyTimeline = tabbedArchive.tabs.find(tab => tab.id === 'history').sections[0];
assert.equal(historyTimeline.mode, 'history');
assert.equal(historyTimeline.path, 'modules.history.events');
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
const terminalLayout = Core.normalizeLayout({
  preset: 'terminal',
  primary_panel: 'world'
}, schema.panels);
assert.equal(terminalLayout.preset, 'terminal');
assert.equal(terminalLayout.primary_panel, 'world');
const badTerminalLayout = Core.normalizeLayout({
  preset: 'terminal',
  primary_panel: 'config.api.key'
}, schema.panels);
assert.equal(badTerminalLayout.primary_panel, '');
assert.equal(Core.LAYOUT_PRESETS.includes('terminal'), true);
assert.deepEqual(Core.CARD_VARIANTS, ['codex', 'quest', 'party', 'skill']);
const badCards = Core.normalize({version:1,panels:[{id:'bad_cards',label:'bad',sections:[{type:'cards',variant:'quest',path:'config.api.key'}]}]});
assert.equal(badCards, null, 'cards must not read unsafe paths');
const fallbackCards = Core.normalize({version:1,panels:[{id:'cards',label:'cards',sections:[{type:'cards',variant:'javascript:1',path:'npcs'}]}]});
assert.equal(fallbackCards.panels[0].sections[0].variant, 'codex');
assert.deepEqual(Core.TIMELINE_MODES, ['history', 'round_diff']);
const unsafeArchive = Core.normalize({version:1,panels:[{id:'archive',label:'archive',sections:[{
  type:'tabs',
  tabs:[
    {id:'bad_location',label:'bad',sections:[{type:'location_archive',area_path:'config.api.key',destinations_path:'config.api.key'}]},
    {id:'bad_history',label:'bad history',sections:[{type:'timeline',mode:'history',path:'config.api.key'}]},
    {id:'safe_diff',label:'safe diff',sections:[{type:'timeline',mode:'round_diff',items:[{label:'bad',path:'config.api.key'},{label:'place',path:'location'}]}]}
  ]
}]}]});
assert.ok(unsafeArchive, 'tabs with remaining safe sections should normalize');
const normalizedTabs = unsafeArchive.panels[0].sections[0].tabs;
const normalizedLocation = normalizedTabs.find(tab => tab.id === 'bad_location').sections[0];
assert.equal(normalizedLocation.area_path, '');
assert.equal(normalizedLocation.destinations_path, '');
assert.equal(normalizedTabs.some(tab => tab.id === 'bad_history'), false, 'unsafe history path should remove its empty tab');
const normalizedDiff = normalizedTabs.find(tab => tab.id === 'safe_diff').sections[0];
assert.deepEqual(normalizedDiff.items.map(item => item.path), ['location']);
const nestedTabs = Core.normalize({version:1,panels:[{id:'nested',label:'nested',sections:[{type:'tabs',tabs:[{id:'outer',label:'outer',sections:[{type:'tabs',tabs:[{id:'inner',label:'inner',sections:[{type:'stats',items:[{label:'place',path:'location'}]}]}]}]}]}]}]});
assert.equal(nestedTabs, null, 'nested archive tabs are intentionally not allowed');
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
// The reported production card exposes the same world modules through custom
// read panels. Only remove generic navigation if the full module is reachable.
{
  const production = JSON.parse(fs.readFileSync('data/characters/community/8f/heart-contract-custom-lover.json', 'utf8'));
  const ui = Core.normalize(production.gameplay.gameplay_ui);
  const defs = production.gameplay.world_modules;
  const coverage = Core.modulePanelCoverage(ui, defs, {});
  assert.equal(coverage.lover, 'lover');
  assert.equal(coverage.contract, 'contract');
  assert.equal(coverage.relationship, 'relationship');
  assert.equal(coverage.scene, 'scene', 'nested current-state tabs count as a read view');
  assert.equal(coverage.client, undefined);
  assert.equal(coverage.lover_request, undefined);
  assert.equal(Core.modulePanelCoverage(ui, defs, { lover: { player_extra: '保留入口' } }).lover, undefined,
    'player-added fields must remain reachable through the generic module');
  const diffOnly = Core.normalize({ panels: [{ id: 'history', sections: [{ type: 'timeline', mode: 'round_diff', items: defs.find(d => d.id === 'lover').fields.map(f => ({ path: `modules.lover.${f.key}` })) }] }] });
  assert.equal(Core.modulePanelCoverage(diffOnly, defs).lover, undefined, 'history is not current state');
  const limited = Core.normalize({ panels: [{ id: 'limited', sections: [{ type: 'list', path: 'modules.people', limit: 1 }] }] });
  assert.equal(Core.modulePanelCoverage(limited, [{ id: 'people', kind: 'collection' }], { people: [{ name: 'a' }, { name: 'b' }] }).people, undefined, 'a truncated list must not hide access to the rest');
  const summaryOnly = Core.normalize({ panels: [{ id: 'summary', sections: [{ type: 'stats', items: [{ path: 'modules.lover' }] }] }] });
  assert.equal(Core.modulePanelCoverage(summaryOnly, defs).lover, undefined, 'a formatted name/summary is not the full object');
  const sameName = Core.normalize({ panels: [{ id: 'lover', sections: [{ type: 'stats', items: [{ path: 'location' }] }] }] });
  assert.equal(Core.modulePanelCoverage(sameName, defs).lover, undefined, 'matching labels/IDs alone do not prove duplicate data');
}

console.log('Gameplay UI Engine core PASS: opt-in schema, safe archive tabs, location archives, timelines, and state binding');

// Custom selects survive normalization, persistence, and initial world binding.
const customSchema = structuredClone(schema);
customSchema.builder.fields = [{ key: 'origin', type: 'select', options: ['散修', '自訂'], custom_option: '自訂', default: '散修', target_path: 'modules.player.origin' }];
assert.equal(Core.normalizeBuilderValues(customSchema, { origin: { option: '自訂', custom: '  星海旅人  ' } }).origin, '星海旅人');
assert.equal(Core.normalizeBuilderValues(customSchema, { origin: '星海旅人' }).origin, '星海旅人');
assert.equal(Core.normalizeBuilderValues(customSchema, { origin: { option: '自訂', custom: '' } }).origin, '');
assert.equal(Core.normalizeBuilderValues(customSchema, { origin: 'x'.repeat(300) }).origin.length, 240);
const customState = { modules: { player: {} } };
Core.applyBuilderValues(customSchema, { origin: { option: '自訂', custom: '星海旅人' } }, customState);
assert.equal(customState.modules.player.origin, '星海旅人');
customSchema.builder.fields[0].custom_option = '';
assert.equal(Core.normalizeBuilderValues(customSchema, { origin: '星海旅人' }).origin, '散修');
const cultivationCard = JSON.parse(fs.readFileSync('data/characters/community/28/zhutian-cultivation-fortune-strife.json', 'utf8'));
const cultivationSchema = Core.normalize(cultivationCard.gameplay.ui_schema);
const customFields = cultivationSchema.builder.fields.filter(field => field.custom_option);
assert.deepEqual(customFields.map(field => field.key), ['gender', 'origin', 'realm', 'fortune_grade', 'goldfinger_type', 'temperament', 'start_location']);
const cultivationValues = Object.fromEntries(customFields.map(field => [field.key, { option: field.custom_option, custom: '自訂內容：' + field.key }]));
const cultivationState = structuredClone(cultivationCard.gameplay.initial_state);
Core.applyBuilderValues(cultivationSchema, cultivationValues, cultivationState);
for (const field of customFields) assert.equal(Core.getPath(cultivationState, field.target_path), '自訂內容：' + field.key);
// Story Setup builder keeps scalar relationship choices and preserves ordered multi-picks.
const storySchema = Core.normalize({
  version: 1,
  builder: {
    kind: 'story',
    fields: [{ key:'relationship', label:'你們原有的關係', type:'select', presentation:'cards', target_path:'modules.session.relationship', options:['初識','朋友'], default:'初識' }],
    choice_groups: [{
      key:'family', label:'選擇兩位家人', target_path:'modules.session.family', min:2, max:2, ordered:true,
      options:[{id:'a',label:'A',cost:0},{id:'b',label:'B',cost:0},{id:'c',label:'C',cost:0}]
    }]
  }
});
assert.ok(storySchema);
assert.equal(storySchema.builder.kind, 'story');
assert.equal(storySchema.builder.title, '進入故事前');
assert.equal(storySchema.builder.fields[0].presentation, 'cards');
assert.equal(storySchema.builder.choice_groups[0].ordered, true);
const storyValues = Core.normalizeBuilderValues(storySchema, { relationship:'朋友', family:['b','a'] });
assert.equal(storyValues.relationship, '朋友');
assert.deepEqual(storyValues.family, ['b','a']);
const storyState = { modules:{ session:{} } };
assert.equal(Core.applyBuilderValues(storySchema, storyValues, storyState), true);
assert.equal(storyState.modules.session.relationship, '朋友');
assert.deepEqual(storyState.modules.session.family.map(item => item.id), ['b','a']);
assert.equal(Core.normalize({version:1,builder:{kind:'oops',fields:[{key:'x',type:'text',target_path:'modules.session.x'}]}}).builder.kind, 'gameplay');
