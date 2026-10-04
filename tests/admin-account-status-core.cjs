const assert = require("node:assert/strict");
const { loadWorkerTestSource } = require("./helpers/worker-test-source.cjs");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const worker = loadWorkerTestSource();
const admin = fs.readFileSync(
  path.join(root, "admin-wallet.html"),
  "utf8"
);

new Function(
  worker.replace(
    /export\s+default\s+\{/,
    "const __workerDefault = {"
  )
);
const script = admin.match(/<script>([\s\S]*?)<\/script>/)?.[1] || "";
new Function(script);

assert.match(worker, /CREATE TABLE IF NOT EXISTS admin_player_events/);
assert.match(worker, /\(credit\|wallet-credit\|disable\|enable\)/);
assert.match(worker, /action ===\s*"disable"[\s\S]*action ===\s*"enable"/);
assert.match(worker, /INSERT INTO admin_player_events/);
assert.match(worker, /UPDATE auth_sessions[\s\S]*revoked_at/);
assert.match(worker, /session_relogin_required/);
assert.match(worker, /last_admin_reason/);
assert.match(worker, /last_admin_action_at/);

assert.match(admin, /data-disable-player/);
assert.match(admin, /data-enable-player/);
assert.match(admin, /停用帳號/);
assert.match(admin, /恢復帳號/);
assert.match(admin, /舊版停用，原因未記錄/);
assert.match(admin, /Wallet 與帳務紀錄保留/);
assert.match(admin, /玩家需要重新登入/);
assert.match(admin, /async function refreshPlayers/);

console.log("admin account status core test passed");
