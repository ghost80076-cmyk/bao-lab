'use strict';
const assert = require('node:assert/strict');
const lab = require('../scripts/memory-tier-cost-lab.cjs');
(async () => {
  const source = lab.story(100);
  const chapters = lab.chaptersFor(source, 160);
  assert.equal(chapters.length, 4);
  assert.ok(chapters.every(c => lab.validChapter(c, source)));
  assert.deepEqual(lab.select(chapters, source, 'chapter-1').map(c => c.id), ['chapter-1']);
  assert.equal(lab.select(chapters, source, 'chapter-40').length, 0);
  assert.equal(lab.select(chapters, source, 'no-chapter').length, 0);
  const changed = source.map(m => m.id === 'reply-4' ? { ...m, content: m.content + ' 被改寫' } : m);
  assert.equal(lab.validChapter(chapters[0], changed), false, 'rewritten original invalidates chapter');
  assert.equal(lab.select(chapters, changed, 'chapter-1').length, 0, 'stale source must not be retrieved');
  assert.equal(lab.validChapter(chapters[0], source.slice(0, 12)), false, 'rewind cannot keep a missing chapter');
  const reordered = source.slice();
  [reordered[2], reordered[3]] = [reordered[3], reordered[2]];
  assert.equal(lab.validChapter(chapters[0], reordered), false, 'reordered evidence invalidates chapter');

  const rows = await lab.compare();
  assert.deepEqual(rows.map(row => row.rounds), [100, 500, 1000]);
  for (const row of rows) {
    assert.equal(row.verified, true);
    assert.deepEqual(row.selected, ['chapter-1']);
    assert.ok(row.totalHistoryBytes > row.smartBytes,
      'actual Chat.context smart mode should omit successfully summarized raw history');
    assert.ok(row.allChaptersBytes > row.selectiveBytes,
      'injecting all archived chapters must cost more context bytes than selected recall');
    assert.equal(row.relativeToSmartBytes, row.selectiveBytes - row.smartBytes);
    assert.equal(row.cost, null);
    assert.equal(row.providerTokens, null);
    assert.equal(row.providerCalls, null);
  }
  console.log('PASS 100/500/1000-turn real Chat.context baseline, local hypothetical chapter selection, source invalidation, no fabricated provider costs');
})().catch(error => { console.error(error); process.exitCode = 1; });
