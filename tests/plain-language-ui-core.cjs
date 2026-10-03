const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const index = read('index.html');
assert.match(index, /連線金鑰（API Key）/);
assert.match(index, /模型服務（Provider）/);
assert.match(index, /模型代號（Model ID）/);
assert.match(index, /連線網址（Base URL）/);
assert.match(index, /夜灣故事輸入預算（Token 參考值）/);

const quickStart = read('quick-start.html');
assert.match(quickStart, /模型（Model）/);
assert.match(quickStart, /不同服務商的金鑰不能混用/);

const quickMode = read('js/quick-start-mode.js');
assert.match(quickMode, /選擇模型服務與模型/);
assert.match(quickMode, /完整連線說明（API）/);

const chatSettings = read('js/chat-api-settings.js');
assert.match(chatSettings, /目前故事的模型連線/);
assert.match(chatSettings, /連線格式（Protocol）/);

const chatExperienceRepairs = read('js/chat-experience-repairs.js');
assert.match(chatExperienceRepairs, /YoruBay 點數模式最高 8192/);
assert.match(chatExperienceRepairs, /自備 API Key（BYOK）介面最高 32768/);
assert.match(chatExperienceRepairs, /const outputLimit = isYoruBay \? 8192 : 32768/);

const discovery = read('js/model-discovery.js');
assert.match(discovery, /連線格式（API Protocol；自訂連線可切換）/);

const apiGuide = read('api-guide.html');
assert.match(apiGuide, /自備連線金鑰（BYOK/);
assert.match(apiGuide, /AI 服務商（Provider）/);
assert.match(apiGuide, /模型代號（Model ID）/);

const lmStudioGuide = read('lm-studio-guide.html');
assert.match(lmStudioGuide, /故事脈絡（Context）/);
assert.match(lmStudioGuide, /本機金鑰（API Token）/);

const storyTools = read('js/story-tools.js');
assert.match(storyTools, /劇情摘要包（Context Pack）／建立續篇/);
assert.match(storyTools, /瀏覽器故事資料庫（IndexedDB）/);
assert.match(storyTools, /字詞用量（Token）/);

const diagnostics = read('js/provider-diagnostics.js');
assert.match(diagnostics, /完整 Streaming 與連線診斷/);
assert.match(diagnostics, /即時輸出（Streaming）/);
assert.match(diagnostics, /連線金鑰（API Key）/);

const routing = read('js/model-routing.js');
assert.match(routing, /同模型就合併狀態，不同模型再分工/);
assert.match(routing, /模型代號（Model ID）/);
assert.match(routing, /連線網址（Base URL）/);
assert.match(routing, /連線金鑰（API Key）/);

const brand = read('js/brand-ui.js');
assert.match(brand, /今夜有/);
assert.match(brand, /故事書庫/);
assert.match(brand, /開始探索/);
assert.doesNotMatch(brand, /<dt>Characters<\/dt>|<dt>World Sim<\/dt>|<dt>Play Mode<\/dt>/);

const memoryDesk = read('js/memory-workbench-core.js');
assert.match(memoryDesk, /正式劇情資料庫（Canon）/);
assert.match(memoryDesk, /對話輪數/);

const statusUi = read('js/character-status-ui.js');
assert.match(statusUi, /主要故事脈絡（Context）/);
assert.match(statusUi, /只供畫面顯示（UI Only）/);

console.log('Plain-language UI terminology checks passed.');
