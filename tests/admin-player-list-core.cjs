const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(
  path.join(__dirname, "../admin-wallet.html"),
  "utf8"
);

assert.match(html, /id="player-list-area"/);
assert.match(html, /id="player-list-body"/);
assert.match(html, /id="player-count"/);
assert.match(html, /id="player-list-filter"/);
assert.match(html, /id="player-list-sort"/);
assert.match(html, /data-select-player/);
assert.match(html, /function renderPlayerList\(\)/);
assert.match(html, /function selectPlayer\(player\)/);
assert.match(html, /renderPlayerList\(\);[\s\S]*管理員驗證成功/);
assert.match(html, /selected=players\.find\(function\(p\)\{return p\.id===selected\.id;\}\)\|\|selected;[\s\S]*renderPlayerList\(\);/);

const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || "";
new Function(script);

console.log("admin player list core test passed");
