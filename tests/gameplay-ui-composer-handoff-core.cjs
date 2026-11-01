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
assert.equal(statusOf(['panels', 0, 'sections', 0, 'items', 1]), 'incomplete', 'the bad item itself is pointed out (P1b)');
assert.equal(report.summary.incomplete, 3, 'empty section + empty panel + the unusable item');
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

// --- P1a: draft operations --------------------------------------------------------------------------
{
  const C = Composer;
  const rich = () => ({
    version: 1,
    x_future_root: { keep: [1, { deep: true }] },
    layout: { preset: 'rpg-dashboard', left_panel: 'status', right_panel: 'world', x_layout_extra: 'k' },
    panels: [
      { id: 'status', label: '狀態', x_panel_extra: 1, sections: [
        { type: 'meters', title: 'T', x_section_extra: 'a', items: [
          { label: 'HP', value_path: 'modules.player.hp', max_path: 'modules.player.max_hp', x_item_extra: { n: 1 } },
          { label: 'MP', value_path: 'modules.player.mp', max: 30, min: 0 }
        ] },
        { type: 'stats', items: [{ label: '地點', path: 'location' }] }
      ] },
      { id: 'world', label: '世界', sections: [] }
    ]
  });
  const frozen = deepFreeze(rich());
  const same = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));

  // starter draft is valid
  const starter = C.createStarterDraft();
  assert.equal(C.analyzeDraft(starter, Core).summary.problems, 0);
  assert.ok(Core.normalize(starter), 'starter normalizes to a real schema');

  // every operation leaves its (deep-frozen) input untouched and returns a new object
  const ops = [
    () => C.addPanel(frozen), () => C.removePanel(frozen, 1), () => C.movePanel(frozen, 0, 1),
    () => C.addMeterSection(frozen, 1), () => C.removeSection(frozen, 0, 1), () => C.moveSection(frozen, 0, 0, 1),
    () => C.addMeterItem(frozen, 0, 0), () => C.removeItem(frozen, 0, 0, 0), () => C.moveItem(frozen, 0, 0, 0, 1),
    () => C.setField(frozen, { panel: 0 }, 'label', 'x'), () => C.setField(frozen, { panel: 0, section: 0, item: 0 }, 'max', '9')
  ];
  ops.forEach((run, i) => {
    const r = run();
    assert.equal(r.ok, true, `op ${i} succeeds`);
    assert.notEqual(r.draft, frozen);
  });

  // unknown fields survive every operation (deep equality outside the touched node)
  let r = C.setField(rich(), { panel: 0, section: 0, item: 0 }, 'label', '生命');
  const expected = rich(); expected.panels[0].sections[0].items[0].label = '生命';
  same(r.draft, expected);
  r = C.moveItem(rich(), 0, 0, 0, 1);
  assert.equal(r.draft.panels[0].sections[0].items[1].x_item_extra.n, 1, 'moved item keeps its unknown field');
  assert.equal(r.draft.x_future_root.keep[1].deep, true);
  assert.equal(r.draft.panels[0].x_panel_extra, 1);
  assert.equal(r.draft.layout.x_layout_extra, 'k');
  // no-op round trip: cloning is lossless
  same(C.cloneDraft(rich()), rich());

  // add / remove / move behave and respect limits
  r = C.addPanel(rich());
  assert.equal(r.draft.panels.length, 3);
  assert.equal(r.draft.panels[2].id, 'panel_1');
  assert.equal(C.addPanel(r.draft).draft.panels[3].id, 'panel_2', 'ids are unique');
  assert.equal(C.analyzeDraft(r.draft, Core).nodes.some(n => n.status === C.STATUS.INCOMPLETE), true, 'an empty new panel is kept and reported, not dropped');
  const full = { version: 1, panels: Array.from({ length: Core.MAX_PANELS }, (_, i) => ({ id: `p${i}`, label: 'x', sections: [] })) };
  assert.equal(C.addPanel(full).reason, 'panel_limit');
  assert.equal(C.addMeterSection({ version: 1, panels: [{ id: 'a', sections: Array.from({ length: Core.MAX_SECTIONS }, () => ({ type: 'stats', items: [] })) }] }, 0).reason, 'section_limit');
  assert.equal(C.addMeterItem({ version: 1, panels: [{ id: 'a', sections: [{ type: 'meters', items: Array.from({ length: Core.MAX_ITEMS }, () => ({})) }] }] }, 0, 0).reason, 'item_limit');
  assert.equal(C.addItem({ version: 1, panels: [{ id: 'a', sections: [{ type: 'list', path: 'events' }] }] }, 0, 0).reason, 'section_has_no_items', 'list sections have no items');
  assert.equal(C.movePanel(rich(), 0, 5).reason, 'out_of_range');
  assert.equal(C.removeItem(rich(), 0, 0, 9).reason, 'out_of_range');
  assert.deepEqual(C.movePanel(rich(), 0, 1).draft.panels.map(p => p.id), ['world', 'status']);
  assert.deepEqual(C.moveSection(rich(), 0, 0, 1).draft.panels[0].sections.map(x => x.type), ['stats', 'meters']);

  // removing / renaming a panel keeps layout references honest
  r = C.removePanel(rich(), 1);
  assert.equal('right_panel' in r.draft.layout, false);
  assert.deepEqual(r.clearedLayout, ['right_panel']);
  assert.equal(r.draft.layout.left_panel, 'status');
  r = C.setField(rich(), { panel: 1 }, 'id', 'realm');
  assert.equal(r.draft.layout.right_panel, 'realm');
  assert.equal(r.draft.layout.left_panel, 'status');
  const dup = rich(); dup.panels.push({ id: 'world', label: '複本', sections: [] });
  assert.equal(C.removePanel(dup, 1).draft.layout.right_panel, 'world', 'a surviving duplicate keeps the reference');

  // field whitelist and number handling
  assert.equal(C.setField(rich(), { panel: 0, section: 0, item: 0 }, 'x_item_extra', 'oops').reason, 'field_not_editable');
  assert.equal(C.setField(rich(), { panel: 0 }, 'sections', []).reason, 'field_not_editable');
  assert.equal(C.setField(rich(), { panel: 0, section: 0, item: 0 }, 'max', 'abc').reason, 'not_a_number');
  assert.equal(C.setField(rich(), { panel: 0, section: 0, item: 1 }, 'max', '').draft.panels[0].sections[0].items[1].max, undefined, 'emptying a number removes the key');
  assert.equal(C.setField(rich(), { panel: 0, section: 0, item: 1 }, 'min', '-5').draft.panels[0].sections[0].items[1].min, -5);
  assert.equal(C.setField(rich(), { panel: 9 }, 'label', 'x').reason, 'out_of_range');
  assert.equal(C.setField(rich(), { panel: 0, section: 1, item: 0 }, 'max', '5').reason, 'field_not_editable', 'stats items have no max');
  // internal editor ids never leak into the draft
  const allKeys = new Set();
  (function walk(v) { if (v && typeof v === 'object') Object.keys(v).forEach(k => { allKeys.add(k); walk(v[k]); }); })(C.addMeterItem(C.addMeterSection(C.addPanel(starter).draft, 0).draft, 0, 0).draft);
  assert.deepEqual([...allKeys].filter(k => /^(_|uid|key|editor)/i.test(k)), []);

  // preview test state
  const t = C.buildMeterTestState(rich(), {}, Core);
  assert.equal(t.state.modules.player.max_hp, 100);
  assert.equal(t.state.modules.player.hp, 60);
  assert.equal(t.state.modules.player.mp, 18, 'fixed max 30 → 60%');
  assert.deepEqual(t.entries.map(e => e.path), ['modules.player.max_hp', 'modules.player.hp', 'modules.player.mp', 'location'], 'meters first, then the stats path');
  assert.equal(C.buildMeterTestState(rich(), { 'modules.player.hp': 5 }, Core).state.modules.player.hp, 5, 'override wins');
  assert.equal(C.buildMeterTestState(rich(), { 'modules.player.max_hp': 200 }, Core).state.modules.player.hp, 120, 'value follows an overridden max');
  assert.deepEqual(C.buildMeterTestState({ version: 1, panels: [{ sections: [{ type: 'meters', items: [{ label: 'x', value_path: 'player.hp' }, { value_path: '__proto__.x' }] }] }] }, {}, Core).entries, [], 'non-module and unsafe paths are skipped');
  assert.equal(({}).x, undefined, 'no prototype pollution');
  assert.deepEqual(C.buildMeterTestState(null, {}, Core).entries, []);
  assert.equal(JSON.stringify(frozen), JSON.stringify(rich()), 'frozen input never changed');
}

