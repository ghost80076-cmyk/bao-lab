const assert = require("node:assert/strict");
const core = require("../js/story-extensions-core.js");

{
  const world = core.worldSummary([
    { id: "inventory", label: "背包", origin: "character" },
    { id: "quests", label: "任務", origin: "built_in" },
    { id: "custom_map", label: "地圖", origin: "player" }
  ]);
  assert.equal(world.title, "3 個世界模組");
  assert.deepEqual(world.scopes, ["AI 上下文", "狀態追蹤", "故事內"]);
  assert.deepEqual(world.ownership.sources.map(item => [item.label, item.count]), [
    ["作品提供", 1],
    ["夜灣內建", 1],
    ["玩家新增", 1]
  ]);
  assert.equal(world.ownership.storage, "故事存檔");
  assert.equal(world.ownership.appliesTo, "目前故事");
  assert.match(world.ownership.control, /玩家可啟用/);
  assert.equal(world.active, true);
}

{
  const scene = core.sceneSummary({ mode: "efficient", status: "author" });
  assert.equal(scene.title, "節省 Token 場景排版");
  assert.match(scene.detail, /作者狀態欄/);
  assert.deepEqual(scene.scopes, ["AI 回覆格式", "閱讀顯示", "這台裝置"]);
  assert.equal(scene.ownership.sources[0].label, "夜灣內建");
  assert.equal(scene.ownership.storage, "這台裝置");
  assert.equal(scene.ownership.appliesTo, "這台裝置的所有故事");
  assert.match(scene.ownership.control, /玩家決定/);
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
  assert.equal(replace.ownership.sources[0].label, "玩家建立");
  assert.equal(replace.ownership.storage, "故事存檔");
  assert.equal(replace.ownership.appliesTo, "目前故事");
  assert.match(replace.ownership.control, /排序/);
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
      enabled: false,
      allowScripts: false,
      rules: [
        { pattern: "hello", replacement: "hi", enabled: true }
      ]
    }
  );
  assert.equal(regex.title, "1 條 Regex 顯示規則");
  assert.equal(regex.detail, "玩家 1 條");
  assert.deepEqual(regex.scopes, ["顯示層", "不自動送 API", "進階"]);
  assert.deepEqual(regex.ownership.sources.map(item => [item.label, item.count]), [
    ["玩家規則", 2],
    ["作品提供", 1]
  ]);
  assert.equal(regex.ownership.storage, "這台裝置");
  assert.equal(regex.ownership.appliesTo, "玩家規則：所有故事 · 作品規則：目前作品");
  assert.match(regex.ownership.control, /作品規則也需要玩家明確啟用/);
  assert.match(regex.ownership.permissions.join(" · "), /等待玩家啟用/);
  assert.match(regex.ownership.permissions.join(" · "), /作者腳本：未允許/);
}


{
  const regex = core.regexSummary(
    { active: false, rules: [] },
    {
      enabled: true,
      allowScripts: true,
      allowStateSharing: true,
      allowExternalAssets: true,
      allowUiPersistence: true,
      rules: [{ pattern: "choice", replacement: "<button>選項</button>", enabled: true }]
    }
  );
  assert.equal(regex.title, "1 條 Regex 顯示規則");
  assert.match(regex.ownership.permissions.join(" · "), /作品規則：玩家已啟用/);
  assert.match(regex.ownership.permissions.join(" · "), /作者腳本：已允許（沙盒）/);
  assert.match(regex.ownership.permissions.join(" · "), /受限狀態分享：已允許/);
  assert.match(regex.ownership.permissions.join(" · "), /外部素材：已允許/);
  assert.match(regex.ownership.permissions.join(" · "), /介面狀態保存：已允許/);
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
