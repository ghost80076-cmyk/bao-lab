const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const workerEntrySource = fs.readFileSync(
  path.join(__dirname, "../workers/bao-lab-credits-api/worker.js"),
  "utf8"
);
const modulePath = path.join(
  __dirname,
  "../workers/bao-lab-credits-api/modules/admin-usage-routes.js"
);
const moduleSource = fs.readFileSync(
  modulePath,
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

const boundaryStart = moduleSource.indexOf(
  "const WorkerAdminUsageRoutes = (() => {"
);
const boundaryEnd = moduleSource.indexOf(
  "const {\n  adminUsageRoute,\n} = WorkerAdminUsageRoutes;"
);
const boundary = moduleSource.slice(
  boundaryStart,
  boundaryEnd
);

assert.match(boundary, /"\/admin\/usage"/);
assert.match(boundary, /FROM api_usage/);
assert.match(boundary, /LIMIT 100/);
assert.doesNotMatch(
  boundary,
  /UPDATE |INSERT INTO |DELETE FROM |"\/admin\/players"/,
  "usage history subroutes must remain read-only and separate from player administration"
);

(async () => {
  const {
    WorkerAdminUsageRoutes,
    adminUsageRoute,
  } = await import(pathToFileURL(modulePath).href);

  assert.equal(
    WorkerAdminUsageRoutes.adminUsageRoute,
    adminUsageRoute
  );

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
