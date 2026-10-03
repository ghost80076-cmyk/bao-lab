const assert = require("node:assert/strict");
const core = require("../js/commentary-mods-core.js");

const catalog = [
  { id: "yinmo-monitor", label: "A", adult: true, prompt: "p1" },
  { id: "succubus-bun", label: "B", adult: true, prompt: "p2" },
  { id: "general-commentator", label: "C", adult: false, prompt: "p3" }
];

assert.deepEqual(core.availableCatalog(catalog, { adultEnabled: false }).map(x => x.id), ["general-commentator"]);
assert.deepEqual(core.availableCatalog(catalog, { adultEnabled: true }).map(x => x.id), ["yinmo-monitor", "succubus-bun", "general-commentator"]);

let state = core.normalizeState({});
assert.deepEqual(state.enabled, []);
assert.equal(state.auto, true);

state = core.toggle(state, "yinmo-monitor", true);
assert.deepEqual(state.enabled, ["yinmo-monitor"]);
state = core.toggle(state, "succubus-bun", true);
assert.deepEqual(core.activeMods(state, catalog, { adultEnabled: true }).map(x => x.id), ["yinmo-monitor", "succubus-bun"]);
assert.deepEqual(core.activeMods(state, catalog, { adultEnabled: false }).map(x => x.id), []);

const twin = core.command("【召喚淫魔雙子】", catalog);
assert.deepEqual(twin, { enabled: ["yinmo-monitor", "succubus-bun"], mode: "replace" });
state = core.applyCommand(state, core.command("【只留魅魔肉包】", catalog));
assert.deepEqual(state.enabled, ["succubus-bun"]);
state = core.applyCommand(state, core.command("【遣回淫魔雙子】", catalog));
assert.deepEqual(state.enabled, []);

state = core.addOutput(state, { messageId: "m1", content: "hello", modIds: ["yinmo-monitor"] });
assert.equal(core.outputFor(state, "m1").content, "hello");

const messages = core.buildMessages({
  mods: catalog.slice(0, 2),
  playerText: "玩家說話",
  sceneText: "本輪正文"
});
assert.equal(messages.length, 2);
assert.match(messages[0].content, /不得評論或性化玩家/);
assert.match(messages[0].content, /明確為成年/);
assert.match(messages[0].content, /不得被重新解讀成性同意/);
assert.match(messages[1].content, /本輪故事正文/);

console.log("commentary mods core test passed");
