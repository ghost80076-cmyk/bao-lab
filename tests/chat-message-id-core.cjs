const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = {
  console,
  crypto: { randomUUID: (() => { let id = 0; return () => `uuid-${++id}`; })() },
  setTimeout() {},
  document: { getElementById() { return null; }, querySelector() { return null; } },
  App: { config: { memory: {} } },
  API: {},
  GameState: { current: null }
};
context.window = { addEventListener() {}, GameState: context.GameState, API: context.API };
context.globalThis = context;
vm.createContext(context);
const source = fs.readFileSync(path.join(__dirname, "..", "js", "chat.js"), "utf8");
vm.runInContext(`${source}\nwindow.__Chat = Chat;`, context, { filename: "js/chat.js" });
const Chat = context.window.__Chat;

const added = Chat.add("user", "第一句");
assert.match(added.id, /^msg-uuid-/);
assert.equal(Chat.messages[0].id, added.id);

const migrated = Chat.ensureMessageIds([
  { role: "user", content: "舊訊息" },
  { id: "msg-stable", role: "assistant", content: "已有 ID" },
  { id: "msg-stable", role: "assistant", content: "重複 ID" }
]);
assert.match(migrated[0].id, /^msg-uuid-/);
assert.equal(migrated[1].id, "msg-stable");
assert.notEqual(migrated[2].id, "msg-stable");
assert.equal(new Set(migrated.map(message => message.id)).size, 3);
assert.equal(Chat.ensureMessageIds(migrated)[1].id, "msg-stable", "existing IDs must remain stable");

console.log("chat message ID core test passed");
