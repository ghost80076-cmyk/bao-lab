const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const clone = value => structuredClone(value);

global.window = global;
global.document = {
  getElementById() { return null; },
  querySelector() { return null; }
};

global.Storage = {
  clone,
  scrubSecrets(value) {
    const walk = (input, path = []) => {
      if (Array.isArray(input)) return input.map((item, index) => walk(item, path.concat(String(index))));
      if (!input || typeof input !== 'object') return input;
      const out = {};
      for (const [key, item] of Object.entries(input)) {
        const normalized = key.toLowerCase().replace(/[^a-z]/g, '');
        const parent = String(path.at(-1) || '').toLowerCase();
        if (normalized === 'apikey' || normalized === 'authorization' || (normalized === 'key' && parent.endsWith('api'))) continue;
        out[key] = walk(item, path.concat(key));
      }
      return out;
    };
    return walk(clone(value));
  },
  sanitizeImportedStory(value) { return clone(value); }
};

global.GameState = {
  current: {
    location: 'AFTER',
    time: 'midnight',
    pendingStateTurns: [{ player: 'old player', assistant: 'old assistant' }],
    memory: ['old derived memory'],
    config: { api: { key: 'SECRET' } }
  }
};

global.Chat = {
  messages: [
    { id: 'user-1', role: 'user', content: '走進房間' },
    {
      id: 'assistant-1', role: 'assistant', content: '舊版本', activeVariant: 0,
      variants: [{ id: 'variant-old', type: 'original', content: '舊版本' }],
      revisionBase: {
        state: { location: 'BEFORE', time: 'evening', pendingStateTurns: [], memory: ['prior memory'] },
        summary: 'prior summary', summarizedUntil: 0
      }
    }
  ],
  summary: 'summary after old reply',
  summarizedUntil: 1,
  add(role, content) {
    const message = { id: `msg-${this.messages.length + 1}`, role, content };
    this.messages.push(message);
    return message;
  },
  memoryStatus() { return 'ok'; },
  async afterTurn() { this.summary = 'summary from selected variant'; }
};

const saves = [];
global.App = {
  config: { api: { key: 'SECRET' }, memory: { maxRounds: 20 }, displayMode: 'ui' },
  activeCharacter: { id: 'hero' },
  buildSystemPrompt() { return `STATE:${GameState.current.location}`; },
  saveStory() {
    saves.push({ state: clone(GameState.current), summary: Chat.summary, messages: clone(Chat.messages) });
    return true;
  },
  async sendMessage() { return 'sent'; },
  renderUIPanel() {}
};

global.BAOCharacterStatus = { ensureState() {} };
global.BAOWorldModules = { ensureState() {} };

const apiCalls = [];
global.API = {
  async send(config, messages) {
    apiCalls.push({ config: clone(config), messages: clone(messages), location: GameState.current.location });
    return { text: 'NEW TEXT' };
  }
};

global.WorldStateEngine = {
  async update(config, playerText, assistantText) {
    GameState.current.location = `DERIVED:${assistantText}`;
    GameState.current.pendingStateTurns = [{ player: playerText, assistant: assistantText }];
    return { location: GameState.current.location };
  }
};

const libraryRecords = [];
global.BAOStoryLibrary = {
  __revisionStatePatched: false,
  clone,
  refs() { return { storyId: 'story-1', chapterId: 'chapter-1' }; },
  async open() { return true; },
  async flush() { return true; },
  async allRecords() { return clone(libraryRecords); },
  messageRecords(payload, refs) {
    return payload.chat.messages.map((message, seq) => ({ kind: 'message', storyId: refs.storyId, chapterId: refs.chapterId, seq, messageId: message.id, role: message.role, content: message.content }));
  },
  async reconstruct(storyId, chapterId) {
    return { chat: { messages: [{ id: 'assistant-1', role: 'assistant', content: 'plain' }] }, _library: { storyId, chapterId } };
  },
  async createBranch() { return null; },
  async persist() { return true; }
};

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'story-revision-state.js'), 'utf8');
vm.runInThisContext(source, { filename: 'js/story-revision-state.js' });

(async () => {
  assert.ok(BAOStoryRevisionState, 'revision state coordinator should load');
  assert.equal(BAOStoryLibrary.__revisionStatePatched, true, 'story library should be patched once');

  GameState.current.location = 'AFTER';
  await API.send({ __storyTool: true }, [
    { role: 'system', content: 'STATE:AFTER\n\n【本次任務】只改寫' },
    { role: 'user', content: 'rewrite' }
  ]);
  assert.equal(apiCalls.at(-1).location, 'BEFORE');
  assert.match(apiCalls.at(-1).messages[0].content, /^STATE:BEFORE/);
  assert.match(apiCalls.at(-1).messages[0].content, /【本次任務】只改寫/);
  assert.equal(GameState.current.location, 'AFTER', 'temporary rollback must be restored after the API call');

  const assistant = Chat.messages[1];
  assistant.variants.push({ id: 'variant-new', type: 'regenerate', content: '新版本' });
  assistant.activeVariant = 1;
  assistant.content = '新版本';
  App.saveStory(false);
  assert.equal(saves.at(-1).state.location, 'BEFORE', 'first revision save must not persist stale post-turn state');
  assert.deepEqual(saves.at(-1).state.pendingStateTurns, [], 'stale queued state turns must be rolled back too');
  await BAOStoryRevisionState.whenIdle();
  assert.equal(GameState.current.location, 'DERIVED:新版本');
  assert.deepEqual(GameState.current.pendingStateTurns, [{ player: '走進房間', assistant: '新版本' }]);
  assert.equal(Chat.summary, 'summary from selected variant');
  assert.equal(assistant.variants[1].derivedSnapshot.state.location, 'DERIVED:新版本');
  assert.equal(saves.at(-1).state.location, 'DERIVED:新版本', 'final save must persist freshly derived state');

  const updatesBefore = apiCalls.length;
  assistant.content = '舊版本';
  assistant.activeVariant = 0;
  assistant.variants[0].derivedSnapshot = {
    state: { location: 'DERIVED:舊版本', time: 'evening', pendingStateTurns: [] },
    summary: 'old variant summary', summarizedUntil: 0
  };
  App.saveStory(false);
  await BAOStoryRevisionState.whenIdle();
  assert.equal(GameState.current.location, 'DERIVED:舊版本');
  assert.equal(Chat.summary, 'old variant summary');
  assert.equal(apiCalls.length, updatesBefore, 'cached derived variant should not call the story model again');

  GameState.current = { location: 'PRE-NEXT', config: { api: { key: 'TOP-SECRET' } }, pendingStateTurns: [] };
  Chat.add('user', '下一步');
  const next = Chat.add('assistant', '下一個回覆');
  assert.equal(next.revisionBase.state.location, 'PRE-NEXT');
  assert.equal(next.revisionBase.state.config, undefined);
  assert.equal(JSON.stringify(next.revisionBase).includes('TOP-SECRET'), false);

  const payload = { chat: { messages: [next] } };
  const enriched = BAOStoryLibrary.messageRecords(payload, { storyId: 'story-1', chapterId: 'chapter-1' });
  assert.equal(enriched[0].messagePayload.id, next.id);
  assert.ok(enriched[0].messagePayload.revisionBase?.state);
  libraryRecords.splice(0, libraryRecords.length, ...enriched);
  const reconstructed = await BAOStoryLibrary.reconstruct('story-1', 'chapter-1');
  assert.equal(reconstructed.chat.messages[0].id, next.id);
  assert.equal(reconstructed.chat.messages[0].revisionBase.state.location, 'PRE-NEXT');

  console.log('story revision state core test passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
