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
assert.equal(report.character.gender, "female");
assert.equal(report.character.name, "林沉風");
assert.equal(report.longFormReady, true, JSON.stringify(report, null, 2));
assert.ok(report.score >= 85);
assert.equal(report.character.supported_modes.world, true);
assert.ok(report.character.world.includes("匿名論壇"));
assert.ok(Array.isArray(report.character.narrative_profile.recommended_styles));
assert.ok(report.character.world_modules.some(module => module.id === "relationship"));
assert.equal(report.character.initial_state.character_statuses["林沉風"].relationship_stage, "陌生人｜試探階段");
assert.equal(report.character.initial_state.modules.relationship.trust, "尚未建立");

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
