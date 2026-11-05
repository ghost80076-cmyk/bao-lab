const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');

function startup() {
  let active = { id: 'home-view' };
  let release;
  const loading = new Promise(resolve => { release = resolve; });
  const shown = [];
  const context = {
    window: { addEventListener() {} },
    document: { querySelector: () => active },
    setTimeout() {}
  };
  vm.createContext(context);
  vm.runInContext(source + '\nglobalThis.app = App;', context);
  const app = context.app;
  app.bindNavigation = app.bindBuilder = app.populateAPIControls = () => {};
  app.loadCharacters = app.loadPrompts = app.loadModels = () => loading;
  app.showView = view => { shown.push(view); active = { id: view + '-view' }; };
  return { run: () => app.init(), release: () => release(), shown,
    navigate: view => { active = { id: view + '-view' }; }, active: () => active.id };
}

test('fresh startup finishes on the home screen', async () => {
  const app = startup();
  const pending = app.run();
  app.release();
  await pending;
  assert.deepEqual(app.shown, ['home']);
});

for (const destination of ['explore', 'builder', 'chat']) {
  test('late startup completion preserves navigation to ' + destination, async () => {
    const app = startup();
    const pending = app.run();
    app.navigate(destination);
    app.release();
    await pending;
    assert.deepEqual(app.shown, []);
    assert.equal(app.active(), destination + '-view');
  });
}
