const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const original = '<div class="scene" style="color:red">角色打開門。<br>交給玩家一封信。</div><style>HISTORY_MARKUP_SENTINEL</style><script>bad()</script>';
const messages = [{ role: 'assistant', content: original }, { role: 'user', content: '<b>玩家原始輸入</b>' }];
const chat = { messages, async context(config) { return config.memory.mode === 'full' ? this.messages : this.messages.slice(-2); } };
const sandbox = { window: { }, Chat: chat, App: {}, GameState: {} };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('js/global-bridge.js', 'utf8'), sandbox);
(async () => {
  for (const mode of ['full', 'rounds', 'smart']) {
    const context = await chat.context({ memory: { mode } });
    assert.match(context[0].content, /角色打開門。/);
    assert.match(context[0].content, /交給玩家一封信。/);
    assert.doesNotMatch(context[0].content, /<div|<br|style=|HISTORY_MARKUP_SENTINEL|bad\(\)/);
    assert.equal(context[1].content, '<b>玩家原始輸入</b>', 'player-authored content must remain untouched');
    assert.notEqual(context[0], messages[0], 'request history must be a copy');
    assert.equal(chat.messages[0].content, original, 'display and saved history must remain intact');
  }
  console.log('PASS: three context modes strip assistant presentation markup, retain narrative, preserve player text and original story.');
})().catch(error => { console.error(error); process.exitCode = 1; });
