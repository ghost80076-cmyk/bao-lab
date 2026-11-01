'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'js/provider-policy-guard.js'), 'utf8');

const route = { model: 'gemini-3.1-pro-preview', route: 'bao-credits',
  baseUrl: 'https://api.yorubay.com/chat', __automaticPolicyTask: false };
const policyError = () => Object.assign(new Error('Google 拒絕此內容'), { code: 'BAO_PROVIDER_BLOCKED' });

test('two actual provider policy rejections pause auto state and summary for this story/model only', async () => {
  const another = setupWithTransport(async () => {
    throw policyError();
  });
  await assert.rejects(another.api.send(route, []), error => error.code === 'BAO_PROVIDER_BLOCKED');
  assert.equal(another.guard.isPaused(another.story, route), false);
  await assert.rejects(another.api.send(route, []), error =>
    error.code === 'BAO_PROVIDER_BLOCKED' && /自動記憶與世界狀態整理已暫停/.test(error.message));
  assert.equal(another.guard.isPaused(another.story, route), true);
  await assert.rejects(another.api.send({ ...route, __automaticPolicyTask: true, __memoryTask: true }, []),
    error => error.code === 'BAO_POLICY_CIRCUIT_OPEN');
  await assert.rejects(another.api.send({ ...route, __stateTask: true }, []),
    error => error.code === 'BAO_POLICY_CIRCUIT_OPEN');
  assert.equal(another.calls.length, 2, 'suppressed automatic requests must not reach the provider');
  const otherStory = {};
  another.window.GameState.current = otherStory;
  assert.equal(another.guard.isPaused(otherStory, route), false);
  assert.equal(another.guard.isPaused(another.story, { ...route, model: 'other-model' }), false);
});

function setupWithTransport(transport) {
  const calls = [];
  const story = {};
  const window = { GameState: { current: story },
    BAOChatSystemNotices: { sync() {} } };
  const api = {
    async send(config, messages) {
      calls.push({ config, messages });
      return transport(config, messages);
    },
    noteRequest() {},
    wrapSend(_name, wrapper) {
      const next = this.send.bind(this);
      this.send = (config, messages) => wrapper(next, config, messages);
    }
  };
  vm.runInNewContext(source, { window, API: api, Date, URL, console });
  return { api, window, calls, story, guard: window.BAOProviderPolicyGuard };
}

test('manual work is allowed; successful chosen request clears the automatic pause', async () => {
  let block = true;
  const s = setupWithTransport(async () => {
    if (block) throw policyError();
    return { text: '完整 JSON', finishReason: 'STOP' };
  });
  await assert.rejects(s.api.send(route, []));
  await assert.rejects(s.api.send(route, []));
  assert.equal(s.guard.isPaused(s.story, route), true);
  block = false;
  const manual = await s.api.send({ ...route, __memoryTask: true, __memoryTaskKind: 'notes' }, []);
  assert.equal(manual.text, '完整 JSON');
  assert.equal(s.guard.isPaused(s.story, route), false);
  const auto = await s.api.send({ ...route, __memoryTask: true, __automaticPolicyTask: true }, []);
  assert.equal(auto.text, '完整 JSON');
  assert.equal(s.calls.length, 4);
});

test('explicit completion blocks are failures, not successful story/summary output', async () => {
  let blocked = true;
  const s = setupWithTransport(async () =>
    blocked ? { text: 'Gemini 未產生內容', blockReason: 'PROHIBITED_CONTENT' } : { text: 'OK' });
  await assert.rejects(s.api.send(route, []), e => e.code === 'BAO_PROVIDER_BLOCKED');
  await assert.rejects(s.api.send(route, []), e => e.code === 'BAO_PROVIDER_BLOCKED');
  assert.equal(s.guard.isPaused(s.story, route), true);
  blocked = false;
  await s.api.send(route, []);
  assert.equal(s.guard.isPaused(s.story, route), false);
});

test('a real narrated story ending with a safety finish stays visible while automatic helpers pause', async () => {
  const s = setupWithTransport(async () => ({ text: '第24輪故事。', finishReason: 'SAFETY' }));
  const first = await s.api.send(route, []);
  const second = await s.api.send(route, []);
  assert.equal(first.text, '第24輪故事。');
  assert.equal(second.text, '第24輪故事。');
  assert.equal(s.guard.isPaused(s.story, route), true);
  await assert.rejects(s.api.send({ ...route, __stateTask: true }, []),
    error => error.code === 'BAO_POLICY_CIRCUIT_OPEN');
  assert.equal(s.calls.length, 2);
});

test('connection tests and unrelated failures never count as policy rejection', async () => {
  const s = setupWithTransport(async config => {
    if (config.__connectionTest) throw policyError();
    throw new Error('Network error');
  });
  await assert.rejects(s.api.send({ ...route, __connectionTest: true }, []));
  await assert.rejects(s.api.send(route, []));
  assert.equal(s.guard.isPaused(s.story, route), false);
  assert.equal(s.story.providerPolicyGuard, undefined);
});

test('stale requests never poison the newly opened story', async () => {
  let complete;
  const s = setupWithTransport(async () => new Promise((resolve, reject) => { complete = reject; }));
  const request = s.api.send(route, []);
  const oldStory = s.story;
  s.window.GameState.current = {};
  complete(policyError());
  await assert.rejects(request);
  assert.equal(oldStory.providerPolicyGuard, undefined);
  assert.equal(s.window.GameState.current.providerPolicyGuard, undefined);
});
