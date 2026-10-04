const assert = require("node:assert/strict");
const { loadWorkerTestSource } = require("./helpers/worker-test-source.cjs");
const fs = require("node:fs");
const path = require("node:path");

const source = loadWorkerTestSource();

assert.match(
  source,
  /const WorkerAdminPlayerDirectoryRoutes = \(\(\) => \{/,
  "player list/create endpoints must stay behind their own admin subroute boundary"
);

const boundaryStart = source.indexOf("const WorkerAdminPlayerDirectoryRoutes = (() => {");
const boundaryEnd = source.indexOf("const {\n  adminPlayerDirectoryRoute,\n} = WorkerAdminPlayerDirectoryRoutes;");
const boundary = source.slice(boundaryStart, boundaryEnd);

assert.match(boundary, /"\/admin\/players"/);
assert.match(boundary, /request\.method ===\s*"GET"/);
assert.match(boundary, /request\.method ===\s*"POST"/);
assert.match(boundary, /LIMIT 200/);
assert.match(boundary, /INSERT INTO players/);
assert.match(boundary, /INSERT INTO wallets/);
assert.doesNotMatch(
  boundary,
  /wallet_topups|wallet_ledger|\(credit\|wallet-credit\|disable\|enable\)/,
  "directory routes must not absorb existing-player mutations or top-ups"
);

const instrumented =
  source.replace(
    /export\s+default\s+\{/,
    "const __workerDefault = {"
  ) +
  "\nreturn { WorkerAdminPlayerDirectoryRoutes, adminPlayerDirectoryRoute };";

const {
  WorkerAdminPlayerDirectoryRoutes,
  adminPlayerDirectoryRoute,
} = new Function(instrumented)();

assert.equal(
  WorkerAdminPlayerDirectoryRoutes.adminPlayerDirectoryRoute,
  adminPlayerDirectoryRoute
);

(async () => {
  let touchedDatabase = false;
  const db = {
    prepare() {
      touchedDatabase = true;
      throw new Error("invalid or unmatched directory requests must not touch D1");
    },
    async batch() {
      touchedDatabase = true;
      throw new Error("invalid directory requests must not batch D1 writes");
    },
  };

  const unmatched = await adminPlayerDirectoryRoute(
    new Request("https://worker.test/admin/usage"),
    "/admin/usage",
    {},
    db
  );
  assert.equal(unmatched, null);

  const invalid = await adminPlayerDirectoryRoute(
    new Request("https://worker.test/admin/players", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ daily_chat_limit: 0 }),
    }),
    "/admin/players",
    {},
    db
  );

  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error, "invalid_player_settings");
  assert.equal(touchedDatabase, false);

  console.log("worker admin player directory routes core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
