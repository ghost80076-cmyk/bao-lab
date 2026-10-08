const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let resolve, calls = 0;
const sandbox = {
  GameState: { current: {} },
  WorldStateEngine: {
    enabled: () => true,
    update: () => { calls++; return new Promise(done => { resolve = done; }); }
  },
  window: null
};
sandbox.window = sandbox;
vm.runInNewContext(fs.readFileSync('js/world-state-cost.js', 'utf8'), sandbox);
(async () => {
  const config = { api: { key: 'test' }, cost: { stateInterval: 1 } };
  const first = sandbox.WorldStateEngine.update(config, 'one', 'one');
  await sandbox.WorldStateEngine.update(config, 'two', 'two');
  assert.equal(calls, 1, 'concurrent turns cannot send the same pending batch twice');
  resolve({ time: 'now' });
  await first;
  assert.equal(sandbox.GameState.current.pendingStateTurns.length, 1);
  assert.equal(sandbox.GameState.current.pendingStateTurns[0].player, 'two');
  const retry = sandbox.WorldStateEngine.update(config, 'three', 'three');
  assert.equal(calls, 2, 'lock releases after completion');
  resolve(null);
  await retry;
  assert.equal(sandbox.GameState.current.pendingStateTurns.length, 2, 'failed batches remain queued');
  console.log('world state concurrency core test passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
