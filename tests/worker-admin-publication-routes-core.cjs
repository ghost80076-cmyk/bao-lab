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
  "../workers/bao-lab-credits-api/modules/admin-publication-routes.js"
);
const moduleSource = fs.readFileSync(
  modulePath,
  "utf8"
);

assert.match(
  workerEntrySource,
  /from "\.\/modules\/admin-publication-routes\.js";/,
  "the Worker entry must import the extracted admin publication routes module"
);
assert.doesNotMatch(
  workerEntrySource,
  /function adminPublicationRoute\(/,
  "admin publication route implementation must not remain duplicated in worker.js"
);
assert.match(
  moduleSource,
  /const WorkerAdminPublicationRoutes = \(\(\) => \{/,
  "admin publication endpoints must stay behind their own subroute boundary"
);

const boundaryStart = moduleSource.indexOf(
  "const WorkerAdminPublicationRoutes = (() => {"
);
const boundaryEnd = moduleSource.indexOf(
  "const {\n  adminPublicationRoute,\n} = WorkerAdminPublicationRoutes;"
);
const boundary = moduleSource.slice(
  boundaryStart,
  boundaryEnd
);

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

(async () => {
  const {
    WorkerAdminPublicationRoutes,
    adminPublicationRoute,
  } = await import(pathToFileURL(modulePath).href);

  assert.equal(
    WorkerAdminPublicationRoutes.adminPublicationRoute,
    adminPublicationRoute
  );

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
