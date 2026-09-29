const assert = require("node:assert/strict");
const core = require("../js/story-control-center-core.js");

{
  const stats = core.storyStats([
    { role: "user", content: "一" },
    { role: "assistant", content: "二" },
    { role: "user", content: "三" },
    { role: "assistant", content: "四" }
  ], { chapterLabel: "第二章" });
  assert.deepEqual(stats, { messages: 4, turns: 2, chapter: "第二章" });
}

{
  const local = core.modelSummary({ model: "gemma-test", baseUrl: "http://127.0.0.1:1234/v1" });
  assert.equal(local.title, "gemma-test");
  assert.equal(local.detail, "本地 AI");
  const byok = core.modelSummary({ model: "claude-test", key: "secret" });
  assert.equal(byok.detail, "自備 API");
}

{
  const persona = core.personaSummary({ name: "玩家", identity: "記者", relationship: "陌生人" });
  assert.equal(persona.title, "玩家");
  assert.equal(persona.detail, "記者 · 陌生人");
}

{
  const memory = core.memorySummary({ totalRounds: 36, coveredRounds: 20, pendingRounds: 0, hasSummary: true, health: {} }, 3);
  assert.equal(memory.title, "長期記憶已建立");
  assert.match(memory.detail, /36 輪對話/);
  assert.match(memory.detail, /20 輪已整理/);
  assert.match(memory.detail, /3 條固定筆記/);
}

{
  const status = core.statusSummary({ enabled: true, fields: [{ key: "mood" }] }, "hidden");
  assert.equal(status.title, "狀態追蹤中");
  assert.equal(status.detail, "追蹤：開 · 顯示：面板隱藏");
  const disabled = core.statusSummary({ enabled: false, fields: [] }, "native");
  assert.equal(disabled.title, "未啟用狀態追蹤");
}

{
  const world = core.worldSummary([{ id: "bag", label: "背包" }, { id: "quest", label: "任務" }, { id: "skill", label: "技能" }, { id: "faction", label: "勢力" }]);
  assert.equal(world.title, "4 個世界模組");
  assert.match(world.detail, /背包、任務、技能…/);
}

{
  const narrative = core.narrativeSummary({ items: ["韓式電影感", "豐富描寫"] });
  assert.equal(narrative.title, "2 項敘事偏好");
  const plain = core.narrativeSummary({ items: [] });
  assert.equal(plain.title, "完全依角色卡");
}

{
  const mod = core.modSummary({ active: true, rules: [{ find: "20歲", replace: "XX歲", enabled: true }, { find: "", enabled: true }] });
  assert.equal(mod.title, "1 條顯示替換");
  assert.match(mod.detail, /不改故事原文/);
}

console.log("story control center core test passed");
