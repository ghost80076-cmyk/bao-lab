const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'yorubay-public-works-'));
try {
  for (const file of ['scripts/build-public-works.cjs', 'data/public-works.json', 'data/characters.json', 'data/character-catalog/community/manifest.json', 'sitemap.xml']) {
    fs.mkdirSync(path.dirname(path.join(temp, file)), { recursive: true });
    fs.copyFileSync(path.join(root, file), path.join(temp, file));
  }
  const communityManifest = JSON.parse(fs.readFileSync(path.join(root, 'data/character-catalog/community/manifest.json'), 'utf8'));
  for (const page of communityManifest.pages || []) {
    const file = page.file;
    fs.mkdirSync(path.dirname(path.join(temp, file)), { recursive: true });
    fs.copyFileSync(path.join(root, file), path.join(temp, file));
  }
  // No full character files exist here: generation must use public metadata only.
  const build = () => execFileSync(process.execPath, ['scripts/build-public-works.cjs'], { cwd: temp, stdio: 'pipe' });
  const catalogPath = path.join(temp, 'data/characters.json');
  const catalog = JSON.parse(fs.readFileSync(catalogPath));
  const ids = JSON.parse(fs.readFileSync(path.join(temp, 'data/public-works.json')));
  const work = catalog.find(c => c.id === ids[0]);
  work.title = '引號 " & <script>alert(1)</script>';
  work.description = '</script><script>INJECTED</script>';
  work.hidden_prompt = 'PRIVATE_SENTINEL_MUST_NOT_RENDER';
  fs.writeFileSync(catalogPath, JSON.stringify(catalog));
  build();
  const html = fs.readFileSync(path.join(temp, `works/${work.id}.html`), 'utf8');
  assert(!html.includes('PRIVATE_SENTINEL'));
  assert(!html.includes('<script>INJECTED'));
  assert(html.includes('&lt;script&gt;'));
  const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(schema['@graph'].find(s => s['@type'] === 'CreativeWork').description, work.description);
  assert(html.includes(`href="/?work=${work.id}"`));
  assert(html.includes(`href="https://yorubay.com/works/${work.id}"`));
  const oldId = ids.pop();
  fs.writeFileSync(path.join(temp, 'data/public-works.json'), JSON.stringify(ids));
  build();
  assert(!fs.existsSync(path.join(temp, `works/${oldId}.html`)), 'withdrawn pages must be removed');
  assert(!fs.readFileSync(path.join(temp, 'sitemap.xml'), 'utf8').includes(`/works/${oldId}`));
  for (const [field, value] of [['rating', 'adult'], ['author_id', 'external-author']]) {
    const previous = work[field]; work[field] = value;
    fs.writeFileSync(catalogPath, JSON.stringify(catalog));
    assert.notEqual(spawnSync(process.execPath, ['scripts/build-public-works.cjs'], { cwd: temp }).status, 0, `${field} must require review`);
    work[field] = previous;
  }
  const generatedFiles = fs.readdirSync(path.join(root, 'works')).filter(f => f.endsWith('.html'));
  for (const file of generatedFiles) {
    const page = fs.readFileSync(path.join(root, 'works', file), 'utf8');
    assert.equal((page.match(/<h1>/g) || []).length, 1);
    assert(page.includes('<html lang="zh-Hant">'));
    for (const match of page.matchAll(/href="(\/(?!\?)[^"?#]*)/g)) {
      const route = match[1];
      const target = path.join(root, route.endsWith('/') ? route + 'index.html' : route);
      assert(fs.existsSync(target) || fs.existsSync(target + '.html'), `Broken static link: ${route}`);
    }
  }
  console.log('PASS: metadata-only generation, injection escaping, reviewed publication, withdrawal, and static links.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
