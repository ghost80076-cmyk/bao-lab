const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../js/author-regex-core.js');
const input = '【开屏】【开屏1】【开屏2】 HP=<img src=x onerror=alert(1)>';
const raw = { regex_scripts: [
  { scriptName: '样式', findRegex: '【开屏】', replaceString: '<style>.a{color:red}</style>' },
  { scriptName: '画面', findRegex: '【开屏1】', replaceString: '<div class="a">主畫面</div>' },
  { scriptName: '互动', findRegex: '【开屏2】', replaceString: '<script>window.authorDemo=1</script>' },
  { scriptName: '状态', findRegex: '/HP=(.+)/g', replaceString: '<span class="status">$1</span>' }
] };
const rules = core.normalize(raw);
assert.equal(rules.length, 4);
const safe = core.render(input, rules, false);
assert.equal(safe.matched, true);
assert.equal(safe.blocked, 1);
assert.equal(safe.script, false);
assert.match(safe.html, /<style>/);
assert.match(safe.html, /主畫面/);
assert.doesNotMatch(safe.html, /<script>/);
assert.match(safe.html, /&lt;img/);
const full = core.render(input, rules, true);
assert.equal(full.script, true);
assert.equal(full.applied, 4);
assert.match(full.html, /<style>/);
assert.match(full.html, /<div class="a">/);
assert.match(full.html, /<script>/);
assert.match(full.html, /&lt;img/);
assert.doesNotMatch(full.html, /<img src=x/);
for (const path of ['js/author-regex-core.js', 'js/author-regex-compat.js', 'js/author-regex-mobile.js', 'js/regex-chat.js']) {
  new vm.Script(fs.readFileSync(require('node:path').join(__dirname, '..', path), 'utf8'), { filename: path });
}
console.log('✓ layered author UI, script consent, escaped captures and four JS syntax checks passed');
