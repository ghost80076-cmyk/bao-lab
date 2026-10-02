const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "state-tracker-repairs.js"), "utf8");
const owner = { npcs: [], stateTracker: null };
let received = null;
let failProvider = false;
let ensureStateCalls = 0;
let shellCalls = 0;

global.window = global;
global.document = {
  getElementById() { return null; },
  createElement() { return { id: "", dataset: {}, className: "", style: {}, setAttribute() {}, appendChild() {} }; },
  head: { appendChild() {} }
};
global.App = {
  __renderChatShellWrapperIds: new Set(),
  characters: [],
  activeCharacter: { id: "autonomous-npc-world" },
  openCharacter() {},
  renderChatShell(...args) { shellCalls += 1; return { args }; },
  wrapRenderChatShell(id, wrapper) {
    if (this.__renderChatShellWrapperIds.has(id)) return false;
    const next = this.renderChatShell.bind(this);
    this.renderChatShell = (...args) => wrapper.call(this, next, ...args);
    this.__renderChatShellWrapperIds.add(id);
    return true;
  },
  renderUIPanel() {}
};
global.GameState = { current: owner };
global.BAOCharacterStatus = {
  ensureState() { ensureStateCalls += 1; },
  configFor() { return { fields: [] }; }
};
global.BAOHelperData = {
  stateUpdate(data) { return data; }
};
global.API = {
  __sendWrapperIds: new Set(),
  async send(config, messages, ...rest) {
    received = { config, messages, rest };
    if (failProvider) throw new Error("quota exceeded for state route");
    return { text: "OK" };
  },
  wrapSend(id, wrapper) {
    if (this.__sendWrapperIds.has(id)) return false;
    const next = this.send.bind(this);
    this.send = (config, messages, ...rest) => wrapper(next, config, messages, ...rest);
    this.__sendWrapperIds.add(id);
    return true;
  }
};
global.WorldStateEngine = {
  stateSnapshot() { return { npcs: [] }; },
  async update() {
    try {
      await API.send(
        { __stateTask: true },
        [{ role: "system", content: "STATE BASE" }, { role: "user", content: "turn" }]
      );
    } catch {}
    owner.stateTracker = { phase: "failed", message: "generic failure" };
    return null;
  }
};

vm.runInThisContext(source, { filename: "js/state-tracker-repairs.js" });

assert.equal(
  API.__sendWrapperIds.has("state-tracker-repairs:presence-guard"),
  true,
  "state tracker repairs must install through API.wrapSend"
);
assert.equal(
  App.__renderChatShellWrapperIds.has("state-tracker-repairs:schema"),
  true,
  "state tracker shell repair must install through App.wrapRenderChatShell"
);
const ensureBeforeShell = ensureStateCalls;
const shellResult = App.renderChatShell(true, "extra");
assert.equal(shellCalls, 1, "base renderChatShell must run exactly once");
assert.equal(ensureStateCalls, ensureBeforeShell + 1, "state schema must be ensured before shell rendering");
assert.deepEqual(shellResult, { args: [true, "extra"] }, "shell return value and args must pass through");

(async () => {
  const stateMessages = [
    { role: "system", content: "STATE BASE" },
    { role: "user", content: "turn" }
  ];
  await API.send({ __stateTask: true }, stateMessages, "rest");
  assert.match(received.messages[0].content, /presence 可為 present、away 或 unknown/);
  assert.equal(received.messages[1].content, "turn");
  assert.equal(received.rest[0], "rest");
  assert.equal(
    stateMessages[0].content,
    "STATE BASE",
    "state presence guard must not mutate the caller's system message"
  );

  await API.send({}, [{ role: "system", content: "ordinary" }]);
  assert.equal(received.messages[0].content, "ordinary", "ordinary chat must pass through untouched");

  failProvider = true;
  await WorldStateEngine.update();
  assert.equal(owner.stateTracker.phase, "failed");
  assert.match(owner.stateTracker.message, /狀態 API 呼叫失敗/);
  assert.match(owner.stateTracker.message, /quota exceeded for state route/);
  assert.match(owner.stateTracker.message, /連線、Key 與額度/);

  console.log("state-tracker-request-guard: shared wrapper preserves presence rules and diagnostics");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
