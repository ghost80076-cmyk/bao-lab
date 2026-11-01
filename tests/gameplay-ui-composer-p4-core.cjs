const assert=require('node:assert/strict');
const Core=require('../js/gameplay-ui-core.js');
const Composer=require('../js/gameplay-ui-composer-core.js');
const Protocol=require('../js/gameplay-ui-preview-protocol-core.js');
// ---- P4: templates, state seed, contrast, builder diagnostics, image message ------------------------
{
  // every template is a fresh, valid draft; mutating one never leaks into the next call
  for (const t of Composer.TEMPLATES) {
    const a = Composer.templateDraft(t.id); const b = Composer.templateDraft(t.id);
    assert.deepEqual(a, b); assert.notEqual(a, b);
    a.panels.push({ id: 'x' });
    assert.equal(Composer.templateDraft(t.id).panels.length, b.panels.length, 'no shared state');
    const report = Composer.analyzeDraft(Composer.templateDraft(t.id), Core);
    if (t.id === 'blank') assert.ok(report.summary.problems > 0, 'blank is honest about being empty');
    else assert.equal(report.summary.problems, 0, `${t.id}: ${JSON.stringify(report.nodes.filter(n => n.status !== 'ok'))}`);
  }
  assert.equal(Composer.templateDraft('nope'), null);
  assert.equal(Composer.templateDraft('__proto__'), null);
  assert.equal(Composer.isEmptyDraft(null), true);
  assert.equal(Composer.isEmptyDraft(Composer.templateDraft('blank')), true);
  assert.equal(Composer.isEmptyDraft(Composer.templateDraft('rpg-status')), false);
  assert.equal(Composer.isEmptyDraft({ version: 1, panels: [], x_unknown: 1 }), false, 'unknown fields count as content');
  // the shop template's action really runs with the production executor
  const shopT = Composer.templateDraft('shop');
  const trial = Composer.trialAction(shopT, { panel: 1, section: 1, item: 0 }, {}, Core);
  assert.equal(trial.ok, true, trial.reason);

  // state seed: the card's own values win, copies only, sample data fills the rest
  const seed = Object.freeze({ initial_state: Object.freeze({ time: '黃昏', location: '港口', events: ['出發'], modules: { player: { hp: 7, max_hp: 20, gold: 3 } } }), world_modules: [{ id: 'player', kind: 'object' }, { id: 'inventory', kind: 'collection' }] });
  const seeded = Composer.buildTestState(Composer.templateDraft('shop'), {}, Core, seed);
  assert.equal(Core.getPath(seeded.state, 'modules.player.hp'), 7);
  assert.equal(Core.getPath(seeded.state, 'modules.player.max_hp'), 20);
  assert.equal(seeded.state.moduleDefinitions.length, 2);
  assert.equal(seeded.entries.find(e => e.path === 'modules.player.hp').value, 7);
  seeded.state.moduleDefinitions.push({ id: 'x' }); seeded.state.modules.player.hp = 1;
  assert.equal(seed.world_modules.length, 2); assert.equal(seed.initial_state.modules.player.hp, 7, 'seed untouched');
  const plain = Composer.buildTestState(Composer.templateDraft('shop'), {}, Core);
  assert.notEqual(Core.getPath(plain.state, 'modules.player.hp'), 7);
  // an override still beats the card's value
  assert.equal(Core.getPath(Composer.buildTestState(Composer.templateDraft('shop'), { 'modules.player.hp': 2 }, Core, seed).state, 'modules.player.hp'), 2);
  // seeded gold (3) is too little for the 5-gold potion: the trial reports the failure instead of faking success
  assert.equal(Composer.trialAction(shopT, { panel: 1, section: 1, item: 0 }, {}, Core, 'current', seed).ok, false);
  // rows the card already has are not replaced by sample rows
  const rows = Composer.buildTestState({ version: 1, panels: [{ id: 'p', sections: [{ type: 'list', path: 'events' }] }] }, {}, Core, seed).state.events;
  assert.deepEqual(rows, ['出發']);

  // contrast: known ratios, composited alpha, rules
  assert.ok(Math.abs(Composer.contrastRatio('rgb(0, 0, 0)', 'rgb(255, 255, 255)') - 21) < 0.01);
  assert.equal(Composer.contrastRatio('red', 'rgb(0,0,0)'), null);
  const low = Composer.analyzeDraft(Composer.templateDraft('rpg-status'), Core, { colors: { accent: 'rgb(30, 30, 30)', surface: 'rgb(23, 23, 21)', text: 'rgb(230, 230, 230)', muted: 'rgba(255, 255, 255, 0.62)' } });
  assert.deepEqual(low.nodes.filter(n => n.kind === 'theme').map(n => n.path.join('.')), ['theme.accent']);
  assert.equal(low.summary.problems, 0, 'a contrast warning is not a problem');
  assert.equal(low.summary.warnings, 1);
  assert.equal(Composer.analyzeDraft(Composer.templateDraft('rpg-status'), Core, { colors: { accent: 'rgb(214, 169, 79)', surface: 'rgb(23, 23, 21)', text: 'rgb(230, 230, 230)', muted: 'rgba(255, 255, 255, 0.62)' } }).summary.warnings, 0);

  // builder: what the core resets is explained, the draft is not touched
  const withBuilder = { ...Composer.templateDraft('rpg-status'), builder: { kind: 'wizard', points_path: 'nonsense', x_keep: 1 } };
  const br = Composer.analyzeDraft(withBuilder, Core);
  assert.deepEqual(br.nodes.filter(n => n.kind === 'builder').map(n => n.reason).sort(), ['builder_kind_unknown', 'builder_points_path_invalid']);
  assert.equal(withBuilder.builder.x_keep, 1);

  // image message: allow-list, size, base64
  const P = require('../js/gameplay-ui-preview-protocol-core.js');
  assert.equal(P.validatePayload('set-image', { mime: 'image/jpeg', data: 'QUJD' }).ok, true);
  assert.equal(P.validatePayload('set-image', { mime: '', data: '' }).ok, true, 'empty data clears');
  assert.equal(P.validatePayload('set-image', { mime: 'image/svg+xml', data: 'QUJD' }).reason, 'image_mime_not_allowed');
  assert.equal(P.validatePayload('set-image', { mime: 'image/png', data: 'not base64!' }).reason, 'image_not_base64');
  assert.equal(P.validatePayload('set-image', { mime: 'image/png', data: 'A'.repeat(P.MAX_IMAGE_CHARS + 4) }).reason, 'image_too_large');
  assert.equal(P.validatePayload('set-image', { mime: 'image/png', data: 'A'.repeat(P.MAX_BYTES + 4) }).reason, 'payload_too_large');
  assert.equal(P.validatePayload('set-image', { mime: 'image/png' }).reason, 'image_needs_data');
  assert.ok(P.TO_PREVIEW.includes('set-image'));
}



