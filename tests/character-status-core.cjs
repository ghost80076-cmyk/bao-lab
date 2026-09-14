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

BAOCharacterStatus.resetCustomization(character);
assert.equal(BAOCharacterStatus.configFor(character).fields.some(field => field.key === "custom_alert"), false);
assert.equal(GameState.current.characterStatuses[character.name].custom_alert, undefined);
assert.equal(JSON.stringify(character), originalCard);
assert.equal(WorldStateEngine.enabled({ narrativeMode: "immersive", displayMode: "text" }), true);

console.log("character status core test passed");
