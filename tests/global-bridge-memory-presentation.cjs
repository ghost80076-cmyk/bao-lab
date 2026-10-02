const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "global-bridge.js"), "utf8");
const assistantSource = { role: "assistant", content: "<div>第一行<br>第二行</div>" };
const contextMessages = [
  { role: "user", content: "玩家原文" },
  assistantSource
];
let received = null;

global.window = global;
global.App = {};
global.GameState = {};
global.Storage = {};
global.CharacterEngine = {};
global.Chat = {
  async context() { return contextMessages; }
};
global.API = {
  __sendWrapperIds: new Set(),
  async send(config, messages, ...rest) {
    received = { config, messages, rest };
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

vm.runInThisContext(source, { filename: "js/global-bridge.js" });

assert.equal(
  API.__sendWrapperIds.has("global-bridge:memory-presentation"),
  true,
  "memory presentation guard must install through API.wrapSend"
);

(async () => {
  const built = await Chat.context({});
  assert.equal(built[1].content, "第一行\n第二行");
  assert.equal(
    assistantSource.content,
    "<div>第一行<br>第二行</div>",
    "context sanitation must not mutate the original assistant message"
  );

  const memoryInput = [
    { role: "user", content: "<section>記憶 A<br>記憶 B</section>" },
    { role: "assistant", content: "<b>assistant stays as supplied to this guard</b>" }
  ];
  await API.send({ __memoryTask: true }, memoryInput, "rest");
  assert.equal(received.messages[0].content, "記憶 A\n記憶 B");
  assert.equal(received.messages[1].content, memoryInput[1].content);
  assert.equal(received.rest[0], "rest");
  assert.equal(
    memoryInput[0].content,
    "<section>記憶 A<br>記憶 B</section>",
    "memory sanitation must not mutate the caller's message array"
  );

  await API.send({}, [{ role: "user", content: "<b>ordinary request</b>" }]);
  assert.equal(
    received.messages[0].content,
    "<b>ordinary request</b>",
    "non-memory requests must pass through untouched"
  );

  console.log("global-bridge-memory-presentation: request copies sanitized without mutating story data");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
