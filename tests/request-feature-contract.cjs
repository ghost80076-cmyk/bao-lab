'use strict';
// Exercise production builders AND protocol serializers; fetch is the only model mock.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../js/worldbook-library-core.js');
const requests = [];
const c = { console, structuredClone, Date, URL, Response, AbortController, TextDecoder, TextEncoder,
  setTimeout() {}, clearTimeout() {}, addEventListener() {},
  localStorage: { getItem: () => null, setItem() {} },
  document: { readyState: 'loading', head: { appendChild() {} }, body: { appendChild() {} },
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
    createElement: () => ({ classList: { toggle() {} }, dataset: {}, setAttribute() {} }), addEventListener() {} },
  Storage: { clone: structuredClone, scrubSecrets: structuredClone },
  MutationObserver: class { observe() {} },
  YoruWorldbookLibraryCore: core,
  fetch: async (url, init) => {
    assert.ok(init?.body, 'test packs must use installed snapshots without catalog downloads');
    requests.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }],
      content: [{ type: 'text', text: 'ok' }], candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
      { headers: { 'content-type': 'application/json' } });
  }
};
c.window = c;
c.Chat = { messages: [{ id: 'u', role: 'user', content: 'AUDIT_QUERY' }],
  usage: {}, summary: '', summarizedUntil: 0,
  async context() { return this.messages.map(m => ({ role: m.role, content: m.content })); },
  add() {}, reset() {}, renderUsage() {}, addUsage() {}, async maybeSummarize() {}, afterTurn() {} };
c.GameState = { current: { location: 'BEFORE', npcs: [], events: [] } };
c.App = { config: { api: {}, narrative: {}, memory: {} }, activeCharacter: { id: 'audit', name: 'Audit actor' },
  buildSystemPrompt() { return `CHARACTER\n\n【目前核心狀態】\nLOCATION:${c.GameState.current.location}`; },
  escapeHTML: String, collectConfig() { return this.config; }, renderChatShell() {}, openBuilder() {}, saveStory() {},
  getSelectedPreset() { return null; }, async sendMessage() {}, renderUIPanel() {}, renderStoryMessage: String,
  wrapBuildSystemPrompt(id, wrapper) { const next = this.buildSystemPrompt.bind(this); this.buildSystemPrompt = (...args) => wrapper.call(this, next, ...args); },
  wrapBuildMessages(id, wrapper) { const next = this.buildMessages.bind(this); this.buildMessages = (...args) => wrapper.call(this, next, ...args); }
};
vm.createContext(c);
const load = file => vm.runInContext(fs.readFileSync(`js/${file}.js`, 'utf8') + (file === 'api' ? ';window.API=API;' : ''), c, { filename: file });
for (const f of ['api', 'narrative-settings', 'prompt-cache', 'prompt-orchestrator', 'episodic-memory-core', 'episodic-memory', 'worldbook-library', 'actor-mode-core', 'actor-mode', 'phone-ui-core', 'phone-player-core', 'phone-story-core', 'phone-story-bridge', 'story-revision-state']) load(f);
const api = protocol => ({ protocol, type: protocol, model: 'audit-model', key: 'test-key',
  baseUrl: 'https://provider.invalid/v1', retryEnabled: false, maxOutputTokens: 2048 });
const text = messages => messages.map(m => m.content).join('\n\n');
const serializeText = body => body.messages ? [typeof body.system === 'string' ? body.system : '', ...body.messages.map(m => m.content)].join('\n\n')
  : [...(body.systemInstruction?.parts || []), ...body.contents.flatMap(m => m.parts)].map(p => p.text).join('\n\n');
const pack = core.normalizePack({ schema: core.SCHEMA, version: 1,
  meta: { id: 'audit-pack', name: 'Audit', world: 'general' }, entries: [
    { id: 'fixed', mode: 'constant', content: 'AUDIT_FIXED' },
    { id: 'selected', mode: 'keyword', keywords: ['AUDIT_QUERY'], content: 'AUDIT_SELECTED' },
    { id: 'rejected', mode: 'keyword', keywords: ['REJECTED_REPLY'], content: 'SHOULD_NOT_RECALL_REJECTED_REPLY' }
  ] });
