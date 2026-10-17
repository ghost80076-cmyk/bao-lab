const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ctx = { console, structuredClone, addEventListener() {}, document: { getElementById() { return null; } }, setTimeout() {} };
ctx.window = ctx;
vm.createContext(ctx);
const load = file => vm.runInContext(fs.readFileSync(`js/${file}.js`, 'utf8'), ctx);
load('helper-data'); load('episodic-memory-core'); load('chat');
vm.runInContext('window.Chat = Chat;', ctx);
const core = ctx.BAOEpisodicMemory;
assert.deepEqual(Array.from(core.audience({
  state: { npcs: [{ name: '守衛', presence: 'present' }, { name: '旁觀者', presence: 'away' }] },
  config: { narrativeMode: 'immersive' }, primary: '艾琳'
})), ['艾琳', '守衛'], 'single-role plus present NPCs must share one cast resolver');
assert.deepEqual(Array.from(core.audience({
  state: { npcs: [{ name: '守衛', presence: 'present' }] },
  config: { narrativeMode: 'world' }, primary: '作品名稱'
})), ['守衛'], 'world title cannot become a speaker');
assert.equal(core.canRead({ knowledge_scope: 'actors', known_by: ['艾琳'] }, ['艾琳']), true);
assert.equal(core.canRead({ knowledge_scope: 'actors', known_by: ['艾琳'] }, ['艾琳', '守衛']), false);
assert.equal(core.canRead({ knowledge_scope: 'actors', known_by: ['艾琳'] }, []), false);
assert.equal(core.canRead({ knowledge_scope: 'actors' }, ['艾琳']), false, 'unlisted cast denies private data');
assert.equal(core.canRead({ knowledge_scope: 'shared' }, []), true, 'legacy shared records remain readable');

const source = [
  { id: 'm1', role: 'user', content: '雨夜我對艾琳隱瞞身分。' },
  { id: 'm2', role: 'assistant', content: '艾琳與你爭吵，守衛只聽說你偷走戒指。' },
  { id: 'm3', role: 'assistant', content: '廣場向全城公告：城門將關閉。' }
];
const event = { text: '雨夜隱瞞身分導致爭吵。', entities: ['艾琳'], keywords: ['雨天', '信任'], evidenceIds: ['m1', 'm2'], visibility: 'restricted', certainty: 'confirmed', knowledge: [
  { actor: '艾琳', mode: 'witnessed', claim: '雨夜因隱瞞身分與玩家爭吵。', evidenceIds: ['m2'] },
  { actor: '守衛', mode: 'rumor', claim: '聽說玩家偷走戒指，未證實。', evidenceIds: ['m2'] }
] };
const state = {};
core.ingest(state, { episodes: [event, { ...event, evidenceIds: ['invented'] }] }, source);
assert.equal(state.episodicMemory.events.length, 1, 'reject fabricated message IDs');
core.ingest(state, { episodes: [event] }, source);
assert.equal(state.episodicMemory.events.length, 1, 'idempotent extraction');
const query = (actors, input = '雨夜', messages = source, extra = {}) => core.recall({ state, messages, input, actors, ...extra });
assert.equal(query(['陌生人']).length, 0);
assert.equal(query([]).length, 0);
assert.equal(query(['艾琳', '陌生人']).length, 0, 'mixed cast cannot receive private recall');
assert.equal(query(['艾琳', '守衛']).length, 0, 'different beliefs cannot expose each other in shared request');
assert.match(query(['守衛'], '戒指')[0].block, /rumor.*聽說玩家偷走戒指/);
assert.doesNotMatch(query(['守衛'], '戒指')[0].block, /隱瞞身分/);
assert.equal(query(['艾琳'], '妳是不是還在怪我？').length, 1, 'relational cue without original keywords');
assert.equal(query(['艾琳'], '不相干的星際航行').length, 0);
assert.equal(query(['艾琳'], '雨天').length, 1, 'explicit synonym keyword');
const longStory = [...source, ...Array.from({ length: 400 }, (_, i) => ({ id: `filler-${i}`, role: i % 2 ? 'assistant' : 'user', content: `日常第${i}則` }))];
assert.equal(query(['艾琳'], '還記得雨天嗎', longStory).length, 1, 'event remains retrievable after 200 turns');
assert.equal(query(['艾琳'], '雨夜', source.slice(0, 1)).length, 0, 'branch before event cannot recall it');
assert.equal(query(['艾琳'], '雨夜', source.map(m => m.id === 'm2' ? { ...m, content: '改寫後沒有爭吵。' } : m)).length, 0);
assert.equal(query(['艾琳'], '雨夜', source, { maxChars: 5 }).length, 0);
assert.equal(query(['艾琳'], '雨夜', source, { exclude: event.knowledge[0].claim }).length, 0, 'avoid duplicating summary or Canon');

