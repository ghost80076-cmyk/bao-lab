const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/bao-guide.js'), 'utf8');

function setup(saved = new Map()) {
  const title = {}, body = {}, actions = {};
  const host = {
    innerHTML: '',
    querySelector: selector => selector === 'h3' ? title : body,
    addEventListener: (_, callback) => { actions.click = callback; }
  };
  let view = 'home-view', opened = '', closed = 0, reopened = 0, connected = '';
  const nodes = new Map();
  const app = {
    activeCharacter: null,
    showView(value) { view = value + '-view'; },
    openBuilder() { view = 'builder-view'; },
    get config() { throw new Error('Guide must not inspect raw connection or story data'); }
  };
  const context = {
    window: {
      App: app,
      BAOStoryStartReadiness: { snapshot: () => ({ canStart: false, ai: { label: '還缺連線金鑰' } }) },
      BAOGuidedOnboarding: { reopen: () => { reopened++; }, render() {}, connect(provider) { connected=provider;return true; } },
      BAOChatAPISettings: { open: () => { opened = 'api'; } },
      BAOMemoryWorkbench: { open: () => { opened = 'memory'; } },
      BAOStoryControlCenter: { open: () => { opened = 'control'; } }
    },
    App: app,
    document: { getElementById: id => nodes.get(id) || (['home-view', 'chat-view', 'builder-view'].includes(id) ? { classList: { contains: () => id === view } } : null) },
    localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) },
    fetch() { throw new Error('Guide must never send network requests'); },
    location: {}
  };
  vm.runInNewContext(source, context);
  const api = context.window.BAOGuide;
  api.mount(host, { close: () => { closed++; } });
  return {
    api, app, context, nodes, saved,
    title: () => title.textContent, body: () => body.textContent, markup: () => host.innerHTML,
    view: () => view, setView(value) { view = value; },
    closed: () => closed, opened: () => opened, reopened: () => reopened, connected: () => connected,
    click(action) { actions.click({ target: { closest: () => ({ dataset: { baoJourney: action } }) } }); }
  };
}

test('skip survives a reload and resuming leads to the real work view', () => {
  const first = setup();
  assert.match(first.title(), /1 \/ 3/);
  first.click('skip');
  assert.equal(first.closed(), 1);
  const second = setup(first.saved);
  assert.match(second.title(), /需要時/);
  second.click('resume');
  assert.equal(second.reopened(), 1);
  second.click('explore');
  assert.equal(second.view(), 'explore-view');
  assert.equal(second.saved.get('yorubay:bao-journey:v1'), 'active');
});

test('API learning keeps route context and returns to the existing builder', () => {
  const page = setup();
  page.app.activeCharacter = { id: 'work' };
  page.api.show('api');
  page.click('router');
  assert.match(page.body(), /並非各模型公司的官方 API/);
  assert.match(page.markup(), /https:\/\/openrouter.ai\/keys/);
  page.click('setup');
  assert.equal(page.view(), 'builder-view');
  assert.equal(page.reopened(), 1);
  assert.equal(page.saved.size, 0);
  page.api.show('journey');
  assert.match(page.body(), /還缺連線金鑰/);
  page.context.window.BAOStoryStartReadiness.snapshot = () => ({ canStart: true });
  page.api.render();
  assert.match(page.title(), /3 \/ 3/);
  assert.match(page.body(), /尚不代表實際連線成功/);
});

test('story help hands off to original settings without reading story or connection data', () => {
  const page = setup();
  page.setView('chat-view');
  page.api.render();
  assert.match(page.title(), /故事已開啟/);
  page.click('error');
  page.click('auth');
  assert.match(page.title(), /401、403/);
  page.click('setup');
  assert.equal(page.opened(), 'api');
  assert.equal(page.closed(), 1);
  page.click('memory-open');
  assert.equal(page.opened(), 'memory');
  assert.deepEqual([...page.saved.values()], ['completed']);
});

test('model help expands the existing technical controls before focusing discovery', () => {
  const page = setup();
  page.app.activeCharacter = { id: 'work' };
  page.setView('builder-view');
  let expanded = false, focused = false;
  page.nodes.set('bao-quick-technical-toggle', { hidden: false, getAttribute: () => 'false', click() { expanded = true; } });
  const disclosure = { open: false, scrollIntoView() {}, querySelector: () => ({ focus() { focused = true; } }) };
  page.nodes.set('bao-builder-model-discovery-more', disclosure);
  page.click('find-model');
  assert.equal(expanded, true);
  assert.equal(disclosure.open, true);
  assert.equal(focused, true);
});

test('storage failure does not block reading help', () => {
  const saved = new Map();
  const page = setup(saved);
  page.context.localStorage.getItem = () => { throw new Error('unavailable'); };
  page.context.localStorage.setItem = () => { throw new Error('unavailable'); };
  page.click('skip');
  page.api.show('api');
  assert.match(page.title(), /自己的模型連線/);
});

test('provider help keeps the intended route until a work is selected', () => {
  const page=setup();
  page.click('setup-openrouter');
  assert.equal(page.view(),'explore-view');
  assert.equal(page.connected(),'');
  page.app.activeCharacter={id:'selected'};
  page.app.openBuilder();
  page.api.applyPending();
  assert.equal(page.view(),'builder-view');
  assert.equal(page.connected(),'openrouter');
  assert.equal(page.saved.get('yorubay:bao-journey:v1'),'active');
});
