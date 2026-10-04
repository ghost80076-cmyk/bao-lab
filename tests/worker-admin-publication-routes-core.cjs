const assert = require("node:assert/strict");
const { loadWorkerTestSource } = require("./helpers/worker-test-source.cjs");
const fs = require("node:fs");
const path = require("node:path");

const source = loadWorkerTestSource();

assert.match(
  source,
  /const WorkerAdminPublicationRoutes = \(\(\) => \{/,
  "admin publication endpoints must stay behind their own subroute boundary"
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
