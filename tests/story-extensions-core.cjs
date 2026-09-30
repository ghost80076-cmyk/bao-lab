const assert = require("node:assert/strict");
const core = require("../js/story-extensions-core.js");

{
  const world = core.worldSummary([
    { id: "inventory", label: "背包" },
    { id: "quests", label: "任務" }
  ]);
  assert.equal(world.title, "2 個世界模組");
  assert.deepEqual(world.scopes, ["AI 上下文", "狀態追蹤", "故事內"]);
  assert.equal(world.active, true);
}

{
  const scene = core.sceneSummary({ mode: "efficient", status: "author" });
  assert.equal(scene.title, "節省 Token 場景排版");
  assert.match(scene.detail, /作者狀態欄/);
  assert.deepEqual(scene.scopes, ["AI 回覆格式", "閱讀顯示", "故事內"]);
}

{
  const replace = core.replaceSummary({
    active: true,
    scope: { chat: true, status: true },
    rules: [
      { find: "20歲", replace: "XX歲", enabled: true },
      { find: "", replace: "ignored", enabled: true }
    ]
  });
  assert.equal(replace.title, "1 條文字替換");
  assert.match(replace.detail, /故事文字＋狀態顯示/);
  assert.deepEqual(replace.scopes, ["只改畫面", "不改原文", "故事內"]);
}

{
  const regex = core.regexSummary(
    {
      active: true,
      rules: [
        { pattern: "foo", replacement: "bar", enabled: true },
        { pattern: "off", replacement: "", enabled: false }
      ]
    },
    {
      enabled: true,
      rules: [
        { pattern: "hello", replacement: "hi", enabled: true }
      ]
    }
  );
  assert.equal(regex.title, "2 條 Regex 顯示規則");
  assert.equal(regex.detail, "玩家 1 條 · 作品 1 條");
  assert.deepEqual(regex.scopes, ["只改畫面", "不改 API", "進階"]);
}

{
  const overview = core.overview({
    world: [{ id: "status", label: "狀態" }],
    scene: { mode: "native", status: "native" },
    replace: { active: false, rules: [] },
    regex: { active: false, rules: [] },
    authorRegex: { enabled: false, rules: [] }
  });
  assert.equal(overview.activeCount, 1);
  assert.equal(overview.title, "1 類故事擴充正在運作");
  assert.match(overview.detail, /世界運作/);
  assert.equal(overview.cards.length, 4);
}

{
  const overview = core.overview({});
  assert.equal(overview.activeCount, 0);
  assert.equal(overview.title, "使用作品原始設定");
}

console.log("story extensions core test passed");
