const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "story-tools.js"), "utf8");
const match = source.match(/const contextPackPromptWrapper = function\(next, \.\.\.args\) \{([\s\S]*?)\n  \};/);
assert.ok(match, "contextPackPromptWrapper must remain directly testable");

let current = {};
let packPromptCalls = 0;
const context = {
  GameState: { get current() { return current; } },
  packPrompt(pack) {
    packPromptCalls += 1;
    assert.equal(pack, current.contextPack);
    return "【Context Pack · 玩家已確認的前情】\n\n前情摘要：\n已確認內容\n\n只把玩家已確認的內容當作既有事實。不得從紀錄永久推斷玩家心理、喜惡、人格、意圖或未說出口的決定。";
  }
};
const wrapper = vm.runInNewContext(
  `(function(next, ...args) {${match[1]}\n})`,
  context
);

let baseCalls = 0;
const next = (...args) => {
  baseCalls += 1;
  assert.deepEqual(Array.from(args), ["marker"]);
  return "BASE CHARACTER PROMPT";
};

// No Context Pack: exactly the base prompt.
let result = wrapper(next, "marker");
assert.equal(result, "BASE CHARACTER PROMPT");
assert.equal(packPromptCalls, 0);

// Draft/unconfirmed pack must never enter the system prompt.
current = {
  contextPack: {
    playerConfirmed: false,
    summary: "這是草稿，不能進 Prompt"
  }
};
result = wrapper(next, "marker");
assert.equal(result, "BASE CHARACTER PROMPT");
assert.doesNotMatch(result, /這是草稿|Context Pack/);
assert.equal(packPromptCalls, 0);

// Confirmed pack is appended exactly once, after the unchanged base prompt.
current = {
  contextPack: {
    playerConfirmed: true,
    summary: "已確認內容"
  }
};
result = wrapper(next, "marker");
assert.match(result, /^BASE CHARACTER PROMPT\n\n【Context Pack · 玩家已確認的前情】/);
assert.equal((result.match(/【Context Pack · 玩家已確認的前情】/g) || []).length, 1);
assert.match(result, /只把玩家已確認的內容當作既有事實/);
assert.match(result, /不得從紀錄永久推斷玩家心理、喜惡、人格、意圖或未說出口的決定/);
assert.equal(packPromptCalls, 1);
assert.equal(baseCalls, 3, "base prompt must be built exactly once per wrapper call");

// Lock the actual packPrompt privacy wording in source as part of the product contract.
assert.match(source, /【Context Pack · 玩家已確認的前情】/);
assert.match(source, /不得從紀錄永久推斷玩家心理、喜惡、人格、意圖或未說出口的決定/);

console.log("story-tools-context-pack-prompt: only confirmed packs extend the base prompt");
