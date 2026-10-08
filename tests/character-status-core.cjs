const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

global.window = global;
global.App = { config: {}, activeCharacter: null };
global.API = { send: async () => ({ text: "{}" }) };

const run = file => vm.runInThisContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), { filename: file });
run("js/state.js");
run("js/world-state.js");
run("js/character-status.js");

const character = {
  name: "測試角色",
  character_status: {
    enabled: true,
    allow_player_customize: true,
    fields: [
      { key: "condition", label: "狀態", type: "text", context: "core", track: true, player_toggle: false, player_rename: false, default: "正常" },
      { key: "clue", label: "線索", type: "text", context: "relevant", track: true, default: "銀色鑰匙" },
      { key: "note", label: "備註", type: "text", context: "ui_only", track: false, default: "UI" }
    ]
  },
  initial_state: { npcs: [], character_statuses: {} }
};

App.activeCharacter = character;
GameState.create(character, App.config);

const originalCard = JSON.stringify(character);
const applied = BAOCharacterStatus.applyCustomization({
  hidden: ["condition", "clue"],
  labels: { condition: "不可改名", clue: "新線索名" },
  order: ["custom_alert", "condition", "clue", "note"],
  customFields: [{
    key: "custom_alert",
    label: "警戒值",
    type: "meter",
    context: "core",
    track: true,
    default: 25,
    min: 0,
    max: 100,
    description: "只在故事明確出現戒備反應時更新。"
  }]
}, character);

assert.deepEqual(applied.customization.hidden, ["clue"]);
assert.equal(applied.customization.labels.condition, undefined);
assert.equal(applied.customization.labels.clue, "新線索名");
assert.equal(applied.fields[0].key, "custom_alert");
assert.equal(GameState.current.characterStatuses[character.name].custom_alert, 25);
assert.match(BAOCharacterStatus.trackerRules(), /警戒值 \(custom_alert\).*meter.*0～100/);

GameState.applyUpdate({ character_statuses: { [character.name]: { custom_alert: 999, note: "不接受未追蹤以外的錯誤 key", unknown: "drop" } } });
assert.equal(GameState.current.characterStatuses[character.name].custom_alert, 100);
assert.equal(GameState.current.characterStatuses[character.name].unknown, undefined);

const tracker = BAOCharacterStatus.snapshotForTracker(character.name);
assert.equal(tracker[character.name].custom_alert, 100);
assert.equal(tracker[character.name].note, undefined);

const unrelated = BAOCharacterStatus.compactForPrompt("今天天氣很好");
assert.match(unrelated.text, /狀態=正常/);
assert.match(unrelated.text, /警戒值=100/);
assert.doesNotMatch(unrelated.text, /線索=/);
assert.doesNotMatch(unrelated.text, /備註=/);

const relevant = BAOCharacterStatus.compactForPrompt("我查看銀色鑰匙的線索");
assert.match(relevant.text, /線索=銀色鑰匙/);

GameState.upsertNPC({ name: "同學甲", role: "同學", status: { condition: "疲憊", clue: "羽毛筆" } });
GameState.upsertNPC({ name: "同學乙", role: "同學", status: { condition: "緊張", clue: "舊地圖" } });
BAOCharacterStatus.toggleContextCharacter("同學甲");
BAOCharacterStatus.toggleContextCharacter("同學乙");
assert.deepEqual(BAOCharacterStatus.selectedContextCharacters(), ["同學甲", "同學乙"]);
const multi = BAOCharacterStatus.compactForPrompt("我繼續往前走", { maxCharacters: 2, consumeViewed: false });
assert.equal(multi.names.includes("同學甲"), true);
assert.equal(multi.names.includes("同學乙"), true);
assert.match(multi.text, /同學甲/);
assert.match(multi.text, /同學乙/);
assert.equal(BAOCharacterStatus.selectedContextCharacters().length, 2);
BAOCharacterStatus.compactForPrompt("我繼續往前走", { maxCharacters: 2, consumeViewed: true });
assert.deepEqual(BAOCharacterStatus.selectedContextCharacters(), []);

GameState.current.location = "教室";
GameState.upsertNPC({ name: "同學甲", role: "同學", location: "教室", presence: "present" });
GameState.upsertNPC({ name: "同學乙", role: "班長", presence: "away" });
assert.deepEqual(BAOCharacterStatus.sceneNPCs().map(npc => npc.name), ["同學甲"]);
const scene = BAOCharacterStatus.setSceneParticipants(["同學乙"]);
assert.deepEqual(scene, ["同學乙"]);
assert.equal(GameState.current.npcs.find(npc => npc.name === "同學甲").presence, "away");
assert.equal(GameState.current.npcs.find(npc => npc.name === "同學乙").presence, "present");
assert.equal(GameState.current.npcs.find(npc => npc.name === "同學乙").location, "教室");
const rosterIndex = BAOCharacterStatus.compactRosterIndex();
assert.match(rosterIndex, /同學甲｜同學/);
assert.match(rosterIndex, /同學乙｜班長/);
assert.doesNotMatch(rosterIndex, /疲憊|緊張|羽毛筆|舊地圖/);

