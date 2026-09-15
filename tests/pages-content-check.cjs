// Read-only deployment verification. Never sends a player's API key or data.
const fs = require('node:fs');
const files = ['index.html', 'data/presets/models.json', 'js/chat.js', 'js/helper-data.js', 'js/memory-preferences.js', 'js/model-routing.js', 'js/prompt-cache.js', 'js/site-ui.js', 'js/story-backup.js', 'js/story-tools.js', 'js/story-revision-state.js', 'js/story-branches.js', 'js/world-modules.js', 'js/world-state-hook.js', 'js/player-settings.js', 'css/memory-preferences.css', 'css/story-branches.css'];
const storyTools = fs.readFileSync('js/story-tools.js', 'utf8');
if (storyTools.includes('sourceMessages.length ? sourceMessages : Chat.messages')) throw new Error('Context Pack source isolation regressed to current-chat fallback.');
if (!storyTools.includes('const messagesToOrganize = requireSourceMessages();')) throw new Error('Context Pack organizer no longer requires an explicit source.');
if (!storyTools.includes('BAOStoryBackup.exportCurrentStory()')) throw new Error('Story Desk full export is not routed through the Story Bundle exporter.');
if (storyTools.includes('Storage.exportCurrentStory("完整故事備份")')) throw new Error('Story Desk full export regressed to single-chapter export.');
if (!storyTools.includes('主線與全部分支')) throw new Error('Story Desk no longer describes full branch-tree backup.');

const presets = JSON.parse(fs.readFileSync('data/presets/models.json', 'utf8'));
const zai = presets.find(item => item.provider === 'zai');
if (!zai) throw new Error('Z.AI provider is missing from deployed model presets.');
if (zai.model !== '') throw new Error('Z.AI provider must keep Model ID user-selectable instead of hardcoding one GLM model.');
if (zai.base_url !== 'https://api.z.ai/api/paas/v4/chat/completions') throw new Error('Z.AI official endpoint changed unexpectedly.');
if (zai.protocol !== 'openai' || zai.route !== 'official' || zai.cache !== 'automatic') throw new Error('Z.AI provider contract metadata is incomplete.');
const modelRouting = fs.readFileSync('js/model-routing.js', 'utf8');
if (!modelRouting.includes('filter(p => p.base_url && p.route !== "custom")')) throw new Error('Helper routing no longer accepts official providers with user-entered Model IDs.');
if (!modelRouting.includes('type: presetEndpointMatches ? (preset.provider || "custom") : "custom"')) throw new Error('Helper routing no longer preserves provider identity.');

const base = 'https://ghost80076-cmyk.github.io/bao-lab/';
(async () => {
  for (let attempt = 0; attempt < 40; attempt++) {
    const results = await Promise.all(files.map(async file => {
      try {
        const response = await fetch(`${base}${file}?verify=${process.env.GITHUB_SHA || Date.now()}`, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
        return response.ok && (await response.text()).trim() === fs.readFileSync(file, 'utf8').trim();
      } catch { return false; }
    }));
    if (results.every(Boolean)) { console.log(`Pages content matches ${process.env.GITHUB_SHA || 'checkout'}: ${files.join(', ')}`); return; }
    console.log(`Waiting for Pages (${attempt + 1}/40): ${files.filter((_, i) => !results[i]).join(', ')}`);
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
  throw new Error('Pages did not serve the checked-out content before the verification deadline.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
