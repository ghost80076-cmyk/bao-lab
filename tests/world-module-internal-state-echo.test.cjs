'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '../js/world-module-ui.js'), 'utf8');
const relevanceCode = fs.readFileSync(path.join(__dirname, '../js/world-relevance.js'), 'utf8');

function setup() {
  const window = {BAOWorldModules: {
    compactForPrompt: () => '{"此刻":{"calendar":"靈曆三千年"},"修為":{"realm":"凡俗"}}',
    ensureState() {},
    definitions: () => [],
    compactRelevantForPrompt: () => ({ids:[], text:''})
  }};
  const App = {
    config: {narrativeMode:'world', displayMode:'ui'},
    buildSystemPrompt() {return '請根據玩家回應推進故事。';},
    renderUIPanel() {},
    renderChatShell() {},
    openBuilder() {},
    escapeHTML: value => String(value)
  };
  let nextReply = '';
  const API = {
    async send() {return {text:nextReply, usage:{total_tokens:5}};},
    wrapSend(_id, wrapper) {
      const next = this.send.bind(this);
      this.send = (config, messages) => wrapper(next, config, messages);
    }
  };
  const document = {
    querySelector: () => ({}),
    getElementById: () => null,
    addEventListener() {}
  };
  const GameState = {current:{}};
  const Chat = {messages:[]};
  vm.runInNewContext(code, {window, App, API, document, GameState, console});
  vm.runInNewContext(relevanceCode, {window, App, Chat, GameState, document, console});
  const messages = () => [{role:'system',content:App.buildSystemPrompt()}];
  return {App, API, window, GameState, messages, reply: value => {nextReply=value;}};
}

test('internal core state is context, explicitly not a reply template', () => {
  const h = setup();
  const prompt = h.App.buildSystemPrompt();
  assert.match(prompt, /【目前核心狀態】/);
  assert.match(prompt, /【僅供內部參考，不得照抄】/);
  assert.match(prompt, /"calendar":"靈曆三千年"/);
  assert.equal(prompt.split('【目前核心狀態】').length - 1, 1, 'core JSON must enter the system prompt only once');
});

test('remove a trailing old-style JSON echo without deleting the preceding story', async () => {
  const h = setup();
  h.reply('女侍將茶盞放在桌邊。\n\n【目前核心狀態】\n{"此刻":{"calendar":"靈曆三千年"},"修為":{"realm":"凡俗"}}');
  const result = await h.API.send({}, h.messages());
  assert.equal(result.text, '女侍將茶盞放在桌邊。');
  assert.equal(result.usage.total_tokens, 5);
});

test('a reply made entirely of internal JSON becomes a retry notice, not a blank bubble', async () => {
  const h = setup();
  h.reply('【目前核心狀態】\n{"此刻":{"calendar":"靈曆三千年"}}');
  const result = await h.API.send({}, h.messages());
  assert.match(result.text, /未生成有效劇情/);
  assert.doesNotMatch(result.text, /calendar/);
});

test('do not strip JSON spoken about in prose, arbitrary JSON, or unrelated requests', async () => {
  const h = setup();
  const source = '店員拿出告示：\n【目前核心狀態】\n這不是 JSON，而是普通公告。';
  h.reply(source);
  assert.equal((await h.API.send({}, h.messages())).text, source);
  const raw = '{"realm":"凡俗"}';
  h.reply(raw);
  assert.equal((await h.API.send({}, h.messages())).text, raw);
  const echoed = '【目前核心狀態】\n{"realm":"凡俗"}';
  h.reply(echoed);
  assert.equal((await h.API.send({__memoryTask:true},h.messages())).text,echoed);
});

test('without an active world state no core reference is appended', () => {
  const h=setup();
  h.GameState.current=null;
  assert.equal(h.App.buildSystemPrompt(), '請根據玩家回應推進故事。');
});

test('streaming preview hides incomplete JSON echo but preserves story prose', () => {
  const h = setup();
  const raw = '女侍向你欠身。\n【目前核心狀態】\n{"此刻":{"calendar":"靈曆';
  assert.equal(h.window.BAOWorldModuleUI.stripInternalStateEcho(raw, {partial:true}), '女侍向你欠身。');
  assert.equal(h.window.BAOWorldModuleUI.stripInternalStateEcho('【目前核心狀態】', {partial:true}), '正在生成敘事……');
  assert.equal(h.window.BAOWorldModuleUI.stripInternalStateEcho(raw), raw, 'incomplete or malformed text must not be modified as committed content');
});
