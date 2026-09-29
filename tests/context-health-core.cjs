const assert = require("node:assert/strict");
const core = require("../js/context-health-core.js");

{
  const normal = core.pressure(32000, 64000, {});
  assert.equal(normal.level, "normal");
  assert.equal(normal.label, "充足");
  assert.equal(normal.percent, 50);
}

{
  const watch = core.pressure(48000, 64000, {});
  assert.equal(watch.level, "watch");
  assert.equal(watch.label, "開始整理");
  assert.equal(Math.round(watch.percent), 75);
}

{
  const critical = core.pressure(62000, 64000, {});
  assert.equal(critical.level, "critical");
  assert.equal(critical.label, "接近管理上限");
}

{
  const manual = core.pressure(null, 64000, { level: "manual", ratio: 0.9 });
  assert.equal(manual.level, "manual");
  assert.equal(manual.label, "完整上下文");
}

{
  const cache = core.cacheSummary({ input: 10000, cached: 2500 });
  assert.equal(cache.title, "命中 2,500 tok");
  assert.match(cache.detail, /25%/);
  const unknown = core.cacheSummary({ input: 10000, cached: null });
  assert.equal(unknown.title, "快取資料未知");
}

{
  const memory = core.memorySummary({
    totalRounds: 40,
    coveredRounds: 22,
    pendingRounds: 0,
    hasSummary: true,
    health: {}
  }, 2);
  assert.equal(memory.title, "長期摘要已接手");
  assert.match(memory.detail, /40 輪對話/);
  assert.match(memory.detail, /22 輪已摘要/);
  assert.match(memory.detail, /2 條必記事項/);
}

{
  const rows = core.layers({
    hasCharacter: true,
    characterDetail: "夜灣角色",
    recentRounds: 16,
    hasSummary: true,
    coveredRounds: 20,
    noteCount: 2,
    personaName: "玩家",
    worldCount: 3,
    statusTracked: true,
    narrativeCount: 2,
    contextPackConfirmed: false
  });
  assert.equal(rows.length, 9);
  assert.equal(rows.find(item => item.id === "summary").active, true);
  assert.equal(rows.find(item => item.id === "world").detail, "3 個啟用");
  assert.equal(rows.find(item => item.id === "context-pack").active, false);
}

{
  const result = core.summary({
    lastInputTokens: 32000,
    budget: 64000,
    guard: { level: "normal", ratio: 0.5, recentRounds: 18 },
    memoryDiag: { totalRounds: 30, recentRounds: 18, coveredRounds: 12, hasSummary: true, health: {} },
    noteCount: 1,
    lastStoryUsage: { input: 32000, cached: 8000 },
    hasCharacter: true,
    recentRounds: 18,
    hasSummary: true,
    coveredRounds: 12,
    personaName: "玩家"
  });
  assert.equal(result.pressure.percent, 50);
  assert.equal(result.recentRounds, 18);
  assert.equal(result.memory.title, "長期摘要已接手");
  assert.match(result.cache.title, /8,000 tok/);
}

console.log("context health core test passed");
