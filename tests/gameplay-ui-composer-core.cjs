const assert = require('node:assert/strict');
const fs = require('node:fs');
const Core = require('../js/gameplay-ui-core.js');
const Composer = require('../js/gameplay-ui-composer-core.js');
const Protocol = require('../js/gameplay-ui-preview-protocol-core.js');

const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
};
const demo = () => JSON.parse(fs.readFileSync('tests/fixtures/gameplay-ui-demo-character.json', 'utf8')).gameplay_ui;

// --- P0a: new exports -------------------------------------------------------
assert.equal(Core.MAX_OPTIONS, 40, 'MAX_OPTIONS is exported for the composer');
for (const name of ['MAX_PANELS', 'MAX_SECTIONS', 'MAX_ITEMS', 'MAX_ATTRIBUTES', 'MAX_FIELDS', 'MAX_TABS']) {
  assert.ok(Number.isInteger(Core[name]) && Core[name] > 0, `${name} stays exported`);
}
assert.equal(typeof Core.normalize, 'function');
assert.equal(typeof Core.normalizeSection, 'function');
assert.equal(typeof Core.normalizePanel, 'function');
assert.equal(Core.normalizeGameplayUI, undefined, 'there is no normalizeGameplayUI; the API is normalize()');

// normalizeSection / normalizePanel behave exactly as they do inside normalize().
const meterSection = { type: 'meters', items: [{ label: 'HP', value_path: 'modules.player.hp', max_path: 'modules.player.max_hp' }] };
const fromParts = Core.normalizePanel({ id: 'status', label: '狀態', sections: [meterSection] }, 0);
const fromNormalize = Core.normalize({ version: 1, panels: [{ id: 'status', label: '狀態', sections: [meterSection] }] }).panels[0];
assert.deepEqual(fromParts, fromNormalize);
assert.deepEqual(Core.normalizeSection(meterSection, 0), fromNormalize.sections[0]);

// --- normalize() must not mutate its input ---------------------------------
const frozenDemo = deepFreeze(demo());
assert.doesNotThrow(() => Core.normalize(frozenDemo), 'normalize reads a deeply frozen schema without writing to it');
const before = JSON.stringify(demo());
const probe = demo();
Core.normalize(probe);
Core.normalizePanel(probe.panels[0], 0);
Core.normalizeSection(probe.panels[0].sections[0], 0);
assert.equal(JSON.stringify(probe), before, 'normalize / normalizePanel / normalizeSection leave input unchanged');

// --- composer keeps incomplete drafts --------------------------------------
const draft = {
  version: 1,
  custom_note: 'unknown field must survive',
  panels: [
    { id: 'status', label: '狀態', extra_panel_key: 7, sections: [
      { type: 'meters', items: [
        { label: 'HP', value_path: 'modules.player.hp', max_path: 'modules.player.max_hp' },
        { label: 'bad path', value_path: 'secrets.apiKey' }
      ], future_option: { keep: true } },
      { type: 'meters', items: [] }
    ] },
    { id: 'empty_panel', label: '剛新增', sections: [] }
  ]
};
const snapshot = JSON.stringify(draft);
assert.equal(Core.normalize(draft).panels.length, 1, 'normalize drops the empty panel');
assert.equal(Core.normalizePanel(draft.panels[1], 1), null, 'normalizePanel returns null for an empty panel');
const report = Composer.analyzeDraft(draft, Core);
assert.equal(JSON.stringify(draft), snapshot, 'analyzeDraft does not modify the draft');
assert.equal(draft.panels.length, 2, 'the incomplete panel is still in the draft');
assert.equal(draft.panels[0].sections.length, 2, 'the incomplete section is still in the draft');
assert.equal(draft.custom_note, 'unknown field must survive');
const statusOf = path => report.nodes.find(n => JSON.stringify(n.path) === JSON.stringify(path))?.status;
assert.equal(statusOf(['panels', 0]), 'ok');
assert.equal(statusOf(['panels', 0, 'sections', 0]), 'trimmed', 'invalid item path is reported, not deleted');
assert.equal(statusOf(['panels', 0, 'sections', 1]), 'incomplete');
assert.equal(statusOf(['panels', 1]), 'incomplete');
assert.equal(report.summary.incomplete, 3, 'includes the invalid item as well as its section/panel');
assert.ok(report.schema && report.schema.panels.length === 1, 'preview schema comes from normalize, separately from the draft');

