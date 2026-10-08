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

// Usage ledger must stay inside the same authenticated administrator view.
assert.match(html, /id="view-player-usage"/);
assert.match(html, /id="player-usage-card"/);
assert.match(html, /id="usage-rows"/);
assert.match(html, /data-usage-player/);
assert.match(html, /"\/admin\/usage\?player_id="/);
assert.match(html, /"Bearer "\+adminToken/);
assert.match(html, /usageRows=page===0\?rows:usageRows\.concat\(rows\)/);
assert.match(html, /usageHasMore=Boolean\(data\.has_more\)/);
assert.match(html, /escapeHTML\(row\.model\|\|"—"\)/);
assert.match(html, /row\.billing_mode==="raw_tokens_v1"/);

const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || "";
new Function(script);

console.log("admin player list core test passed");
