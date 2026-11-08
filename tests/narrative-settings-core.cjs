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

// Free-text author metadata is display-only until the player explicitly selects
// a known style. Never infer permissions, pacing or genre from loose labels.
const suggestionPrefs = BAONarrativeSettings.get();
const suggestionCard = { narrative_profile: { recommended_styles: [
  ' 電影感 ', 'cinematic', '自然對話', '第二人稱', '慢熱關係',
  '__proto__', '<img src=x onerror=alert(1)>', 42, null, ''
] } };
const suggestionSource = JSON.stringify(suggestionCard);
assert.deepEqual(BAONarrativeSettings.authorStyleSuggestions(suggestionCard), [
  { label: '電影感', pack: 'cinematic' }, { label: '自然對話', pack: 'natural' },
  { label: '第二人稱', pack: null }, { label: '慢熱關係', pack: null },
  { label: '__proto__', pack: null }, { label: '<img src=x onerror=alert(1)>', pack: null }
]);
assert.equal(JSON.stringify(suggestionCard), suggestionSource);
assert.deepEqual(BAONarrativeSettings.get(), suggestionPrefs);
assert.deepEqual(BAONarrativeSettings.authorStyleSuggestions({}), []);
assert.deepEqual(BAONarrativeSettings.authorStyleSuggestions({ narrative_profile: { recommended_styles: '電影感' } }), []);

BAONarrativeSettings.set({stylePack:'cinematic'});
assert.deepEqual(BAONarrativeSettings.get().stylePacks, ['cinematic']);
BAONarrativeSettings.set({...BAONarrativeSettings.get(), stylePacks:[]});
assert.equal(BAONarrativeSettings.buildPrompt(BAONarrativeSettings.get()), '');

// Optional story direction features must not change an unconfigured story or force plot outcomes.
assert.equal(BAONarrativeSettings.buildPrompt({ sceneFocus: 'card', storyExpectation: '' }), '');
BAONarrativeSettings.set({ sceneFocus: 'protect', storyExpectation: ' 希望她能重新信任我。\n但不能保證和好。 ' });
const direction = BAONarrativeSettings.get();
assert.equal(direction.sceneFocus, 'protect');
assert.equal(direction.storyExpectation, '希望她能重新信任我。\n但不能保證和好。'.replace('\n', ' '));
assert.match(BAONarrativeSettings.buildPrompt(direction), /【場景投入保護】/);
assert.match(BAONarrativeSettings.buildPrompt(direction), /不為補足戲劇密度強塞/);
assert.match(BAONarrativeSettings.buildPrompt(direction), /世界時間、已確立的時限/);
assert.match(BAONarrativeSettings.buildPrompt(direction), /【玩家場外劇情期待｜非角色意圖】/);
assert.match(BAONarrativeSettings.buildPrompt(direction), /不得用它強制 NPC 變心/);
assert.match(BAONarrativeSettings.statusLabel(direction).title, /劇情期待已設定/);
BAONarrativeSettings.set({ sceneFocus: 'invalid', storyExpectation: 'a'.repeat(400) });
assert.equal(BAONarrativeSettings.get().sceneFocus, 'card');
assert.equal(BAONarrativeSettings.get().storyExpectation.length, 240);
BAONarrativeSettings.set({});
assert.equal(BAONarrativeSettings.buildPrompt(BAONarrativeSettings.get()), '');


// One-turn spectator authorization is opt-in and never inherited by a legacy story.
assert.equal(BAONarrativeSettings.observationAllowed({}), false);
assert.equal(BAONarrativeSettings.buildPrompt({ observationMode: 'off' }), '');
BAONarrativeSettings.set({ observationMode: 'one_turn' });
assert.equal(BAONarrativeSettings.get().observationMode, 'one_turn');
assert.equal(BAONarrativeSettings.observationAllowed({ narrative: BAONarrativeSettings.get() }), true);
assert.match(BAONarrativeSettings.statusLabel(BAONarrativeSettings.get()).title, /單輪觀賞已開放/);
assert.match(BAONarrativeSettings.playerPortrayalRule({ narrative: BAONarrativeSettings.get() }), /本輪觀賞標記/);
assert.doesNotMatch(BAONarrativeSettings.playerPortrayalRule({}), /可選觀賞授權/);
BAONarrativeSettings.set({ observationMode: 'unrecognized' });
assert.equal(BAONarrativeSettings.get().observationMode, 'off');
assert.equal(BAONarrativeSettings.buildPrompt(BAONarrativeSettings.get()), '');

