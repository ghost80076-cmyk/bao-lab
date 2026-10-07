const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const workerEntrySource = fs.readFileSync(
  path.join(__dirname, "../workers/bao-lab-credits-api/worker.js"),
  "utf8"
);
const routeModulePath = path.join(
  __dirname,
  "../workers/bao-lab-credits-api/modules/admin-provider-control-routes.js"
);
const routeModuleSource = fs.readFileSync(
  routeModulePath,
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

const boundaryStart = routeModuleSource.indexOf(
  "const WorkerAdminProviderControlRoutes = (() => {"
);
const boundaryEnd = routeModuleSource.indexOf(
  "const {\n  adminProviderControlRoute,\n} = WorkerAdminProviderControlRoutes;"
);
const boundary = routeModuleSource.slice(
  boundaryStart,
  boundaryEnd
);

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

(async () => {
  const {
    WorkerAdminProviderControlRoutes,
    adminProviderControlRoute,
  } = await import(pathToFileURL(routeModulePath).href);

  assert.equal(
    WorkerAdminProviderControlRoutes.adminProviderControlRoute,
    adminProviderControlRoute
  );

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
