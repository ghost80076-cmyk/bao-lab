const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "storage-write-guard.js"), "utf8");
const context = vm.createContext({
  console,
  Promise,
  JSON,
  window: {},
  document: {
    querySelector() { return null; },
    getElementById() { return null; },
    createElement() { return { setAttribute() {}, style: {} }; }
  },
  localStorage: { getItem() { return null; } }
});

// App / Storage exist as earlier classic-script lexical globals, but global-bridge
// has intentionally NOT copied them onto window yet.
vm.runInContext(`
  const App = { saveStory() { return false; } };
  const Storage = {
    prefix: "bao:",
    storyKey: "story",
    _cache: {},
    status() { return { mode: "indexedDB", ready: true }; },
    flush() { return Promise.resolve(true); }
  };
`, context);

assert.equal(context.window.App, undefined);
assert.equal(context.window.Storage, undefined);

vm.runInContext(source, context, { filename: "js/storage-write-guard.js" });

assert.ok(
  context.window.BAOStorageWriteGuard,
  "storage guard must install without waiting for global-bridge to populate window.App/window.Storage"
);
assert.equal(
  typeof context.window.BAOStorageWriteGuard.verify,
  "function"
);

console.log("storage-write-guard-load-order: installs independently of global-bridge timing");
