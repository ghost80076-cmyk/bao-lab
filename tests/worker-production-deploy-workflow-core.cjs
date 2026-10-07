const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "../.github/workflows/worker-production-deploy.yml"),
  "utf8"
);
const workerReadme = fs.readFileSync(
  path.join(__dirname, "../workers/bao-lab-credits-api/README.md"),
  "utf8"
);
const rollbackRunbook = fs.readFileSync(
  path.join(__dirname, "../docs/worker-production-rollback.md"),
  "utf8"
);

assert.match(
  source,
  /on:\s*\n\s*push:\s*\n\s*branches:\s*\n\s*- main/,
  "production Worker deployment must auto-run from main"
);

for (const watchedPath of [
  "workers/bao-lab-credits-api/worker.js",
  "workers/bao-lab-credits-api/modules/**",
  "workers/bao-lab-credits-api/deployment-manifest.json",
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
  /YORUBAY_WORKER_MANIFEST:\s*workers\/bao-lab-credits-api\/deployment-manifest\.json/,
  "production deployment must load the reviewed Worker module manifest"
);
assert.match(
  source,
  /node --check workers\/bao-lab-credits-api\/modules\/account-auth\.js/,
  "the extracted account auth module must pass syntax validation before deployment"
);
assert.match(
  source,
  /node --check workers\/bao-lab-credits-api\/modules\/account-author-routes\.js/,
  "the extracted account author routes module must pass syntax validation before deployment"
);
assert.match(
  source,
  /node --check workers\/bao-lab-credits-api\/modules\/account-rate-limit\.js/,
  "the extracted account rate limit module must pass syntax validation before deployment"
);
assert.match(
  source,
  /node --check workers\/bao-lab-credits-api\/modules\/account-self-route\.js/,
  "the extracted account self route module must pass syntax validation before deployment"
);
assert.match(
  source,
  /node --check workers\/bao-lab-credits-api\/modules\/account-validation\.js/,
  "the extracted account validation module must pass syntax validation before deployment"
);
assert.match(
  source,
  /node --check workers\/bao-lab-credits-api\/modules\/admin-auth\.js/,
  "the extracted admin auth module must pass syntax validation before deployment"
);
assert.match(
  source,
  /node --check workers\/bao-lab-credits-api\/modules\/admin-player-directory-routes\.js/,
  "the extracted admin player directory routes module must pass syntax validation before deployment"
);
assert.match(
  source,
  /node --check workers\/bao-lab-credits-api\/modules\/admin-player-mutation-routes\.js/,
  "the extracted admin player mutation routes module must pass syntax validation before deployment"
);
assert.match(
  source,
  /node --check workers\/bao-lab-credits-api\/modules\/admin-provider-control-routes\.js/,
  "the extracted admin provider control routes module must pass syntax validation before deployment"
);
assert.match(
  source,
  /node --check workers\/bao-lab-credits-api\/modules\/admin-publication-routes\.js/,
  "the extracted admin publication routes module must pass syntax validation before deployment"
);
assert.match(
  source,
  /node --check workers\/bao-lab-credits-api\/modules\/admin-routes\.js/,
  "the extracted admin dispatcher module must pass syntax validation before deployment"
);
assert.match(
  source,
  /node --check workers\/bao-lab-credits-api\/modules\/admin-usage-routes\.js/,
  "the extracted admin usage routes module must pass syntax validation before deployment"
);
assert.match(
  source,
  /node --check workers\/bao-lab-credits-api\/modules\/author-profile-publication\.js/,
  "the extracted author profile publication module must pass syntax validation before deployment"
);
assert.match(
  source,
  /node --check workers\/bao-lab-credits-api\/modules\/author-ownership\.js/,
  "the extracted author ownership module must pass syntax validation before deployment"
);
assert.match(
  source,
  /node --check workers\/bao-lab-credits-api\/modules\/billing-constants\.js/,
  "the shared billing constants module must pass syntax validation before deployment"
);
assert.match(
  source,
  /node --check workers\/bao-lab-credits-api\/modules\/chat-input\.js/,
  "the extracted chat input module must pass syntax validation before deployment"
);
assert.match(
  source,
  /node --check workers\/bao-lab-credits-api\/modules\/crypto\.js/,
  "the extracted crypto module must pass syntax validation before deployment"
);
assert.match(
  source,
  /node --check workers\/bao-lab-credits-api\/modules\/github-publication-transport\.js/,
  "the extracted GitHub publication transport module must pass syntax validation before deployment"
);
assert.match(
  source,
  /node --check workers\/bao-lab-credits-api\/modules\/http\.js/,
  "the extracted HTTP module must pass syntax validation before deployment"
);
assert.match(
  source,
  /node --check workers\/bao-lab-credits-api\/modules\/model-pricing\.js/,
  "the extracted model pricing module must pass syntax validation before deployment"
);
assert.match(
  source,
  /node --check workers\/bao-lab-credits-api\/modules\/number-utils\.js/,
  "the extracted numeric helper module must pass syntax validation before deployment"
);
assert.match(
  source,
  /node --check workers\/bao-lab-credits-api\/modules\/provider-control\.js/,
  "the extracted provider control module must pass syntax validation before deployment"
);
assert.match(
  source,
  /node --check workers\/bao-lab-credits-api\/modules\/publication-format\.js/,
  "the extracted publication format module must pass syntax validation before deployment"
);
assert.match(
  source,
  /node --check workers\/bao-lab-credits-api\/modules\/provider-routing\.js/,
  "the extracted provider routing module must pass syntax validation before deployment"
);
assert.match(
  source,
  /node --check workers\/bao-lab-credits-api\/modules\/runtime-config\.js/,
  "the extracted runtime config module must pass syntax validation before deployment"
);
assert.match(
  source,
  /node --check workers\/bao-lab-credits-api\/modules\/session-auth\.js/,
  "the extracted session auth module must pass syntax validation before deployment"
);

assert.match(
  source,
  /node tests\/worker-session-auth-core\.cjs/,
  "session auth behavior contract must run before production deployment"
);
assert.match(
  source,
  /node tests\/worker-account-auth-core\.cjs/,
  "standalone account auth ES module behavior must run before production deployment"
);
assert.match(
  source,
  /node tests\/worker-account-self-route-core\.cjs/,
  "account self route behavior contract must run before production deployment"
);
assert.match(
  source,
  /node tests\/worker-provider-control-esm-core\.mjs/,
  "standalone provider-control ES module behavior must run before production deployment"
);
assert.match(
  source,
  /node tests\/account-author-identity\.cjs/,
  "account author identity contract must run before production deployment"
);
assert.match(
  source,
  /node tests\/worker-crypto-core\.cjs/,
  "crypto behavior contract must run before production deployment"
);
assert.match(
  source,
  /node tests\/worker-number-utils-core\.cjs/,
  "numeric helper behavior contract must run before production deployment"
);
assert.match(
  source,
  /node tests\/worker-http-core\.cjs/,
  "HTTP behavior contract must run before production deployment"
);

assert.match(
  source,
  /group: production-worker\s*\n\s*cancel-in-progress: false/,
  "production deployments must remain serialized"
);

assert.match(
  workerReadme,
  /automatically deployed after they are merged to `main`/,
  "Worker documentation must describe the active auto-deploy contract"
);
assert.doesNotMatch(
  workerReadme,
  /GitHub does \*\*not\*\* automatically deploy/,
  "Worker documentation must not retain the retired manual-only contract"
);

for (const healthUrl of [
  "https://api.yorubay.com/health",
  "https://bao-lab-credits-api.ghost80076.workers.dev/health",
]) {
  assert.ok(
    rollbackRunbook.includes(healthUrl),
    "rollback runbook must verify " + healthUrl
  );
}
assert.match(
  rollbackRunbook,
  /npm run audit:production-security/,
  "rollback runbook must require the production security audit"
);

console.log("production Worker auto-deploy workflow contract passed");
