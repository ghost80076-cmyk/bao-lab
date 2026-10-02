const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "../workers/bao-lab-credits-api/worker.js"),
  "utf8"
);

assert.match(
  source,
  /const WorkerAdminPlayerMutationRoutes = \(\(\) => \{/,
  "existing-player mutations must stay behind their own admin subroute boundary"
);

const boundaryStart = source.indexOf("const WorkerAdminPlayerMutationRoutes = (() => {");
const boundaryEnd = source.indexOf("const {\n  adminPlayerMutationRoute,\n} = WorkerAdminPlayerMutationRoutes;");
const boundary = source.slice(boundaryStart, boundaryEnd);

assert.match(boundary, /\(credit\|wallet-credit\|disable\|enable\)/);
assert.match(boundary, /UPDATE players/);
assert.match(boundary, /UPDATE wallets/);
assert.match(boundary, /INSERT INTO admin_player_events/);
assert.match(boundary, /INSERT INTO wallet_topups/);
assert.match(boundary, /INSERT INTO wallet_ledger/);
assert.doesNotMatch(
  boundary,
  /LIMIT 200|FROM api_usage|"\/admin\/characters\/publish/,
  "mutation routes must not absorb directory, usage or publication administration"
);

const instrumented =
  source.replace(
    /export\s+default\s+\{/,
    "const __workerDefault = {"
  ) +
  "\nreturn { WorkerAdminPlayerMutationRoutes, adminPlayerMutationRoute };";

const {
  WorkerAdminPlayerMutationRoutes,
  adminPlayerMutationRoute,
} = new Function(instrumented)();

assert.equal(
  WorkerAdminPlayerMutationRoutes.adminPlayerMutationRoute,
  adminPlayerMutationRoute
);

(async () => {
  let touchedDatabase = false;
  const db = {
    prepare() {
      touchedDatabase = true;
      throw new Error("invalid or unmatched mutations must not touch D1");
    },
    async batch() {
      touchedDatabase = true;
      throw new Error("invalid mutations must not batch D1 writes");
    },
  };

  const unmatched = await adminPlayerMutationRoute(
    new Request("https://worker.test/admin/players"),
    "/admin/players",
    db
  );
  assert.equal(unmatched, null);

  const playerId = "00000000-0000-0000-0000-000000000000";
  const invalidCredit = await adminPlayerMutationRoute(
    new Request(`https://worker.test/admin/players/${playerId}/credit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount_credits: 0 }),
    }),
    `/admin/players/${playerId}/credit`,
    db
  );

  assert.equal(invalidCredit.status, 400);
  assert.equal((await invalidCredit.json()).error, "invalid_credit_amount");
  assert.equal(touchedDatabase, false);

  console.log("worker admin player mutation routes core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
