'use strict';

// Audit every top-level HTML document published as a YoruBay Pages route.
// JavaScript/CSS source uses legitimate escape sequences; HTML text nodes do not.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pages = fs.readdirSync(root).filter((name) => name.endsWith('.html')).sort();
const leaked = [];
const htmlTokens = /<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<[^>]+>|([^<]+)/gi;
const escapes = /\\[nrt]/g;

for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  htmlTokens.lastIndex = 0;
  let token;
  while ((token = htmlTokens.exec(html)) !== null) {
    if (token[1] === undefined) continue;
    const text = token[1];
    const offset = token.index + token[0].indexOf(text);
    escapes.lastIndex = 0;
    let match;
    while ((match = escapes.exec(text)) !== null) {
      const pos = offset + match.index;
      const line = html.slice(0, pos).split('\n').length;
      leaked.push(page + ':' + line + ' visible raw escape ' + JSON.stringify(match[0]));
    }
  }
}

if (!pages.length) {
  console.error('No public HTML pages found; unable to run HTML text audit.');
  process.exitCode = 1;
} else if (leaked.length) {
  console.error('Raw escape sequences leaked into HTML visible text:\n' + leaked.join('\n'));
  process.exitCode = 1;
} else {
  console.log('PASS: ' + pages.length + ' HTML documents have no raw \\n/\\r/\\t in visible text.');
}
