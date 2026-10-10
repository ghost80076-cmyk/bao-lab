const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

global.window = global;
global.structuredClone = global.structuredClone || (value => JSON.parse(JSON.stringify(value)));

global.App = {
  activeCharacter: { id: "hero", name: "Hero" },
  __buildSystemPromptWrapperIds: new Set(),
  buildSystemPrompt() { return "BASE"; },
  wrapBuildSystemPrompt(id, wrapper) {
    if (this.__buildSystemPromptWrapperIds.has(id)) return false;
    const next = this.buildSystemPrompt.bind(this);
    this.buildSystemPrompt = (...args) => wrapper.call(this, next, ...args);
    this.__buildSystemPromptWrapperIds.add(id);
    return true;
  }
};

global.GameState = {
  current: null,
  create(character, config) {
    const base = structuredClone(character?.initial_state || {});
    this.current = {
      time: base.time || "未設定",
      location: base.location || "未設定",
      events: [],
      npcs: [],
      config,
      ...(base.world_clock ? { worldClock: structuredClone(base.world_clock) } : {})
    };
    return this.current;
  },
  applyUpdate(update = {}) {
    if (typeof update.time === "string") this.current.time = update.time;
    if (typeof update.location === "string") this.current.location = update.location;
  }
};

global.WorldStateEngine = {
  stateSnapshot() {
    return {
      time: GameState.current?.time || "未設定",
      location: GameState.current?.location || "未設定"
    };
  }
};

vm.runInThisContext(fs.readFileSync(path.join(__dirname, "..", "js", "helper-data.js"), "utf8"), { filename: "js/helper-data.js" });
vm.runInThisContext(fs.readFileSync(path.join(__dirname, "..", "js", "world-clock.js"), "utf8"), { filename: "js/world-clock.js" });

const invalid = BAOHelperData.stateUpdate({
  world_clock: { advance_minutes: -5, schedule: [{ label: "", in_minutes: 10 }] }
}, []);
assert.deepEqual(invalid, {}, "invalid clock data must not create a patch");

const state = GameState.create({
  initial_state: {
    time: "帝國曆 1247 年 8 月 17 日・21:34",
    world_clock: {
      tick_minutes: 120,
      scheduled_events: [
        { id: "wc-3", label: "王室宴會", due_tick_minutes: 300, status: "pending" }
      ]
    }
  }
}, {});
assert.equal(state.worldClock.tickMinutes, 120);
assert.equal(state.worldClock.nextEventSeq, 4);
assert.equal(BAOWorldClock.dueEvents().length, 0);

const first = BAOHelperData.stateUpdate({
  world_clock: {
    advance_minutes: 60,
    schedule: [{ label: "黑鴉商會交易", in_minutes: 30 }]
  }
}, []);
assert.deepEqual(first.world_clock, {
  advance_minutes: 60,
  schedule: [{ label: "黑鴉商會交易", in_minutes: 30 }]
});
GameState.applyUpdate(first);
assert.equal(GameState.current.worldClock.tickMinutes, 180);
const trade = GameState.current.worldClock.scheduledEvents.find(event => event.label === "黑鴉商會交易");
assert.ok(trade);
assert.equal(trade.id, "wc-4");
assert.equal(trade.dueTickMinutes, 210, "relative schedules start after the turn's elapsed time is applied");

GameState.applyUpdate({ world_clock: { advance_minutes: 120 } });
assert.equal(GameState.current.worldClock.tickMinutes, 300);
assert.deepEqual(BAOWorldClock.dueEvents().map(event => event.id), ["wc-4", "wc-3"]);

const prompt = App.buildSystemPrompt();
assert.match(prompt, /【世界時鐘】/);
assert.match(prompt, /王室宴會/);
assert.match(prompt, /黑鴉商會交易/);
assert.match(prompt, /到期只代表事件進入可發生或需要處理的時間窗口/);

const snapshot = WorldStateEngine.stateSnapshot();
assert.equal(snapshot.world_clock.tick_minutes, 300);
assert.equal(snapshot.world_clock.scheduled_events.length, 2);
assert.equal(snapshot.world_clock.scheduled_events[0].status, "pending");

GameState.applyUpdate({ world_clock: { resolve: ["wc-4"], cancel: ["wc-3"] } });
assert.equal(GameState.current.worldClock.scheduledEvents.find(event => event.id === "wc-4").status, "resolved");
assert.equal(GameState.current.worldClock.scheduledEvents.find(event => event.id === "wc-3").status, "cancelled");
assert.equal(BAOWorldClock.dueEvents().length, 0);

GameState.current = { time: "未設定", location: "未設定", events: [], npcs: [] };
assert.equal(BAOWorldClock.promptBlock(), "", "legacy stories without a clock must remain unchanged");
GameState.applyUpdate({ world_clock: { schedule: [{ label: "三天後見面", in_minutes: 4320 }] } });
assert.ok(GameState.current.worldClock, "an explicit schedule can establish the clock lazily");
assert.equal(GameState.current.worldClock.scheduledEvents[0].dueTickMinutes, 4320);

const storyTools = fs.readFileSync(path.join(__dirname, "..", "js", "story-tools.js"), "utf8");
assert.match(storyTools, /state\.worldClock \? \{ worldClock: clone\(state\.worldClock\) \}/);
assert.match(storyTools, /const carriedClock = world\.worldClock \|\| world\.world_clock/);

const promptCache = fs.readFileSync(path.join(__dirname, "..", "js", "prompt-cache.js"), "utf8");
assert.match(promptCache, /"世界時鐘"/, "world clock prompt must stay in the dynamic cache partition");

const siteUI = fs.readFileSync(path.join(__dirname, "..", "js", "site-ui.js"), "utf8");
assert.match(siteUI, /world-modules\.js(?:\?v=\d+)?"[\s\S]*world-clock\.js\?v=1[\s\S]*world-state-cost\.js\?v=2"/);

const sameModel = fs.readFileSync(path.join(__dirname, "..", "js", "same-model-state-merge.js"), "utf8");
assert.match(sameModel, /world_clock/);
assert.match(sameModel, /不得自行創造劇情/);

console.log("world-clock core: relative clock, schedules, Context Pack and cache integration passed");
