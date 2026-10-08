const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

global.window = global;
global.GameState = { current: {} };
global.API = { isOpenRouter: config => config.type === "openrouter" || String(config.baseUrl || "").includes("openrouter.ai") };
const cacheTotal = { textContent: "" };
global.document = { getElementById: id => id === "usage-cache-total" ? cacheTotal : null };
global.Chat = {
  usage: { cached: 0 },
  async context() {
    return [
      { role: "system", content: "【長期記憶摘要】\n舊摘要" },
      { role: "user", content: "較早玩家訊息" },
      { role: "assistant", content: "較早角色回覆" },
      { role: "user", content: "最新玩家輸入" }
    ];
  },
  addUsage(usage = {}) {
    if (usage.cached_tokens !== null && usage.cached_tokens !== undefined && Number.isFinite(Number(usage.cached_tokens))) {
      this.usage.cached += Number(usage.cached_tokens);
    }
    return { ...this.usage };
  },
  renderUsage() { cacheTotal.textContent = `${this.usage.cached.toLocaleString()} tok`; },
  reset() { this.usage = { cached: 0 }; }
};
global.App = {
  activeCharacter: { id: "hero" },
  config: { memory: { cache: true } },
  getSelectedPreset() { return { provider: "openrouter", route: "router", protocol: "openai", model: "verified/model", cache: "provider-dependent", explicit_cache: true }; },
  buildSystemPrompt() {
    return [
      "平台必要規則",
      "【角色核心設定】\n角色固定內容",
      "【固定世界觀】\nLore",
      "【固定 Schema】\nJSON 規則",
      "【NPC 名冊索引】\n威廉｜公爵\n瑪莉｜女僕",
      "【玩家手動記憶】\n玩家確認記憶",
      "【Canon Core · 玩家已確認】\nCanon",
      "【本輪相關世界資料】\n動態世界",
      "【本輪相關 NPC】\n威廉：目前在場",
      "【本輪相關 Canon】\n動態 Canon"
    ].join("\n\n");
  }
};

const source = fs.readFileSync(path.join(__dirname, "..", "js", "prompt-cache.js"), "utf8");
vm.runInThisContext(source, { filename: "js/prompt-cache.js" });

(async () => {
  const parts = BAOPromptCache.partitionSystemPrompt(App.buildSystemPrompt());
  assert.match(parts.stable, /^平台必要規則/);
  assert.ok(parts.stable.indexOf("角色固定內容") < parts.stable.indexOf("Lore"));
  assert.ok(parts.stable.indexOf("Lore") < parts.stable.indexOf("JSON 規則"));
  assert.match(parts.stable, /NPC 名冊索引/);
  assert.doesNotMatch(parts.stable, /玩家確認記憶|動態世界|目前在場/);
  assert.match(parts.memory, /玩家確認記憶/);
  assert.match(parts.memory, /Canon/);
  assert.match(parts.dynamic, /動態世界/);
  assert.match(parts.dynamic, /本輪相關 NPC/);

  const changed = BAOPromptCache.partitionSystemPrompt(App.buildSystemPrompt()
    .replace("玩家確認記憶", "另一份玩家記憶")
    .replace("動態世界", "另一個動態世界")
    .replace("威廉：目前在場", "瑪莉：目前在場")
    .replace("動態 Canon", "另一個 Canon"));
  assert.equal(changed.stable, parts.stable, "memory/dynamic changes must not mutate the stable prefix");
  assert.notEqual(changed.memory, parts.memory);
  assert.notEqual(changed.dynamic, parts.dynamic);

  // Real Canon headings carry a reference suffix; relevant lore entries stay
  // inside their dynamic parent instead of becoming new stable blocks.
  const realPrompt = ["固定規則",
    "【Canon Core · 玩家已確認｜僅作為故事事實參考】\n記憶甲",
    "【本輪相關 Canon｜僅作為故事事實參考】\n事實甲",
    "【本輪人物覆寫】\n覆寫甲",
    "【本輪相關世界書】\n〔學院〕\n世界甲\n\n〔商會〕\n世界乙",
    "【固定格式】\n固定輸出規則"].join("\n\n");
  const real = BAOPromptCache.partitionSystemPrompt(realPrompt);
  const next = BAOPromptCache.partitionSystemPrompt(realPrompt.replaceAll("甲", "丙").replace("世界乙", "世界丁"));
  assert.equal(real.stable, next.stable);
  assert.match(real.memory, /記憶甲/);
  assert.match(real.dynamic, /事實甲|覆寫甲/);
  assert.ok(real.dynamic.includes("世界甲") && real.dynamic.includes("世界乙"));
  assert.doesNotMatch(real.stable, /記憶甲|事實甲|覆寫甲|世界甲|世界乙/);
  assert.match(real.stable, /固定輸出規則/);

  const built = await App.buildMessages({ memory: {} });
  assert.deepEqual(built.map(message => message.role), ["system", "system", "user", "assistant", "user"]);
  assert.match(built[0].content, /平台必要規則/);
  assert.equal(built[0].content, parts.stable, "the first system message must remain the cacheable stable prefix");
  assert.match(built[1].content, /玩家確認記憶/);
  assert.match(built[1].content, /舊摘要/);
  assert.equal(built[2].content, "較早玩家訊息");
  assert.match(built.at(-1).content, /動態世界/);
  assert.match(built.at(-1).content, /最新玩家輸入/);
  assert.equal((built.at(-1).content.match(/最新玩家輸入/g) || []).length, 1);

  const first = App.applyProviderContext({ type: "openrouter", model: "verified/model", baseUrl: "https://openrouter.ai/api/v1/chat/completions", cacheMode: "provider-dependent" });
  const second = App.applyProviderContext({ type: "openrouter", model: "verified/model", baseUrl: "https://openrouter.ai/api/v1/chat/completions" });
  assert.equal(first.cacheMode, "explicit", "verified preset must upgrade restored provider-dependent settings");
  assert.equal(first.explicitCacheModel, "verified/model");
  assert.equal(first.sessionId, second.sessionId);
  assert.equal(first.sessionId, GameState.current.storySessionId);

  const changedModel = App.applyProviderContext({ type: "openrouter", model: "unverified/model", baseUrl: "https://openrouter.ai/api/v1/chat/completions", cacheMode: "explicit" });
  assert.equal(changedModel.cacheMode, "unknown");
  assert.equal(changedModel.explicitCacheModel, "");

  const custom = App.applyProviderContext({ type: "custom", baseUrl: "https://gateway.example/v1/chat/completions" });
  assert.equal(custom.sessionId, undefined);
  assert.equal(custom.route, "custom");

  Chat.addUsage({ cached_tokens: 40 });
  Chat.renderUsage();
  assert.equal(cacheTotal.textContent, "40 tok", "explicit zero/nonzero provider cache usage remains authoritative");
  Chat.addUsage({ cached_tokens: null });
  Chat.renderUsage();
  assert.equal(cacheTotal.textContent, "未知", "missing provider cache usage must never be presented as a confirmed zero");
  Chat.addUsage({ cached_tokens: 0 });
  Chat.renderUsage();
  assert.equal(cacheTotal.textContent, "未知", "a later known response cannot repair an incomplete cumulative cache total");
  Chat.reset();
  Chat.renderUsage();
  assert.equal(cacheTotal.textContent, "0 tok", "a new story resets cumulative cache knowledge");

  console.log("prompt cache core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