// --- P1b: meter item-level diagnostics ----------------------------------------------------------------
{
  const C = Composer;
  const items = [
    { label: 'ok', value_path: 'modules.player.hp', max_path: 'modules.player.max_hp' },
    { label: 'no path' },
    { label: 'bad value', value_path: 'a b c' },
    { label: 'bad max', value_path: 'modules.player.mp', max_path: '..' },
    'not an object',
    { label: 'both', value_path: 'modules.player.sp', max_path: 'modules.player.max_sp', max: 40 }
  ];
  const d = { version: 1, panels: [{ id: 'status', label: 's', sections: [{ type: 'meters', items }] }] };
  const snap = JSON.stringify(d);
  const rep = C.analyzeDraft(d, Core);
  const at = i => rep.nodes.find(n => JSON.stringify(n.path) === JSON.stringify(['panels', 0, 'sections', 0, 'items', i]));
  assert.equal(at(0).status, C.STATUS.OK);
  assert.deepEqual([at(1).status, at(1).reason], [C.STATUS.INCOMPLETE, 'meter_value_path_missing']);
  assert.deepEqual([at(2).status, at(2).reason], [C.STATUS.INCOMPLETE, 'meter_value_path_invalid']);
  assert.deepEqual([at(3).status, at(3).reason], [C.STATUS.INCOMPLETE, 'meter_max_path_invalid']);
  assert.deepEqual([at(4).status, at(4).reason], [C.STATUS.INCOMPLETE, 'item_not_object']);
  assert.deepEqual([at(5).status, at(5).reason], [C.STATUS.TRIMMED, 'meter_fixed_max_ignored']);
  assert.equal(JSON.stringify(d), snap, 'analysis never modifies the draft');
  // agreement with the real renderer input: exactly the OK/TRIMMED items survive normalize
  const surviving = rep.nodes.filter(n => n.kind === 'item' && (n.status === C.STATUS.OK || n.status === C.STATUS.TRIMMED)).length;
  assert.equal(rep.schema.panels[0].sections[0].items.length, surviving);

  // cap: items beyond MAX_ITEMS (counted among valid ones) are flagged, invalid ones do not use up slots
  const many = [{ label: 'bad' }].concat(Array.from({ length: Core.MAX_ITEMS + 2 }, (_, i) => ({ label: `m${i}`, value_path: `modules.p.v${i}` })));
  const big = C.analyzeDraft({ version: 1, panels: [{ id: 'a', sections: [{ type: 'meters', items: many }] }] }, Core);
  const itemNodes = big.nodes.filter(n => n.kind === 'item');
  assert.equal(itemNodes.filter(n => n.status === C.STATUS.OVER_LIMIT).length, 2);
  assert.equal(itemNodes[0].status, C.STATUS.INCOMPLETE);
  assert.equal(big.schema.panels[0].sections[0].items.length, Core.MAX_ITEMS);

  // a meters section whose items are all unfinished is itself reported, and so is each item (author sees where)
  const fresh = C.analyzeDraft(C.addMeterSection(C.addPanel(null).draft, 0).draft, Core);
  assert.ok(fresh.nodes.some(n => n.kind === 'section' && n.status === C.STATUS.INCOMPLETE));
  assert.ok(fresh.nodes.some(n => n.kind === 'item' && n.reason === 'meter_value_path_missing'));
  assert.equal(fresh.summary.schemaValid, false);

  // a panel with a rejected id is told apart from an empty panel
  const badId = C.analyzeDraft({ version: 1, panels: [{ id: 'has space', label: 'x', sections: [{ type: 'stats', items: [{ path: 'time' }] }] }, { id: 'p2', sections: [] }] }, Core);
  assert.equal(badId.nodes.find(n => n.path[1] === 0 && n.kind === 'panel').reason, 'panel_id_invalid');
  assert.equal(badId.nodes.find(n => n.path[1] === 1 && n.kind === 'panel').reason, 'panel_empty');
}