// Optional NPC motivation continuity uses the existing extras contract; no new state schema.
assert.deepEqual(BAONarrativeSettings.get().storyExtras, []);
assert.doesNotMatch(BAONarrativeSettings.buildPrompt({}), /讓已有的長短期目標/);
BAONarrativeSettings.set({ storyExtras: ['motivation', 'threads', 'motivation', 'unknown'] });
const motives = BAONarrativeSettings.get();
assert.deepEqual(motives.storyExtras, ['motivation', 'threads']);
assert.match(BAONarrativeSettings.statusLabel(motives).title, /人物心理深度/);
const motivesPrompt = BAONarrativeSettings.buildPrompt(motives);
assert.match(motivesPrompt, /讓已有的長短期目標/);
assert.match(motivesPrompt, /重大新資訊、明確拒絕/);
assert.match(motivesPrompt, /不預設所有人都善於算計/);
assert.match(motivesPrompt, /不強迫每輪出現心理博弈/);
assert.match(motivesPrompt, /未執行的打算與猜測不視為既成事實/);
assert.match(motivesPrompt, /缺少依據時不憑空捏造過往/);
assert.equal((motivesPrompt.match(/讓已有的長短期目標/g) || []).length, 1);
const noThoughtDisclosure = BAONarrativeSettings.buildPrompt({
  playerPortrayal: 'coauthor', innerThoughts: 'none', storyExtras: ['motivation']
});
assert.match(noThoughtDisclosure, /不直接揭露 NPC 內心/);
assert.match(noThoughtDisclosure, /心理呈現仍依既有視角與內心描寫設定/);
assert.match(noThoughtDisclosure, /玩家選擇「小說共創」/);
motives.storyExtras.push('tension');
assert.deepEqual(BAONarrativeSettings.get().storyExtras, ['motivation', 'threads']);
BAONarrativeSettings.set({ storyExtras: ['not-a-feature'] });
assert.deepEqual(BAONarrativeSettings.get().storyExtras, []);
assert.equal(BAONarrativeSettings.buildPrompt(BAONarrativeSettings.get()), '');


// Optional narrative flexibility is a prose-only story extra, not a new core rule.
assert.equal(BAONarrativeSettings.buildPrompt({}), '');
assert.doesNotMatch(BAONarrativeSettings.buildPrompt({ storyExtras: ['unknown'] }), /讓句式、描寫焦點/);
BAONarrativeSettings.set({ storyExtras: ['flexibility', 'motivation', 'flexibility', 'unknown'] });
const flexible = BAONarrativeSettings.get();
assert.deepEqual(flexible.storyExtras, ['flexibility', 'motivation']);
assert.match(BAONarrativeSettings.statusLabel(flexible).title, /敘事靈活性/);
assert.match(BAONarrativeSettings.statusLabel(flexible).title, /人物心理深度/);
const flexiblePrompt = BAONarrativeSettings.buildPrompt(flexible);
assert.match(flexiblePrompt, /讓句式、描寫焦點、對話節奏/);
assert.match(flexiblePrompt, /不把例子當成固定輪替清單/);
assert.match(flexiblePrompt, /符合目前內心揭露設定/);
assert.match(flexiblePrompt, /不為避免冷場強塞轉折/);
assert.match(flexiblePrompt, /讓已有的長短期目標/);
assert.equal((flexiblePrompt.match(/讓句式、描寫焦點、對話節奏/g) || []).length, 1);
const withoutInnerThoughts = BAONarrativeSettings.buildPrompt({
  storyExtras: ['flexibility'], innerThoughts: 'none'
});
assert.match(withoutInnerThoughts, /不直接揭露 NPC 內心/);
assert.match(withoutInnerThoughts, /符合目前內心揭露設定/);
const withInnerThoughts = BAONarrativeSettings.buildPrompt({
  storyExtras: ['flexibility'], innerThoughts: 'clear'
});
assert.match(withInnerThoughts, /可明確描寫 NPC 的內在想法/);
assert.match(withInnerThoughts, /符合目前內心揭露設定/);
flexible.storyExtras.push('daily');
assert.deepEqual(BAONarrativeSettings.get().storyExtras, ['flexibility', 'motivation']);
BAONarrativeSettings.set({ storyExtras: ['not-a-feature'] });
assert.deepEqual(BAONarrativeSettings.get().storyExtras, []);
assert.equal(BAONarrativeSettings.buildPrompt(BAONarrativeSettings.get()), '');
