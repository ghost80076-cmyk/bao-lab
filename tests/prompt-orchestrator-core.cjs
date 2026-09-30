const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

global.window = global;
global.App = {
  config: {},
  async buildMessages() {
    return [
      { role: "system", content: "BASE" },
      { role: "assistant", content: "上一輪" },
      { role: "user", content: "玩家最新輸入" }
    ];
  }
};

const source = fs.readFileSync(path.join(__dirname, "..", "js", "prompt-orchestrator.js"), "utf8");
vm.runInThisContext(source, { filename: "js/prompt-orchestrator.js" });

assert.equal(BAOPromptOrchestrator.version, 3);
assert.equal(BAOPromptOrchestrator.familyFor({ model: "google/gemini-3.1-pro-preview", type: "openrouter" }), "gemini");
assert.equal(BAOPromptOrchestrator.familyFor({ model: "anthropic/claude-sonnet-4.5", type: "openrouter" }), "claude");
assert.equal(BAOPromptOrchestrator.familyFor({ model: "deepseek/deepseek-v4.1" }), "deepseek");
assert.equal(BAOPromptOrchestrator.familyFor({ model: "glm-5", baseUrl: "https://api.z.ai/api/paas/v4" }), "glm");
assert.equal(BAOPromptOrchestrator.familyFor({ model: "minimax-m3" }), "minimax");
assert.equal(BAOPromptOrchestrator.familyFor({ model: "gpt-5.6" }), "gpt");
assert.equal(BAOPromptOrchestrator.familyFor({ model: "unknown-model" }), "generic");

// Prompt-bloat guard: shared rules and per-turn reminders must stay tiny.
assert.ok(BAOPromptOrchestrator.priorityPrompt.length <= 120, "priority prompt too large: " + BAOPromptOrchestrator.priorityPrompt.length);
assert.ok(BAOPromptOrchestrator.sceneParticipationRule.length <= 90, "scene participation rule too large: " + BAOPromptOrchestrator.sceneParticipationRule.length);
assert.ok(BAOPromptOrchestrator.turnAnchor.length <= 55, "turn anchor too large: " + BAOPromptOrchestrator.turnAnchor.length);
for (const family of ["deepseek", "glm", "minimax"]) {
  const guidance = BAOPromptOrchestrator.guidanceFor({ model: family });
  assert.ok(guidance.length <= 80, family + " adapter too large: " + guidance.length);
}

// Modern models get no generic prose lesson unless BAO/LAB has an observed failure mode.
for (const model of ["gpt-5.6", "google/gemini-3.1-pro-preview", "anthropic/claude-sonnet-4.5", "unknown-model"]) {
  assert.equal(BAOPromptOrchestrator.guidanceFor({ model }), "");
}

(async () => {
  const gemini = await App.buildMessages({ api: { type: "openrouter", model: "google/gemini-3.1-pro-preview" } });
  assert.match(gemini[0].content, /平台硬規則/);
  assert.match(gemini[0].content, /場景參與/);
  assert.match(gemini[0].content, /在場≠必須發言/);
  assert.match(gemini[0].content, /只依自身已知資訊反應/);
  assert.doesNotMatch(gemini[0].content, /模型補丁/);
  assert.match(gemini.at(-1).content, /玩家最新輸入/);
  assert.match(gemini.at(-1).content, /【本輪】/);
  assert.match(gemini.at(-1).content, /不代寫玩家/);
  assert.doesNotMatch(gemini.at(-1).content, /場景參與|在場≠必須發言/);
  assert.doesNotMatch(gemini.at(-1).content, /生動|感官|電影|段落/);
  assert.equal(gemini.length, 3, "scene participation must not add another output-facing message");

  // Same model + same base prompt => identical first system message, preserving the cacheable prefix.
  const geminiAgain = await App.buildMessages({ api: { type: "openrouter", model: "google/gemini-3.1-pro-preview" } });
  assert.equal(geminiAgain[0].content, gemini[0].content);

  const glm = await App.buildMessages({ api: { model: "glm-5", baseUrl: "https://api.z.ai/api/paas/v4" } });
  assert.match(glm[0].content, /模型補丁 · GLM/);
  assert.match(glm[0].content, /後半段、否定句、條件句/);

  const minimax = await App.buildMessages({ api: { model: "minimax-m3" } });
  assert.match(minimax[0].content, /模型補丁 · MiniMax/);
  assert.match(minimax[0].content, /勿重置已確認/);

  const deepseek = await App.buildMessages({ api: { model: "deepseek/deepseek-v4.1" } });
  assert.match(deepseek[0].content, /模型補丁 · DeepSeek/);
  assert.match(deepseek[0].content, /玩家最新輸入/);

  console.log("prompt orchestrator core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