// --- P2: stats / list / actions, effects, diagnostics, trial ---------------------------------------------
{
  const C = Composer;
  const same = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  const shop = () => ({
    version: 1, x_root: { a: [1] },
    panels: [{ id: 'shop', label: '商店', x_p: 1, sections: [
      { type: 'stats', title: '資源', x_s: 'k', items: [{ label: '金幣', path: 'modules.player.gold', x_i: 1 }, { label: '地點', path: 'location' }] },
      { type: 'list', title: '紀錄', path: 'events', limit: 5, x_l: true },
      { type: 'actions', title: '行動', items: [
        { label: '買藥水', draft: '我買藥水。', hint: '5 金幣', x_a: { z: 1 }, effect: { changes: [{ path: 'modules.player.gold', delta: -5 }], items: [{ path: 'modules.inventory', id: 'potion', name: '藥水', delta: 1 }], event: '買了藥水', x_e: 1 } },
        { label: '說話', draft: '你好。' }
      ] }
    ] }]
  });
  const frozen = deepFreeze(shop());

  // creation per type
  for (const type of ['meters', 'stats', 'list', 'actions']) {
    const r = C.addSection(C.addPanel(null).draft, 0, type);
    assert.equal(r.ok, true, type);
    assert.equal(r.draft.panels[0].sections[0].type, type);
  }
  assert.equal(C.addSection(C.addPanel(null).draft, 0, 'hologram').reason, 'section_type_not_supported');
  assert.equal(C.addChildSection(C.addSection(C.addPanel(null).draft, 0, 'tabs').draft, 0, 0, 0, 'tabs').reason, 'section_type_not_supported');

  // edits touch only their node; unknown fields everywhere survive; input never changes
  let r = C.setField(frozen, { panel: 0, section: 2, item: 0 }, 'hint', '6 金幣');
  assert.equal(r.ok, true);
  const want = shop(); want.panels[0].sections[2].items[0].hint = '6 金幣';
  same(r.draft, want);
  r = C.setField(frozen, { panel: 0, section: 1 }, 'limit', '12');
  assert.equal(r.draft.panels[0].sections[1].limit, 12);
  assert.equal(r.draft.panels[0].sections[1].x_l, true);
  assert.equal(C.setField(frozen, { panel: 0, section: 1 }, 'limit', '').draft.panels[0].sections[1].limit, undefined);
  assert.equal(C.setField(frozen, { panel: 0, section: 1 }, 'path', 'modules.log.lines').draft.panels[0].sections[1].path, 'modules.log.lines');
  assert.equal(C.setField(frozen, { panel: 0, section: 0, item: 0 }, 'path', 'modules.player.silver').ok, true);
  assert.equal(C.setField(frozen, { panel: 0, section: 1 }, 'label', 'x').reason, 'field_not_editable');
  assert.equal(C.setField(frozen, { panel: 0, section: 2, item: 0 }, 'effect', {}).reason, 'field_not_editable', 'effect is edited only through the effect operations');
  r = C.moveItem(frozen, 0, 2, 0, 1);
  assert.deepEqual(r.draft.panels[0].sections[2].items.map(i => i.label), ['說話', '買藥水']);
  assert.equal(r.draft.panels[0].sections[2].items[1].effect.x_e, 1, 'a moved action keeps its effect and unknown fields');
  assert.equal(C.addItem(frozen, 0, 0).draft.panels[0].sections[0].items[2].path, '');
  assert.equal(C.removeItem(frozen, 0, 2, 1).draft.panels[0].sections[2].items.length, 1);

  // effect editing
  const T = { panel: 0, section: 2, item: 0 };
  r = C.setEffectEntryField(frozen, T, 'changes', 0, 'delta', '-8');
  assert.equal(r.draft.panels[0].sections[2].items[0].effect.changes[0].delta, -8);
  assert.equal(r.draft.panels[0].sections[2].items[0].effect.x_e, 1, 'effect unknown field kept');
  assert.equal(C.setEffectEntryField(frozen, T, 'changes', 0, 'delta', 'abc').reason, 'not_a_number');
  assert.equal(C.setEffectEntryField(frozen, T, 'changes', 0, 'delta', '').reason, 'not_a_number', 'delta cannot be emptied');
  assert.equal(C.setEffectEntryField(frozen, T, 'items', 0, 'name', '紅藥水').draft.panels[0].sections[2].items[0].effect.items[0].name, '紅藥水');
  assert.equal(C.setEffectEntryField(frozen, T, 'changes', 0, 'bogus', 1).reason, 'field_not_editable');
  assert.equal(C.setEffectEvent(frozen, T, '賣掉').draft.panels[0].sections[2].items[0].effect.event, '賣掉');
  assert.equal(C.setEffectEvent(frozen, { panel: 0, section: 2, item: 1 }, 'x').reason, 'no_effect');
  // adding creates the effect on a plain action, and respects the platform cap of 8
  const plain = { panel: 0, section: 2, item: 1 };
  r = C.addEffectEntry(frozen, plain, 'changes');
  assert.deepEqual(r.draft.panels[0].sections[2].items[1].effect, { changes: [{ path: '', delta: -1 }] });
  let many = shop();
  for (let i = 0; i < 8; i += 1) many = C.addEffectEntry(many, plain, 'items').draft;
  assert.equal(C.addEffectEntry(many, plain, 'items').reason, 'effect_limit');
  // removing the last entry removes the effect (an effect with only an event is not an effect)
  r = C.removeEffectEntry(frozen, T, 'changes', 0);
  assert.equal(r.draft.panels[0].sections[2].items[0].effect.changes, undefined);
  assert.ok(r.draft.panels[0].sections[2].items[0].effect.items);
  r = C.removeEffectEntry(r.draft, T, 'items', 0);
  assert.equal(r.effectRemoved, true);
  assert.equal('effect' in r.draft.panels[0].sections[2].items[0], false);
  assert.equal('effect' in C.removeEffect(frozen, T).draft.panels[0].sections[2].items[0], false);
  assert.equal(JSON.stringify(frozen), JSON.stringify(shop()), 'no operation touched the frozen input');
  // unknown fields survive all of it
  same(C.setField(shop(), { panel: 0 }, 'label', '商店'), { ok: true, draft: shop(), rewrittenLayout: [] });

  // diagnostics: stats / actions items, list path, effect parts
  const bad = {
    version: 1, panels: [{ id: 'a', sections: [
      { type: 'stats', items: [{ label: 'ok', path: 'time' }, { label: 'none' }, { label: 'bad', path: 'x y' }] },
      { type: 'list', path: '' },
      { type: 'list', path: 'not.valid' },
      { type: 'actions', items: [
        { label: 'text', draft: 'hi' },
        { label: 'empty' },
        { label: 'badfx', draft: 'x', effect: { changes: [{ path: 'modules.p.gold', delta: 0 }, { path: 'modules.p.gold', delta: -1 }, { path: 'modules.p.gold', delta: -2 }], items: [{ path: 'modules.p.gold', id: 'i', delta: 1 }, { path: 'modules.bag', id: 'i', delta: 1 }] } },
        { label: 'noentries', draft: 'x', effect: {} }
      ] }
    ] }]
  };
  const snap = JSON.stringify(bad);
  const rep = C.analyzeDraft(bad, Core);
  assert.equal(JSON.stringify(bad), snap);
  const find = path => rep.nodes.find(n => JSON.stringify(n.path) === JSON.stringify(path));
  const sec = i => ['panels', 0, 'sections', i];
  assert.equal(find(sec(0).concat('items', 0)).status, 'ok');
  assert.equal(find(sec(0).concat('items', 1)).reason, 'stat_path_missing');
  assert.equal(find(sec(0).concat('items', 2)).reason, 'stat_path_invalid');
  assert.equal(find(sec(1)).reason, 'section_path_missing');
  assert.equal(find(sec(2)).reason, 'section_path_invalid');
  assert.equal(find(sec(3).concat('items', 0)).status, 'ok');
  assert.equal(find(sec(3).concat('items', 1)).reason, 'action_needs_draft_or_effect');
  assert.equal(find(sec(3).concat('items', 2)).reason, 'action_effect_invalid', 'a bad effect fails closed, even with a draft text');
  assert.equal(find(sec(3).concat('items', 2, 'effect', 'changes', 0)).reason, 'effect_change_invalid');
  assert.equal(find(sec(3).concat('items', 2, 'effect', 'changes', 1)), undefined, 'a valid first use of a path is not flagged');
  assert.equal(find(sec(3).concat('items', 2, 'effect', 'changes', 2)).reason, 'effect_change_duplicate_path');
  assert.equal(find(sec(3).concat('items', 2, 'effect', 'items', 0)).reason, 'effect_item_invalid');
  assert.equal(find(sec(3).concat('items', 3, 'effect')).reason, 'effect_empty');
  // what the preview keeps equals what the diagnostics call ok
  const okItems = rep.nodes.filter(n => n.kind === 'item' && (n.status === 'ok' || n.status === 'trimmed')).length;
  const shown = rep.schema.panels[0].sections.reduce((n, s) => n + (s.items ? s.items.length : 0), 0);
  assert.equal(shown, okItems);

  // test state + trial with the production executor
  const ts = C.buildTestState(shop(), {}, Core);
  assert.equal(ts.state.modules.player.gold, 20);
  assert.deepEqual(ts.state.modules.inventory, []);
  assert.deepEqual(ts.state.moduleDefinitions.map(d => `${d.id}:${d.kind}`).sort(), ['inventory:collection', 'player:object']);
  assert.equal(ts.state.modules.log === undefined, true);
  assert.deepEqual(ts.state.events, ['範例 1', '範例 2', '範例 3'], 'a list on a top-level path gets sample rows');
  assert.equal(ts.state.location, '範例');
  assert.deepEqual(ts.entries.map(e => e.role), ['effect', 'text'], 'effect resource first, then the location text (the gold stat shares the effect path)');
  assert.equal(C.buildTestState({ version: 1, panels: [{ sections: [{ type: 'list', path: 'modules.log.lines' }] }] }, {}, Core).state.modules.log.lines.length, 3);
  assert.equal(C.buildTestState(shop(), { 'modules.player.gold': 3 }, Core).state.modules.player.gold, 3);

  const ok = C.trialAction(shop(), T, {}, Core);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.changes, [{ path: 'modules.player.gold', from: 20, to: 15 }]);
  assert.deepEqual(ok.items, [{ path: 'modules.inventory', id: 'potion', from: 0, to: 1 }]);
  const poor = C.trialAction(shop(), T, {}, Core, 'empty');
  assert.equal(poor.ok, false);
  assert.match(poor.reason, /資源不足/);
  assert.equal(C.trialAction(shop(), T, { 'modules.player.gold': 2 }, Core).ok, false, 'a low test value fails the same way');
  assert.equal(C.trialAction(shop(), plain, {}, Core).ok, false);
  assert.match(C.trialAction(shop(), plain, {}, Core).reason, /沒有自動結算/);
  const before = JSON.stringify(shop());
  C.trialAction(shop(), T, {}, Core);
  assert.equal(JSON.stringify(shop()), before);
  // an invalid effect is reported by the executor, not crashed on
  const broken = shop(); broken.panels[0].sections[2].items[0].effect.changes[0].delta = 0;
  assert.equal(C.trialAction(broken, T, {}, Core).ok, false);
}