BAOCharacterStatus.resetCustomization(character);
assert.equal(BAOCharacterStatus.configFor(character).fields.some(field => field.key === "custom_alert"), false);
assert.equal(GameState.current.characterStatuses[character.name].custom_alert, undefined);
assert.equal(JSON.stringify(character), originalCard);
assert.equal(WorldStateEngine.enabled({ narrativeMode: "immersive", displayMode: "text" }), true);

const modernCard = {
  schema_version: "1.5",
  name: '愛吃"辣椒"的89妹',
  character_status: {
    enabled: true,
    fields: [{ key: "condition", label: "狀態", type: "text", context: "core", track: true, default: "正常" }]
  },
  initial_state: { npcs: [{ name: "陳思婷", role: "NPC" }] }
};
App.activeCharacter = modernCard;
GameState.create(modernCard, App.config);
assert.equal(Object.hasOwn(GameState.current.characterStatuses, modernCard.name), false);
assert.equal(Object.hasOwn(GameState.current.characterStatuses, "陳思婷"), true);
assert.deepEqual(BAOCharacterStatus.statusNames(modernCard), ["陳思婷"]);
assert.equal(BAOCharacterStatus.isPrimaryCharacterName("陳思婷", modernCard), true);

GameState.current.characterStatuses[modernCard.name] = { condition: "舊版誤建" };
GameState.current.uiContextCharacters = [modernCard.name, "陳思婷"];
BAOCharacterStatus.ensureState(modernCard);
assert.equal(Object.hasOwn(GameState.current.characterStatuses, modernCard.name), false, "schema 1.5 work title must not survive as a person");
assert.deepEqual(BAOCharacterStatus.selectedContextCharacters(), ["陳思婷"]);

const simulatorCard = {
  schema_version: "1.5",
  name: "模擬世界",
  character_status: {
    enabled: true,
    fields: [{ key: "condition", label: "狀態", type: "text", context: "core", track: true, default: "正常" }]
  },
  initial_state: { npcs: [] }
};
App.activeCharacter = simulatorCard;
GameState.create(simulatorCard, App.config);
assert.deepEqual(BAOCharacterStatus.statusNames(simulatorCard), []);
assert.equal(Object.hasOwn(GameState.current.characterStatuses, "模擬世界"), false);

console.log("character status core test passed");

// Exercise all published cards and both model update ingress paths.
run("js/character.js");
const catalog = [...require('../data/characters.json'), ...require('../data/character-catalog/community/page-0001.json')];
const visited = new Set();
for (const item of catalog) {
  if (visited.has(item.id)) continue;
  visited.add(item.id);
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', item.file), 'utf8'));
  const original = JSON.stringify(raw);
  const c = CharacterEngine.normalize(raw);
  App.activeCharacter = c;
  GameState.create(c, App.config);
  const declared = new Set([
    ...(c.initial_state.npcs || []).map(n => n.name),
    ...Object.keys(c.initial_state.character_statuses || {}),
    ...[].concat(c.character_status.primary_character_name || c.character_status.primary_character || c.character_status.subject_name || [])
  ]);
  const legitimateTitleActor = declared.has(c.name);
  GameState.applyUpdate({ npcs: [{name:c.name, status:{condition:'誤建'}}], character_statuses: {[c.name]:{condition:'誤建'}} });
  if (!legitimateTitleActor) {
    assert.equal(GameState.current.npcs.some(n => n.name === c.name), false, item.id + ': model NPC title rejected');
    assert.equal(Object.hasOwn(GameState.current.characterStatuses, c.name), false, item.id + ': model status title rejected');
    GameState.upsertNPC({name:' ' + c.name + ' ', status:{condition:'誤建'}});
    GameState.current.npcs.push({name:c.name});
    GameState.current.characterStatuses[c.name] = {condition:'舊存檔誤建'};
    BAOCharacterStatus.ensureState(c);
    assert.equal(GameState.current.npcs.some(n => n.name.trim() === c.name), false, item.id + ': saved title NPC repaired');
    assert.equal(Object.hasOwn(GameState.current.characterStatuses, c.name), false, item.id + ': saved title status repaired');
  } else {
    assert.equal(GameState.current.npcs.some(n => n.name === c.name), true, item.id + ': explicitly declared actor retained');
  }
  if (c.title !== c.name && !declared.has(c.title)) {
    GameState.applyUpdate({npcs:[{name:c.title}], character_statuses:{[c.title]:{condition:'誤建'}}});
    assert.equal(GameState.current.npcs.some(n => n.name === c.title), false, item.id + ': display title alias rejected');
    assert.equal(Object.hasOwn(GameState.current.characterStatuses, c.title), false);
  }
  GameState.upsertNPC({name:'新登場人物', role:'路人'});
  assert.equal(GameState.current.npcs.some(n => n.name === '新登場人物'), true, item.id + ': genuine discovered NPC retained');
  assert.equal(JSON.stringify(raw), original, item.id + ': source card unchanged');
}
console.log('All ' + visited.size + ' published cards: work titles rejected, saved pollution repaired, real actors retained');
