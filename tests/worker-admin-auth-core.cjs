const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const workerSource = fs.readFileSync(
  path.join(__dirname, "../workers/bao-lab-credits-api/worker.js"),
  "utf8"
);
const modulePath = path.join(
  __dirname,
  "../workers/bao-lab-credits-api/modules/admin-auth.js"
);
const moduleSource = fs.readFileSync(
  modulePath,
  "utf8"
);

assert.match(
  workerSource,
  /from "\.\/modules\/admin-auth\.js";/,
  "the Worker entry must import the extracted admin auth module"
);
assert.doesNotMatch(
  workerSource,
  /function adminAuthorized\(/,
  "admin auth implementation must not remain duplicated in worker.js"
);
assert.match(
  moduleSource,
  /const WorkerAdminAuth = Object\.freeze\(/,
  "admin bearer-token policy must stay separate from player session auth"
);

(async () => {
  const {
    WorkerAdminAuth,
    adminAuthorized,
  } = await import(pathToFileURL(modulePath).href);

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
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
