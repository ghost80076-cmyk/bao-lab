const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class MemoryLocalStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

global.window = global;
global.localStorage = new MemoryLocalStorage();
global.App = {
  escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, x => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[x]));
  }
};
global.document = {
  querySelector() { return null; },
  getElementById() { return null; },
  createElement() { return { style: {}, dataset: {}, appendChild() {}, addEventListener() {} }; },
  body: { appendChild() {} }
};
global.setInterval = () => 1;
global.clearInterval = () => {};

const characterCode = fs.readFileSync(path.join(__dirname, "..", "js", "character.js"), "utf8");
vm.runInThisContext(characterCode, { filename: "js/character.js" });
const readinessCode = fs.readFileSync(path.join(__dirname, "..", "js", "character-readiness.js"), "utf8");
vm.runInThisContext(readinessCode, { filename: "js/character-readiness.js" });

const linPath = path.join(__dirname, "..", "data", "characters", "general", "linchenfeng.json");
const lin = JSON.parse(fs.readFileSync(linPath, "utf8"));
const report = CharacterEngine.audit(lin);

assert.equal(report.ok, true, report.errors.join("\n"));
assert.equal(report.character.category, "female", "女性向是作品受眾分類，不是角色性別");
assert.equal(report.character.gender, "male", "林沉風本人是男性角色");
assert.equal(report.character.name, "林沉風");
assert.equal(report.longFormReady, true, JSON.stringify(report, null, 2));
assert.ok(report.score >= 85);
assert.equal(report.character.supported_modes.world, true);
assert.ok(report.character.world.includes("匿名論壇"));
assert.ok(Array.isArray(report.character.narrative_profile.recommended_styles));
assert.ok(report.character.world_modules.some(module => module.id === "relationship"));
assert.ok(report.character.dynamic_prompts.some(block => block.id === "intimacy"));
assert.equal(report.character.initial_state.character_statuses["林沉風"].relationship_stage, "陌生人｜試探階段");
assert.equal(report.character.initial_state.modules.relationship.trust, "尚未建立");

const baseContext = {
  persona: { name: "玩家", gender: "女性" },
  modePrompt: "保持沉浸敘事。",
  displayMode: "text"
};
const ordinaryPrompt = CharacterEngine.composeSystemPrompt(lin, {
  ...baseContext,
  recentMessages: [{ role: "user", content: "今天工作有點累。" }]
});
assert.equal(ordinaryPrompt.includes("【親密情境｜林沉風】"), false, "一般對話不應浪費 token 載入親密模組");
const intimatePrompt = CharacterEngine.composeSystemPrompt(lin, {
  ...baseContext,
  recentMessages: [
    { role: "assistant", content: "林沉風沒有催促，只是安靜看著你。" },
    { role: "user", content: "我靠近他，想吻他。" }
  ]
});
assert.equal(intimatePrompt.includes("【親密情境｜林沉風】"), true, "親密情境應載入專屬互動規則");
assert.ok(intimatePrompt.includes("情緒與信任先於身體行動"));

const invalid = JSON.parse(JSON.stringify(lin));
invalid.gameplay.character_status.fields.push({
  key: invalid.gameplay.character_status.fields[0].key,
  label: "重複欄位",
  type: "text"
});
invalid.presentation.supported_display = { text: false, ui: false };
const invalidReport = CharacterEngine.audit(invalid);
assert.equal(invalidReport.ok, false);
assert.ok(invalidReport.errors.some(x => x.includes("key 不可重複")));
assert.ok(invalidReport.errors.some(x => x.includes("至少需要啟用")));

console.log(`character readiness core test passed (${report.score}/100 ${report.grade})`);
