'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '../js/story-persona-manager.js'), 'utf8');
const KEY = 'bao-lab:persona-presets-v1';

class FakeSelect {
  constructor() {
    this.options = [];
    this._value = '';
    this.innerHTML = '<option value="">Select…</option>';
  }
  set innerHTML(markup) {
    this._html = markup;
    this.options = [...markup.matchAll(/<option value="([^"]*)"/g)].map(match => ({value:match[1]}));
    this._value = this.options[0]?.value || '';
  }
  get innerHTML() { return this._html; }
  get value() { return this._value; }
  set value(next) { this._value = this.options.some(option => option.value === next) ? next : ''; }
}

function makeHarness(initial = []) {
  const db = new Map([[KEY, JSON.stringify(initial)]]);
  const localStorage = {
    getItem: key => db.get(key) ?? null,
    setItem: (key, value) => { db.set(key, String(value)); },
    removeItem: key => { db.delete(key); }
  };
  const builderSelect = new FakeSelect();
  const storySelect = new FakeSelect();
  const playerNameInput = {value:'In-progress draft'};
  const panel = {dataset:{personaDraftBound:'1'}};
  const listeners = new Map();
  const document = {
    getElementById(id) {
      if (['bao-actor-styles','persona-age','bao-persona-presets','bao-builder-actors'].includes(id)) return {};
      if (id === 'persona-name') return playerNameInput;
      return null;
    },
    querySelector(selector) {
      if (selector === '.builder-step[data-step-panel="3"]') return panel;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '#bao-persona-presets > select, #bao-actor-preset') return [builderSelect, storySelect];
      return [];
    }
  };
  const App = {
    activeCharacter:{id:'story-a'},
    startStory() {},
    renderChatShell() {},
    openBuilder() { return true; },
    collectConfig() { return {persona:{}}; },
    buildSystemPrompt() { return ''; },
    escapeHTML(value) { return String(value); }
  };
  const Storage = {
    clone: data => JSON.parse(JSON.stringify(data)),
    restoreStory() {}
  };
  const window = {
    App, Storage,
    prompt(_message, defaultValue) { return defaultValue; },
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(callback);
    }
  };
  const context = {window, App, Storage, document, localStorage, console, alert() {}};
  vm.runInNewContext(SOURCE, context, {filename:'story-persona-manager.js'});
  assert.ok(window.BAOStoryActors, 'persona manager mounted');
  const emit = (name, event) => (listeners.get(name) || []).forEach(fn => fn(event));
  return {App, api:window.BAOStoryActors, localStorage, builderSelect, storySelect, playerNameInput, emit};
}

test('creating a player in the library refreshes both dropdowns without changing the draft', () => {
  const h = makeHarness();
  const record = h.api.savePreset({name:'向左', gender:'男性', identity:'學生'}, '向左');
  assert.ok(record?.id);
  for (const select of [h.builderSelect, h.storySelect]) {
    assert.ok(select.options.some(option => option.value === record.id));
    assert.match(select.innerHTML, /向左/);
  }
  assert.equal(h.playerNameInput.value, 'In-progress draft');
});

test('editing the library preserves a still-valid chosen preset', () => {
  const h = makeHarness();
  const first = h.api.savePreset({name:'向左'}, '向左');
  h.builderSelect.value = first.id;
  h.storySelect.value = first.id;
  const second = h.api.savePreset({name:'另外一個人物'}, '另外一個人物');
  assert.ok(second?.id);
  assert.equal(h.builderSelect.value, first.id);
  assert.equal(h.storySelect.value, first.id);
  assert.equal(h.builderSelect.options.length, 3);
});

test('opening another story refreshes an already-mounted picker', () => {
  const h = makeHarness();
  const original = h.api.savePreset({name:'向左'}, '向左');
  h.localStorage.setItem(KEY, JSON.stringify([
    {id:'later', label:'新角色', persona:{name:'新角色'}},
    {id:original.id, label:'向左', persona:{name:'向左'}}
  ]));
  assert.equal(h.builderSelect.options.length, 2, 'picker was stale before reopening');
  h.App.activeCharacter = {id:'story-b'};
  h.App.openBuilder();
  assert.ok(h.builderSelect.options.some(option => option.value === 'later'));
  assert.ok(h.storySelect.options.some(option => option.value === 'later'));
});

test('updates from another browser tab refresh options and discard only deleted selections', () => {
  const h = makeHarness();
  const first = h.api.savePreset({name:'向左'}, '向左');
  h.builderSelect.value = first.id;
  h.storySelect.value = first.id;
  h.localStorage.setItem(KEY, JSON.stringify([{id:'other',label:'另一位',persona:{name:'另一位'}}]));
  h.emit('storage', {key:KEY});
  assert.equal(h.builderSelect.value, '');
  assert.equal(h.storySelect.value, '');
  assert.ok(h.builderSelect.options.some(option => option.value === 'other'));
  assert.equal(h.playerNameInput.value, 'In-progress draft');
});
