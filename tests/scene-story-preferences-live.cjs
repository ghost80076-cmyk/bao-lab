// Read-only verification of the actual public Pages JavaScript; no API Key.
const fs = require('node:fs');
const files = ['js/chat-markup.js', 'js/scene-story-preferences.js'];
const root = 'https://ghost80076-cmyk.github.io/bao-lab/';

(async () => {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const matches = await Promise.all(files.map(async path => {
        const response = await fetch(`${root}${path}?version=${encodeURIComponent(process.env.GITHUB_SHA || Date.now())}-${attempt}`,
          { cache: 'no-store', signal: AbortSignal.timeout(12000) });
        return response.ok && (await response.text()).trim() === fs.readFileSync(path, 'utf8').trim();
      }));
      if (matches.every(Boolean)) {
        console.log(`Live Pages scene story files match checkout (${process.env.GITHUB_SHA || 'local'}).`);
        return;
      }
    } catch (error) {
      console.log(`Pages probe ${attempt}/30: ${String(error?.message || error).slice(0, 120)}`);
    }
    if (attempt < 30) await new Promise(resolve => setTimeout(resolve, 10000));
  }
  throw new Error('Live Pages did not serve the checked-out scene story files.');
})().catch(error => { console.error(error); process.exitCode = 1; });
