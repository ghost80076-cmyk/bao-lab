const assert = require("node:assert/strict");
const { loadWorkerTestSource } = require("./helpers/worker-test-source.cjs");
const fs = require("node:fs");
const path = require("node:path");

const source = loadWorkerTestSource();
const workerEntrySource = fs.readFileSync(
  path.join(__dirname, "../workers/bao-lab-credits-api/worker.js"),
  "utf8"
);
const routeModuleSource = fs.readFileSync(
  path.join(__dirname, "../workers/bao-lab-credits-api/modules/admin-provider-control-routes.js"),
  "utf8"
);

assert.match(
  workerEntrySource,
  /from "\.\/modules\/admin-provider-control-routes\.js";/,
  "the Worker entry must import the extracted admin provider-control routes"
);
assert.doesNotMatch(
  workerEntrySource,
  /const WorkerAdminProviderControlRoutes =/,
  "admin provider-control route implementation must not remain duplicated in worker.js"
);
assert.match(
  routeModuleSource,
  /const WorkerAdminProviderControlRoutes = \(\(\) => \{/,
  "provider-control admin endpoints must stay behind their own subroute boundary"
);

const boundaryStart = source.indexOf("const WorkerAdminProviderControlRoutes = (() => {");
const boundaryEnd = source.indexOf("const {\n  adminProviderControlRoute,\n} = WorkerAdminProviderControlRoutes;");
const boundary = source.slice(boundaryStart, boundaryEnd);

for (const route of [
  "/admin/provider-control",
  "/admin/provider-control/route",
  "/admin/provider-control/balance",
]) {
  assert.ok(boundary.includes(route), `missing provider-control route: ${route}`);
}

assert.doesNotMatch(
  boundary,
  /"\/admin\/players"|"\/admin\/usage"/,
  "provider-control subroutes must not absorb player or usage administration"
);

const instrumented =
  source.replace(
    /export\s+default\s+\{/,
    "const __workerDefault = {"
  ) +
  "\nreturn { WorkerAdminProviderControlRoutes, adminProviderControlRoute };";

const {
  WorkerAdminProviderControlRoutes,
  adminProviderControlRoute,
} = new Function(instrumented)();

assert.equal(
  WorkerAdminProviderControlRoutes.adminProviderControlRoute,
  adminProviderControlRoute
);

(async () => {
  let touchedDatabase = false;
  const unmatched = await adminProviderControlRoute(
    new Request("https://worker.test/admin/players"),
    "/admin/players",
    {},
    {
      prepare() {
        touchedDatabase = true;
        throw new Error("an unmatched subroute must not touch D1");
      },
    }
  );

  assert.equal(unmatched, null);
  assert.equal(touchedDatabase, false);

  console.log("worker admin provider-control routes core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
