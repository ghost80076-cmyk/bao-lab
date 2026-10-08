'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

global.window = global;
global.window.addEventListener = () => {};
global.document = { getElementById: () => null };
global.GameState = { current: { memory: [] } };
const main = { key: 'main-key', model: 'main-model', baseUrl: 'https://main.example/v1' };
const helper = { key: 'helper-key', model: 'helper-model', baseUrl: 'https://other.example/v1' };
const config = {
  api: main,
  memory: {
    mode: 'smart', maxRounds: 4, summaryInterval: 2,
    summaryApiMode: 'same', summaryModel: 'legacy-wrong-model', summaryApi: helper
  }
};
global.App = { config };
global.BAOHelperData = {
  memoryRules: '僅輸出已有事實',
  memoryText: text => String(text).includes('GOOD') ? '整理過的摘要' : ''
};
const calls = [];
global.API = { async send(route) { calls.push(route); return { text: 'GOOD' }; } };
vm.runInThisContext(
  fs.readFileSync(path.join(__dirname, '..', 'js', 'chat.js'), 'utf8') + '\nglobalThis.Chat = Chat;',
  { filename: 'js/chat.js' }
);
Chat.messages = Array.from({ length: 40 }, (_, i) => ({
  id: 'message-' + i,
  role: i % 2 === 0 ? 'user' : 'assistant',
  content: '內容-' + i
}));
(async () => {
  await Chat.maybeSummarize(config);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'main-model', 'same memory route must use active main model');
  assert.equal(Chat.summary, '整理過的摘要');
  assert.ok(Chat.summarizedUntil > 0, 'successful memory summary must advance cursor');
  assert.equal(Chat.memoryHealth.lastModel, 'main-model');
  assert.equal(Chat.memoryDiagnostics(config).model, 'main-model');

  const previousCalls = calls.length;
  config.memory.summaryApiMode = 'separate';
  config.memory.summaryApi = helper;
  Chat.summary = '';
  Chat.summarizedUntil = 0;
  await Chat.maybeSummarize(config);
  assert.equal(calls.length, previousCalls + 1);
  assert.equal(calls.at(-1).model, 'helper-model', 'separate memory route must remain supported');
  assert.equal(Chat.memoryHealth.lastModel, 'helper-model');
  console.log('memory model selection core test passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