// Seeded empty collections and object values are authored data, not missing samples.
{
 const raw={version:1,panels:[{id:'p',sections:[{type:'list',path:'events'},{type:'stats',items:[{path:'modules.player'}]}]}]};
 const seed={initial_state:{events:[],modules:{player:{hp:0,future:1}}},world_modules:[{id:'player',kind:'object',privateMetadata:'not for the renderer'}]};
 const result=Composer.buildTestState(raw,{},Core,seed).state;
 assert.deepEqual(result.events,[]);assert.deepEqual(result.modules.player,{hp:0,future:1});assert.equal(result.moduleDefinitions[0].privateMetadata,undefined);assert.equal(seed.world_modules[0].privateMetadata,'not for the renderer');
 assert.equal(Protocol.validatePayload('set-image',{mime:'image/png',data:'A'}).reason,'image_not_base64');
 assert.ok(Math.abs(Composer.contrastRatio('rgba(255,255,255,0.5)','rgba(0,0,0,0.5)')-5.2808)<.01);
}

console.log('Gameplay UI composer P4 PASS: templates, state seed, contrast, builder diagnostics and bounded image protocol');

assert.ok(Protocol.TO_PREVIEW.includes('refresh'));
assert.equal(Protocol.validatePayload('refresh',{}).ok,true);
