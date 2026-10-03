const assert = require("node:assert/strict");
const core = require("../js/interpretation-mods-core.js");

const catalog = [
  {
    id: "bun-interpreter",
    label: "🎀 肉包",
    stage: "pre_response_advisor",
    prompt: "肉包規則"
  },
  {
    id: "class-monitor",
    label: "📘 班長",
    stage: "post_response_observer",
    prompt: "班長規則"
  }
];

{
  const safe = core.sanitizeCatalog([
    ...catalog,
    { id: "bad-stage", label: "錯誤", stage: "story_rewriter", prompt: "x" },
    { id: "bun-interpreter", label: "重複", stage: "pre_response_advisor", prompt: "x" }
  ]);
  assert.deepEqual(safe.map(item => item.id), ["bun-interpreter", "class-monitor"]);
}

{
  const state = core.normalizeState({});
  assert.deepEqual(state.enabled, []);
  assert.equal(state.detailMode, "compact");
  assert.equal(state.monitorTone, "professional");
  assert.equal(state.showAdvisor, true);
}

{
  let state = core.normalizeState({});
  state = core.toggle(state, "bun-interpreter", true);
  state = core.toggle(state, "class-monitor", true);
  assert.deepEqual(core.activeMods(state, catalog).map(item => item.id), ["bun-interpreter", "class-monitor"]);
  assert.deepEqual(core.activeForStage(state, catalog, "pre_response_advisor").map(item => item.id), ["bun-interpreter"]);
  assert.deepEqual(core.activeForStage(state, catalog, "post_response_observer").map(item => item.id), ["class-monitor"]);

  state = core.applyCommand(state, core.command("【關閉雙系統】", catalog));
  assert.deepEqual(state.enabled, []);
  state = core.applyCommand(state, core.command("【啟用雙系統】", catalog));
  assert.deepEqual(state.enabled.sort(), ["bun-interpreter", "class-monitor"]);

  state = core.applyCommand(state, core.command("【班長切換吐槽模式】", catalog));
  assert.equal(state.monitorTone, "banter");
  state = core.applyCommand(state, core.command("【解讀詳細模式】", catalog));
  assert.equal(state.detailMode, "detailed");
}

{
  let state = core.normalizeState({});
  state = core.applyCommand(state, core.command("【啟用肉包】", catalog));
  assert.deepEqual(state.enabled, ["bun-interpreter"]);
  state = core.applyCommand(state, core.command("【啟用班長】", catalog));
  assert.deepEqual(state.enabled.sort(), ["bun-interpreter", "class-monitor"]);
  state = core.applyCommand(state, core.command("【關閉肉包】", catalog));
  assert.deepEqual(state.enabled, ["class-monitor"]);
}

{
  let state = core.normalizeState({});
  state = core.addOutput(state, {
    messageId: "assistant-1",
    playerMessageId: "user-1",
    advisor: "可能是在試探，但資訊不足。",
    observer: "她停頓了一下；可能有所保留。",
    createdAt: "2026-10-03T10:00:00Z"
  });
  const output = core.outputFor(state, "assistant-1");
  assert.equal(output.playerMessageId, "user-1");
  assert.match(output.advisor, /資訊不足/);
  assert.match(output.observer, /可能/);
}

{
  const messages = core.buildAdvisorMessages({
    mods: [catalog[0]],
    playerText: "要不要一起吃午餐？",
    previousScene: "她把書闔上，看了過來。",
    detailMode: "compact"
  });
  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /不是玩家的真實內心/);
  assert.match(messages[0].content, /不得把模糊行為解讀成明確同意、戀愛或敵意/);
  assert.match(messages[0].content, /肉包規則/);
  assert.match(messages[1].content, /要不要一起吃午餐/);
  assert.match(messages[1].content, /她把書闔上/);

  const injected = core.advisorContext("玩家可能是在低壓力邀約。");
  assert.match(injected, /低優先級參考/);
  assert.match(injected, /不是玩家內心事實/);
  assert.match(injected, /不得據此讓 NPC 讀心/);
  assert.match(injected, /玩家可能是在低壓力邀約/);
}

{
  const messages = core.buildObserverMessages({
    mods: [catalog[1]],
    playerText: "你還好嗎？",
    sceneText: "她停頓了一下，視線落到桌面，才輕聲說：「沒事。」",
    detailMode: "detailed",
    monitorTone: "banter"
  });
  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /不是測謊/);
  assert.match(messages[0].content, /眼睛往左／右/);
  assert.match(messages[0].content, /撥頭髮代表喜歡/);
  assert.match(messages[0].content, /不得判定 100% 說謊或喜歡/);
  assert.match(messages[0].content, /輕鬆吐槽/);
  assert.match(messages[0].content, /班長規則/);
  assert.match(messages[1].content, /停頓了一下/);
}

{
  assert.deepEqual(core.buildAdvisorMessages({ mods: [catalog[0]], playerText: "" }), []);
  assert.deepEqual(core.buildObserverMessages({ mods: [catalog[1]], sceneText: "" }), []);
}

console.log("interpretation mods core test passed");
