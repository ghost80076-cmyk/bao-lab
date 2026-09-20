// Confirm that the publicly hosted JavaScript is the exact checked-out version.
// No API Key or player data is needed for this read-only deployment check.
const fs = require('node:fs');
const expected = fs.readFileSync('js/state-tracker-repairs.js', 'utf8').trim();
const base = 'https://ghost80076-cmyk.github.io/bao-lab/js/state-tracker-repairs.js';

(async () => {
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      const url = `${base}?verify=${encodeURIComponent(process.env.GITHUB_SHA || Date.now())}-${attempt}`;
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
      if (response.ok && (await response.text()).trim() === expected) {
        console.log(`Live Pages NPC presence module matches checkout (${process.env.GITHUB_SHA || 'local'}).`);
        return;
      }
    } catch (error) {
      console.log(`Live Pages probe ${attempt}/30: ${String(error?.message || error).slice(0, 150)}`);
    }
    if (attempt < 30) await new Promise(resolve => setTimeout(resolve, 10000));
  }
  throw new Error('Live Pages did not serve the checked-out NPC presence module.');
})().catch(error => { console.error(error); process.exitCode = 1; });
