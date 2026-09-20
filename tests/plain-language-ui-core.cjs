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

console.log('Plain-language UI terminology checks passed.');
