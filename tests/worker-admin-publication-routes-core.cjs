const assert = require("node:assert/strict");
const { loadWorkerTestSource } = require("./helpers/worker-test-source.cjs");
const fs = require("node:fs");
const path = require("node:path");

const source = loadWorkerTestSource();
const workerEntrySource = fs.readFileSync(
  path.join(__dirname, "../workers/bao-lab-credits-api/worker.js"),
  "utf8"
);
const adminPublicationModuleSource = fs.readFileSync(
  path.join(
    __dirname,
    "../workers/bao-lab-credits-api/modules/admin-publication-routes.js"
  ),
  "utf8"
);

assert.match(
  workerEntrySource,
  /from "\.\/modules\/admin-publication-routes\.js";/,
  "the Worker entry must import the extracted admin publication routes module"
);
assert.doesNotMatch(
  workerEntrySource,
  /async function adminPublicationRoute\(/,
  "admin publication route implementation must not remain duplicated in worker.js"
);
assert.match(
  adminPublicationModuleSource,
  /const WorkerAdminPublicationRoutes = \(\(\) => \{/,
  "admin publication endpoints must stay behind their own subroute boundary"
);
assert.match(
  adminPublicationModuleSource,
  /const MAX_ADMIN_PUBLISH_BODY_BYTES = 2_500_000;/,
  "publication body limit must stay at 2.5 MB"
);

const boundaryStart = source.indexOf("const WorkerAdminPublicationRoutes = (() => {");
const boundaryEnd = source.indexOf("const {\n  adminPublicationRoute,\n} = WorkerAdminPublicationRoutes;");
const boundary = source.slice(boundaryStart, boundaryEnd);

for (const route of [
  "/admin/characters/publish-status",
  "/admin/authors/profile-pr",
  "/admin/characters/publish-pr",
]) {
  assert.ok(boundary.includes(route), `missing publication route: ${route}`);
}

assert.doesNotMatch(
  boundary,
  /"\/admin\/provider-control|"\/admin\/players"|"\/admin\/usage"/,
  "publication subroutes must not absorb provider, player or usage administration"
);

const instrumented =
  source.replace(
    /export\s+default\s+\{/,
    "const __workerDefault = {"
  ) +
  "\nreturn { WorkerAdminPublicationRoutes, adminPublicationRoute };";

const {
  WorkerAdminPublicationRoutes,
  adminPublicationRoute,
} = new Function(instrumented)();

assert.equal(
  WorkerAdminPublicationRoutes.adminPublicationRoute,
  adminPublicationRoute
);

(async () => {
  const unmatched = await adminPublicationRoute(
    new Request("https://worker.test/admin/players"),
    "/admin/players",
    {}
  );
  assert.equal(unmatched, null);

  const status = await adminPublicationRoute(
    new Request("https://worker.test/admin/characters/publish-status"),
    "/admin/characters/publish-status",
    {}
  );

  assert.equal(status.status, 200);
  const payload = await status.json();
  assert.equal(payload.configured, false);
  assert.equal(payload.mode, "pull_request_only");

  console.log("worker admin publication routes core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