const knowledgeUpdateMessage = { id: 'm4-knowledge', role: 'assistant', content: '艾琳親口告訴守衛：玩家沒有偷走戒指。' };
const changedBelief = {
  eventId: state.episodicMemory.events[0].id, actor: '守衛',
  mode: 'told', claim: '艾琳告訴我，玩家沒有偷戒指。', evidenceIds: ['m4-knowledge']
};
core.ingest(state, { knowledgeUpdates: [
  changedBelief,
  { ...changedBelief, actor: '陌生人', evidenceIds: ['fake-id'] },
  { ...changedBelief, eventId: 'not-an-event' }
] }, [knowledgeUpdateMessage]);
const withUpdate = [...source, knowledgeUpdateMessage];
assert.match(query(['守衛'], '戒指', withUpdate)[0].block, /told.*艾琳告訴我，玩家沒有偷戒指/);
assert.doesNotMatch(query(['守衛'], '戒指', withUpdate)[0].block, /聽說玩家偷走戒指/);
assert.match(query(['守衛'], '戒指', source)[0].block, /rumor/, 'rewound branch uses old belief');
assert.match(query(['守衛'], '戒指', withUpdate.map(m => m.id === 'm4-knowledge'
  ? { ...m, content: '已改寫得知來源' } : m))[0].block, /rumor/, 'rewritten knowledge source invalidates update');
assert.equal(query(['陌生人'], '戒指', withUpdate).length, 0);
assert.equal(core.knowledgeMatrix({ state, messages: withUpdate })[0].knowledge.find(k => k.actor === '守衛').mode, 'told');
assert.equal(core.knowledgeMatrix({ state, messages: source })[0].knowledge.find(k => k.actor === '守衛').mode, 'rumor');
const before = state.episodicMemory.events[0].knowledge.length;
core.ingest(state, { knowledgeUpdates: [changedBelief] }, [knowledgeUpdateMessage]);
assert.equal(state.episodicMemory.events[0].knowledge.length, before, 'replay must not duplicate knowledge records');
core.ingest(state, { knowledgeUpdates: [{ ...changedBelief, actor: '艾琳', evidenceIds: ['m2'] }] }, source);
assert.equal(state.episodicMemory.events[0].knowledge.some(k => k.actor === '艾琳' && k.claim === changedBelief.claim), false,
  'same or older event evidence must not be mistaken for a later update');

core.ingest(state, { episodes: [{ text: '城門將關閉。', evidenceIds: ['m3'], visibility: 'public', certainty: 'confirmed' }] }, source);
assert.match(query([], '城門')[0].block, /公開事實/);
assert.deepEqual(JSON.parse(JSON.stringify(structuredClone(state))), JSON.parse(JSON.stringify(state)), 'index is portable state');
const correctionSource = [{ id: 'm4', role: 'assistant', content: '公告更正：城門不會關閉。' }];
const old = state.episodicMemory.events[1].id;
core.ingest(state, { episodes: [{ text: '城門不會關閉。', evidenceIds: ['m4'], visibility: 'public', certainty: 'confirmed', supersedes: [old] }] }, correctionSource);
const corrected = query([], '城門', [...source, ...correctionSource]);
assert.equal(corrected.length, 1);
assert.match(corrected[0].block, /城門不會關閉/);
assert.equal(query([], '城門', source).length, 1, 'invalid future correction cannot erase historical fact');
state.episodicMemory.events.push(null, { evidence: [null] });
assert.doesNotThrow(() => query([], '城門'));

