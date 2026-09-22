const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'chat-reading-scroll.js'), 'utf8');
const streaming = fs.readFileSync(path.join(__dirname, '..', 'js', 'streaming-ui.js'), 'utf8');

function harness({ fail = false, empty = false } = {}) {
  let resolveAPI;
  let called = 0;
  const pending = { classList: { contains: x => x === 'assistant' }, style: {}, isConnected: true,
    querySelector: x => x === '.bubble' ? { textContent: '正在生成……' } : null };
  const users = [];
  const stream = { scrollTop: 0, scrollHeight: 5000, clientHeight: 420,
    getBoundingClientRect: () => ({ top: 100 }),
    querySelectorAll: x => x === ':scope > .message.user' ? users : [] };
  const chat = { classList: { contains: x => x === 'active' } };
  const input = { value: empty ? '' : '我走過去。' };
  const api = { send: async () => new Promise(resolve => { resolveAPI = resolve; }) };
  const app = { sendMessage: async () => {
    called++;
    if (empty) return 'no-op';
    const player = { isConnected: true, nextElementSibling: pending,
      getBoundingClientRect: () => ({ top: 350 - stream.scrollTop }) };
    users.push(player);
    stream.scrollTop = 5000; // Legacy initial follow-to-bottom.
    await Promise.resolve();
    try {
      const response = await api.send({}, []);
      stream.scrollTop = 5000; // Legacy completion follow-to-bottom.
      return response;
    } catch (error) {
      player.isConnected = false;
      throw error;
    }
  } };
  const context = { window: { App: app, API: api }, App: app, API: api,
    document: { getElementById: id => ({ 'chat-stream': stream, 'chat-view': chat, 'user-input': input })[id] } };
  vm.runInNewContext(source, context);
  return { app, stream, pending, called: () => called,
    complete: value => resolveAPI(fail ? Promise.reject(Error('API failed')) : value) };
}

async function main() {
  assert.match(streaming, /const readingTop = stream\?\.scrollTop/);
  assert.doesNotMatch(streaming, /stream\.scrollTop\s*=\s*stream\.scrollHeight/,
    'streaming preview must not force the scrollbar to the bottom');
  assert.match(streaming, /js\/chat-reading-scroll\.js/, 'stream module loads reading controller');
  {
    const h = harness();
    const task = h.app.sendMessage();
    assert.equal(h.stream.scrollTop, 242, 'player turn positioned near top immediately');
    assert.equal(h.pending.style.minHeight, '420px', 'pending turn leaves reading space');
    await Promise.resolve();
    h.stream.scrollTop = 99; // The player scrolls upward while AI is working.
    h.complete('new story');
    assert.equal(await task, 'new story');
    assert.equal(h.stream.scrollTop, 99, 'completion does not steal player scroll');
    assert.equal(h.pending.style.minHeight, '', 'temporary reading space removed');
    assert.equal(h.called(), 1, 'original send invoked exactly once');
  }
  {
    const h = harness({ fail: true });
    const task = h.app.sendMessage();
    await Promise.resolve();
    h.complete();
    await assert.rejects(task, /API failed/);
    assert.equal(h.pending.style.minHeight, '', 'failure cleans up placeholder');
  }
  {
    const h = harness({ empty: true });
    assert.equal(await h.app.sendMessage(), 'no-op');
    assert.equal(h.stream.scrollTop, 0, 'empty send does not reposition');
    assert.equal(h.called(), 1);
  }
  console.log('PASS: initial player anchor, streaming non-follow, manual scroll, completion, failure, empty input');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
