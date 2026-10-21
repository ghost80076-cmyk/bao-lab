const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

global.window = global;
global.App = {
  __buildMessagesWrapperIds: new Set(),
  config: {},
  async buildMessages() {
    return [
      { role: "system", content: "BASE" },
      { role: "assistant", content: "上一輪" },
      { role: "user", content: "玩家最新輸入" }
    ];
  },
  wrapBuildMessages(id, wrapper) {
    if (this.__buildMessagesWrapperIds.has(id)) return false;
    const next = this.buildMessages.bind(this);
    this.buildMessages = (...args) => wrapper.call(this, next, ...args);
    this.__buildMessagesWrapperIds.add(id);
    return true;
  }
};

const source = fs.readFileSync(path.join(__dirname, "..", "js", "prompt-orchestrator.js"), "utf8");
vm.runInThisContext(source, { filename: "js/prompt-orchestrator.js" });

assert.equal(
  App.__buildMessagesWrapperIds.has("prompt-orchestrator:rules"),
  true,
  "prompt orchestrator must install through App.wrapBuildMessages"
);
assert.equal(BAOPromptOrchestrator.version, 4);
assert.match(BAOPromptOrchestrator.playerAgencyRule, /對話選項與行動建議/);
assert.match(BAOPromptOrchestrator.playerAgencyRule, /不可逆/);
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
  assert.match(gemini[0].content, /玩家自主權/);
  assert.match(gemini[0].content, /NPC 與世界仍依因果自主反應/);
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

  // Yume-only repair is stable, includes older saved cards, and never affects other works.
  App.activeCharacter = { id: "kurobane-yume-kabukicho" };
  const localConfig = { api: { type: "lmstudio", model: "local-model" } };
  const yume = await App.buildMessages(localConfig);
  assert.match(yume[0].content, /【黑羽ゆめ｜語言與場景】/);
  assert.match(yume[0].content, /自然繁體中文/);
  assert.match(yume[0].content, /緊接繁中譯文/);
  assert.match(yume[0].content, /已進便利店且未離開/);
  assert.match(yume[0].content, /CHAR 角色標籤/);
  assert.doesNotMatch(yume[0].content, /\[CHAR:yume\]/);
  assert.doesNotMatch(yume.at(-1).content, /黑羽ゆめ｜語言與場景/, "no per-turn token tax");
  const yumeAgain = await App.buildMessages(localConfig);
  assert.equal(yume[0].content, yumeAgain[0].content, "Yume stable prefix can be cached");
  App.activeCharacter = { id: "some-other-card" };
  const other = await App.buildMessages(localConfig);
  assert.doesNotMatch(other[0].content, /黑羽ゆめ｜語言與場景/, "other cards retain their language");

  // Long-story failure: fixed-round/pressure trimming may hide the hospital
  // scene, but locally saved recent source still exists and can be re-anchored.
  global.GameState = { current: {
    time: '凌晨兩點十六分', location: '公寓',
    stateTracker: { phase: 'failed' }, pendingStateTurns: [{ player: '先前', assistant: '錯誤' }]
  } };
  global.Chat = { messages: [], turnCount() {
    return this.messages.filter(m => m.role === 'user').length;
  } };
  for (let i = 0; i < 39; i++) {
    Chat.messages.push({ role: 'user', content: `玩家行動${i}` },
      { role: 'assistant', content: i === 38
        ? '走進醫院急診室，完成登記並與醫師交談。'
        : `故事場景${i}` });
  }
  Chat.messages.push({ role: 'user', content: '接著呢？' });
  const hospital = await App.buildMessages(localConfig);
  assert.match(hospital.at(-1).content, /狀態延遲｜近期劇情原文/);
  assert.match(hospital.at(-1).content, /走進醫院急診室，完成登記/);
  assert.match(hospital.at(-1).content, /依較新的已完成事件推進/);
  assert.doesNotMatch(hospital[0].content, /走進醫院急診室/, 'cacheable system prefix must remain stable');
  assert.ok(BAOPromptOrchestrator.recentContinuityEvidence().length < 1200, 'stale state evidence must remain bounded');
  GameState.current.stateTracker.phase = 'updated';
  GameState.current.pendingStateTurns = [];
  const recovered = await App.buildMessages(localConfig);
  assert.doesNotMatch(recovered.at(-1).content, /狀態延遲｜近期劇情原文/, 'no repeating raw transcript once tracker is healthy');

  console.log("prompt orchestrator core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
