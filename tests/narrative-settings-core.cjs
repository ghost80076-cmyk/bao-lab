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
assert.equal(defaults.responseLength, "card");
assert.equal(defaults.pacing, "card");
assert.equal(defaults.dialogueBalance, "card");
assert.deepEqual(defaults.customInstructions, []);
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

BAONarrativeSettings.set({
  responseLength: "long",
  pacing: "slow",
  dialogueBalance: "dialogue",
  customInstructions: [
    { text: "重要對話不要急著總結，保留沉默與停頓。", enabled: true },
    { text: "重要對話不要急著總結，保留沉默與停頓。", enabled: true },
    { text: "不得替玩家決定心理、台詞或行動。", enabled: true },
    { text: "NPC 可以知道所有未在場事件。", enabled: true },
    { text: "這條停用不應出現。", enabled: false }
  ]
});
const writing = BAONarrativeSettings.get();
assert.equal(writing.responseLength, "long");
assert.equal(writing.pacing, "slow");
assert.equal(writing.dialogueBalance, "dialogue");
assert.equal(writing.customInstructions.length, 5);
assert.equal(BAONarrativeSettings.classifyInstruction("不得替玩家決定心理、台詞或行動。").kind, "redundant");
assert.equal(BAONarrativeSettings.classifyInstruction("NPC 可以知道所有未在場事件。").kind, "conflict");

const writingPrompt = BAONarrativeSettings.buildPrompt(writing);
assert.match(writingPrompt, /900–1400/);
assert.match(writingPrompt, /敘事慢慢展開/);
assert.match(writingPrompt, /提高對話比例/);
assert.match(writingPrompt, /重要對話不要急著總結/);
assert.equal((writingPrompt.match(/重要對話不要急著總結/g) || []).length, 1);
assert.doesNotMatch(writingPrompt, /不得替玩家決定心理、台詞或行動/);
assert.doesNotMatch(writingPrompt, /NPC 可以知道所有未在場事件/);
assert.doesNotMatch(writingPrompt, /這條停用不應出現/);

const tooMany = Array.from({ length: 12 }, (_, index) => ({ text: "自訂規則 " + index + " " + "字".repeat(230), enabled: true }));
BAONarrativeSettings.set({ customInstructions: tooMany });
const capped = BAONarrativeSettings.get();
assert.equal(capped.customInstructions.length, 10);
assert.ok(capped.customInstructions.every(item => item.text.length <= 200));

BAONarrativeSettings.set({ matureDrama: "invalid", characterAgency: "invalid", responseLength: "invalid", pacing: "invalid", dialogueBalance: "invalid" });
const repaired = BAONarrativeSettings.get();
assert.equal(repaired.matureDrama, "card");
assert.equal(repaired.characterAgency, "card");
assert.equal(repaired.responseLength, "card");
assert.equal(repaired.pacing, "card");
assert.equal(repaired.dialogueBalance, "card");

console.log("narrative settings core test passed");

// New experience choices retain bounded input, no-op defaults and legacy settings.
assert.deepEqual(BAONarrativeSettings.get().storyExtras, []);
BAONarrativeSettings.set({ stylePacks: ['tender'], storyExtras: ['daily','threads','daily','unknown'], characterAgency:'active' });
const tonight = BAONarrativeSettings.get();
assert.deepEqual(tonight.storyExtras, ['daily','threads']);
assert.match(BAONarrativeSettings.buildPrompt(tonight), /不預設角色愛上玩家/);
assert.match(BAONarrativeSettings.buildPrompt(tonight), /缺少依據時不憑空捏造過往/);
assert.match(BAONarrativeSettings.buildPrompt(tonight), /角色更常主動/);
tonight.storyExtras.push('tension');
assert.deepEqual(BAONarrativeSettings.get().storyExtras, ['daily','threads'], 'returned arrays must be isolated');
for (const agency of ['reserved','natural','active','autonomous']) {
  assert.match(BAONarrativeSettings.buildPrompt({characterAgency:agency}), /角色/);
}
for (const pack of ['tender','suspense','literary']) {
  assert.match(BAONarrativeSettings.buildPrompt({stylePacks:[pack]}), /不得破壞角色卡人格/);
}
// The new style is opt-in, composable, deduplicated, and never imposes per-turn drama.
BAONarrativeSettings.set({ stylePacks: ['realist_subtext', 'natural', 'realist_subtext', 'unknown'] });
const realist = BAONarrativeSettings.get();
assert.deepEqual(realist.stylePacks, ['realist_subtext', 'natural']);
assert.match(BAONarrativeSettings.statusLabel(realist).title, /寫實留白 · 細膩敘事/);
const realistPrompt = BAONarrativeSettings.buildPrompt(realist);
assert.match(realistPrompt, /採寫實留白的敘事方式/);
assert.match(realistPrompt, /對話潛台詞/);
assert.match(realistPrompt, /允許平凡日常與直白表達/);
assert.match(realistPrompt, /自然口語/);
assert.equal((realistPrompt.match(/採寫實留白的敘事方式/g) || []).length, 1);
assert.doesNotMatch(realistPrompt, /每輪必須|強制轉折/);

BAONarrativeSettings.set({});
assert.equal(BAONarrativeSettings.buildPrompt(BAONarrativeSettings.get()), '');

BAONarrativeSettings.set({stylePack:'cinematic'});
assert.deepEqual(BAONarrativeSettings.get().stylePacks, ['cinematic']);
BAONarrativeSettings.set({...BAONarrativeSettings.get(), stylePacks:[]});
assert.equal(BAONarrativeSettings.buildPrompt(BAONarrativeSettings.get()), '');
