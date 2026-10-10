const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const core = require("../js/worldbook-library-core.js");
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/worldbook-library.json"), "utf8"));
let saves = 0, calls = 0;
const GameState = { current: { location: "中央商業區", npcs: [], events: [], worldbookLibrary: {
  version: 1, enabled: ["sunrise-geography-demo"], installed: [], pinned: {}
} } };
const Chat = { messages: [{ role: "user", content: "我到中央商業區了" }] };
const App = {
  escapeHTML: text => String(text),
  saveStory: () => { saves++; return true; },
  async buildMessages() {
    return [{ role: "system", content: "PLATFORM STABLE PREFIX" }, { role: "user", content: "我到中央商業區了" }];
  },
  wrapBuildMessages(id, wrapper) {
    assert.equal(id, "worldbook-library:recall");
    const base = this.buildMessages.bind(this);
    this.buildMessages = (...args) => wrapper(base, ...args);
  }
};
const doc = {
  head: { appendChild() {} }, body: {},
  createElement: () => ({ textContent: "" }),
  querySelector: () => null
};
const win = { YoruWorldbookLibraryCore: core, App, GameState, Chat };
const context = {
  window: win, document: doc, App, GameState, Chat,
  MutationObserver: class { observe() {} },
  fetch: async url => {
    assert.equal(url, "data/worldbook-library.json");
    calls++;
    return { ok: true, json: async () => catalog };
  },
  console
};
const source = fs.readFileSync(path.join(__dirname, "../js/worldbook-library.js"), "utf8");
vm.runInNewContext(source, context, { filename: "worldbook-library.js" });

(async () => {
  const first = await App.buildMessages();
  assert.equal(first[0].content, "PLATFORM STABLE PREFIX");
  assert.match(first[1].content, /世界書按需提供的背景資料/);
  assert.match(first[1].content, /中央商業區/);
  assert.equal(calls, 1);
  assert.equal(saves, 0);
  const second = await App.buildMessages();
  assert.equal(calls, 1, "static catalog should be cached");
  assert.equal((second[1].content.match(/世界書資料結束/g) || []).length, 1);
  GameState.current.worldbookLibrary.enabled = [];
  const disabled = await App.buildMessages();
  assert.equal(disabled[1].content, "我到中央商業區了", "opt-out must leave prompt byte-for-byte unchanged");
  GameState.current.worldbookLibrary.enabled = ["sunrise-geography-demo"];
  GameState.current.location = "陌生地點";
  Chat.messages = [{ role: "user", content: "你好" }];
  // Foundation is allowed only after explicit opt-in, but irrelevant details are still suppressed.
  const generic = await App.buildMessages();
  assert.match(generic[1].content, /曙光市是東部沿海/);
  assert.doesNotMatch(generic[1].content, /中央商業區位於曙光市中心/);
  console.log("Worldbook prompt integration passed: cache-friendly stable prefix, selection, no double append, opt-out, conditional recall.");
})().catch(err => { console.error(err); process.exitCode = 1; });
