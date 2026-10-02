// Wrapper-only regression: runtime behavior remains covered by browser and provider streaming suites.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "streaming-ui.js"), "utf8");
const events = [];
const bubbleClasses = new Set();
const bubble = {
  innerHTML: "",
  closest() { return { classList: { add(value) { bubbleClasses.add(value); } } }; },
  querySelector() { return null; },
  dataset: {},
  classList: { remove() {}, toggle() {} },
  style: { cssText: "" }
};
const stream = {
  scrollTop: 42,
  querySelectorAll() { return []; }
};
const chatView = { classList: { contains(value) { return value === "active"; } } };
let received = null;
let shellCalls = 0;

global.window = global;
global.CustomEvent = class CustomEvent {
  constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
};
global.MutationObserver = class MutationObserver { observe() {} };
global.document = {
  head: { append() {} },
  getElementById(id) {
    if (id === "chat-view") return chatView;
    if (id === "chat-stream") return stream;
    return null;
  },
  querySelector(selector) {
    if (selector === "#chat-stream > .message.assistant:last-child .bubble") return bubble;
    return null;
  },
  createElement() { return { src: "", onerror: null }; }
};
global.dispatchEvent = event => { events.push(event); return true; };
global.requestAnimationFrame = callback => callback();
global.setTimeout = callback => { if (typeof callback === "function") callback(); return 0; };
global.queueMicrotask = callback => callback();

global.Chat = { messages: [] };
let appSendCount = 0;
global.App = {
  __sendMessageWrapperIds: new Set(),
  __renderChatShellWrapperIds: new Set(),
  formatMessage(value) { return String(value); },
  async sendMessage() { appSendCount += 1; return "sent"; },
  wrapSendMessage(id, wrapper) {
    if (this.__sendMessageWrapperIds.has(id)) return false;
    const next = this.sendMessage.bind(this);
    this.sendMessage = (...args) => wrapper.call(this, next, ...args);
    this.__sendMessageWrapperIds.add(id);
    return true;
  },
  renderChatShell(...args) { shellCalls += 1; return { args }; },
  wrapRenderChatShell(id, wrapper) {
    if (this.__renderChatShellWrapperIds.has(id)) return false;
    const next = this.renderChatShell.bind(this);
    this.renderChatShell = (...args) => wrapper.call(this, next, ...args);
    this.__renderChatShellWrapperIds.add(id);
    return true;
  }
};
global.API = {
  __sendWrapperIds: new Set(),
  async send(config, messages, ...rest) {
    received = { config, messages, rest };
    if (typeof config.onDelta === "function") {
      config.onDelta("正文[STATUS]", "正文[STATUS]");
      config.onDelta("隱藏", "正文[STATUS]隱藏[/STATUS]");
    }
    return { text: "正文", usage: {} };
  },
  wrapSend(id, wrapper) {
    if (this.__sendWrapperIds.has(id)) return false;
    const next = this.send.bind(this);
    this.send = (config, messages, ...rest) => wrapper(next, config, messages, ...rest);
    this.__sendWrapperIds.add(id);
    return true;
  }
};

vm.runInThisContext(source, { filename: "js/streaming-ui.js" });

assert.equal(
  API.__sendWrapperIds.has("streaming-ui:main-story"),
  true,
  "streaming UI must install through API.wrapSend"
);
assert.equal(
  App.__sendMessageWrapperIds.has("streaming-ui:committed-paint"),
  true,
  "streaming committed repaint must install through App.wrapSendMessage"
);
assert.equal(
  App.__renderChatShellWrapperIds.has("streaming-ui:committed-paint"),
  true,
  "streaming shell repaint must install through App.wrapRenderChatShell"
);

(async () => {
  const shellResult = App.renderChatShell(false, "extra");
  assert.deepEqual(shellResult, { args: [false, "extra"] });
  assert.equal(shellCalls, 1, "streaming shell wrapper must call the underlying render exactly once");

  const sendResult = await App.sendMessage("turn");
  assert.equal(sendResult, "sent");
  assert.equal(appSendCount, 1, "streaming repaint wrapper must call the underlying App.sendMessage exactly once");

  await API.send({ model: "main" }, [{ role: "user", content: "hello" }], "rest");
  assert.equal(received.config.stream, true, "main story request must enable streaming");
  assert.equal(typeof received.config.onDelta, "function");
  assert.equal(received.rest[0], "rest");
  assert.equal(events.some(event => event.type === "bao:stream-delta"), true);
  assert.equal(bubbleClasses.has("is-streaming"), true);
  assert.doesNotMatch(bubble.innerHTML, /\[STATUS\]/, "streaming preview must hide unfinished status metadata");
  assert.equal(stream.scrollTop, 42, "stream repaint must preserve reading position");

  events.length = 0;
  bubble.innerHTML = "";
  await API.send({ __memoryTask: true }, [{ role: "user", content: "memory" }]);
  assert.equal(received.config.__memoryTask, true);
  assert.equal(received.config.stream, undefined, "memory request must not be forced into UI streaming");
  assert.equal(events.length, 0, "memory request must not emit story streaming UI events");

  await API.send({ __stateTask: true }, [{ role: "user", content: "state" }]);
  assert.equal(received.config.stream, undefined, "state request must not be forced into UI streaming");

  console.log("streaming-ui-wrapper: main-story streaming isolated from helper requests");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
