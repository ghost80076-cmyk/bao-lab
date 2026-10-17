const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
const base = () => ({ state: { location: 'BEFORE' }, summary: 'prior summary', summarizedUntil: 0 });
function harness(legacy) {
  const c = {
    console,
    Storage: { clone: structuredClone, scrubSecrets: structuredClone },
    GameState: { current: { location: 'AFTER', config: { api: { key: 'private' } } } },
    Chat: {
      messages: [{ role: 'user', content: 'go' }, { id: 'reply-1', role: 'assistant', content: 'old story', revisionBase: base() }],
      summary: 'current summary', summarizedUntil: 1,
      add() {}, afterTurn() {}
    },
    document: { getElementById: () => null, querySelector: () => null }
  };
  c.window = c;
  c.App = {
    config: { api: { key: 'private' } }, activeCharacter: { id: 'hero' },
    buildSystemPrompt() { return `STATE:${c.GameState.current.location};MEMORY:${c.Chat.summary}`; },
    saveStory() {}, async sendMessage() {}, renderUIPanel() {}
  };
  vm.createContext(c);
  vm.runInContext(read('api.js') + '\nwindow.API = API;', c);
  if (legacy) c.API.wrapSend = undefined;
  const calls = [];
  let implementation = async () => ({ text: 'replacement' });
  c.API.send = async (config, messages) => {
    calls.push({ config, messages, location: c.GameState.current.location, summary: c.Chat.summary });
    return implementation(config, messages);
  };
  vm.runInContext(read('story-revision-state.js'), c);
  if (!legacy) {
    assert.deepEqual(Array.from(c.API.inspectSendPipeline().activeSegment), ['story-revision-state:snapshot']);
    assert.equal(c.API.inspectSendPipeline().legacyWrapperOnTop, false);
  }
  const send = c.API.send, add = c.Chat.add, save = c.App.saveStory;
  vm.runInContext(read('story-revision-state.js'), c);
  assert.equal(c.API.send, send);
  assert.equal(c.Chat.add, add);
  assert.equal(c.App.saveStory, save);
  return { c, calls, transport(fn) { implementation = fn; } };
}
function restored(c) {
  assert.equal(c.GameState.current.location, 'AFTER');
  assert.equal(c.GameState.current.config, c.App.config);
  assert.equal(c.Chat.summary, 'current summary');
  assert.equal(c.Chat.summarizedUntil, 1);
}
async function run(legacy) {
  const h = harness(legacy), { c } = h;
  const config = Object.freeze({ __storyTool: true, signal: new AbortController().signal });
  const messages = Object.freeze([
    Object.freeze({ role: 'system', content: 'STALE\n\n【本次任務】rewrite only' }),
    Object.freeze({ role: 'user', content: 'rewrite' })
  ]);
  const result = { text: 'new story', usage: { input_tokens: 10 } };
  h.transport(async () => result);
  assert.equal(await c.API.send(config, messages), result);
  assert.equal(h.calls[0].config, config);
  assert.equal(h.calls[0].location, 'BEFORE');
  assert.equal(h.calls[0].summary, 'prior summary');
  assert.match(h.calls[0].messages[0].content, /^STATE:BEFORE;MEMORY:prior summary/);
  assert.match(h.calls[0].messages[0].content, /【本次任務】rewrite only/);
  assert.equal(messages[0].content, 'STALE\n\n【本次任務】rewrite only');
  restored(c);

  for (const code of ['BAO_ABORTED', 'PROVIDER_FAILURE']) {
    const error = Object.assign(new Error(code), { code });
    h.transport(async () => { throw error; });
    const before = h.calls.length;
    await assert.rejects(c.API.send(config, messages), value => value === error);
    assert.equal(h.calls.length, before + 1, 'revision observer must not retry requests');
    restored(c);
  }
  const promptFailure = new Error('prompt assembly failed');
  const build = c.App.buildSystemPrompt;
  c.App.buildSystemPrompt = () => { throw promptFailure; };
  const before = h.calls.length;
  await assert.rejects(c.API.send(config, messages), value => value === promptFailure);
  assert.equal(h.calls.length, before, 'prompt failure must not send transport');
  restored(c);
  c.App.buildSystemPrompt = build;
  h.transport(async () => result);

  for (const flags of [{}, { __memoryTask: true }, { __stateTask: true }, { __auxiliaryTask: true }, { __connectionTest: true }]) {
    await c.API.send(flags, messages);
    assert.equal(h.calls.at(-1).location, 'AFTER');
    assert.equal(h.calls.at(-1).config, flags);
    assert.equal(h.calls.at(-1).messages, messages);
  }
  delete c.Chat.messages[1].revisionBase;
  await c.API.send(config, messages);
  assert.equal(h.calls.at(-1).messages, messages, 'missing revision base must pass through');
  assert.equal(h.calls.at(-1).location, 'AFTER');
  let lookups = 0;
  c.BAOStoryLibrary = { async revisionBaseFor(id) { lookups++; assert.equal(id, 'reply-1'); return base(); } };
  await c.API.send(config, messages);
  assert.equal(lookups, 1);
  assert.equal(h.calls.at(-1).location, 'BEFORE');
  assert.equal(c.Chat.messages[1].revisionBase.state.location, 'BEFORE');
  restored(c);
  await c.API.send(config, messages);
  assert.equal(lookups, 1, 'cached revision base must avoid another library lookup');
  restored(c);
  c.Chat.messages = [];
  await c.API.send(config, messages);
  assert.equal(h.calls.at(-1).messages, messages, 'no assistant message must pass through');
}
run(false).then(() => run(true)).then(() => console.log('Revision pipeline: prompt snapshot, restoration, cancellation, failure, task isolation, missing/base lookup and duplicate guard passed')).catch(error => {
  console.error(error); process.exitCode = 1;
});
