const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

global.window = global;
global.GameState = {
  current: {},
  applyUpdate(patch = {}) {
    if (patch.time) this.current.time = patch.time;
    if (patch.location) this.current.location = patch.location;
  }
};
let releaseDelayed;
const attempts = [];
global.WorldStateEngine = {
  enabled: () => true,
  async update(config, playerText, assistantText) {
    attempts.push({ config, playerText, assistantText });
    if (config.api.model === 'race-tracker') {
      await new Promise(resolve => { releaseDelayed = resolve; });
      GameState.applyUpdate({ time: '凌晨一點', location: '舊走廊' });
      return { time: '凌晨一點', location: '舊走廊' };
    }
    return attempts.length === 1 ? null : { time: "更新" };
  }
};

const source = fs.readFileSync(path.join(__dirname, "..", "js", "world-state-cost.js"), "utf8");
const hookSource = fs.readFileSync(path.join(__dirname, "..", "js", "world-state-hook.js"), "utf8");
vm.runInThisContext(source, { filename: "js/world-state-cost.js" });

(async () => {
  const config = { narrativeMode: "world", api: { model: "main", key: "mock-only" }, cost: {
    stateInterval: 3,
    stateModel: "tracker",
    stateApi: { model: "tracker", baseUrl: "https://state.example/v1", key: "state-key" }
  } };
  assert.equal(await WorldStateEngine.update(config, "玩家一", "角色一"), null);
  assert.equal(GameState.current.stateTracker.phase, "waiting");
  assert.equal(await WorldStateEngine.update(config, "玩家二", "角色二"), null);
  assert.equal(attempts.length, 0, "the tracker must wait for the configured interval");
  assert.equal(GameState.current.pendingStateTurns.length, 2);

  assert.equal(await WorldStateEngine.update(config, "玩家三", "角色三"), null);
  assert.equal(GameState.current.stateTracker.phase, "failed");
  assert.match(GameState.current.stateTracker.message, /繼續故事即可/);
  assert.match(GameState.current.stateTracker.message, /下一輪自動重試/);
  assert.doesNotMatch(GameState.current.stateTracker.message, /JSON|API|輸出長度/);
  assert.match(GameState.current.stateTracker.diagnostic, /JSON/);
  assert.equal(attempts.length, 1);
  assert.match(attempts[0].playerText, /玩家一/);
  assert.match(attempts[0].playerText, /玩家二/);
  assert.match(attempts[0].playerText, /玩家三/);
  assert.match(attempts[0].assistantText, /角色一/);
  assert.equal(attempts[0].config.api.model, "tracker");
  assert.equal(GameState.current.pendingStateTurns.length, 3, "failed tracker updates must retain every unprocessed turn");

  const result = await WorldStateEngine.update(config, "玩家四", "角色四");
  assert.deepEqual(result, { time: "更新" });
  assert.equal(GameState.current.stateTracker.phase, "updated");
  assert.equal(attempts.length, 2);
  assert.match(attempts[1].playerText, /玩家一/);
  assert.match(attempts[1].playerText, /玩家三/);
  assert.doesNotMatch(attempts[1].playerText, /玩家四/, "retry cost stays bounded to one configured batch");
  assert.equal(GameState.current.pendingStateTurns.length, 1, "newer queued turns must survive a successful retry");

  assert.equal(await WorldStateEngine.update(config, "玩家五", "角色五"), null);
  assert.equal(attempts.length, 2, "the queued remainder still waits until a full batch exists");
  const later = await WorldStateEngine.update(config, "玩家六", "角色六");
  assert.deepEqual(later, { time: "更新" });
  assert.equal(attempts.length, 3);
  assert.match(attempts[2].playerText, /玩家四/);
  assert.match(attempts[2].playerText, /玩家六/);
  assert.doesNotMatch(attempts[2].playerText, /玩家一/, "already processed retry history is never resent");
  assert.equal(GameState.current.pendingStateTurns.length, 0, "successful batches clear only the turns they processed");
  assert.equal(WorldStateEngine.takePersistenceHint(), true);
  assert.equal(WorldStateEngine.takePersistenceHint(), false);
  assert.match(hookSource, /takePersistenceHint/);
  assert.match(hookSource, /pendingChanged/);
  assert.match(hookSource, /this\.saveStory\(false\)/, "skipped tracker turns must be persisted locally");
  assert.match(hookSource, /this\.renderUIPanel\('npc'\)/, "status diagnostics must be refreshed after failed checks");

  GameState.current = {};
  const staleConfig = {
    narrativeMode: "world",
    api: { model: "main", key: "mock-only" },
    cost: { stateInterval: 1, stateModel: "legacy-wrong-model", stateApi: null }
  };
  await WorldStateEngine.update(staleConfig, "舊存檔玩家", "舊存檔故事");
  assert.equal(attempts.at(-1).config.api.model, "main",
    "a stale stateModel without stateApi must never replace the main endpoint model");

  GameState.current = {};
  const contradictorySameConfig = {
    narrativeMode: "world",
    api: { model: "main", key: "mock-only" },
    cost: {
      stateInterval: 1,
      stateApiMode: "same",
      stateModel: "legacy-helper",
      stateApi: { model: "legacy-helper", baseUrl: "https://main.example/v1", key: "legacy-key" }
    }
  };
  await WorldStateEngine.update(contradictorySameConfig, "同模型玩家", "同模型故事");
  assert.equal(attempts.at(-1).config.api.model, "main",
    "explicit same mode must ignore a populated legacy stateApi route");

  // A delayed separate-model PATCH must not move the story back after a newer
  // completed turn states an explicit scene.
  GameState.current = { time: '午夜', location: '大廳' };
  const raceConfig = {
    narrativeMode: 'world',
    api: { model: 'main', key: 'mock-only' },
    cost: { stateInterval: 1, stateApi: { model: 'race-tracker', baseUrl: 'https://state.example/v1', key: 'state-key' } }
  };
  const delayed = WorldStateEngine.update(raceConfig, '第一輪', '當前場景資訊\n時間：凌晨一點\n地點：舊走廊');
  assert.equal(typeof releaseDelayed, 'function');
  await WorldStateEngine.update(raceConfig, '第二輪', '當前場景資訊\n時間：凌晨二點\n地點：新房間');
  assert.equal(GameState.current.location, '新房間');
  releaseDelayed();
  const delayedResult = await delayed;
  assert.equal(delayedResult.location, '新房間', 'returned result must match restored scene');
  assert.equal(GameState.current.location, '新房間', 'late separate status must not rewind location');
  assert.equal(GameState.current.time, '凌晨二點', 'late separate status must not rewind time');
  assert.equal(GameState.current.pendingStateTurns.length, 1, 'later turn remains queued');

  // Pending turns must survive long outages; only the transmitted batch is capped.
  GameState.current = {};
  const backlogConfig = {
    narrativeMode: 'world', api: { model: 'main', key: 'mock-only' },
    cost: { stateInterval: 20 }
  };
  for (let i = 0; i < 16; i++) {
    await WorldStateEngine.update(backlogConfig, '玩家' + i, '故事' + i);
  }
  assert.equal(GameState.current.pendingStateTurns.length, 16, 'separate-helper backlog must not silently discard older turns');

  console.log("world state cost core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