// over-limit panels are flagged, not removed
const many = { version: 1, panels: Array.from({ length: Core.MAX_PANELS + 1 }, (_, i) => ({ id: `p${i}`, label: `P${i}`, sections: [meterSection] })) };
const manyReport = Composer.analyzeDraft(many, Core);
assert.equal(many.panels.length, Core.MAX_PANELS + 1);
assert.equal(manyReport.nodes.find(n => n.status === 'over_limit').path[1], Core.MAX_PANELS);

// null / junk input never throws
for (const junk of [null, undefined, 5, 'x', [], {}]) assert.doesNotThrow(() => Composer.analyzeDraft(junk, Core));

// cloneDraft: deep, equal, and strips pollution keys
const cloned = Composer.cloneDraft(JSON.parse('{"a":{"b":[1,{"c":2}]},"__proto__":{"x":1},"constructor":{"y":1}}'));
assert.deepEqual(cloned, { a: { b: [1, { c: 2 }] } });
assert.equal(({}).x, undefined, 'no prototype pollution');

// --- preview protocol -------------------------------------------------------
const win = {};
const origin = 'https://yorubay.example';
const rule = { allowed: Protocol.TO_PREVIEW, expectedOrigin: origin, expectedSource: win };
const msg = (type, payload) => Protocol.makeMessage(type, payload);
const ok = (data, over = {}) => Protocol.validateMessage({ data, origin, source: win, ...over }, rule);

assert.equal(ok(msg('render', { schema: demo(), state: { time: 'x' }, panelId: 'status' })).ok, true);
assert.equal(ok(msg('reset')).ok, true);
assert.equal(ok(msg('set-state', { state: { a: 1 } })).ok, true);
assert.equal(ok(msg('render', { schema: {} }), { origin: 'https://evil.example' }).reason, 'bad_origin');
assert.equal(ok(msg('render', { schema: {} }), { source: {} }).reason, 'bad_source');
assert.equal(ok(msg('render', { schema: {} }), { source: null }).reason, 'bad_source');
assert.equal(Protocol.validateMessage({ data: msg('reset'), origin: 'null', source: win }, { ...rule, expectedOrigin: 'null' }).reason, 'opaque_origin_not_allowed');
assert.equal(ok('hello').reason, 'bad_shape');
assert.equal(ok({ ...msg('reset'), channel: 'other' }).reason, 'bad_channel');
assert.equal(ok({ ...msg('reset'), version: 2 }).reason, 'bad_channel');
assert.equal(ok(msg('ready')).reason, 'bad_type', 'a preview->parent type is rejected on the preview side');
assert.equal(ok(msg('render', {})).reason, 'render_needs_schema');
assert.equal(ok(msg('render', { schema: [] })).reason, 'render_needs_schema');
assert.equal(ok(msg('render', { schema: {}, state: [] })).reason, 'render_state_not_object');
assert.equal(ok(msg('set-state', {})).reason, 'set_state_needs_state');
assert.equal(ok({ ...msg('reset'), payload: 'x' }).reason, 'bad_payload');
assert.equal(ok(msg('render', { schema: JSON.parse('{"__proto__":{"a":1}}') })).reason, 'payload_not_plain_json');
assert.equal(ok(msg('set-state', { state: { fn: () => 1 } })).reason, 'payload_not_plain_json');
assert.equal(ok(msg('set-state', { state: { n: NaN } })).reason, 'payload_not_plain_json');
assert.equal(ok(msg('set-state', { state: { big: 'x'.repeat(Protocol.MAX_BYTES + 1) } })).reason, 'payload_too_large');
let deep = {};
let cursor = deep;
for (let i = 0; i < Protocol.MAX_DEPTH + 2; i++) { cursor.n = {}; cursor = cursor.n; }
assert.equal(ok(msg('set-state', { state: deep })).reason, 'payload_not_plain_json', 'depth is capped');
const parentRule = { allowed: Protocol.FROM_PREVIEW, expectedOrigin: origin, expectedSource: win };
assert.equal(Protocol.validateMessage({ data: msg('ready'), origin, source: win }, parentRule).ok, true);
assert.equal(Protocol.validateMessage({ data: msg('render', { schema: {} }), origin, source: win }, parentRule).reason, 'bad_type', 'the parent never accepts render commands');


