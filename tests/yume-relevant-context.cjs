'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const card = require('../data/characters/general/kurobane-yume-kabukicho.json');

const engineContext = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/character.js'), 'utf8') + '\nthis.engine=CharacterEngine;', engineContext);
const engine = engineContext.engine;
engineContext.CharacterEngine = engine;
engineContext.window = {
  CharacterEngine: engine,
  GameState: {
    current: {
      location: 'Club Rose 街角的便利店門前',
      npcs: [{ name: '黑羽ゆめ', role: 'Club Rose キャバ嬢', presence: 'present', location: 'Club Rose 街角的便利店門前' }],
      events: []
    }
  }
};
engineContext.document = { readyState: 'loading', addEventListener() {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/lorebook.js'), 'utf8'), engineContext);

assert.match(card.content.system_prompt, /六人群像世界卡/);
assert.match(card.content.system_prompt, /不具有永久主角特權/);
assert.match(card.content.lore, /【世界書：黑羽ゆめ/);
assert.match(card.content.lore, /【世界書：桜井りな/);
assert.match(card.content.lore, /【世界書：琉星/);

const worldMode = require('../data/prompts/world.json');
const yumePrompt = engine.composeSystemPrompt(card, {
  persona: { name: '測試玩家' },
  modePrompt: worldMode.prompt,
  displayMode: 'ui',
  recentMessages: [{ role: 'user', content: '我看向ゆめ' }]
});
assert.match(yumePrompt, /【黑羽ゆめ】/);
assert.match(yumePrompt, /依附焦慮/);
assert.doesNotMatch(yumePrompt, /【六人私下設定：桜井りな】/);
assert.doesNotMatch(yumePrompt, /童年曾遭父親性侵/);

engineContext.window.GameState.current = {
  location: 'ACQUA',
  npcs: [{ name: '琉星', role: 'ACQUA Host', presence: 'present', location: 'ACQUA' }],
  events: []
};
const ryuseiPrompt = engine.composeSystemPrompt(card, {
  persona: { name: '測試玩家' },
  modePrompt: worldMode.prompt,
  displayMode: 'ui',
  recentMessages: [{ role: 'user', content: '我留在這裡觀察' }]
});
assert.match(ryuseiPrompt, /【琉星】/);
assert.match(ryuseiPrompt, /ACQUA 的資深 Host/);
assert.doesNotMatch(ryuseiPrompt, /【六人私下設定：あいり】/);

engineContext.window.GameState.current = {
  location: '中野',
  npcs: [{ name: '田中美咲', role: '深夜便利商店員工', presence: 'present', location: '中野便利商店' }],
  events: []
};
const misakiPrompt = engine.composeSystemPrompt(card, {
  persona: { name: '測試玩家' },
  modePrompt: worldMode.prompt,
  displayMode: 'ui',
  recentMessages: [{ role: 'user', content: '我沒有提任何人的名字' }]
});
assert.match(misakiPrompt, /【田中美咲】/);
assert.match(misakiPrompt, /兩年前離開夜職/);
assert.doesNotMatch(misakiPrompt, /【六人私下設定：桜井りな】/);

console.log('PASS Yume relevant context: cover character is an entry point, active world NPCs load on demand.');
