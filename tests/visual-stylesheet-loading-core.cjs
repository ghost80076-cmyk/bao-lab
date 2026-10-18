const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/bao-visual-ui.js', 'utf8');
const pathOf = href => String(href).split(/[?#]/)[0];
function page(hrefs) {
  const links = hrefs.map(href => ({ rel: 'stylesheet', href,
    getAttribute(name) { return this[name]; } }));
  const document = {
    readyState: 'loading',
    querySelector(selector) {
      const href = selector.match(/\[href="([^"]+)"\]/)?.[1];
      return href ? links.find(link => link.href === href) || null : null;
    },
    querySelectorAll() { return links; },
    createElement() { return { getAttribute(name) { return this[name]; } }; },
    head: { appendChild(link) { links.push(link); } },
    addEventListener() {}
  };
  const context = vm.createContext({ document, window: {} });
  return { links, run: () => vm.runInContext(source, context) };
}

test('current index keeps one brand stylesheet at its declared cascade position', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const hrefs = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1]);
  const p = page(hrefs);
  p.run();
  assert.equal(p.links.filter(l => pathOf(l.href) === 'css/bao-brand-v2.css').length, 1);
  for (const path of ['css/bao-brand-v2.css', 'css/bao-editorial.css', 'css/bao-image-quality.css']) {
    const i = hrefs.findIndex(href => pathOf(href) === path);
    assert.equal(p.links[i].href, hrefs[i], 'keep existing version and position: ' + path);
  }
});

test('alternate query/hash versions stay in place across repeated loader evaluation', () => {
  const hrefs = ['css/bao-visual-ui.css?v=future#theme', 'css/bao-brand-v2.css?v=future',
    'css/bao-editorial.css?v=future', 'css/bao-image-quality.css#future'];
  const p = page(hrefs);
  p.run(); p.run();
  assert.deepEqual(p.links.map(l => l.href), hrefs);
});

test('older pages without these links still receive fallback styles in order, once', () => {
  const p = page([]);
  p.run(); p.run();
  assert.deepEqual(p.links.map(l => pathOf(l.href)), ['css/bao-visual-ui.css',
    'css/bao-brand-v2.css', 'css/bao-editorial.css', 'css/bao-image-quality.css']);
});
