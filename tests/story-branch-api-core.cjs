'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'story-branches.js'), 'utf8');

function fixture({ targetURL = 'https://a.example/v1', targetProtocol = 'openai', answer = 'target-secret' } = {}) {
  const events = { prompts: [], alerts: [], restores: 0, apiOpens: 0, saves: 0 };
  const sourceApi = { baseUrl: 'https://a.example/v1/', protocol: 'openai', model: 'source-model', key: 'source-secret' };
  const target = {
    config: { api: { baseUrl: targetURL, protocol: targetProtocol, model: 'target-model' }, memory: {} },
    chat: { messages: [{ id: 'a1', role: 'assistant', content: 'branch point' }], summary: 'historical memory' },
    state: { money: 100 },
    _library: { storyId: 'story1', chapterId: 'branch1', parentChapterId: 'main' }
  };
  const app = {
    config: { api: sourceApi, memory: {} },
    escapeHTML: x => String(x), escapeAttr: x => String(x),
    saveStory: () => { events.saves++; return true; },
    renderChatShell: () => {}, showView: () => {}
  };
  const chat = { messages: [target.chat.messages[0]] };
  const state = { current: { money: 20, config: app.config } };
  const storage = {
    restoreStory: save => {
      events.restores++;
      app.config = structuredClone(save.config);
      app.config.api.key = '';
      chat.messages = structuredClone(save.chat.messages);
      state.current = { ...structuredClone(save.state), config: app.config };
      return true;
    }
  };
  const library = {
    flush: async () => true,
    reconstruct: async () => structuredClone(target),
    createBranch: async () => structuredClone(target)
  };
  const win = {
    BAOStoryLibrary: library,
    BAOStoryRevisionState: { whenIdle: async () => {} },
    BAOChatAPISettings: { open: () => { events.apiOpens++; } },
    BAORefreshSaveUI: () => {},
    prompt: (message, initial) => { events.prompts.push(message); return initial === '另一條故事線' ? 'new branch' : answer; },
    alert: message => events.alerts.push(message)
  };
  const document = { body: {}, head: {}, querySelector: selector => selector.startsWith('link[') ? {} : null, querySelectorAll: () => [] };
  const observer = class { observe() {} };
  const context = vm.createContext({ window: win, document, App: app, Chat: chat, Storage: storage, GameState: state,
    MutationObserver: observer, queueMicrotask: () => {}, setTimeout: () => {},
    alert: message => events.alerts.push(message), console });
  vm.runInContext(source, context, { filename: 'story-branches.js' });
  assert(win.BAOStoryBranches, 'branch module must initialize');
  return { ...events, app, chat, state, branch: win.BAOStoryBranches, events };
}

(async () => {
  {
    const f = fixture({ targetURL: 'https://a.example/v1' });
    assert.equal(await f.branch.restore('story1', 'branch1'), true);
    assert.equal(f.app.config.api.key, 'source-secret');
    assert.equal(f.events.prompts.length, 0);
    assert.equal(f.chat.messages[0].content, 'branch point');
    assert.equal(f.state.current.money, 100);
    assert.equal(f.events.apiOpens, 0);
    console.log('PASS matching endpoint reuses in-memory key while restoring branch state');
  }
  {
    const f = fixture({ targetURL: 'https://other.example/v1' });
    assert.equal(await f.branch.restore('story1', 'branch1'), true);
    assert.equal(f.app.config.api.key, 'target-secret');
    assert.equal(f.events.prompts.length, 1);
    console.log('PASS switching providers asks for destination key');
  }
  {
    const f = fixture({ targetURL: 'https://a.example/v1', targetProtocol: 'anthropic' });
    assert.equal(await f.branch.restore('story1', 'branch1'), true);
    assert.equal(f.app.config.api.key, 'target-secret');
    assert.equal(f.events.prompts.length, 1);
    console.log('PASS protocol changes cannot reuse the old API key');
  }
  {
    const f = fixture({ targetURL: 'https://other.example/v1', answer: null });
    assert.equal(await f.branch.restore('story1', 'branch1'), false);
    assert.equal(f.events.restores, 0);
    assert.equal(f.app.config.api.key, 'source-secret');
    assert.equal(f.state.current.money, 20);
    console.log('PASS cancelling destination key prompt keeps current story untouched');
  }
  {
    const f = fixture({ targetURL: 'https://other.example/v1', answer: '' });
    assert.equal(await f.branch.restore('story1', 'branch1'), true);
    assert.equal(f.app.config.api.key, '');
    assert.equal(f.events.apiOpens, 1);
    console.log('PASS blank destination key opens story API settings without leaking prior key');
  }
  {
    const f = fixture({ targetURL: 'https://other.example/v1' });
    await f.branch.createFrom(0);
    assert.equal(f.app.config.api.key, '');
    assert.equal(f.events.apiOpens, 1);
    assert.equal(f.state.current.money, 100);
    console.log('PASS new branch with a different endpoint preserves state but not unrelated key');
  }
  console.log('PASS 6 branch API continuity regression cases');
})().catch(error => { console.error(error); process.exitCode = 1; });