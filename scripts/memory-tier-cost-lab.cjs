'use strict';
// Read-only, synthetic memory-tier cost comparison; no provider calls or storage writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const bytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
const digest = values => createHash('sha256').update(JSON.stringify(values)).digest('hex');
const evidence = items => items.map(m => [m.id, m.role, m.content, m.context_content || '']);

function story(rounds) {
  assert.ok(Number.isInteger(rounds) && rounds >= 40 && rounds <= 1000);
  const messages = [];
  for (let i = 1; i <= rounds; i++) {
    const event = i % 40 === 1 ? '曾在港口訂下承諾：保守密碼與來源。' : '調查港口寄來的舊信。';
    messages.push({
      id: 'player-' + i, role: 'user',
      content: '第' + i + '輪：旅人詢問艾琳。' + event + '她只說了自己確實知道的事。'.repeat(6)
    }, {
      id: 'reply-' + i, role: 'assistant',
      content: '第' + i + '輪：艾琳依現有知情與人物關係回答。' +
        '街道的燈火映在窗上，她沒有擅自替旅人決定下一步。'.repeat(17)
    });
  }
  return messages;
}
function chapterProof(messages) { return digest(evidence(messages)); }
function chaptersFor(messages, coveredMessages, chapterRounds = 20) {
  const result = [];
  const end = Math.min(messages.length, coveredMessages);
  for (let start = 0; start < end; start += chapterRounds * 2) {
    const stop = Math.min(end, start + chapterRounds * 2);
    const covered = messages.slice(start, stop);
    if (!covered.length || covered.length % 2 !== 0 || covered[0].role !== 'user' ||
      covered[covered.length - 1].role !== 'assistant') throw Error('Only complete turns may be chapter sources.');
    const first = start / 2 + 1, last = stop / 2;
    result.push({
      id: 'chapter-' + (result.length + 1), start, stop, first, last,
      digest: chapterProof(covered),
      // Fixture only: not AI-generated text and NOT evidence of summarization quality.
      text: '【章節】第' + first + '至' + last +
        '輪。艾琳與旅人仍在港口調查舊信；承諾未解除。各角色的知情範圍依原文與獨立索引，不得由本句推定。'
    });
  }
  return result;
}
function validChapter(chapter, messages) {
  if (!chapter || chapter.stop > messages.length || chapter.stop <= chapter.start ||
    (chapter.stop - chapter.start) % 2 !== 0) return false;
  const slice = messages.slice(chapter.start, chapter.stop);
  return slice.length === chapter.stop - chapter.start &&
    slice[0]?.role === 'user' && slice.at(-1)?.role === 'assistant' &&
    chapterProof(slice) === chapter.digest;
}
function select(chapters, messages, query, max = 2) {
  const wanted = String(query || '').match(/^chapter-(\d+)$/);
  if (!wanted) return [];
  return chapters.filter(c => c.id === wanted[0] && validChapter(c, messages)).slice(0, max);
}
function chatRuntime() {
  const runtime = { console, GameState: { current: {} }, BAOHelperData: { narrativeMemoryRules: '' } };
  runtime.window = runtime;
  vm.createContext(runtime);
  const source = fs.readFileSync(path.resolve(__dirname, '../js/chat.js'), 'utf8');
  vm.runInContext(source + '\nwindow.Chat = Chat;', runtime, { filename: 'js/chat.js' });
  runtime.Chat.renderGuard = () => {};
  return runtime.Chat;
}
async function scenario(rounds) {
  const messages = story(rounds);
  const chat = chatRuntime();
  chat.messages = messages;
  // The fixture represents an already-successful summary for completed turns.
  // No LLM generation, meaning/recall grading, or provider billing is simulated.
  chat.summary = [
    '【重要事件】港口的舊信仍在調查，尚未解決。',
    '【人物關係】艾琳與旅人仍在合作，沒有自動改變立場。',
    '【約定】最初確定的保密承諾仍有效。',
    '【知情】秘密不可視作所有角色已知。',
    '【其他前情】'.concat('早期事件只能沿用已證實的來源與結果。'.repeat(28))
  ].join('\n');
  const covered = (rounds - 20) * 2;
  chat.summarizedUntil = covered;
  const config = { memory: { mode: 'smart', maxRounds: 20, summaryInterval: 4, maxContext: 64000 } };
  const smart = await chat.context(config);
  const raw = smart.filter(m => m.role !== 'system');
  const all = chaptersFor(messages, covered, 20);
  const retrieved = select(all, messages, 'chapter-1');
  const synopsis = '【長期大綱｜合成示例】港口舊信尚未解決，艾琳與旅人合作。初始保密承諾有效；角色知情必須另核對來源。';
  const candidate = [{ role: 'system', content: synopsis },
    ...retrieved.map(c => ({ role: 'system', content: c.text })), ...raw];
  const naive = [{ role: 'system', content: synopsis },
    ...all.map(c => ({ role: 'system', content: c.text })), ...raw];
  // The actual Chat.context output is used as baseline. Its uncompressed
  // raw suffix remains byte-for-byte identical in both hypothetical strategies.
  assert.equal(JSON.stringify(candidate.slice(-raw.length)), JSON.stringify(raw));
  chat.lastStoryPromptTokens = 0;
  const full = await chat.context({ memory: { ...config.memory, mode: 'full' } });
  assert.equal(full.length, messages.length);
  return {
    rounds, chapters: all.length, verified: all.every(c => validChapter(c, messages)),
    totalHistoryBytes: bytes(full), smartBytes: bytes(smart),
    allChaptersBytes: bytes(naive), selectiveBytes: bytes(candidate),
    selected: retrieved.map(c => c.id),
    relativeToSmartBytes: bytes(candidate) - bytes(smart), 
    // Unknown: model tokenizer, cache, helper/summary/distillation calls and price.
    providerCalls: null, providerTokens: null, cost: null
  };
}
async function compare() { return Promise.all([100, 500, 1000].map(scenario)); }
if (require.main === module) {
  compare().then(rows => {
    console.log('SYNTHETIC historical-context bytes only; NOT a provider Token, cost, or recall-quality benchmark.');
    console.table(rows.map(({rounds,chapters,smartBytes,selectiveBytes,allChaptersBytes,relativeToSmartBytes}) =>
      ({rounds,chapters,smartBytes,selectiveBytes,allChaptersBytes,deltaBytes:relativeToSmartBytes})));
  }).catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = { story, chaptersFor, validChapter, select, scenario, compare };
