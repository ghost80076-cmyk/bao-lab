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

test('start and resume first paint has stable reading styles before any deferred scripts', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const head = html.split('</head>')[0];
  const hrefs = [...head.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1]);
  const mobileHref = hrefs.find(link => pathOf(link) === 'css/mobile-reading-layout.css');
  assert.match(mobileHref || '', /^css\/mobile-reading-layout\.css\?v=\d+$/,
    'mobile reading CSS preload needs a numeric cache version');
  const critical = [
    'css/story-reader.css?v=3',
    'css/chat-tool-navigation.css?v=9',
    mobileHref
  ];
  for (const href of critical) {
    const path = pathOf(href);
    assert.equal(hrefs.filter(link => pathOf(link) === path).length, 1, path + ' is preloaded once');
    assert.ok(hrefs.includes(href), 'match the lazy fallback version for ' + path);
  }
  assert.ok(hrefs.indexOf('css/story-reader.css?v=3') < hrefs.indexOf('css/chat-tool-navigation.css?v=9'));
  assert.ok(hrefs.indexOf('css/chat-tool-navigation.css?v=9') < hrefs.indexOf(mobileHref));
  assert.ok(hrefs.indexOf(mobileHref) > hrefs.indexOf('css/phone-ui.css?v=2'));
  const script = fs.readFileSync('js/mobile-reading-layout.js', 'utf8');
  assert.ok(script.includes("style.href = '" + mobileHref + "'"),
    'lazy mobile CSS fallback must use the same cache version as index.html');
  assert.match(script, /let style = document\.querySelector\('link\[href\^="css\/mobile-reading-layout\.css"\]'\)/,
    'late mobile JS must reuse its preloaded stylesheet');
  assert.match(script, /document\.head\.append\(style\)/,
    'move the same stylesheet to the end after deferred UI styles to retain cascade precedence');
});