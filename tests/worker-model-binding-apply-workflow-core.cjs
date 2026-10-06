const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(
    __dirname,
    "../.github/workflows/production-model-registry-apply.yml"
  ),
  "utf8"
);

assert.match(
  source,
  /on:\s*\n\s*workflow_dispatch:/,
  "model binding apply must be manual-only"
);
assert.doesNotMatch(
  source,
  /\n\s*push:/,
  "model binding apply must never run automatically on push"
);
assert.doesNotMatch(
  source,
  /\n\s*pull_request:/,
  "model binding apply must never run automatically on pull requests"
);

assert.match(
  source,
  /mode:\s*\n[\s\S]*default: dry-run[\s\S]*options:[\s\S]*- dry-run[\s\S]*- apply/,
  "manual workflow must default to dry-run and require an explicit apply choice"
);
assert.match(
  source,
  /expected_current_fingerprint:/,
  "manual apply must accept the optimistic-lock fingerprint"
);
assert.match(
  source,
  /\^\[a-fA-F0-9\]\{64\}\$/,
  "workflow must reject malformed fingerprints before the apply script runs"
);

assert.match(
  source,
  /group: production-worker\s*\n\s*cancel-in-progress: false/,
  "model binding changes must serialize with production Worker content deployments"
);

for (const command of [
  "node --check scripts/apply-worker-model-bindings.cjs",
  "node tests/worker-model-binding-apply-core.cjs",
  "node tests/model-deployment-plan-core.cjs",
  "node tests/production-model-registry-audit-core.cjs",
]) {
  assert.ok(
    source.includes(command),
    `guarded apply contract is missing: ${command}`
  );
}

assert.match(
  source,
  /node scripts\/apply-worker-model-bindings\.cjs\s+--apply\s+"--expect-current=\$\{YORUBAY_EXPECTED_FINGERPRINT\}"/,
  "apply mode must pass the operator-confirmed current fingerprint"
);
assert.match(
  source,
  /node scripts\/audit-production-model-registry\.cjs/,
  "successful apply must be followed by the production registry audit"
);

const applyIndex = source.indexOf("--apply");
const auditIndex = source.lastIndexOf(
  "node scripts/audit-production-model-registry.cjs"
);
assert.ok(
  applyIndex >= 0 && auditIndex > applyIndex,
  "post-apply audit must run after the guarded mutation"
);

console.log("production model registry apply workflow contract passed");
