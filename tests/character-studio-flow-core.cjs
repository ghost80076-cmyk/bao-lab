const assert = require("node:assert/strict");
const core = require("../js/character-studio-flow-core.js");

assert.equal(core.STEPS.length, 6);
assert.equal(core.validId("my-world_01"), true);
assert.equal(core.validId("bad id"), false);

{
  const progress = core.requiredProgress({});
  assert.deepEqual(progress, {
    done: 0,
    total: 4,
    complete: false,
    checks: { name: false, id: false, system_prompt: false, greeting: false }
  });
}

{
  const values = {
    name: "雨港",
    id: "rain-port",
    system_prompt: "維持世界規則。",
    greeting: "雨開始下了。"
  };
  const progress = core.requiredProgress(values);
  assert.equal(progress.done, 4);
  assert.equal(progress.complete, true);
  assert.equal(core.overallLabel(values), "必填 4/4 · 可以預覽與試玩");
}

{
  const states = core.stepStates({
    name: "雨港",
    id: "rain-port",
    system_prompt: "",
    greeting: "",
    world: "港口城市"
  }, { gameplayEnabled: false });
  assert.equal(states.basic.state, "complete");
  assert.equal(states.core.label, "必填");
  assert.equal(states.opening.label, "必填");
  assert.equal(states.world.label, "已填寫");
  assert.equal(states.appearance.label, "選填");
  assert.equal(states.finish.label, "差 2 項");
}

{
  const states = core.stepStates({
    name: "雨港",
    id: "rain-port",
    system_prompt: "核心",
    greeting: "開場"
  }, { gameplayEnabled: true });
  assert.equal(states.appearance.label, "可調整");
  assert.equal(states.finish.state, "ready");
}

console.log("character studio flow core test passed");
