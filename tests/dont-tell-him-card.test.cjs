'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const UI = require('../js/gameplay-ui-core.js');
const Regex = require('../js/author-regex-core.js');
const root = path.join(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const card = read('data/characters/community/60/dont-tell-him.json');
const sidecar = read('data/characters/community/60/dont-tell-him.regex.json');
const schema = UI.normalize(card.gameplay.ui_schema);
assert.ok(schema);
assert.deepEqual(schema.panels.map(p => p.id), ['now', 'people', 'messages', 'clues']);
assert.equal(sidecar.characterId, card.meta.id);
assert.equal(card.gameplay.world_modules.find(m => m.id === 'private_continuity').visibility, 'internal');
// Every rendered path must exist and must avoid the private continuity store.
for (const panel of schema.panels) for (const section of panel.sections) {
  const paths = [section.path, ...(section.items || []).map(item => item.path)].filter(Boolean);
  for (const p of paths) {
    assert.ok(UI.isDisplayPath(p), p);
    assert.notEqual(UI.getPath(card.gameplay.initial_state, p), undefined, p);
    assert.ok(!p.startsWith('modules.private_continuity'), p);
  }
}
const publicState = structuredClone(card.gameplay.initial_state);
delete publicState.modules.private_continuity;
assert.doesNotMatch(JSON.stringify(publicState), /北風本人|確認晚星身分|知道表弟帳號/);
assert.doesNotMatch(card.content.greeting, /就是北風|就是晚星|<[^>]+>|<!--/);
const rules = Regex.normalize(sidecar);
assert.equal(rules.length, 1);
const rule = sidecar.regex_scripts[0];
const apply = text => text.replace(new RegExp(rule.findRegex, rule.flags), rule.replaceString);
const raw = card.content.greeting;
assert.equal((apply(raw).match(/yb-dont-tell-message/g) || []).length, 1);
assert.ok(apply(raw).includes('北風 · 21:18'));
assert.ok(apply(raw).includes('賀予深沒有接話'));
assert.equal(apply('這是一段沒有訊息的敘事。'), '這是一段沒有訊息的敘事。');
assert.equal(apply('私訊｜29:77\n北風：錯誤時間'), '私訊｜29:77\n北風：錯誤時間');
for (const newline of ['\n', '\r\n']) {
  const sample = ['前文', '', '私訊｜00:08', '北風：到家了嗎？', '', '私訊｜00:09', '妳：到了。', '', '後文'].join(newline);
  const html = apply(sample);
  assert.equal((html.match(/yb-dont-tell-message/g) || []).length, 2);
  assert.ok(html.includes('後文'));
  assert.ok(html.includes('到家了嗎？'));
}
assert.doesNotMatch(rule.replaceString, /<script|\bon\w+=|javascript:|https?:|!important|font-size/i);
// Actor labels come from the message only; the display rule cannot map aliases.
assert.ok(!rule.replaceString.includes('賀予深'));
const catalog = read('data/character-catalog/community/page-0002.json');
const entry = catalog.find(e => e.id === card.meta.id);
assert.equal(entry.file, 'data/characters/community/60/dont-tell-him.json');
assert.equal(entry.avatar, card.meta.avatar);
assert.ok(fs.existsSync(path.join(root, card.meta.avatar)));
const manifest = read('data/character-catalog/community/manifest.json');
assert.equal(manifest.total, manifest.pages.reduce((sum, page) => sum + read(page.file).length, 0));
console.log('PASS Dont Tell Him: real greeting regex, CRLF/multiple messages, UI bindings, privacy and catalog');
