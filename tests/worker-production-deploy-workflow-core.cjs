const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "../.github/workflows/worker-production-deploy.yml"),
  "utf8"
);

assert.match(
  source,
  /on:\s*\n\s*push:\s*\n\s*branches:\s*\n\s*- main/,
  "production Worker deployment must auto-run from main"
);

for (const watchedPath of [
  "workers/bao-lab-credits-api/worker.js",
  "scripts/deploy-worker-content.cjs",
  ".github/workflows/worker-production-deploy.yml",
]) {
  assert.ok(
    source.includes("- " + watchedPath),
    "production Worker deployment must watch " + watchedPath
  );
}

assert.match(
  source,
  /workflow_dispatch:/,
  "manual production deployment must remain available as a fallback"
);

const verifyIndex = source.indexOf("- name: Verify deployment boundary");
const deployIndex = source.indexOf("- name: Replace production Worker content");
const auditIndex = source.indexOf("- name: Verify production security contract");

assert.ok(verifyIndex >= 0, "pre-deploy verification step is missing");
assert.ok(deployIndex > verifyIndex, "deployment must happen only after pre-deploy verification");
assert.ok(auditIndex > deployIndex, "production security audit must run after deployment");

assert.match(
  source,
  /group: production-worker\s*\n\s*cancel-in-progress: false/,
  "production deployments must remain serialized"
);

console.log("production Worker auto-deploy workflow contract passed");
