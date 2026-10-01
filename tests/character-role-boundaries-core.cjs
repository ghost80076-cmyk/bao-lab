const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'character.js'), 'utf8');
const sandbox = { console, localStorage: { getItem: () => null, setItem() {} } };
sandbox.window = sandbox;
vm.runInNewContext(source + '\n;globalThis.CharacterEngine = CharacterEngine;', sandbox, { filename: 'character.js' });
const engine = sandbox.CharacterEngine;

const immersive = engine.composeSystemPrompt({
  id: 'edward',
  name: '愛德華',
  system_prompt: '冷靜而克制。',
  greeting: '夜色很深。',
  profile: { 'AI 主角色設定': '32 歲，公爵。' },
  initial_state: { npcs: [{ name: '威廉', role: '侍從' }] },
  supported_modes: { immersive: true, world: false }
}, { persona: { name: '玩家甲' } });

assert.match(immersive, /玩家角色：玩家甲（controlled_by=user）/);
assert.match(immersive, /作品／角色卡主體：愛德華/);
assert.match(immersive, /【主要 AI 角色／作品主體設定】/);
assert.match(immersive, /【重要 NPC｜controlled_by=assistant】/);
assert.match(immersive, /不得因其出現在「人物／角色／NPC」文字區塊中就改變控制權/);

const world = engine.composeSystemPrompt({
  id: 'world',
  name: '自主 NPC 世界',
  system_prompt: '世界自行運作。',
  greeting: '城市甦醒。',
  profile: { 'AI 主角色設定': '作品主體是城市群像。' },
  supported_modes: { immersive: true, world: true }
}, { persona: { name: '玩家乙' } });

assert.match(world, /作品／角色卡主體：自主 NPC 世界/);
assert.match(world, /可能是一名 AI 主角色，也可能是一個多 NPC 世界/);
assert.match(world, /【主要 AI 角色／作品主體設定】/);

const largeRoster = engine.composeSystemPrompt({
  id: 'court',
  name: '王宮世界',
  system_prompt: '宮廷依既有關係自行運作。',
  greeting: '宴會開始。',
  initial_state: { npcs: [
    { name:'甲', role:'侍從', personality:'甲專屬細節' },
    { name:'乙', role:'大臣', personality:'乙專屬細節' },
    { name:'丙', role:'醫師', personality:'丙專屬細節' },
    { name:'丁', role:'護衛', personality:'丁專屬細節' },
    { name:'威廉', role:'公爵', personality:'威廉專屬細節' },
    { name:'瑪莉', role:'女僕', personality:'瑪莉專屬細節' }
  ] }
}, {
  persona: { name:'玩家丙' },
  recentMessages: [{ role:'user', content:'我轉向威廉，問他剛才看見了什麼。' }],
  currentLocation: '宴會廳',
  storyNPCs: [{ name:'丁', role:'護衛', location:'宴會廳', presence:'present' }]
});

assert.match(largeRoster, /【NPC 名冊索引】/);
assert.match(largeRoster, /威廉｜公爵/);
assert.match(largeRoster, /【本輪相關 NPC】/);
assert.match(largeRoster, /威廉專屬細節/);
assert.match(largeRoster, /丁專屬細節/);
assert.doesNotMatch(largeRoster, /甲專屬細節/);
assert.match(largeRoster, /名冊只表示故事中已登記的人物與身分，不代表目前在場/);

console.log('character role boundaries: player, AI actor, NPC and world labels passed');
