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
assert.match(immersive, /AI 主角色「愛德華」屬於 controlled_by=assistant/);
assert.match(immersive, /【AI 主角色設定】/);
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

assert.match(world, /作品／世界主體：自主 NPC 世界/);
assert.match(world, /作品／世界主體名稱，不等同玩家角色/);
assert.match(world, /【作品主體／主要 AI 角色設定】/);

console.log('character role boundaries: player, AI actor, NPC and world labels passed');