// ---- P3: cards / timeline / location_archive / tabs / layout ---------------------------------
{
  const reasons = d => Composer.analyzeDraft(d, Core).nodes.map(n => `${n.path.join('.')}:${n.reason}`);
  const base = () => Composer.addPanel(null).draft;
  const add = (d, type) => Composer.addSection(d, 0, type);

  // new section types are created, normalize keeps them, and ops never mutate their input
  for (const type of ['cards', 'timeline', 'location_archive', 'tabs']) {
    const before = base();
    const snap = JSON.stringify(before);
    const r = add(before, type);
    assert.equal(r.ok, true, type);
    assert.equal(JSON.stringify(before), snap, 'input untouched');
    assert.equal(r.draft.panels[0].sections[0].type, type);
  }

  // enum fields: refused when unknown, removed when emptied, unknown siblings preserved
  let d = add(base(), 'cards').draft;
  d.panels[0].sections[0].x_keep = { a: 1 };
  assert.equal(Composer.setField(d, { panel: 0, section: 0 }, 'variant', 'bogus').reason, 'value_not_allowed');
  const q = Composer.setField(d, { panel: 0, section: 0 }, 'variant', 'quest');
  assert.equal(q.draft.panels[0].sections[0].variant, 'quest');
  assert.deepEqual(q.draft.panels[0].sections[0].x_keep, { a: 1 });
  assert.equal('variant' in Composer.setField(q.draft, { panel: 0, section: 0 }, 'variant', '').draft.panels[0].sections[0], false);

  // hand-written bad enum is reported, not silently fixed
  const bad = base(); bad.panels[0].sections = [{ type: 'cards', path: 'modules.a.b', variant: 'nope' }];
  assert.ok(reasons(bad).includes('panels.0.sections.0.variant:enum_value_unknown'));

  // location_archive: invalid path reset reported
  const arch = base(); arch.panels[0].sections = [{ type: 'location_archive', time_path: 'nonsense', area_path: 'nonsense' }];
  const ar = reasons(arch);
  assert.ok(ar.includes('panels.0.sections.0.time_path:archive_time_path_reset'), ar.join());
  assert.ok(ar.includes('panels.0.sections.0.area_path:archive_path_cleared'), ar.join());

  // timeline round_diff: items + duplicate path
  const tl = base(); tl.panels[0].sections = [{ type: 'timeline', mode: 'round_diff', items: [{ label: 'a', path: 'time' }, { label: 'b', path: 'time' }] }];
  assert.ok(reasons(tl).includes('panels.0.sections.0.items.1:timeline_item_duplicate_path'), reasons(tl).join());
  assert.equal(Composer.addItem(tl, 0, 0).ok, true);

  // tabs: add/remove/move/rename keep default_tab coherent and unknown fields intact
  let t = add(base(), 'tabs').draft;
  t.panels[0].sections[0].x_keep = 1;
  t.panels[0].sections[0].tabs[0].x_tab = 'k';
  t = Composer.addTab(t, 0, 0).draft;
  assert.equal(t.panels[0].sections[0].tabs.length, 2);
  assert.notEqual(t.panels[0].sections[0].tabs[0].id, t.panels[0].sections[0].tabs[1].id);
  t = Composer.setField(t, { panel: 0, section: 0 }, 'default_tab', t.panels[0].sections[0].tabs[1].id).draft;
  const oldId = t.panels[0].sections[0].tabs[1].id;
  t = Composer.setTabField(t, 0, 0, 1, 'id', 'renamed').draft;
  assert.equal(t.panels[0].sections[0].default_tab, 'renamed');
  assert.equal(Composer.setTabField(t, 0, 0, 1, 'x', 'y').reason, 'field_not_editable');
  t = Composer.moveTab(t, 0, 0, 1, 0).draft;
  assert.equal(t.panels[0].sections[0].tabs[0].id, 'renamed');
  assert.equal(t.panels[0].sections[0].tabs[1].x_tab, 'k');
  t = Composer.removeTab(t, 0, 0, 0).draft;
  assert.equal('default_tab' in t.panels[0].sections[0], false);
  assert.equal(t.panels[0].sections[0].x_keep, 1);
  assert.ok(oldId);
  assert.equal(Composer.removeTab(t, 0, 0, 9).reason, 'out_of_range');
  // tab limit
  let many = add(base(), 'tabs').draft;
  for (let i = 1; i < Core.MAX_TABS; i++) many = Composer.addTab(many, 0, 0).draft;
  assert.equal(Composer.addTab(many, 0, 0).reason, 'tab_limit');

  // default_tab pointing at nothing is reported
  const ghost = Composer.addChildSection(add(base(), 'tabs').draft, 0, 0, 0, 'stats').draft;
  ghost.panels[0].sections[0].tabs[0].sections[0].items[0].path = 'time'; ghost.panels[0].sections[0].default_tab = 'gone';
  assert.ok(reasons(ghost).includes('panels.0.sections.0.default_tab:tabs_default_not_found'), reasons(ghost).join());

  // child sections: nested editing, items, effects and test state reach into tabs
  let n = add(base(), 'tabs').draft;
  n = Composer.addChildSection(n, 0, 0, 0, 'meters').draft;
  assert.equal(Composer.addChildSection(n, 0, 0, 0, 'tabs').reason, 'section_type_not_supported');
  n = Composer.addItem(n, 0, [0, 0, 0]).draft;
  n = Composer.setField(n, { panel: 0, section: 0, tab: 0, child: 0, item: 0 }, 'label', 'HP').draft;
  n = Composer.setField(n, { panel: 0, section: 0, tab: 0, child: 0, item: 0 }, 'value_path', 'modules.hp.value').draft;
  assert.equal(n.panels[0].sections[0].tabs[0].sections[0].items[0].label, 'HP');
  const ts = Composer.buildTestState(n, {}, Core).state;
  assert.equal(Core.getPath(ts, 'modules.hp.value') !== undefined, true);
  const moved = Composer.addChildSection(n, 0, 0, 0, 'stats').draft;
  assert.equal(Composer.moveChildSection(moved, 0, 0, 0, 1, 0).draft.panels[0].sections[0].tabs[0].sections[0].type, 'stats');
  assert.equal(Composer.removeChildSection(moved, 0, 0, 0, 0).draft.panels[0].sections[0].tabs[0].sections.length, 1);

  // sample data for new section kinds
  const sample = base(); sample.panels[0].sections = [
    { type: 'cards', path: 'modules.codex.entries' },
    { type: 'timeline', mode: 'history', path: 'modules.log.events' },
    { type: 'location_archive', area_path: 'modules.map.area', destinations_path: 'modules.map.dest' }
  ];
  const st = Composer.buildTestState(sample, {}, Core).state;
  assert.ok(Array.isArray(Core.getPath(st, 'modules.codex.entries')));
  assert.ok(Array.isArray(Core.getPath(st, 'modules.log.events')));
  assert.ok(Array.isArray(Core.getPath(st, 'modules.map.dest')));
  assert.equal(typeof Core.getPath(st, 'modules.map.area'), 'string');

  // layout: canonical set removes the alias, unknown keys survive, enums validated
  let L = { panels: [], layout: { preset: 'rpg-dashboard', left: 'a', x_keep: 5 } };
  const l1 = Composer.setLayoutField(L, 'left_panel', 'b');
  assert.deepEqual(l1.draft.layout, { preset: 'rpg-dashboard', left_panel: 'b', x_keep: 5 });
  assert.equal(Composer.setLayoutField(L, 'preset', 'nope').reason, 'value_not_allowed');
  assert.equal(Composer.setLayoutField(L, 'mystery', 'x').reason, 'field_not_editable');
  assert.equal(Composer.setLayoutField({ layout: 'str' }, 'preset', 'terminal').reason, 'layout_not_object');
  const cleared = Composer.setLayoutField({ panels: [], layout: { preset: 'terminal' } }, 'preset', '');
  assert.equal('layout' in cleared.draft, false);
  assert.ok(reasons({ ...Composer.addSection(base(), 0, 'location_archive').draft, layout: { scene_fit: 'zoom' } }).includes('layout.scene_fit:enum_value_unknown'));
}

console.log('Gameplay UI composer core PASS: exports, normalize immutability, draft preservation, preview protocol');
