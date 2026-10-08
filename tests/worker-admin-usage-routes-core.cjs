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
assert.match(boundary, /LIMIT 101 OFFSET \?/);
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

  const invalidPage = await adminUsageRoute(
    new Request("https://worker.test/admin/usage?player_id=503f62e8-3777-43c9-b7ef-a7934aa45ed4&page=-1"),
    "/admin/usage",
    new URL("https://worker.test/admin/usage?player_id=503f62e8-3777-43c9-b7ef-a7934aa45ed4&page=-1"),
    db
  );
  assert.equal(invalidPage.status, 400);
  assert.equal((await invalidPage.json()).error, "invalid_usage_page");
  assert.equal(touchedDatabase, false);

  let sql = "";
  let bindings = [];
  const usageRows = Array.from({length: 101}, (_, index) => ({
    request_id: String(index),
    provider: "gemini",
    model: "gemini-3.1-pro-preview",
    request_kind: "chat",
    billing_mode: "cost_usd_v2",
    provider_cost_microusd: 10000,
    cost_microusd: 11000,
    settled_cost_microusd: 11000,
    created_at: "2026-10-08 12:00:00",
  }));
  const usageDb = {
    prepare(query) {
      sql = query;
      return {
        bind(...values) {
          bindings = values;
          return {all: async () => ({results: usageRows})};
        },
      };
    },
  };
  const url = new URL("https://worker.test/admin/usage?player_id=503f62e8-3777-43c9-b7ef-a7934aa45ed4&page=2");
  const response = await adminUsageRoute(new Request(url), "/admin/usage", url, usageDb);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(bindings, ["503f62e8-3777-43c9-b7ef-a7934aa45ed4", 200]);
  assert.match(sql, /ORDER BY\s+created_at DESC,\s+request_id DESC/);
  assert.equal(body.usage.length, 100);
  assert.equal(body.has_more, true);
  assert.equal(body.next_page, 3);
  assert.equal(body.usage[0].provider_cost_usd, 0.01);
  assert.equal(body.usage[0].settled_cost_usd, 0.011);

  console.log("worker admin usage routes core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