const config = { narrativeMode: 'immersive', api: { key: 'test', model: 'main' }, memory: { mode: 'smart', maxRounds: 4, summaryInterval: 4 } };
ctx.GameState = { current: {} };
ctx.App = { config, activeCharacter: { name: '艾琳' }, wrapBuildMessages(id, wrapper) { this.buildMessages = (...args) => wrapper.call(this, this.baseBuild, ...args); } };
ctx.Chat.renderGuard = () => {};
ctx.Chat.messages = Array.from({ length: 16 }, (_, i) => ({ id: `s${i}`, role: i % 2 ? 'assistant' : 'user', content: `原文${i}` }));
let calls = 0;
ctx.API = { async send(api, messages) {
  calls++;
  assert.ok(api.__responseSchema.properties.episodes, "Gemini schema must permit event extraction");
  assert.ok(api.__responseSchema.properties.knowledgeUpdates, "reuse memory call for later knowledge changes");
  assert.match(JSON.stringify(messages), /\[s0\]/);
  return { text: JSON.stringify({ events: ['雨夜爭吵'], episodes: [{ ...event, evidenceIds: ['s0'], knowledge: [{ ...event.knowledge[0], evidenceIds: ['s1'] }] }] }) };
} };
(async () => {
  await ctx.Chat.afterTurn(config);
  assert.equal(calls, 1, 'reuse existing memory call');
  assert.equal(ctx.GameState.current.episodicMemory.events.length, 1);
  const persisted = JSON.parse(JSON.stringify(ctx.GameState.current));
  ctx.GameState.current = persisted;
  ctx.Chat.add('user', '妳是不是還在怪我？');
  ctx.App.baseBuild = async () => [{ role: 'system', content: '固定前綴' }, { role: 'user', content: '最新輸入' }];
  load('episodic-memory');
  let output = await ctx.App.buildMessages(config);
  assert.equal(output[0].content, '固定前綴');
  assert.match(output[1].content, /本輪事件回憶/);
  assert.equal(calls, 1, 'retrieval must never call a model');
  output = await ctx.App.buildMessages({ ...config, memory: { ...config.memory, episodicRecall: false } });
  assert.doesNotMatch(output[1].content, /本輪事件回憶/);
  output = await ctx.App.buildMessages({ ...config, memory: { mode: 'full' } });
  assert.doesNotMatch(output[1].content, /本輪事件回憶/);
  ctx.App.config.narrativeMode = 'world';
  output = await ctx.App.buildMessages(config);
  assert.doesNotMatch(output[1].content, /本輪事件回憶/, 'world title is not a speaker');
  ctx.GameState.current.npcs = [{ name: '艾琳', presence: 'present' }];
  output = await ctx.App.buildMessages(config);
  assert.match(output[1].content, /本輪事件回憶/);
  // Rewriting source after extraction must invalidate persisted events too.
  ctx.Chat.messages[0].content = '已改寫';
  output = await ctx.App.buildMessages(config);
  assert.doesNotMatch(output[1].content, /本輪事件回憶/);
  // Late responses cannot write an event into a newly opened story.
  ctx.Chat.reset(); ctx.GameState.current = {};
  ctx.Chat.messages = Array.from({ length: 16 }, (_, i) => ({ id: `late${i}`, role: i % 2 ? 'assistant' : 'user', content: `原文${i}` }));
  let resolve;
  ctx.API.send = () => new Promise(r => { resolve = r; });
  const pending = ctx.Chat.afterTurn(config);
  ctx.GameState.current = {};
  resolve({ text: JSON.stringify({ events: ['晚到事件'], episodes: [{ ...event, evidenceIds: ['late0'] }] }) });
  await pending;
  assert.equal(ctx.GameState.current.episodicMemory, undefined);
  console.log('episodic memory: evidence, branches, beliefs, corrections, budget, persistence, cache placement and call count passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
