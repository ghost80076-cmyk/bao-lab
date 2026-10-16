const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({ window: {}, structuredClone });
for (const file of ['js/story-history-core.js', 'js/state.js', 'js/world-state.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
const run = code => vm.runInContext(code, context);
const core = context.window.BAOStoryHistoryCore;
const state = { events: ['舊事件'], time: '深夜', location: '碼頭', private_facts: 'SECRET', worldModules: { secret: 'SECRET' } };
assert.equal(JSON.stringify(state).includes('storyHistory'), false);
assert.equal(core.read(state).entries[0].time, '');
assert.equal(state.storyHistory, undefined, 'reading old saves must not migrate or write');
core.record(state, '赴約');
assert.equal(core.read(state).entries[0].location, '碼頭');
assert.equal(JSON.stringify(state.storyHistory).includes('SECRET'), false);
core.record(state, '赴約');
assert.equal(core.read(state).entries.length, 2, 'adjacent duplicates coalesce');
const saved = JSON.parse(JSON.stringify(state));
core.toggle(saved, saved.storyHistory.entries[0].id);
assert.equal(core.read(state).entries[0].starred, false, 'branch copies must remain independent');
assert.equal(core.read(saved).entries[0].starred, true);
core.record(saved, '支線事件');
assert.equal(core.read(state).entries.some(item => item.text === '支線事件'), false);
const snapshot = structuredClone(saved);
core.record(saved, '被撤回的事件');
assert.equal(core.read(snapshot).entries.some(item => item.text === '被撤回的事件'), false);
const dirty = core.read({ storyHistory: { version: 1, entries: [
  { id: 1, text: '公開', private: 'SECRET', starred: true },
  { id: 1, text: '重複ID' }, { id: -1, text: '無效' }, { id: 2, text: { secret: 'SECRET' } }
] } });
assert.equal(dirty.entries.length, 1);
assert.equal(JSON.stringify(dirty).includes('SECRET'), false);
const full = { events: [] };
for (let i = 0; i < core.LIMIT; i++) core.record(full, '事件' + i);
core.toggle(full, full.storyHistory.entries.at(-1).id);
core.record(full, '最新');
assert.equal(full.storyHistory.entries.length, core.LIMIT);
assert.ok(full.storyHistory.entries.some(item => item.text === '事件0'), 'collected oldest entry survives pruning');
full.storyHistory.entries.forEach(item => { item.starred = true; });
core.record(full, '滿額不覆蓋收藏');
assert.equal(full.storyHistory.entries.some(item => item.text === '滿額不覆蓋收藏'), false);
run(`GameState.current = {events:[],time:'清晨',location:'港口'}; GameState.applyUpdate({events:['抵達港口']});`);
assert.equal(run('GameState.current.storyHistory.entries[0].text'), '抵達港口');
const prompt = run('JSON.stringify(WorldStateEngine.stateSnapshot())');
assert.equal(prompt.includes('storyHistory'), false, 'collection must not enter state prompt');
assert.equal(prompt.includes('starred'), false);
console.log('Story history: migration, public field allowlist, branch snapshots, bounds, state integration and prompt isolation passed');

// Public collection projection is opt-in and only copies flat display fields.
const publicModules = {
 events: [], time: '今天', location: '港口',
 moduleDefinitions: [
  { id: 'recent_events', kind: 'collection', visibility: 'public', story_history: true },
  { id: 'private_facts', kind: 'collection', visibility: 'internal', story_history: true },
  { id: 'unmarked', kind: 'collection', visibility: 'public' },
  { id: 'disabled', kind: 'collection', visibility: 'public', story_history: true, enabled: false }
 ],
 modules: {
  recent_events: [{title:'赴約',summary:'在港口見面',status:'已發生',secret:'SECRET'}, '{"summary":"SECRET"}'],
  private_facts: ['SECRET'], unmarked: ['SECRET'], disabled: ['SECRET']
 }
};
core.captureModules(publicModules);
assert.equal(core.read(publicModules).entries.length, 1);
assert.equal(core.read(publicModules).entries[0].text, '赴約｜在港口見面｜已發生');
assert.equal(core.read(publicModules).entries[0].time, '', 'do not attach the current date to a past module row');
assert.equal(publicModules.time, '今天');
assert.equal(JSON.stringify(publicModules.storyHistory).includes('SECRET'), false);
core.toggle(publicModules, core.read(publicModules).entries[0].id);
core.captureModules(publicModules);
assert.equal(core.read(publicModules).entries.length, 1, 'repeated updates do not duplicate rows');
const previousModules = structuredClone(publicModules.modules);
publicModules.storyHistory.entries = [];
core.captureModules(publicModules, {previous:previousModules});
assert.equal(core.read(publicModules).entries.length, 0, 'pruned unchanged rows stay pruned');
publicModules.modules.recent_events.unshift('新事件');
core.captureModules(publicModules, {previous:previousModules});
assert.equal(core.read(publicModules).entries[0].text, '新事件');
console.log('Explicit public module projection: visibility, field allowlist, deduplication and pruning passed');

// Exercise real native cards through normalization and the production module hooks.
const moduleCtx = { console, structuredClone, setTimeout() {}, document: { getElementById() { return null; } }, addEventListener() {}, App: {} };
moduleCtx.window = moduleCtx;
vm.createContext(moduleCtx);
for (const file of ['story-history-core', 'character', 'state', 'helper-data', 'world-state', 'world-modules'])
  vm.runInContext(fs.readFileSync(`js/${file}.js`, 'utf8'), moduleCtx);
for (const [file, id, expected] of [
  ['c4/kept-in-frame-lin-youzhen.json', 'recent_events', '雨夜的匿名委託'],
  ['c4/lin-qiaorou-always-nearby.json', 'event_log', '林巧柔帶早餐']
]) {
  moduleCtx.raw = JSON.parse(fs.readFileSync(`data/characters/community/${file}`, 'utf8'));
  const result = vm.runInContext(`(() => {
    App.activeCharacter = CharacterEngine.normalize(raw);
    GameState.create(App.activeCharacter, {});
    const firstHistory = window.BAOStoryHistoryCore.read(GameState.current);
    GameState.applyUpdate({modules: {['${id}']: ['公開新事件']}});
    return {first: firstHistory, after: window.BAOStoryHistoryCore.read(GameState.current)};
  })()`, moduleCtx);
  assert.ok(result.first.entries.some(row => row.text.includes(expected)), file + ' existing public module rows are captured');
  assert.ok(result.after.entries.some(row => row.text === '公開新事件'));
  assert.ok(result.after.entries.some(row => row.text.includes(expected)), 'replaced rolling module does not erase history');
}
console.log('Native public module sources: Lin Youzhen and Lin Qiaorou create/update integration passed');
