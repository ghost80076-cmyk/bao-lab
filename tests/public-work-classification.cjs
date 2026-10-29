const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const discovery = require('../js/explore-discovery-core.js');
const preferences = require('../js/content-preferences-core.js');
const manifest = JSON.parse(fs.readFileSync('data/character-catalog/community/manifest.json'));
const entries = ['data/characters.json', ...manifest.pages.map(page => page.file)]
  .flatMap(file => JSON.parse(fs.readFileSync(file)));
const sandbox = { console, localStorage: { getItem: () => null, setItem() {} } };
sandbox.window = sandbox;
sandbox.addEventListener = () => {};
sandbox.fetch = async file => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(file)) });
vm.runInNewContext(fs.readFileSync('js/character.js', 'utf8') + '\n;globalThis.engine=CharacterEngine;', sandbox);
const engine = sandbox.engine;
const byId = new Map();
for (const entry of entries) {
  assert.ok(['male', 'female', 'world'].includes(entry.discovery?.category), entry.id + ': explicit public classification');
  if (byId.has(entry.id)) assert.deepEqual(entry.discovery, byId.get(entry.id).discovery, entry.id + ': duplicate catalogs agree');
  byId.set(entry.id, entry);
  const raw = JSON.parse(fs.readFileSync(entry.file));
  const loaded = engine.normalize({ ...raw, discovery: entry.discovery });
  const placeholder = engine.normalize(entry);
  assert.equal(discovery.workCategory(loaded), discovery.workCategory(placeholder), entry.id + ': lazy hydration keeps public category');
  assert.equal(discovery.isAdult(loaded), preferences.isDiscoveryAdult(placeholder), entry.id + ': all discovery surfaces agree');
  assert.equal(preferences.canExpose(loaded, {}), !discovery.isAdult(placeholder), entry.id + ': default visibility agrees');
  assert.equal(loaded.rating, engine.normalize(raw).rating, entry.id + ': original content rating retained');
  assert.equal(engine.composeSystemPrompt(loaded), engine.composeSystemPrompt(engine.normalize(raw)), entry.id + ': public metadata never changes model prompt');
}
assert.equal(byId.size, entries.length, 'public catalog ids are unique');
assert.equal([...byId.values()].filter(c => c.discovery.rating).length, 30, 'only reviewed images receive explicit display ratings');
assert.equal([...byId.values()].filter(c => c.rating === 'adult' && c.discovery.rating === 'general').length, 15);
assert.equal(discovery.workCategory(byId.get('shikong-zhimen')), 'world');
assert.equal(preferences.isDiscoveryAdult(byId.get('shikong-zhimen')), false, 'reviewed fantasy cover and opening stay general');
const role = byId.get('kurobane-yume-solo');
assert.equal(discovery.workCategory(role), 'male');
assert.equal(preferences.isAdult(role), true, 'content classification stays adult');
assert.equal(preferences.isDiscoveryAdult(role), false, 'reviewed public surface is general');
assert.equal(discovery.workCategory(byId.get('elze-survival-world')), 'world');
assert.equal(discovery.workCategory(byId.get('linchenfeng')), 'female');
assert.equal(discovery.inCategory(byId.get('linchenfeng'), 'world'), false, 'world capability does not make a character a world work');
for (const id of ['desire-district', 'ktv-flight-chess', 'desire-academy-city', 'time-reversal-domination']) {
  assert.equal(preferences.canExpose(byId.get(id), {}), false, id + ': adult public premise stays gated');
}
for (const id of ['taiwan-food-hunter', 'eternal-night-codex', 'lastlight-survivors']) {
  assert.equal(byId.get(id).discovery.rating, undefined, id + ': inaccessible cover is not declared reviewed');
  assert.equal(preferences.canExpose(byId.get(id), {}), false, id + ': keep prior exposure pending cover review');
}
for (const legacy of [{ rating: 'adult' }, { category: 'r18' }, { adult_content: true }]) {
  assert.equal(preferences.isDiscoveryAdult(legacy), true);
  assert.equal(discovery.isAdult(legacy), true);
  assert.equal(preferences.canExpose(legacy, {}), false);
}
assert.equal(preferences.isDiscoveryAdult({ rating: 'adult', discovery: { rating: 'invalid' } }), true);
vm.runInNewContext(fs.readFileSync('js/app.js', 'utf8') + '\n;globalThis.app=App;', sandbox);
(async () => {
  const app = sandbox.app;
  app.characterManifest = [...byId.values()];
  app.characters = app.characterManifest.map(item => app.catalogCharacter(item));
  for (const id of ['kurobane-yume-solo', 'across-the-hall', 'elze-survival-world']) {
    const hydrated = await app.loadCharacter(id);
    assert.equal(discovery.workCategory(hydrated), byId.get(id).discovery.category, id + ': actual lazy loader carries catalog decision');
    assert.equal(discovery.isAdult(hydrated), preferences.isDiscoveryAdult(byId.get(id)), id + ': actual loader keeps exposure');
    assert.equal(await app.loadCharacter(id), hydrated, id + ': cache keeps metadata');
  }
  console.log(`PASS: ${byId.size} public classifications, 30 image reviews, 15 display corrections, unchanged role prompts, lazy loader/cache and legacy gates`);
})().catch(error => { console.error(error); process.exitCode = 1; });
