const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'js', 'lorebook.js'), 'utf8');
const engine = {
  normalize: value => ({ ...value, prompt_options: { include_lore: true, ...value.prompt_options } }),
  composeSystemPrompt: value => `世界:${value.world || ''}\n固定:${value.prompt_options?.include_lore === false ? '' : value.lore || ''}`
};
const ctx = {
  window: { CharacterEngine: engine, GameState: { current: { location: '咖啡廳', npcs: [], events: [] } } },
  CharacterEngine: engine,
  document: { readyState: 'loading', addEventListener() {} }
};
vm.runInNewContext(source, ctx);
const card = {
  world: '魔法與科技共存',
  lore: '三年前都市融入魔法世界。\n【世界書：魔法學院｜魔法學院,學院】\n院長艾琳，禁止夜間入校。\n【/世界書】\n【世界書：地下商會｜地下商會,黑市】\n商會坐落在舊城。\n【/世界書】'
};
const unrelated = engine.composeSystemPrompt(card, { recentMessages: [{ role: 'user', content: '在咖啡廳點咖啡' }] });
assert.match(unrelated, /三年前都市融入/);
assert.doesNotMatch(unrelated, /院長艾琳|商會坐落/);
const relevant = engine.composeSystemPrompt(card, { recentMessages: [{ role: 'user', content: '進入魔法學院' }] });
assert.match(relevant, /院長艾琳/);
assert.doesNotMatch(relevant, /商會坐落/);
assert.match(relevant, /魔法與科技共存/);
ctx.window.GameState.current.location = '地下商會';
const byLocation = engine.composeSystemPrompt(card, { recentMessages: [{ role: 'user', content: '我在這裡等著' }] });
assert.match(byLocation, /商會坐落/);
assert.doesNotMatch(byLocation, /院長艾琳/);
ctx.window.GameState.current = { location: '街角', npcs: [{ name: '田中美咲', role: '夜班店員', presence: 'present' }], events: [] };
const byPresentNPC = engine.composeSystemPrompt({
  lore: '【世界書：美咲｜田中美咲,美咲】\\n她正在值夜班。\\n【/世界書】\\n【世界書：其他人｜琉星】\\n不應載入。\\n【/世界書】'
}, { recentMessages: [{ role: 'user', content: '我先不說話' }] });
assert.match(byPresentNPC, /她正在值夜班/);
assert.doesNotMatch(byPresentNPC, /不應載入/);
ctx.window.GameState.current = { location: '街角', npcs: [], events: [{ text: '玩家收到琉星的訊息' }] };
const byRecentEvent = engine.composeSystemPrompt({
  lore: '【世界書：琉星｜琉星】\\nACQUA 的琉星資料。\\n【/世界書】'
}, { recentMessages: [{ role: 'user', content: '繼續' }] });
assert.match(byRecentEvent, /ACQUA 的琉星資料/);
const legacy = engine.composeSystemPrompt({ lore: '只有舊版完整文字。' }, { recentMessages: [] });
assert.match(legacy, /只有舊版完整文字/);
const disabled = engine.composeSystemPrompt({ ...card, prompt_options: { include_lore: false } }, { recentMessages: [{ role: 'user', content: '魔法學院' }] });
assert.doesNotMatch(disabled, /院長艾琳/);
assert.equal(ctx.window.BAOLorebook.parse('【世界書：未完｜學院】文字').entries.length, 0);
console.log('Lorebook tests passed: user, location, present NPC and recent event relevance; legacy and opt-out preserved.');
