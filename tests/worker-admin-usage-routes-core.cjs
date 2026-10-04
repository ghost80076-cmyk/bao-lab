const assert = require("node:assert/strict");
const { loadWorkerTestSource } = require("./helpers/worker-test-source.cjs");
const fs = require("node:fs");
const path = require("node:path");

const source = loadWorkerTestSource();
const workerEntrySource = fs.readFileSync(
  path.join(__dirname, "../workers/bao-lab-credits-api/worker.js"),
  "utf8"
);
const moduleSource = fs.readFileSync(
  path.join(
    __dirname,
    "../workers/bao-lab-credits-api/modules/admin-usage-routes.js"
  ),
  "utf8"
);

assert.match(
  workerEntrySource,
  /from "\.\/modules\/admin-usage-routes\.js";/,
  "the Worker entry must import the extracted admin usage routes module"
);
assert.doesNotMatch(
  workerEntrySource,
  /function adminUsageRoute\(/,
  "admin usage route implementation must not remain duplicated in worker.js"
);
assert.match(
  moduleSource,
  /const WorkerAdminUsageRoutes = \(\(\) => \{/,
  "admin usage history must stay behind its read-only subroute boundary"
);

const boundaryStart = source.indexOf("const WorkerAdminUsageRoutes = (() => {");
const boundaryEnd = source.indexOf("const {\n  adminUsageRoute,\n} = WorkerAdminUsageRoutes;");
const boundary = source.slice(boundaryStart, boundaryEnd);

assert.match(boundary, /"\/admin\/usage"/);
assert.match(boundary, /FROM api_usage/);
assert.match(boundary, /LIMIT 100/);
assert.doesNotMatch(
  boundary,
  /UPDATE |INSERT INTO |DELETE FROM |"\/admin\/players"/,
  "usage history subroutes must remain read-only and separate from player administration"
);

const instrumented =
  source.replace(
    /export\s+default\s+\{/,
    "const __workerDefault = {"
  ) +
  "\nreturn { WorkerAdminUsageRoutes, adminUsageRoute };";

const {
  WorkerAdminUsageRoutes,
  adminUsageRoute,
} = new Function(instrumented)();

assert.equal(WorkerAdminUsageRoutes.adminUsageRoute, adminUsageRoute);

(async () => {
  let touchedDatabase = false;
  const db = {
    prepare() {
      touchedDatabase = true;
      throw new Error("invalid or unmatched usage requests must not touch D1");
    },
  };

  const unmatched = await adminUsageRoute(
    new Request("https://worker.test/admin/players"),
    "/admin/players",
    new URL("https://worker.test/admin/players"),
    db
  );
  assert.equal(unmatched, null);

  const missingPlayer = await adminUsageRoute(
    new Request("https://worker.test/admin/usage"),
    "/admin/usage",
    new URL("https://worker.test/admin/usage"),
    db
  );

  assert.equal(missingPlayer.status, 400);
  assert.equal((await missingPlayer.json()).error, "player_id_required");
  assert.equal(touchedDatabase, false);

  console.log("worker admin usage routes core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
