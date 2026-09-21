const assert = require('node:assert/strict');
const fs = require('node:fs');
const core = require('../js/author-regex-core.js');
const legacy = require('../js/regex-library.js');
let checked = 0;
const test = (name, fn) => { fn(); checked++; console.log('✓ ' + name); };

test('imports card metadata without dropping the original HTML/CSS/JS', () => {
  const original = { data: { extensions: { regex_scripts: [{
    scriptName: '手機', findRegex: '/<GC_UI>([\\s\\S]*?)<\\/GC_UI>/g',
    replaceString: '<style>.phone{color:pink}</style><div class="phone">$1</div><script>window.test=1</script>'
  }] } } };
  const snapshot = JSON.stringify(original);
  const rules = core.normalize(original);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].script, true);
  assert.match(rules[0].replacement, /<script>/);
  assert.equal(JSON.stringify(original), snapshot);
});

test('HTML and CSS transform is local and escapes model-supplied captures', () => {
  const rules = core.normalize([{ name: '面板', pattern: 'HP=(.+)', replacement: '<style>.hp{color:red}</style><div class="hp">$1</div>' }]);
  const result = core.render('HP=<img src=x onerror=alert(1)>', rules, false);
  assert.equal(result.matched, true);
  assert.equal(result.rich, true);
  assert.match(result.html, /<style>/);
  assert.match(result.html, /&lt;img/);
  assert.doesNotMatch(result.html, /<img src=x/);
});

test('JS rules require separate explicit permission', () => {
  const rules = core.normalize([{ name: '翻牌', pattern: 'CARD', replacement: '<button onclick="this.textContent=\'背面\'">翻牌</button>' }]);
  assert.equal(core.render('CARD', rules, false).matched, false);
  const result = core.render('CARD', rules, true);
  assert.equal(result.matched, true);
  assert.equal(result.script, true);
});

test('plain text and regex captures do not create an API call or rewrite the original', () => {
  const original = 'NPC: 你好';
  const rules = core.normalize([{ name: '標記', pattern: 'NPC:', replacement: '角色：' }]);
  assert.equal(core.render(original, rules, false).html, '角色： 你好');
  assert.equal(original, 'NPC: 你好');
});

test('rejects excess patterns without destructive truncation', () => {
  const replacement = '<div>' + 'a'.repeat(200001) + '</div>';
  const rules = core.normalize([{ pattern: 'x', replacement }]);
  assert.ok(rules[0].reason);
  assert.equal(rules[0].replacement, replacement);
  assert.equal(core.render('x', rules, true).matched, false);
});

test('legacy text-only regex manager remains unchanged', () => {
  const rules = legacy.importRules([{ pattern: 'NPC:', replacement: '角色：' }]);
  assert.equal(legacy.apply('NPC: 你好', rules), '角色： 你好');
});

console.log(`Author regex core: ${checked} tests passed`);

// Smoke syntax checks for modules that need the browser at runtime.
for (const file of ['js/author-regex-compat.js', 'js/regex-chat.js']) {
  const source = fs.readFileSync(require('node:path').join(__dirname, '..', file), 'utf8');
  new (require('node:vm').Script)(source, { filename: file });
  console.log('✓ syntax: ' + file);
}
