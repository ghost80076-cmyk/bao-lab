const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const code = fs.readFileSync(path.join(__dirname, "..", "js", "world-state.js"), "utf8");
vm.runInThisContext(code, { filename: "js/world-state.js" });

assert.equal(WorldStateEngine.enabled({ narrativeMode: "immersive", displayMode: "text" }), false, "free text immersive mode must not pay for hidden state tracking");
assert.equal(WorldStateEngine.enabled({ narrativeMode: "immersive", displayMode: "ui" }), true, "UI/status mode needs state tracking");
assert.equal(WorldStateEngine.enabled({ narrativeMode: "world", displayMode: "text" }), true, "world simulation still needs state tracking");

console.log("world state mode gating test passed");
