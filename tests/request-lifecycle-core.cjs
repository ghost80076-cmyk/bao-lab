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
global.App = {
  config: { demoMode: false, api: { key: "TEST-KEY" } },
  async sendMessage() {
    sendCalls += 1;
    return new Promise((resolve, reject) => {
      API.activeSignal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    });
  },
  exitChat() { return "closed"; }
};

const source = fs.readFileSync(path.join(__dirname, "..", "js", "request-lifecycle.js"), "utf8");
vm.runInThisContext(source, { filename: "js/request-lifecycle.js" });

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
  console.log("request lifecycle core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
