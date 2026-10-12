const fs = require('node:fs');

const canonicalPages = {
  'about-bao-lab.html': 'https://yorubay.com/about-bao-lab',
  'age-content-policy.html': 'https://yorubay.com/age-content-policy',
  'api-guide.html': 'https://yorubay.com/api-guide',
  'creator-policy.html': 'https://yorubay.com/creator-policy',
  'lights-refund-policy.html': 'https://yorubay.com/lights-refund-policy',
  'lights.html': 'https://yorubay.com/lights',
  'lm-studio-guide.html': 'https://yorubay.com/lm-studio-guide',
  'policies.html': 'https://yorubay.com/policies',
  'privacy.html': 'https://yorubay.com/privacy',
  'quick-start.html': 'https://yorubay.com/quick-start',
  'terms.html': 'https://yorubay.com/terms'
};

for (const [file, url] of Object.entries(canonicalPages)) {
  const html = fs.readFileSync(file, 'utf8');
  if (!html.includes(`<link rel="canonical" href="${url}">`)) {
    throw new Error(`${file} must declare extensionless canonical ${url}`);
  }
  if (/rel=["']canonical["'][^>]+\.html(?:["?#>])/i.test(html)) {
    throw new Error(`${file} still declares a .html canonical URL`);
  }
}

const sitemap = fs.readFileSync('sitemap.xml', 'utf8');
if (/<loc>[^<]*\.html(?:[?#][^<]*)?<\/loc>/i.test(sitemap)) {
  throw new Error('sitemap.xml must only publish final extensionless public URLs.');
}

const expectedSitemapUrls = [
  'https://yorubay.com/',
  'https://yorubay.com/about-bao-lab',
  'https://yorubay.com/quick-start',
  'https://yorubay.com/api-guide',
  'https://yorubay.com/lm-studio-guide',
  'https://yorubay.com/author',
  'https://yorubay.com/lights',
  'https://yorubay.com/policies',
  'https://yorubay.com/creator-policy',
  'https://yorubay.com/age-content-policy',
  'https://yorubay.com/privacy',
  'https://yorubay.com/terms',
  'https://yorubay.com/lights-refund-policy'
];
for (const url of expectedSitemapUrls) {
  if (!sitemap.includes(`<loc>${url}</loc>`)) throw new Error(`Missing sitemap canonical: ${url}`);
}

for (const privateUrl of ['account', 'admin-wallet', 'character-studio', 'regex-manager']) {
  if (sitemap.includes(`https://yorubay.com/${privateUrl}`)) {
    throw new Error(`noindex/private route leaked into sitemap: ${privateUrl}`);
  }
}

const publicRouteNames = Object.keys(canonicalPages).map(file => file.replace(/\.html$/, '')).concat('author');
const linkPattern = new RegExp(`href=["'][^"']*(?:${publicRouteNames.join('|')})\\.html(?:[?#][^"']*)?["']`, 'i');
for (const file of [...Object.keys(canonicalPages), 'author.html', 'index.html']) {
  const html = fs.readFileSync(file, 'utf8');
  if (linkPattern.test(html)) throw new Error(`${file} still links internally to a redirecting .html public URL`);
}

const robots = fs.readFileSync('robots.txt', 'utf8');
if (!robots.includes('Sitemap: https://yorubay.com/sitemap.xml')) {
  throw new Error('robots.txt must advertise the canonical sitemap URL.');
}

console.log('PASS: YoruBay public SEO URLs are canonical and extensionless.');