// --- review round: diagnostics must not under-report --------------------------------------------
const pathOf = n => JSON.stringify(n.path);
const find = (rep, path) => rep.nodes.find(n => pathOf(n) === JSON.stringify(path));
const panel = (id, extra = {}) => ({ id, label: id, sections: [meterSection], ...extra });

// the shipped demo card reports no problems (no false positives)
const demoReport = Composer.analyzeDraft(demo(), Core);
assert.equal(demoReport.summary.problems, 0, JSON.stringify(demoReport.nodes.filter(n => n.status !== 'ok')));
assert.equal(demoReport.summary.schemaValid, true);

// two panels with the same id: the preview keeps one, the diagnosis must say which was dropped
const dupDraft = { version: 1, panels: [panel('status'), panel('status', { label: 'again' })] };
const dupSnapshot = JSON.stringify(dupDraft);
const dupReport = Composer.analyzeDraft(dupDraft, Core);
assert.equal(dupReport.schema.panels.length, 1, 'preview really shows only one of them');
assert.equal(find(dupReport, ['panels', 0]).status, 'ok');
assert.equal(find(dupReport, ['panels', 1]).status, 'duplicate');
assert.equal(find(dupReport, ['panels', 1]).reason, 'panel_duplicate_id');
assert.equal(dupReport.summary.duplicates, 1);
assert.ok(dupReport.summary.problems > 0);
assert.equal(JSON.stringify(dupDraft), dupSnapshot, 'draft untouched, duplicate kept');

// whole-schema rejection is reported, with the reason
const v99 = Composer.analyzeDraft({ version: 99, panels: [panel('status')] }, Core);
assert.equal(v99.schema, null);
assert.equal(v99.summary.schemaValid, false);
assert.equal(find(v99, []).status, 'invalid');
assert.equal(find(v99, []).reason, 'schema_version_unsupported');
assert.equal(Composer.analyzeDraft({ version: 1, enabled: false, panels: [panel('a')] }, Core).nodes[0].reason, 'schema_disabled');
assert.equal(Composer.analyzeDraft({ version: 1 }, Core).nodes[0].reason, 'schema_has_no_usable_content');
assert.equal(Composer.analyzeDraft({}, Core).nodes[0].reason, 'schema_has_no_usable_content');
assert.equal(Composer.analyzeDraft(null, Core).nodes[0].reason, 'schema_not_object');
assert.equal(Composer.analyzeDraft([], Core).nodes[0].reason, 'schema_not_object');
for (const bad of [null, {}, { version: 99 }, { version: 1, panels: [{ id: 'x', sections: [] }] }]) {
  const rep = Composer.analyzeDraft(bad, Core);
  assert.equal(rep.schema, null);
  assert.ok(rep.summary.problems > 0, 'an empty schema is never reported as "no problems"');
}
assert.equal(Composer.analyzeDraft({ version: '1', panels: [panel('a')] }, Core).summary.problems, 0, 'string "1" is accepted by the core, so it is not flagged');

