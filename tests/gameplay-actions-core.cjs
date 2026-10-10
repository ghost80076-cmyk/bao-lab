'use strict';
const assert = require('node:assert/strict');
const Core = require('../js/gameplay-ui-core.js');

const purchase = {
  changes: [
    { path: 'modules.economy.crystals', delta: -15 },
    { path: 'modules.supplies.cans', delta: 1 }
  ],
  event: '購買罐頭：晶核 -15，罐頭 +1'
};

const makeState = () => ({
  time: '災變前1天',
  events: ['開始'],
  moduleDefinitions: [
    { id: 'economy', kind: 'object' },
    { id: 'supplies', kind: 'object' },
    { id: 'inventory', kind: 'collection' }
  ],
  modules: {
    economy: { crystals: 20, other: { value: 7 } },
    supplies: { cans: 0 },
    inventory: []
  }
});

const rawSchema = {
  version: 1,
  builder: { fields: [] },
  panels: [{ id: 'shop', label: '商店', sections: [{
    type: 'actions',
    title: '交易',
    items: [
      { label: '購買罐頭', effect: purchase },
      { label: '詢問價格', draft: '請問罐頭多少錢？' },
      { label: '不安全設定', draft: '文字', effect: { changes: [{ path: 'modules.economy.__proto__.polluted', delta: 1 }] } }
    ]
  }] }]
};

const schema = Core.normalize(rawSchema);
assert.ok(schema, 'opt-in Gameplay UI schema should normalize');
const items = schema.panels[0].sections[0].items;
assert.equal(items.length, 2, 'invalid effect must fail closed');
assert.equal(items[0].draft, '', 'effect action does not require a prompt draft');
assert.equal(items[1].draft, '請問罐頭多少錢？', 'legacy draft actions must remain intact');
assert.deepEqual(items[0].effect, purchase);

const state = makeState();
const beforeModules = state.modules;
const result = Core.executeActionEffect(state, items[0].effect);
assert.equal(result.ok, true, 'valid purchase should succeed');
assert.equal(state.modules.economy.crystals, 5);
assert.equal(state.modules.supplies.cans, 1);
assert.equal(state.modules.economy.other.value, 7, 'unrelated state is preserved');
assert.deepEqual(state.modules.inventory, [], 'collection is left untouched');
assert.notStrictEqual(state.modules, beforeModules, 'commit replaces module snapshot atomically');

const failInsufficient = makeState();
failInsufficient.modules.economy.crystals = 14;
const snapshotInsufficient = structuredClone(failInsufficient);
assert.equal(Core.executeActionEffect(failInsufficient, purchase).ok, false);
assert.deepEqual(failInsufficient, snapshotInsufficient, 'failure must not deduct or grant');

const failUninitialized = makeState();
delete failUninitialized.modules.supplies.cans;
const snapshotUninitialized = structuredClone(failUninitialized);
assert.equal(Core.executeActionEffect(failUninitialized, purchase).ok, false);
assert.deepEqual(failUninitialized, snapshotUninitialized, 'uninitialized item counter must not be invented');

const failModule = makeState();
failModule.moduleDefinitions.splice(1, 1);
const snapshotModule = structuredClone(failModule);
assert.equal(Core.executeActionEffect(failModule, purchase).ok, false);
assert.deepEqual(failModule, snapshotModule, 'disabled or undeclared modules must not be modified');

assert.equal(Core.normalizeActionEffect({ changes: [
  { path: 'modules.economy.crystals', delta: -10 },
  { path: 'modules.economy.crystals', delta: 5 }
] }), null, 'duplicate paths are rejected');
assert.equal(Core.normalizeActionEffect({ changes: [{ path: 'modules.economy.crystals', delta: -1.5 }] }), null);
assert.equal(Core.normalizeActionEffect({ changes: [{ path: 'modules.economy.crystals', delta: '5' }] }), null);
assert.equal(Core.normalizeActionEffect({ changes: [{ path: 'modules.economy.crystals', delta: 1000001 }] }), null);
assert.equal(Core.normalizeActionEffect({ changes: [{ path: 'modules.economy.constructor.bad', delta: 1 }] }), null);
assert.equal(Core.normalizeActionEffect({ changes: Array.from({ length: 9 }, () => ({ path: 'modules.economy.crystals', delta: 1 })) }), null);

const maxState = makeState();
maxState.modules.supplies.cans = 1000000000;
const maxSnapshot = structuredClone(maxState);
assert.equal(Core.executeActionEffect(maxState, { changes: [{ path: 'modules.supplies.cans', delta: 1 }] }).ok, false);
assert.deepEqual(maxState, maxSnapshot, 'overflow must not modify state');

const collState = makeState();
assert.equal(Core.executeActionEffect(collState, { changes: [{ path: 'modules.inventory.count', delta: 1 }] }).ok, false);
assert.equal(Object.prototype.polluted, undefined, 'prototype pollution must not occur');

console.log('gameplay atomic action core: OK');

