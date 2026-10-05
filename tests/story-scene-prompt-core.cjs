const fs = require('fs');
const assert = require('assert');

const prompt = fs.readFileSync('js/story-image-prompts.js', 'utf8');
const markup = fs.readFileSync('js/chat-markup.js', 'utf8');

assert.match(prompt, /const openPlayer = \(index = null\)/, 'scene prompt must support a selected assistant turn');
assert.match(prompt, /findLastIndex\(message => message\.role === 'assistant'\)/, 'latest assistant turn fallback is required');
assert.match(prompt, /data-bao-scene-prompt/, 'each assistant scene needs its own prompt action');
assert.match(prompt, /將此刻化成畫面/, 'player-facing scene prompt entry is required');

for (const key of ['understanding', 'image_prompt', 'video_prompt', 'negative_prompt', 'continuity_prompt']) {
  assert.ok(prompt.includes(key), `structured output is missing ${key}`);
}

assert.match(prompt, /isAccountReady/, 'hosted YoruBay text-model sessions must be accepted');
assert.match(prompt, /__storyTool:true/, 'scene prompt requests must be marked as story-tool calls');
assert.match(prompt, /maxOutputTokens/, 'scene prompt helper output must remain bounded');
assert.match(prompt, /provider-neutral/, 'prompt compiler must remain provider-neutral');
assert.match(prompt, /不會直接呼叫圖片／影片生成服務/, 'UI must not imply YoruBay renders the media');
assert.match(markup, /story-image-prompts\.js\?v=2/, 'chat loader must fetch the consolidated implementation');
assert.ok(!fs.existsSync('js/story-image-moments.js'), 'duplicate legacy scene-image implementation must stay removed');

console.log('story-scene-prompt-core: ok');