const variants = {
  density: ['concise', 'standard', 'rich'], paragraphs: ['2-3', '3-5', '4-7'],
  innerThoughts: ['none', 'restrained', 'clear'], physicalContinuity: [true],
  intimacyDetailMod: [true], intimacy: ['fade', 'emotion', 'continuous'], matureDrama: ['mature'],
  characterAgency: ['reserved', 'natural', 'active', 'autonomous'], responseLength: ['short', 'medium', 'long'],
  pacing: ['slow', 'balanced', 'brisk'], sceneFocus: ['protect'], storyExpectation: ['AUDIT_EXPECTATION'],
  dialogueBalance: ['dialogue', 'balanced', 'description'], customInstructions: [[{ text: 'AUDIT_CUSTOM', enabled: true }]],
  stylePacks: ['female_kfilm', 'male_visual', 'male_blunt', 'cinematic', 'action_realism', 'natural', 'tender', 'suspense', 'literary', 'realist_subtext'].map(x => [x]),
  storyExtras: ['daily', 'surroundings', 'tension', 'threads'].map(x => [x])
};
(async () => {
  let cases = 0;
  const baseline = text(await c.App.buildMessages(c.App.config));
  for (const [key, values] of Object.entries(variants)) for (const value of values) {
    c.App.config.narrative = { [key]: value };
    const expected = c.BAONarrativeSettings.buildPrompt(c.App.config.narrative);
    assert.ok(expected, `${key}=${JSON.stringify(value)} must emit a preference`);
    const first = await c.App.buildMessages(c.App.config);
    assert.equal(JSON.stringify(await c.App.buildMessages(c.App.config)), JSON.stringify(first), `${key}: unchanged bytes`);
    assert.ok(text(first).includes(expected), `${key}: preference reached assembled messages`);
    for (const protocol of ['openai', 'anthropic', 'gemini']) {
      await c.API.send(api(protocol), first);
      assert.ok(serializeText(requests.at(-1).body).includes(expected), `${key}: lost in ${protocol} body`);
    }
    c.App.config.narrative = {};
    assert.equal(text(await c.App.buildMessages(c.App.config)), baseline, `${key}: disabling must restore original bytes`);
    cases++;
  }
  // Cross-feature combined order and cache partitions.
  c.GameState.current.worldbookLibrary = { version: 1, enabled: ['audit-pack'], installed: [pack], pinned: {}, recallMode: 'auto' };
  c.GameState.current.actorMode = { enabled: true, roleActive: true, role: { label: 'AUDIT_IDENTITY' } };
  c.App.config.narrative = { playerPortrayal: 'coauthor', observationMode: 'one_turn', stylePacks: ['natural'], responseLength: 'long' };
  c.GameState.current.phoneSurface = { version: 1, enabled: true, userName: 'AUDIT_PHONE_OWNER' };
  const combined = await c.App.buildMessages(c.App.config);
  assert.match(combined[0].content, /玩家已授權小說共創/);
  assert.match(combined[0].content, /AUDIT_FIXED/);
  assert.match(combined[0].content, /AUDIT_IDENTITY/);
  assert.doesNotMatch(combined[0].content, /LOCATION:|AUDIT_SELECTED|AUDIT_QUERY/);
  assert.match(combined.at(-1).content, /LOCATION:BEFORE/);
  assert.match(combined.at(-1).content, /AUDIT_PHONE_OWNER/);
  assert.doesNotMatch(combined[0].content, /AUDIT_PHONE_OWNER/);
  assert.match(combined[0].content, /YORUBAY_PHONE_V1/);
  assert.match(combined.at(-1).content, /AUDIT_SELECTED/);
  assert.ok(combined.at(-1).content.indexOf('【玩家最新輸入】') < combined.at(-1).content.indexOf('【本輪】'));
  c.Chat.messages[0].content = '繼續';
  const observe = await c.App.buildMessages(c.App.config);
  assert.equal(observe[0].content, combined[0].content);
  assert.match(observe.at(-1).content, /【本輪觀賞授權】/);
  c.Chat.messages[0].content = 'AUDIT_QUERY';
  c.GameState.current.location = 'AFTER';
  const beforeState = structuredClone(c.GameState.current);
  c.Chat.messages.push({ id: 'a', role: 'assistant', content: 'REJECTED_REPLY', revisionBase: {
    state: { location: 'BEFORE', npcs: [], events: [] }, summary: '', summarizedUntil: 0 } });
  // The target reply is excluded; current player controls survive snapshot rewind.
  const toolMessages = [{ role: 'system', content: 'STALE' }, { role: 'user', content: 'AUDIT_QUERY' }];
  for (const protocol of ['openai', 'anthropic', 'gemini']) {
    await c.API.send({ ...api(protocol), __storyTool: true }, toolMessages);
    const payload = serializeText(requests.at(-1).body);
    for (const expected of ['玩家已授權小說共創', 'AUDIT_FIXED', 'AUDIT_SELECTED', 'AUDIT_IDENTITY', 'LOCATION:BEFORE', '【本輪】', 'AUDIT_PHONE_OWNER', 'YORUBAY_PHONE_V1']) assert.ok(payload.includes(expected), `${protocol} regenerate lost ${expected}`);
    assert.doesNotMatch(payload, /REJECTED_REPLY|LOCATION:AFTER/);
    assert.deepEqual(structuredClone(c.GameState.current).location, beforeState.location);
    assert.equal(c.GameState.current.actorMode.role.label, 'AUDIT_IDENTITY');
  }
  await c.API.send({ ...api('openai'), __storyTool: true }, [
    { role: 'system', content: 'STALE\n\n【本次任務】只改寫，不推進新事件。' },
    { role: 'user', content: 'AUDIT_QUERY' }, { role: 'user', content: 'REWRITE_INSTRUCTION' }
  ]);
  const rewrite = serializeText(requests.at(-1).body);
  assert.match(rewrite, /AUDIT_IDENTITY/); assert.match(rewrite, /只改寫，不推進新事件/);
  assert.match(rewrite, /REWRITE_INSTRUCTION/);
  // A separate action-suggestion helper must keep its own task prompt.
  await c.API.send({ ...api('openai'), __storyTool: true, __inspirationTask: true }, [
    { role: 'system', content: 'INSPIRATION_ONLY' }, { role: 'user', content: 'four suggestions' }
  ]);
  const inspiration = serializeText(requests.at(-1).body);
  assert.match(inspiration, /INSPIRATION_ONLY/); assert.doesNotMatch(inspiration, /AUDIT_IDENTITY|玩家已授權小說共創/);
  // Legacy reply without a revision base still uses the same selected feature layers.
  delete c.Chat.messages[1].revisionBase;
  await c.API.send({ ...api('openai'), __storyTool: true }, toolMessages);
  assert.match(serializeText(requests.at(-1).body), /AUDIT_IDENTITY/);
  c.GameState.current.phoneSurface.enabled = false;
  c.GameState.current.actorMode.enabled = false;
  c.GameState.current.worldbookLibrary.enabled = [];
  const off = text(await c.App.buildMessages(c.App.config));
  assert.doesNotMatch(off, /AUDIT_IDENTITY|AUDIT_FIXED|AUDIT_SELECTED|AUDIT_PHONE_OWNER|YORUBAY_PHONE_V1/);
  assert.equal(requests.length, cases * 3 + 6, 'one transport call per requested operation; assembly is free');
  console.log(`PASS ${cases} preference variants × 3 protocol bodies, disable/repeat bytes, combined partitions, regeneration, rewrite, legacy controls and inspiration isolation`);
})().catch(error => { console.error(error); process.exitCode = 1; });