// the cap counts VALID panels only, exactly like the core (invalid ones do not use up a slot)
const mixed = { version: 1, panels: [{ id: 'blank', sections: [] }, ...Array.from({ length: Core.MAX_PANELS + 1 }, (_, i) => panel(`p${i}`))] };
const mixedReport = Composer.analyzeDraft(mixed, Core);
assert.equal(find(mixedReport, ['panels', 0]).status, 'incomplete');
assert.equal(find(mixedReport, ['panels', Core.MAX_PANELS + 1]).status, 'over_limit', 'only the 9th valid panel is over the cap');
assert.equal(find(mixedReport, ['panels', Core.MAX_PANELS]).status, 'ok');
assert.equal(mixedReport.schema.panels.length, Core.MAX_PANELS);
const oneBlank = { version: 1, panels: [{ id: 'blank', sections: [] }, ...Array.from({ length: Core.MAX_PANELS }, (_, i) => panel(`q${i}`))] };
assert.equal(Composer.analyzeDraft(oneBlank, Core).summary.overLimit, 0, 'a blank panel plus 8 valid ones is not over the cap');

// layout references that the core silently clears
const layoutOf = layout => Composer.analyzeDraft({ version: 1, layout, panels: [panel('status'), panel('world')] }, Core);
assert.equal(layoutOf({ preset: 'rpg-dashboard', left_panel: 'status', right_panel: 'world' }).summary.problems, 0);
assert.equal(find(layoutOf({ preset: 'rpg-dashboard', left_panel: 'ghost', right_panel: 'world' }), ['layout', 'left_panel']).reason, 'layout_panel_not_found');
assert.equal(find(layoutOf({ preset: 'rpg-dashboard', left_panel: 'status', right_panel: 'status' }), ['layout', 'right_panel']).reason, 'layout_right_same_as_left');
assert.equal(find(layoutOf({ preset: 'terminal', primary_panel: 'ghost' }), ['layout', 'primary_panel']).status, 'unresolved');
assert.equal(find(layoutOf({ preset: 'scene-rpg', right_panel: 'ghost' }), ['layout', 'right_panel']).status, 'unresolved');
assert.equal(find(layoutOf({ preset: 'hologram' }), ['layout', 'preset']).reason, 'layout_preset_unknown');
const dropped = Composer.analyzeDraft({ version: 1, layout: { preset: 'rpg-dashboard', left_panel: 'blank' }, panels: [panel('status'), { id: 'blank', sections: [] }] }, Core);
assert.equal(find(dropped, ['layout', 'left_panel']).status, 'unresolved', 'layout pointing at a panel that was dropped');

// tabs: duplicate tab ids, empty tabs, nested tabs and bad children are all visible
const tabsDraft = { version: 1, panels: [{ id: 'archive', label: 'A', sections: [{
  type: 'tabs', id: 'archive_tabs', tabs: [
    { id: 'live', label: '即時', sections: [meterSection, { type: 'meters', items: [] }] },
    { id: 'live', label: '同名', sections: [meterSection] },
    { id: 'empty', label: '空', sections: [] },
    { id: 'nest', label: '巢狀', sections: [{ type: 'tabs', tabs: [{ id: 'x', sections: [meterSection] }] }] }
  ] }] }] };
const tabsSnapshot = JSON.stringify(tabsDraft);
const tabsReport = Composer.analyzeDraft(tabsDraft, Core);
const tabPath = (...rest) => ['panels', 0, 'sections', 0, 'tabs', ...rest];
assert.equal(find(tabsReport, tabPath(0)).status, 'ok');
assert.equal(find(tabsReport, tabPath(0, 'sections', 0)).status, 'ok');
assert.equal(find(tabsReport, tabPath(0, 'sections', 1)).status, 'incomplete', 'bad child inside a tab');
assert.equal(find(tabsReport, tabPath(1)).status, 'duplicate');
assert.equal(find(tabsReport, tabPath(2)).status, 'incomplete');
assert.equal(find(tabsReport, tabPath(3, 'sections', 0)).reason, 'nested_tabs_not_allowed');
assert.equal(tabsReport.schema.panels[0].sections[0].tabs.length, 1, 'only the first "live" tab survives in the preview');
assert.equal(JSON.stringify(tabsDraft), tabsSnapshot);

