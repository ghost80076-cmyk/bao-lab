'use strict';
const assert = require('node:assert/strict');
const core = require('../js/memory-core.js');

(async () => {
  for (const fail of ['accept', 'flush', 'readback', 'durability', 'source', 'replacement']) {
    const old = { offset: 4, summary: '已保存的摘要' }, candidate = { offset: 8, summary: '新批次' };
    const owner = { job: old, draft: '玩家草稿' }, other = { offset: 12 };
    let current = true, disk, writes = 0;
    await assert.rejects(core.commitState({ owner, changes: { job: candidate, draft: undefined },
      isCurrent: () => current,
      save: () => { writes++; disk = structuredClone(owner); return fail !== 'accept'; },
      flush: async () => {
        if (fail === 'flush') throw new Error('disk offline');
        if (fail === 'source') current = false;
        if (fail === 'replacement') owner.job = other;
      },
      load: () => ({ state: fail === 'readback' ? { job: old } : disk }),
      verify: () => ({ ok: fail !== 'durability' })
    }));
    assert.equal(writes, 1);
    assert.equal(owner.job, fail === 'replacement' ? other : old, fail);
    assert.equal(owner.draft, '玩家草稿', fail);
  }
  const owner = { job: { offset: 2 }, draft: '舊草稿' }, next = { offset: 4 };
  let release, written = false;
  const save = core.commitState({owner, changes: {job: next}, isCurrent: () => true,
    save: () => true, flush: () => new Promise(resolve => {release = resolve;}),
    load: () => ({state: structuredClone(owner)}), verify: () => ({ok: true})
  }).then(() => {written = true;});
  await Promise.resolve(); await Promise.resolve();
  assert.equal(written, false, 'save acceptance cannot signal a durable checkpoint');
  release(); await save;
  assert.equal(owner.job, next);
  let calls = 0;
  await assert.rejects(core.commitState({owner,changes:{job:{}},isCurrent:()=>false,save:()=>calls++}), /來源已變更/);
  assert.equal(calls, 0);
  console.log('Checkpoint persistence: awaits flush, exact readback, durability, stale-source and rollback ownership passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