const racing = makeState();
const baseline = Core.captureActionVersions(racing);
assert.equal(Core.executeActionEffect(racing, purchase).ok, true);
const stale = { modules: { economy: { crystals: 20, other: { value: 9 } }, supplies: { cans: 0 } } };
const reconciled = Core.reconcileActionUpdate(racing, stale, baseline);
assert.equal(reconciled.modules.economy.crystals, 5, 'late AI result cannot undo a debit');
assert.equal(reconciled.modules.supplies.cans, 1, 'late AI result cannot undo a grant');
assert.equal(reconciled.modules.economy.other.value, 9, 'unrelated AI updates still apply');
assert.equal(stale.modules.economy.crystals, 20, 'input update is not mutated');
const freshBaseline = Core.captureActionVersions(racing);
assert.deepEqual(Core.reconcileActionUpdate(racing, stale, freshBaseline), stale, 'future requests can update counters normally');
const restored = JSON.parse(JSON.stringify(racing));
assert.deepEqual(Core.captureActionVersions(restored), freshBaseline, 'versions survive story backup');
assert.equal(Core.executeActionEffect(racing, purchase).ok, false);
assert.deepEqual(Core.captureActionVersions(racing), freshBaseline, 'failed transaction does not advance versions');
const omitted = Core.reconcileActionUpdate(racing, { modules: { economy: { other: { value: 11 } } } }, baseline);
assert.equal(omitted.modules.economy.crystals, 5, 'full module replacement preserves even omitted locally modified fields');
assert.equal(omitted.modules.supplies, undefined, 'untouched modules are not invented');
console.log('gameplay action race reconciliation: OK');

const backpackPurchase = {
  changes: [{ path: 'modules.economy.crystals', delta: -15 }],
  items: [{ path: 'modules.inventory', id: 'cans', name: '罐頭', delta: 2 }],
  event: '購買兩份罐頭'
};
const backpack = makeState();
const itemBaseline = Core.captureActionVersions(backpack);
assert.equal(Core.executeActionEffect(backpack, backpackPurchase).ok, true);
assert.equal(backpack.modules.economy.crystals, 5);
assert.deepEqual(backpack.modules.inventory, [{ id: 'cans', name: '罐頭', quantity: 2 }]);
const consume = { items: [{ path: 'modules.inventory', id: 'cans', delta: -1 }] };
assert.equal(Core.executeActionEffect(backpack, consume).ok, true);
assert.equal(backpack.modules.inventory[0].quantity, 1);
const priorBackpack = structuredClone(backpack);
assert.equal(Core.executeActionEffect(backpack, backpackPurchase).ok, false);
assert.deepEqual(backpack, priorBackpack, 'insufficient money cannot grant backpack items');
assert.equal(Core.executeActionEffect(backpack, { changes: [{ path: 'modules.economy.crystals', delta: 10 }], items: [{ path: 'modules.inventory', id: 'cans', delta: -2 }] }).ok, false);
assert.deepEqual(backpack, priorBackpack, 'insufficient item cannot grant money');
const itemReconciled = Core.reconcileActionUpdate(backpack, { modules: { inventory: [] } }, itemBaseline);
assert.deepEqual(itemReconciled.modules.inventory, backpack.modules.inventory, 'late AI cannot erase a local backpack commit');
assert.equal(Core.executeActionEffect(backpack, consume).ok, true);
assert.equal(backpack.modules.inventory[0].quantity, 0, 'zero stock preserves item metadata');
assert.equal(Core.executeActionEffect(backpack, consume).ok, false);
for (const rows of [[{ id: 'x', quantity: 1 }, { id: 'x', quantity: 2 }], [{ name: 'no-id', quantity: 1 }], [{ id: 'x', quantity: '2' }]]) {
  const malformed = makeState(); malformed.modules.inventory = rows;
  const saved = structuredClone(malformed);
  assert.equal(Core.executeActionEffect(malformed, backpackPurchase).ok, false);
  assert.deepEqual(malformed, saved, 'ambiguous or invalid backpack rolls back the entire operation');
}
assert.equal(Core.normalizeActionEffect({ items: [{ path: 'modules.inventory', id: '__proto__', delta: 1 }] }), null);
assert.equal(Core.normalizeActionEffect({ items: [{ path: 'modules.inventory', id: 'cans', delta: 1 }, { path: 'modules.inventory', id: 'cans', delta: 2 }] }), null);
assert.equal(Core.normalizeActionEffect({ changes: [{ path: 'modules.inventory.count', delta: 1 }], items: [{ path: 'modules.inventory', id: 'cans', delta: 1 }] }), null);
assert.equal(Core.normalizeActionEffect({ changes: [] }), null);
assert.equal(Core.normalizeActionEffect({ changes: 'bad', items: [{ path: 'modules.inventory', id: 'cans', delta: 1 }] }), null);
const noName = makeState();
assert.equal(Core.executeActionEffect(noName, { items: [{ path: 'modules.inventory', id: 'new', delta: 1 }] }).ok, false);
const full = makeState(); full.modules.inventory = Array.from({length:100}, (_,i) => ({id:'item'+i,quantity:1}));
assert.equal(Core.executeActionEffect(full, backpackPurchase).ok, false);
assert.equal(full.modules.economy.crystals, 20);
console.log('gameplay backpack transactions: OK');
