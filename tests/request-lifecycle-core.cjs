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
global.BAOCreditsPilot = {
  ready: false,
  isAccountReady() { return this.ready; }
};
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

  // Hosted account sessions must use the same single-flight lock even before
  // prepareAccountConfig has populated the account sentinel key.
  baseMode = "abortable";
  BAOCreditsPilot.ready = true;
  input.value = "燈火故事";
  const hostedCallsBefore = sendCalls;
  const hostedPending = App.sendMessage("hosted");
  await Promise.resolve();
  await App.sendMessage("hosted-duplicate");
  assert.equal(sendCalls, hostedCallsBefore + 1, "hosted duplicate sends must be suppressed");
  assert.equal(App.__requestPending, true);
  assert.equal(App.cancelGeneration(), true);
  await assert.rejects(hostedPending, { name: "AbortError" });
  assert.equal(App.__requestPending, false);
  BAOCreditsPilot.ready = false;

  // exitChat must cancel an active request before leaving the story.
  baseMode = "abortable";
  App.config.api.key = "TEST-KEY";
  input.value = "離開前取消";
  const leaving = App.sendMessage();
  await Promise.resolve();
  assert.equal(App.__requestPending, true);
  const exitResult = App.exitChat();
  assert.equal(exitCalls, 0, "exit must wait for abort cleanup before saving");
  await assert.rejects(leaving, { name: "AbortError" });
  assert.equal(await exitResult, "closed");
  assert.equal(exitCalls, 1);
  assert.equal(App.__requestPending, false);
  assert.equal(API.activeSignal, null);

  // Real App.sendMessage and App.exitChat: the persisted snapshot must match
  // the settled history, even when transport rejects on a later microtask.
  {
    let transportEntered;
    const entered = new Promise(resolve => { transportEntered = resolve; });
    const snapshots = [];
    let transportCalls = 0;
    const realInput = { value: "unsent turn", setAttribute() {} };
    const stream = { insertAdjacentHTML() {}, lastElementChild: { remove() {} }, appendChild() {} };
    const story = { id: "source" };
    const context = { console, AbortController, addEventListener() {},
      document: { getElementById: id => id === "user-input" ? realInput : id === "chat-stream" ? stream : null,
        querySelector: () => null, createElement: () => ({}) },
      GameState: { current: story },
      Chat: { messages: [{ id: "old", role: "assistant", content: "old" }],
        add(role, content) { const message = { id: "pending", role, content }; this.messages.push(message); return message; } },
      API: { send() { transportCalls++; transportEntered(); const signal = context.API.activeSignal;
        return new Promise((resolve, reject) => signal.addEventListener("abort", () => queueMicrotask(() => reject(Object.assign(new Error("cancelled"), { code: "BAO_ABORTED" }))))); } }
    };
    context.window = context;
    const isolated = vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8") + "\nwindow.App=App;", isolated);
    context.App.config = { api: { key: "mock" } };
    context.App.buildMessages = async () => [];
    context.App.renderStoryMessage = text => text;
    context.App.saveStory = () => { snapshots.push(JSON.parse(JSON.stringify(context.Chat.messages))); };
    context.App.showView = () => {};
    vm.runInContext(source, isolated);
    const request = context.App.sendMessage();
    await entered;
    await context.App.sendMessage(); // duplicate returns while the first request still owns the turn
    const exit = context.App.exitChat();
    assert.equal(context.App.exitChat(), exit, "repeated exit shares one handoff");
    realInput.value = "new draft";
    await context.App.sendMessage();
    assert.equal(snapshots.length, 0, "exit must not save an unresolved player turn");
    await Promise.all([request, exit]);
    assert.equal(context.Chat.messages.length, 1);
    assert.equal(snapshots.length, 1);
    assert.deepEqual(snapshots[0], JSON.parse(JSON.stringify(context.Chat.messages)));
    assert.equal(realInput.value, "new draft", "a new unsent draft survives cancellation");

    snapshots.length = 0;
    realInput.value = "preflight draft";
    let preflightEntered, releasePreflight;
    const preflightReady = new Promise(resolve => { preflightEntered = resolve; });
    const preflightGate = new Promise(resolve => { releasePreflight = resolve; });
    context.App.wrapSendMessage("test:async-preflight", async next => {
      preflightEntered();
      await preflightGate;
      return next();
    });
    const preflightRequest = context.App.sendMessage();
    await preflightReady;
    const preflightExit = context.App.exitChat();
    assert.equal(snapshots.length, 0, "an outer preflight must settle before exit saves");
    releasePreflight();
    await Promise.all([preflightRequest, preflightExit]);
    assert.equal(snapshots.length, 1);
    assert.equal(context.Chat.messages.length, 1);
    assert.equal(realInput.value, "preflight draft");

    snapshots.length = 0;
    realInput.value = "outer wrapper";
    let outerEntered, releaseOuter;
    const outerReady = new Promise(resolve => { outerEntered = resolve; });
    const outerGate = new Promise(resolve => { releaseOuter = resolve; });
    let outerTransportEntered;
    const outerTransportReady = new Promise(resolve => { outerTransportEntered = resolve; });
    context.API.send = () => { transportCalls++; outerTransportEntered();
      return new Promise((resolve, reject) => context.API.activeSignal.addEventListener("abort", () => reject(new Error("cancelled")))); };
    context.App.wrapSendMessage("test:post-turn", async next => {
      await Promise.resolve(); // inner lifecycle registers after this outer task
      try { return await next(); }
      finally { outerEntered(); await outerGate; }
    });
    const outerRequest = context.App.sendMessage();
    await outerTransportReady;
    const outerExit = context.App.exitChat();
    await outerReady;
    assert.equal(snapshots.length, 0, "exit must wait for outer post-turn wrappers");
    releaseOuter();
    await Promise.all([outerRequest, outerExit]);
    assert.equal(snapshots.length, 1);
    assert.equal(context.Chat.messages.length, 1);

    // Cancellation may arrive while context construction is still awaiting.
    // It must not start a transport with an already aborted signal.
    snapshots.length = 0;
    realInput.value = "draft during context";
    let releaseContext, enteredContext;
    const contextReady = new Promise(resolve => { enteredContext = resolve; });
    context.App.buildMessages = () => new Promise(resolve => { releaseContext = resolve; enteredContext(); });
    const constructing = context.App.sendMessage();
    await contextReady;
    const earlyExit = context.App.exitChat();
    releaseContext([]);
    await Promise.all([constructing, earlyExit]);
    assert.equal(transportCalls, 2);
    assert.equal(context.Chat.messages.length, 1);
    assert.deepEqual(snapshots[0], JSON.parse(JSON.stringify(context.Chat.messages)));
    assert.equal(realInput.value, "draft during context");

    snapshots.length = 0;
    realInput.value = "stale source";
    context.App.buildMessages = async () => [];
    let enteredAgain;
    const transportAgain = new Promise(resolve => { enteredAgain = resolve; });
    context.API.send = () => { enteredAgain();
      return new Promise((resolve, reject) => {
        context.API.activeSignal.addEventListener("abort", () => queueMicrotask(() => reject(new Error("cancelled")))); }); };
    const staleRequest = context.App.sendMessage();
    await transportAgain;
    const staleExit = context.App.exitChat();
    context.GameState.current = { id: "new-story" };
    await Promise.all([staleRequest, staleExit.then(result => assert.equal(result, false))]);
    assert.equal(snapshots.length, 0, "a stale exit cannot save or close a newer story");
  }

  console.log("request lifecycle core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
