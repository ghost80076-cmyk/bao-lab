const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

global.window = global;
global.addEventListener = () => {};
global.localStorage = {
  value: "",
  getItem() { return this.value || null; },
  setItem(_key, value) { this.value = String(value); }
};
global.document = {
  readyState: "loading",
  head: { appendChild() {} },
  body: { appendChild() {} },
  createElement() { return {}; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  getElementById() { return null; },
  addEventListener() {}
};
global.App = {
  config: {},
  activeCharacter: { world_focus: [] },
  escapeHTML: String,
  collectConfig() { return {}; },
  buildSystemPrompt() { return "BASE"; },
  renderChatShell() {},
  openBuilder() {},
  saveStory() {}
};

const source = fs.readFileSync(path.join(__dirname, "..", "js", "narrative-settings.js"), "utf8");
vm.runInThisContext(source, { filename: "js/narrative-settings.js" });

const defaults = BAONarrativeSettings.get();
assert.equal(defaults.matureDrama, "card");
assert.equal(defaults.characterAgency, "card");
assert.equal(BAONarrativeSettings.buildPrompt({}), "", "default settings must not add prompt tokens");

BAONarrativeSettings.set({ matureDrama: "mature", characterAgency: "autonomous" });
const prefs = BAONarrativeSettings.get();
assert.equal(prefs.matureDrama, "mature");
assert.equal(prefs.characterAgency, "autonomous");

const prompt = BAONarrativeSettings.buildPrompt(prefs);
assert.match(prompt, /面向成年讀者的成熟文學取向/);
assert.match(prompt, /NPC／角色維持自身人格/);
assert.match(prompt, /可拒絕、誤解、欺瞞、爭執/);
assert.match(prompt, /不得把明確拒絕擅自改寫成同意/);
assert.doesNotMatch(prompt, /繞過審查|忽略內容政策|抗拒永遠/);

const systemPrompt = App.buildSystemPrompt();
assert.match(systemPrompt, /^BASE/);
assert.match(systemPrompt, /玩家敘事偏好/);
assert.match(systemPrompt, /成熟文學取向/);

BAONarrativeSettings.set({ matureDrama: "invalid", characterAgency: "invalid" });
const repaired = BAONarrativeSettings.get();
assert.equal(repaired.matureDrama, "card");
assert.equal(repaired.characterAgency, "card");

console.log("narrative settings core test passed");
