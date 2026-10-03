const assert = require("node:assert/strict");
const core = require("../js/commentary-mods-core.js");

const catalog = [
  { id: "director-commentary", label: "🎬 導演旁白", badge: "夜灣官方示範", adult: false, prompt: "導演規則" },
  { id: "yinmo-monitor", label: "🔥 淫魔班長", adult: true, prompt: "班長規則" },
  { id: "succubus-bun", label: "💕 魅魔肉包", adult: true, prompt: "肉包規則" }
];

const safeCatalog = core.availableCatalog(catalog, { adultEnabled: false });
assert.deepEqual(safeCatalog.map(x => x.id), ["director-commentary"]);
assert.equal(safeCatalog[0].badge, "夜灣官方示範");
assert.deepEqual(
  core.availableCatalog(catalog, { adultEnabled: true }).map(x => x.id),
  ["director-commentary", "yinmo-monitor", "succubus-bun"]
);

let state = core.normalizeState({});
assert.deepEqual(state.enabled, []);
assert.equal(state.auto, true);

state = core.toggle(state, "director-commentary", true);
assert.deepEqual(core.activeMods(state, catalog, { adultEnabled: false }).map(x => x.id), ["director-commentary"]);

state = core.toggle(state, "yinmo-monitor", true);
state = core.toggle(state, "succubus-bun", true);
assert.deepEqual(
  core.activeMods(state, catalog, { adultEnabled: true }).map(x => x.id),
  ["director-commentary", "yinmo-monitor", "succubus-bun"]
);
assert.deepEqual(
  core.activeMods(state, catalog, { adultEnabled: false }).map(x => x.id),
  ["director-commentary"]
);

const twin = core.command("【召喚淫魔雙子】", catalog);
assert.deepEqual(twin, {
  enabled: ["yinmo-monitor", "succubus-bun"],
  group: ["yinmo-monitor", "succubus-bun"],
  mode: "replace-group"
});

state = core.applyCommand(state, core.command("【只留魅魔肉包】", catalog));
assert.deepEqual(state.enabled.sort(), ["director-commentary", "succubus-bun"]);
state = core.applyCommand(state, core.command("【遣回淫魔雙子】", catalog));
assert.deepEqual(state.enabled, ["director-commentary"]);

state = core.applyCommand(state, core.command("【遣回導演旁白】", catalog));
assert.deepEqual(state.enabled, []);
state = core.applyCommand(state, core.command("【召喚導演旁白】", catalog));
assert.deepEqual(state.enabled, ["director-commentary"]);

state = core.addOutput(state, {
  messageId: "m1",
  content: "hello",
  modIds: ["director-commentary"],
  adult: false
});
assert.equal(core.outputFor(state, "m1").content, "hello");
assert.equal(core.outputFor(state, "m1").adult, false);

state = core.addOutput(state, {
  messageId: "m2",
  content: "adult",
  modIds: ["yinmo-monitor"],
  adult: true
});
assert.equal(core.outputFor(state, "m2").adult, true);

const generalMessages = core.buildMessages({
  mods: [catalog[0]],
  playerText: "玩家走進房間",
  sceneText: "門沒有完全關上。"
});
assert.equal(generalMessages.length, 2);
assert.match(generalMessages[0].content, /non-canon|非正史/);
assert.match(generalMessages[0].content, /導演規則/);
assert.doesNotMatch(generalMessages[0].content, /只可針對文本中明確為成年人的 NPC/);
assert.match(generalMessages[1].content, /本輪故事正文/);

const adultMessages = core.buildMessages({
  mods: catalog.slice(1),
  playerText: "玩家說話",
  sceneText: "本輪正文"
});
assert.equal(adultMessages.length, 2);
assert.match(adultMessages[0].content, /不得評論或性化玩家/);
assert.match(adultMessages[0].content, /明確為成年人的 NPC/);
assert.match(adultMessages[0].content, /不得被重新解讀成性同意/);

console.log("commentary mods core test passed");