// --- review round: payload size is measured in UTF-8 bytes ----------------------------------------
assert.equal(Protocol.utf8ByteLength('abc'), 3);
assert.equal(Protocol.utf8ByteLength('é'), 2);
assert.equal(Protocol.utf8ByteLength('中'), 3);
assert.equal(Protocol.utf8ByteLength('😀'), 4, 'a surrogate pair is one 4-byte character');
assert.equal(Protocol.utf8ByteLength('中文😀a'), 3 + 3 + 4 + 1);
assert.equal(Protocol.utf8ByteLength('\ud800'), 3, 'a lone surrogate is encoded as U+FFFD (3 bytes)');
assert.equal(Protocol.utf8ByteLength(''), 0);
for (const sample of ['', 'plain ascii', '中文測試', 'mix 中 é 😀 \u0000 "quote"', '𠮷野家']) {
  assert.equal(Protocol.utf8ByteLength(sample), Buffer.byteLength(sample, 'utf8'), `matches Buffer for ${JSON.stringify(sample)}`);
}
const cjk = '中'.repeat(90000); // 90,000 UTF-16 units but 270,000 UTF-8 bytes
assert.ok(cjk.length < Protocol.MAX_BYTES && Buffer.byteLength(cjk) > Protocol.MAX_BYTES);
assert.equal(ok(msg('set-state', { state: { text: cjk } })).reason, 'payload_too_large', 'about 300 KB of Chinese text is rejected');
assert.equal(Protocol.validatePayload('set-state', { state: { text: cjk } }).reason, 'payload_too_large');
const overhead = Protocol.payloadBytes({ state: { s: '' } });
const exact = n => ({ state: { s: 'x'.repeat(n) } });
assert.equal(Protocol.payloadBytes(exact(Protocol.MAX_BYTES - overhead)), Protocol.MAX_BYTES);
assert.equal(ok(msg('set-state', exact(Protocol.MAX_BYTES - overhead))).ok, true, 'exactly MAX_BYTES is allowed');
assert.equal(ok(msg('set-state', exact(Protocol.MAX_BYTES - overhead + 1))).reason, 'payload_too_large', 'one byte more is rejected');
const cjkFit = (Protocol.MAX_BYTES - overhead) / 3;
assert.equal(ok(msg('set-state', { state: { s: '中'.repeat(Math.floor(cjkFit)) } })).ok, true);
assert.equal(ok(msg('set-state', { state: { s: '中'.repeat(Math.floor(cjkFit) + 1) } })).reason, 'payload_too_large');
assert.equal(Protocol.validatePayload('render', { schema: demo(), state: {}, panelId: 'status' }).ok, true);
assert.equal(Protocol.validatePayload('render', { schema: [] }).reason, 'render_needs_schema');
assert.equal(Protocol.validatePayload('render', 'x').reason, 'bad_payload');



// Preserve unknown data and diagnose children even when all tabs are invalid.
{
 const original = demo(); original.future = { preserve: [1, 2] };
 const copy = Composer.cloneDraft(original);
 Composer.analyzeDraft(copy, Core);
 assert.deepEqual(copy, original);
 const raw = {version: 1, panels: [{id: 'p', sections: [{type: 'tabs', tabs: [{id:'t', sections: [{type:'tabs', tabs:[]}]}]}]}]};
 assert.ok(Composer.analyzeDraft(raw, Core).nodes.some(n => n.reason === 'nested_tabs_not_allowed'));
}

