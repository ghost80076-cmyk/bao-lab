const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "../workers/bao-lab-credits-api/worker.js"),
  "utf8"
);

assert.match(
  source,
  /const WorkerAdminAuth = \(\(\) => \{/,
  "admin bearer-token policy must stay separate from player session auth"
);

const instrumented =
  source.replace(
    /export\s+default\s+\{/,
    "const __workerDefault = {"
  ) +
  "\nreturn { WorkerAdminAuth, adminAuthorized };";

const {
  WorkerAdminAuth,
  adminAuthorized,
} = new Function(instrumented)();

assert.equal(WorkerAdminAuth.adminAuthorized, adminAuthorized);

const request = token =>
  new Request("https://worker.test/admin/players", {
    headers: token
      ? { authorization: `Bearer ${token}` }
      : {},
  });

assert.equal(adminAuthorized(request(), {}), false);
assert.equal(
  adminAuthorized(request("admin-secret"), {}),
  false,
  "a matching header cannot authorize admin access when ADMIN_TOKEN is unset"
);
assert.equal(
  adminAuthorized(request(), { ADMIN_TOKEN: "admin-secret" }),
  false
);
assert.equal(
  adminAuthorized(request("wrong-secret"), { ADMIN_TOKEN: "admin-secret" }),
  false
);
assert.equal(
  adminAuthorized(request("admin-secret"), { ADMIN_TOKEN: "admin-secret" }),
  true
);

console.log("worker admin auth core test passed");
