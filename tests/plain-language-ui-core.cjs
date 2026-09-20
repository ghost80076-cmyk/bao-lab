const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const index = read('index.html');
assert.match(index, /連線金鑰（API Key）/);
assert.match(index, /AI 服務商（Provider）/);
assert.match(index, /模型代號（Model ID）/);
assert.match(index, /連線網址（Base URL）/);
assert.match(index, /故事脈絡上限（Context）/);

const quickStart = read('quick-start.html');
assert.match(quickStart, /AI 模型（Model）/);
assert.match(quickStart, /不同服務商的金鑰不能混用/);

const quickMode = read('js/quick-start-mode.js');
assert.match(quickMode, /只連接 AI/);
assert.match(quickMode, /完整連線說明（API）/);

const chatSettings = read('js/chat-api-settings.js');
assert.match(chatSettings, /目前故事的 AI 連線設定/);
assert.match(chatSettings, /連線格式（API Protocol）/);

const discovery = read('js/model-discovery.js');
assert.match(discovery, /連線格式（API Protocol；自訂連線可切換）/);

const apiGuide = read('api-guide.html');
assert.match(apiGuide, /自備金鑰模式（BYOK/);
assert.match(apiGuide, /AI 服務商（Provider）/);
assert.match(apiGuide, /模型代號（Model ID）/);

const lmStudioGuide = read('lm-studio-guide.html');
assert.match(lmStudioGuide, /故事脈絡（Context）/);
assert.match(lmStudioGuide, /本機金鑰（API Token）/);

const storyTools = read('js/story-tools.js');
assert.match(storyTools, /劇情摘要包（Context Pack）／建立續篇/);
assert.match(storyTools, /瀏覽器故事資料庫（IndexedDB）/);
assert.match(storyTools, /字詞用量（Token）/);

console.log('Plain-language UI terminology checks passed.');
