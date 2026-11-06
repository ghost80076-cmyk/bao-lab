const assert = require('node:assert/strict');
const core = require('../js/character-studio-rehearsal-core.js');

assert.equal(core.destination('rain-port_01'), 'index.html?work=rain-port_01&rehearsal=1');
assert.throws(() => core.destination('中文 id'), /合法/);
assert.throws(() => core.destination(''), /合法/);

const ready = core.derive({
  dirty:false, installed:true, synced:true,
  report:{findings:[{severity:'info'}]}
});
assert.equal(ready.rehearsal.key, 'ready');
assert.equal(ready.diagnosis.key, 'clear');

const dirty = core.derive({
  dirty:true, installed:true, synced:false,
  report:{findings:[{severity:'warning'}]}
});
assert.equal(dirty.rehearsal.key, 'dirty');
assert.equal(dirty.diagnosis.warnings, undefined);
assert.equal(dirty.warnings, 1);

const blocked = core.derive({
  dirty:false, installed:false, synced:false,
  report:{findings:[{severity:'blocker'},{severity:'warning'}]}
});
assert.equal(blocked.rehearsal.key, 'blocked');
assert.equal(blocked.blockers, 1);
assert.equal(blocked.warnings, 1);

console.log('character studio rehearsal core: OK');
