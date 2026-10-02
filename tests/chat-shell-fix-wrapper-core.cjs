const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "chat-shell-fix.js"), "utf8");
const match = source.match(/const chatHeaderWrapper = function\(next, fresh = false\) \{([\s\S]*?)\n  \};/);
assert.ok(match, "chatHeaderWrapper must remain directly testable");

const calls = [];
const context = {
  ensureChatHeader() { calls.push("ensure"); },
  syncChatHeader() { calls.push("sync"); }
};
const wrapper = vm.runInNewContext(
  `(function(next, fresh = false) {${match[1]}\n})`,
  context
);

let result = wrapper(
  fresh => {
    calls.push("shell:" + fresh);
    return "rendered";
  },
  true
);
assert.equal(result, "rendered");
assert.deepEqual(calls, ["ensure", "shell:true", "sync"]);

calls.length = 0;
result = wrapper(
  fresh => {
    calls.push("shell:" + fresh);
    return { fresh };
  }
);
assert.deepEqual(result, { fresh: false });
assert.deepEqual(calls, ["ensure", "shell:false", "sync"]);

console.log("chat-shell-fix-wrapper: header repair wraps shell without changing return semantics");
