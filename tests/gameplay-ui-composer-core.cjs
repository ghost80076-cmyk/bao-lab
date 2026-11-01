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
assert.equal(report.summary.incomplete, 2);
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



// Whole-schema diagnostics must agree with the runtime, including filtered siblings.
const validPanel = { id: 'same', sections: [meterSection] };
const duplicates = Composer.analyzeDraft({ version: 1, panels: [validPanel, validPanel] }, Core);
assert.equal(duplicates.schema.panels.length, 1);
assert.ok(duplicates.nodes.some(n => n.reason === 'duplicate_panel_id'));
for (const raw of [{ version: 99, panels: [validPanel] }, { enabled: false, panels: [validPanel] }, {}]) {
  const result = Composer.analyzeDraft(raw, Core);
  assert.equal(result.schema, null);
  assert.ok(result.summary.problems > 0, 'an unusable schema cannot report a clean draft');
}
const nested = { version: 1, panels: [{ id: 'p', sections: [{ type: 'tabs', tabs: [
  { id: 'one', sections: [meterSection, { type: 'tabs', tabs: [] }] },
  { id: 'one', sections: [meterSection] }
] }] }] };
const nestedReport = Composer.analyzeDraft(nested, Core);
assert.ok(nestedReport.nodes.some(n => n.reason === 'duplicate_tab_id'));
assert.ok(nestedReport.nodes.some(n => n.reason === 'section_invalid_or_empty' && n.path.length > 4));
const demoRoundTrip = demo();
demoRoundTrip.future = { preserve: [1, 2] };
const untouched = Composer.cloneDraft(demoRoundTrip);
Composer.analyzeDraft(untouched, Core);
assert.deepEqual(untouched, demoRoundTrip, 'unknown fields survive a no-edit round trip');
assert.equal(ok(msg('render', { schema: { note: '漢'.repeat(100000) } })).reason, 'payload_too_large');
assert.equal(ok(msg('render', { schema: { note: '😀'.repeat(70000) } })).reason, 'payload_too_large');
assert.equal(ok(msg('render', { schema: { note: '漢'.repeat(1000) } })).ok, true);

console.log('Gameplay UI composer core PASS: exports, immutability, diagnostics, nested tabs, round trip, UTF-8 protocol');
