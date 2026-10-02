const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const classNames = values => ({
  values: new Set(values),
  toggle(name, enabled) { enabled ? this.values.add(name) : this.values.delete(name); },
  contains(name) { return this.values.has(name); }
});
const input = { value: "繼續故事", attrs: {}, setAttribute(name, value) { this.attrs[name] = value; } };
const send = { disabled: false, dataset: {}, attrs: {}, setAttribute(name, value) { this.attrs[name] = value; }, before(node) { composer.cancel = node; } };
const composer = {
  cancel: null,
  classList: classNames([]),
  querySelector(selector) {
    if (selector === "button.primary") return send;
    if (selector === "[data-cancel-generation]") return this.cancel;
    return null;
  }
};
global.window = global;
global.document = {
  querySelector(selector) {
    if (selector === "#chat-view .composer") return composer;
    if (selector === "[data-cancel-generation]") return composer.cancel;
    return null;
  },
  getElementById(id) { return id === "user-input" ? input : null; },
  createElement() {
    return {
      disabled: false,
      dataset: {},
      className: "",
      classList: classNames(["hidden"]),
      addEventListener(name, handler) { if (name === "click") this.click = handler; }
    };
  }
};

let sendCalls = 0;
global.API = { activeSignal: null };
let baseMode = "abortable";
let exitCalls = 0;
global.App = {
  __sendMessageWrapperIds: new Set(),
  config: { demoMode: false, api: { key: "TEST-KEY" } },
  async sendMessage(...args) {
    sendCalls += 1;
    if (baseMode === "immediate") return { ok: true, args };
    return new Promise((resolve, reject) => {
      API.activeSignal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    });
  },
  wrapSendMessage(id, wrapper) {
    if (this.__sendMessageWrapperIds.has(id)) return false;
    const next = this.sendMessage.bind(this);
    this.sendMessage = (...args) => wrapper.call(this, next, ...args);
    this.__sendMessageWrapperIds.add(id);
    return true;
  },
  exitChat() { exitCalls += 1; return "closed"; }
};

const source = fs.readFileSync(path.join(__dirname, "..", "js", "request-lifecycle.js"), "utf8");
vm.runInThisContext(source, { filename: "js/request-lifecycle.js" });

assert.equal(
  App.__sendMessageWrapperIds.has("request-lifecycle:pending"),
  true,
  "request lifecycle must install through App.wrapSendMessage"
);

(async () => {
  const pending = App.sendMessage();
  await Promise.resolve();
  await App.sendMessage();
  assert.equal(sendCalls, 1, "a pending generation must reject duplicate sends");
  assert.equal(send.disabled, true);
  assert.equal(composer.cancel.classList.contains("hidden"), false);
  assert.equal(App.cancelGeneration(), true);
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(App.__requestPending, false);
  assert.equal(API.activeSignal, null);
  assert.equal(send.disabled, false);
  assert.equal(composer.cancel.classList.contains("hidden"), true);
  assert.equal(input.attrs["aria-busy"], "false");

  // Demo mode bypasses lifecycle pending/AbortController and preserves args/results.
  baseMode = "immediate";
  App.config.demoMode = true;
  input.value = "demo";
  const demo = await App.sendMessage("demo-arg");
  assert.deepEqual(demo, { ok: true, args: ["demo-arg"] });
  assert.equal(App.__requestPending, false);
  assert.equal(API.activeSignal, null);

  // Empty text and missing key must pass through without entering pending state.
  App.config.demoMode = false;
  input.value = "   ";
  const empty = await App.sendMessage("empty");
  assert.deepEqual(empty, { ok: true, args: ["empty"] });
  assert.equal(App.__requestPending, false);

  input.value = "需要連線";
  App.config.api.key = "";
  const noKey = await App.sendMessage("no-key");
  assert.deepEqual(noKey, { ok: true, args: ["no-key"] });
  assert.equal(App.__requestPending, false);

  // exitChat must cancel an active request before leaving the story.
  baseMode = "abortable";
  App.config.api.key = "TEST-KEY";
  input.value = "離開前取消";
  const leaving = App.sendMessage();
  await Promise.resolve();
  assert.equal(App.__requestPending, true);
  const exitResult = App.exitChat();
  assert.equal(exitResult, "closed");
  assert.equal(exitCalls, 1);
  await assert.rejects(leaving, { name: "AbortError" });
  assert.equal(App.__requestPending, false);
  assert.equal(API.activeSignal, null);

  console.log("request lifecycle core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
