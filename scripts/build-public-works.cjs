/* Public discovery pages: deliberately read catalog metadata only, never card files. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const origin = 'https://yorubay.com';
const selection = JSON.parse(fs.readFileSync(path.join(root, 'data/public-works.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/character-catalog/community/manifest.json'), 'utf8'));
const catalog = ['data/characters.json', ...manifest.pages.map(page => page.file)]
  .flatMap(file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')));
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const works = selection.map(id => {
  const matches = catalog.filter(item => item.id === id);
  if (matches.length !== 1 || !/^[a-z0-9-]+$/.test(id)) throw new Error(`Missing, duplicate or invalid public work: ${id}`);
  const c = matches[0];
  if (c.rating !== 'general' || c.author_id !== 'banzhang') throw new Error(`Work requires public editorial review: ${id}`);
  const image = new URL(c.avatar, origin + '/');
  if (image.protocol !== 'https:') throw new Error(`Invalid public image: ${id}`);
  return { id, title: c.title || c.name, description: c.description, author: c.author,
    authorId: c.author_id, tags: c.tags || [], image: image.href };
});
const brand = { '@type': 'WebSite', '@id': origin + '/#website', url: origin + '/', name: '夜灣 YoruBay', alternateName: ['夜灣', 'YoruBay'], inLanguage: 'zh-Hant', description: 'AI 角色扮演、AI 聊天與世界模擬平台。使用自己的 API 與喜歡的模型，故事與記憶優先保存在本機。' };
function layout(title, description, url, image, body, schema) {
  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}｜夜灣 YoruBay</title><meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}"><meta name="robots" content="index,follow">
<meta property="og:type" content="website"><meta property="og:site_name" content="夜灣 YoruBay"><meta property="og:locale" content="zh_TW">
<meta property="og:title" content="${esc(title)}｜夜灣 YoruBay"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}｜夜灣 YoruBay"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(image)}">
<link rel="icon" href="/assets/bao-mark.svg" type="image/svg+xml"><link rel="stylesheet" href="/css/public-works.css">
<script type="application/ld+json">${json({ '@context': 'https://schema.org', '@graph': [brand, ...schema] })}</script>
</head><body><header><a class="brand" href="/">夜灣 <span>YoruBay</span></a><nav aria-label="主導覽"><a href="/works/">作品介紹</a><a href="/quick-start">開始使用</a><a href="/about-bao-lab">關於夜灣</a></nav></header>
<main>${body}</main><footer><p>夜灣 YoruBay · 故事在夜裡靠岸。</p><a href="/">進入夜灣</a> · <a href="/api-guide">API 連線教學</a> · <a href="/lm-studio-guide">LM Studio 教學</a> · <a href="/privacy">隱私權</a></footer></body></html>\n`;
}
const card = w => `<article class="work-card"><a class="cover-link" href="/works/${w.id}" aria-label="${esc(w.title)}"><img src="${esc(w.image)}" alt="${esc(w.title)}封面" loading="lazy" width="600" height="800"></a><div class="card-copy"><p class="eyebrow">${esc(w.tags[0])} · ${esc(w.author)}</p><h2><a href="/works/${w.id}">${esc(w.title)}</a></h2><p>${esc(w.description)}</p><a class="text-link" href="/works/${w.id}">閱讀作品介紹 →</a></div></article>`;
const files = new Map();
files.set('works/index.html', layout('AI 角色扮演與世界模擬作品', '探索夜灣 YoruBay 的 AI 角色扮演與世界模擬作品：慢熱關係、開放世界、魔法學院與偶像選秀。選一個故事，用自己的 API 開始。', origin + '/works/', origin + '/assets/bao-social-card.png', `<section class="intro"><p class="eyebrow">STORIES AT YORUBAY</p><h1>選一個世界，<br>留下你的故事。</h1><p>從深夜的一段對話，到會自己向前走的世界。這裡收錄夜灣的精選作品介紹，讓你先認識故事，再決定從哪裡開始。</p></section><section class="work-grid" aria-label="精選作品">${works.map(card).join('')}</section><section class="getting-started"><h2>第一次來夜灣？</h2><p>夜灣是 AI 角色扮演、AI 聊天與世界模擬平台。你可以自備 API（BYOK），選擇喜歡的模型；故事、記憶與狀態優先保存在自己的裝置上。模型用量費用依連線方案計算。</p><a href="/quick-start">閱讀快速開始 →</a></section>`, [{ '@type': 'CollectionPage', url: origin + '/works/', name: '夜灣作品介紹', isPartOf: { '@id': origin + '/#website' }, mainEntity: { '@type': 'ItemList', itemListElement: works.map((w, i) => ({ '@type': 'ListItem', position: i + 1, name: w.title, url: origin + '/works/' + w.id })) } }]));
for (const w of works) {
  const url = origin + '/works/' + w.id;
  const body = `<nav class="breadcrumb" aria-label="麵包屑"><a href="/">夜灣</a> / <a href="/works/">作品介紹</a></nav><article class="work-detail"><div class="detail-cover"><img src="${esc(w.image)}" alt="${esc(w.title)}封面" width="600" height="800" fetchpriority="high"></div><div class="detail-copy"><p class="eyebrow">YORUBAY ORIGINAL · 一般分級</p><h1>${esc(w.title)}</h1><p class="byline">作者 <a href="/author?id=${encodeURIComponent(w.authorId)}">${esc(w.author)}</a></p><p class="synopsis">${esc(w.description)}</p><ul class="tags" aria-label="作品題材">${w.tags.map(t => `<li>${esc(t)}</li>`).join('')}</ul><a class="primary" href="/?work=${encodeURIComponent(w.id)}">前往作品，開始故事 →</a><p class="hint">進入夜灣後可查看作品詳情並建立故事。</p></div></article><section class="getting-started"><h2>用你喜歡的 AI，讓故事繼續</h2><p>這是一部互動式 AI 角色扮演／世界模擬作品。建立故事時可選擇敘事與顯示方式、設定玩家身分，再接上自己的模型 API。故事與記憶優先保存在本機；首次使用可以先閱讀教學。</p><a href="/quick-start">快速開始 →</a> · <a href="/works/">尋找下一個故事 →</a></section>`;
  files.set(`works/${w.id}.html`, layout(w.title, w.description, url, w.image, body, [{ '@type': 'CreativeWork', '@id': url + '#work', url, name: w.title, description: w.description, image: w.image, author: { '@type': 'Person', name: w.author, url: origin + '/author?id=' + encodeURIComponent(w.authorId) }, inLanguage: 'zh-Hant', genre: w.tags }, { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: '夜灣', item: origin + '/' }, { '@type': 'ListItem', position: 2, name: '作品介紹', item: origin + '/works/' }, { '@type': 'ListItem', position: 3, name: w.title, item: url }] }]));
}
const sitemapFile = path.join(root, 'sitemap.xml');
let sitemap = fs.readFileSync(sitemapFile, 'utf8').replace(/  <!-- public-works:start -->[\s\S]*?  <!-- public-works:end -->\n?/g, '');
sitemap = sitemap.replace('</urlset>', `  <!-- public-works:start -->\n${['/works/', ...works.map(w => '/works/' + w.id)].map(route => `  <url><loc>${origin}${route}</loc></url>`).join('\n')}\n  <!-- public-works:end -->\n</urlset>`);
files.set('sitemap.xml', sitemap);
if (process.argv.includes('--check')) {
  for (const [file, content] of files) {
    if (!fs.existsSync(path.join(root, file)) || fs.readFileSync(path.join(root, file), 'utf8') !== content) throw new Error(`Public work output is stale: ${file}. Run npm run build:public-works`);
  }
  const expected = new Set([...files.keys()].filter(f => f.startsWith('works/')));
  for (const file of fs.readdirSync(path.join(root, 'works'))) if (!expected.has(`works/${file}`)) throw new Error(`Unreviewed public work output: ${file}`);
  console.log(`PASS: ${works.length} reviewed public works and sitemap are up to date.`);
} else {
  fs.mkdirSync(path.join(root, 'works'), { recursive: true });
  // Only this directory is generated; remove pages withdrawn from the reviewed selection.
  for (const file of fs.readdirSync(path.join(root, 'works'))) if (file.endsWith('.html') && !files.has(`works/${file}`)) fs.unlinkSync(path.join(root, 'works', file));
  for (const [file, content] of files) fs.writeFileSync(path.join(root, file), content);
}
