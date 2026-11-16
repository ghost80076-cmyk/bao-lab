'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function fixture() {
  let calls = 0, saved = false;
  const ctx = vm.createContext({ console, setTimeout() {}, document: {
    querySelector: () => null, createElement: () => ({}), head: { appendChild() {} }
  }, App: { config: { memory: { mode: 'smart' } }, renderChatShell() {}, saveStory() { saved = true; return true; } },
  Chat: { summarizedUntil: 0, summary: '', async maybeSummarize() { calls++; this.summarizedUntil += 2; this.summary = 'confirmed batch ' + calls; } },
  GameState: { current: {} }, BAOStorageWriteGuard: { whenIdle: async () => !saved } });
  ctx.window = ctx;
  vm.runInContext(fs.readFileSync(process.env.MEMORY_WORKBENCH_SOURCE || 'js/memory-workbench-core.js', 'utf8'), ctx);
  return { ctx, calls: () => calls };
}
test('automatic memory stops at a failed durable checkpoint and retains the produced batch', async () => {
  const f = fixture();
  await f.ctx.BAOMemoryWorkbench.retryAutoMemory();
  assert.equal(f.calls(), 1, 'do not request another batch before this one has committed');
  assert.equal(f.ctx.Chat.summarizedUntil, 2);
  assert.equal(f.ctx.Chat.summary, 'confirmed batch 1');
  assert.match(f.ctx.Chat.memoryHealth.message, /尚未完成儲存/);
  await f.ctx.BAOMemoryWorkbench.retryAutoMemory();
  assert.equal(f.calls(), 1, 'retrying memory while storage is still failed must not call a model');
});
test('a controlled pending write blocks the next memory batch and duplicate retries', async () => {
  const f = fixture(); let release, checks = 0;
  f.ctx.BAOStorageWriteGuard.whenIdle = () => ++checks === 2 ? new Promise(resolve => { release = resolve; }) : Promise.resolve(true);
  const pending = f.ctx.BAOMemoryWorkbench.retryAutoMemory();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.equal(typeof release, 'function'); assert.equal(f.calls(), 1);
  await f.ctx.BAOMemoryWorkbench.retryAutoMemory(); assert.equal(f.calls(), 1);
  release(false); await pending; assert.equal(f.calls(), 1);
});
