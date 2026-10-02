const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "../workers/bao-lab-credits-api/worker.js"),
  "utf8"
);

assert.match(
  source,
  /const WorkerAdminRoutes = \(\(\) => \{/,
  "authenticated admin endpoints must stay grouped behind WorkerAdminRoutes"
);

const boundaryStart = source.indexOf("const WorkerAdminRoutes = (() => {");
const boundaryEnd = source.indexOf("const {\n  ensureAdminPlayerEvents,\n  adminRoute,\n} = WorkerAdminRoutes;");
const boundary = source.slice(boundaryStart, boundaryEnd);

for (const pathContract of [
  "/admin/characters/publish-status",
  "/admin/authors/profile-pr",
  "/admin/characters/publish-pr",
  "/admin/players",
  "/admin/usage",
]) {
  assert.ok(boundary.includes(pathContract), `missing admin route contract: ${pathContract}`);
}

assert.match(boundary, /adminAuthorized\(\s*request,\s*env\s*\)/);
assert.match(
  boundary,
  /await adminProviderControlRoute\(\s*request,\s*path,\s*env,\s*db\s*\)/,
  "the admin dispatcher must delegate provider-control endpoints to their subroute boundary"
);

const instrumented =
  source.replace(
    /export\s+default\s+\{/,
    "const __workerDefault = {"
  ) +
  "\nreturn { WorkerAdminRoutes, adminRoute };";

const {
  WorkerAdminRoutes,
  adminRoute,
} = new Function(instrumented)();

assert.equal(WorkerAdminRoutes.adminRoute, adminRoute);

(async () => {
  let touchedDatabase = false;
  const db = {
    prepare() {
      touchedDatabase = true;
      throw new Error("unauthorized admin requests must not reach D1");
    },
  };

  const missingToken = await adminRoute(
    new Request("https://worker.test/admin/players"),
    new URL("https://worker.test/admin/players"),
    { ADMIN_TOKEN: "admin-secret" },
    db
  );

  assert.equal(missingToken.status, 401);
  assert.equal((await missingToken.json()).error, "unauthorized");

  const wrongToken = await adminRoute(
    new Request("https://worker.test/admin/players", {
      headers: { authorization: "Bearer wrong-secret" },
    }),
    new URL("https://worker.test/admin/players"),
    { ADMIN_TOKEN: "admin-secret" },
    db
  );

  assert.equal(wrongToken.status, 401);
  assert.equal((await wrongToken.json()).error, "unauthorized");
  assert.equal(touchedDatabase, false);

  console.log("worker admin route core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