// Builder/theme diagnostics must explain data that the runtime drops or changes.
{
 const make = builder => ({version:1, builder, panels:[panel('p')]});
 const attr = key => ({key,target_path:'modules.player.hp',min:0,max:100,base:10});
 const field = key => ({key,target_path:'modules.player.name',type:'text'});
 const group = key => ({key,target_path:'modules.player.perk',options:[{id:'one',cost:0}]});
 const raw = make({attributes:[attr('same'),attr('same')],fields:[field('same'),field('name')],choice_groups:[group('name'),group('perk')]});
 const snapshot = JSON.stringify(raw);
 const result = Composer.analyzeDraft(raw,Core);
 for (const path of [['builder','attributes',1],['builder','fields',0],['builder','choice_groups',0]]) {
   assert.equal(find(result,path)?.status,'duplicate',JSON.stringify(path));
 }
 assert.equal(result.schema.builder.attributes.length,1);
 assert.equal(result.schema.builder.fields.length,1);
 assert.equal(result.schema.builder.choice_groups.length,1);
 assert.equal(JSON.stringify(raw),snapshot);
 const invalid = Composer.analyzeDraft(make({attributes:[{key:'bad',target_path:'api.key'}], fields:'oops',choice_groups:[{...group('dups'),options:[{id:'x',cost:0},{id:'x',cost:1}]}]}),Core);
 assert.equal(find(invalid,['builder','attributes',0])?.status,'incomplete');
 assert.equal(find(invalid,['builder','fields'])?.status,'invalid');
 assert.equal(find(invalid,['builder','choice_groups',0])?.status,'incomplete');
 const capped = Composer.analyzeDraft(make({attributes:[null,...Array.from({length:Core.MAX_ATTRIBUTES+1},(_,i)=>attr('a'+i))]}),Core);
 assert.equal(find(capped,['builder','attributes',Core.MAX_ATTRIBUTES])?.status,'ok');
 assert.equal(find(capped,['builder','attributes',Core.MAX_ATTRIBUTES+1])?.status,'over_limit');
 const choices = Composer.analyzeDraft(make({choice_groups:[null,...Array.from({length:Core.MAX_CHOICE_GROUPS},(_,i)=>group('g'+i))]}),Core);
 assert.equal(find(choices,['builder','choice_groups',Core.MAX_CHOICE_GROUPS])?.status,'over_limit','groups are capped BEFORE filtering');
 const pruned = Composer.analyzeDraft(make({fields:[{...field('choice'),type:'select',options:Array.from({length:Core.MAX_OPTIONS+1},(_,i)=>'o'+i),default:'missing'}],attributes:[{...attr('clamped'),base:999}],choice_groups:[{...group('perk'),options:[{id:'one',cost:0},{id:'invalid',cost:'bad'}]}]}),Core);
 assert.ok(pruned.nodes.some(n=>n.path.join('.')==='builder.fields.0.options'&&n.status==='trimmed'));
 assert.ok(pruned.nodes.some(n=>n.path.join('.')==='builder.fields.0.default'));
 assert.ok(pruned.nodes.some(n=>n.path.join('.')==='builder.attributes.0.base'));
 assert.ok(pruned.nodes.some(n=>n.path.join('.')==='builder.choice_groups.0.options'));
 const themed = {version:1,panels:[panel('p')],theme:{preset:'hologram',density:'tiny',radius:'huge',meter:'rainbow',accent:'url(javascript:bad)',surface:'#abc',future:'keep'}};
 const clone = Composer.cloneDraft(themed);
 const themeResult = Composer.analyzeDraft(themed,Core);
 for(const name of ['preset','density','radius','meter','accent']) assert.equal(find(themeResult,['theme',name])?.status,'invalid',name);
 assert.equal(find(themeResult,['theme','surface']),undefined,'valid shorthand colors do not report a problem');
 assert.deepEqual(themed,clone,'diagnosis does not overwrite invalid or future values');
 assert.equal(Composer.analyzeDraft({...themed,theme:'arcane-night'},Core).summary.problems,0);
 assert.ok(Composer.analyzeDraft({...themed,theme:[]},Core).nodes.some(n=>n.kind==='theme'&&n.status==='invalid'));
}

console.log('Gameplay UI composer core PASS: schema, builder/theme diagnostics, immutable drafts, UTF-8 preview protocol');
