'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/author-regex-core.js');
const folder = path.join(__dirname, '../docs/author-migrations/chicofy-six-timelines');
const original = fs.readFileSync(path.join(folder, 'roleWelcome_original.html'), 'utf8');
const adapted = fs.readFileSync(path.join(folder, 'roleWelcome_yorubay.html'), 'utf8');
const regex = JSON.parse(fs.readFileSync(path.join(folder, 'welcome.regex.json'), 'utf8'));
const assets = JSON.parse(fs.readFileSync(path.join(folder, 'assets.json'), 'utf8'));
const attribution = JSON.parse(fs.readFileSync(path.join(folder, 'attribution.json'), 'utf8'));
const root = path.join(__dirname, '..');
const authors = JSON.parse(fs.readFileSync(path.join(root, 'data/authors.json'), 'utf8')).authors || [];
const owner = authors.find(x => x.id === attribution.author_id);
assert.equal(attribution.record_type, 'unpublished_author_migration');
assert.equal(attribution.publication_status, 'awaiting_original_character_card');
assert.equal(attribution.migration_id, 'chicofy-six-timelines');
assert.equal(attribution.public_catalog_entry, false);
assert.equal(attribution.published_character_id, null);
assert.equal(attribution.requires_full_original_card, true);
assert.ok(owner, 'the original author account must exist');
assert.equal(owner.name, '齊格飛');
assert.equal(attribution.author, owner.name);
assert.deepEqual(attribution.character_meta, {
  author:'齊格飛', author_id:'chicofy', creator:'齊格飛', creator_id:'chicofy'
});
assert.equal(assets.owner_id, attribution.author_id);
assert.equal(assets.author, attribution.author);
assert.equal(regex.characterId, attribution.migration_id);
assert.match(regex.rules[0].name, /齊格飛/);
const official = JSON.parse(fs.readFileSync(path.join(root, 'data/characters.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/character-catalog/community/manifest.json'), 'utf8'));
const community = (manifest.pages || []).flatMap(page => JSON.parse(fs.readFileSync(path.join(root, page.file), 'utf8')));
const publicCatalog = [...official, ...community];
assert.ok(!publicCatalog.some(x => x.id === attribution.migration_id),
  'unpublished migration must not be exposed as a playable character before the complete original card arrives');
const priorWork = publicCatalog.find(x => x.id === 'shikong-zhimen');
assert.ok(priorWork && priorWork.author === owner.name && priorWork.author_id === owner.id,
  'existing author ownership of The Ages must not be changed');
const rules = Core.normalize(regex);
assert.equal(rules.length, 1);
assert.equal(rules[0].reason, '');
const transformed = Core.render(original, rules, true);
assert.equal(transformed.matched, true);
assert.equal(transformed.script, true);
assert.equal(transformed.html.trim(), adapted.trim(), 'author welcome must transform without changing its content');
const staticOnly = Core.render(original, rules, false);
assert.equal(staticOnly.matched, true);
assert.equal(staticOnly.script, false, 'JS requires player authorization');
assert.ok(staticOnly.blocked > 0);
assert.equal(Core.render('一般敘事內容，不是選角開場。', rules, true).matched, false);
const sends = html => [...html.matchAll(/<hc-btn send="([^"]+)"/g)].map(m => m[1]);
const drafts = html => [...html.matchAll(/<button type="button" class="yb-author-send" data-send="([^"]+)"/g)].map(m => m[1]);
assert.equal(sends(original).length, 12);
assert.deepEqual(drafts(adapted), sends(original), 'all 6 main and 6 fallback button payloads must be unchanged');
const images = html => [...html.matchAll(/<img src="([^"]+)" alt="([^"]+)"/g)].map(m => ({ url:m[1], alt:m[2] }));
assert.equal(images(original).length, 6);
assert.deepEqual(images(adapted), images(original));
assert.deepEqual(assets.portraits.map(x => ({ url:x.source_url, alt:x.alt })), images(original));
assert.equal(assets.portraits.every(x => x.local_file_committed === false), true);
assert.match(adapted, /BAOAuthor\.draft\(message\)/);
assert.match(adapted, /onpointerdown=/);
assert.match(adapted, /onpointerup=/);
assert.match(adapted, /class="yb-author-fallback"/);
for (const name of ['篠原美月','桐谷琉奈','水野澄江','朝倉真帆','白石花音','小早川詩織']) {
  assert.ok(original.includes(name), 'missing original role: '+name);
  assert.ok(adapted.includes(name), 'missing adapted role: '+name);
}
console.log('Chicofy author attribution and unpublished six-timeline adapter contract passed.');
