const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildParameters, sha256, isModelId } = require("../scripts/build-aws-model-sync-parameters.cjs");

const root = path.join(__dirname, "..");
const remoteSource = fs.readFileSync(path.join(root, "scripts/aws-model-allowlist-remote.py"), "utf8");
const workflow = fs.readFileSync(path.join(root, ".github/workflows/coordinated-model-deploy.yml"), "utf8");
const fixture = { aws: { entries: ["google/gemma-4-31b-it", "xiaomi/mimo-v2.6-flash"], value_csv: "google/gemma-4-31b-it,xiaomi/mimo-v2.6-flash" } };
const fingerprint = sha256("google/gemma-4-31b-it,xiaomi/mimo-v2.5");

assert.equal(isModelId("xiaomi/mimo-v2.6-flash"), true);
for (const malformed of ["", "example", "../path", "x/model;rm -rf /", "foo/bar baz", "FOO/MODEL"]) {
  assert.equal(isModelId(malformed), false, malformed);
}
for (const mode of ["dry-run", "apply", "rollback"]) {
  const generated = buildParameters({ mode, expectedCurrentSha: fingerprint, plan: fixture, remoteSource });
  assert.ok(generated.commands.length > 5);
  assert.ok(generated.commands.every(x => x.length <= 2048));
  assert.match(generated.commands.at(-1), new RegExp("python3 - " + mode));
  const encoded = generated.commands.at(-1).match(/'([A-Za-z0-9+/=]+)'$/)[1];
  const payload = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  assert.equal(payload.desired_sha, sha256(fixture.aws.value_csv));
  assert.equal(payload.desired_csv, fixture.aws.value_csv);
  assert.equal(payload.expected_current_sha, mode === "apply" ? fingerprint : undefined);
  const assembledSource = generated.commands.slice(3, -1).map(cmd => cmd.match(/'([A-Za-z0-9+/=]+)'/)[1]).join("");
  assert.equal(Buffer.from(assembledSource, "base64").toString("utf8"), remoteSource);
}
for (const opts of [
  { mode: "apply", plan: fixture, remoteSource },
  { mode: "apply", expectedCurrentSha: "abc", plan: fixture, remoteSource },
  { mode: "unknown", plan: fixture, remoteSource },
  { mode: "dry-run", plan: { aws: { entries: ["invalid"], value_csv: "invalid" } }, remoteSource },
  { mode: "dry-run", plan: { aws: { entries: ["foo/bar", "foo/bar"], value_csv: "foo/bar,foo/bar" } }, remoteSource },
]) assert.throws(() => buildParameters(opts));

assert.match(remoteSource, /fcntl\.flock/);
assert.match(remoteSource, /previous_sha/);
assert.match(remoteSource, /daemon-reload/);
assert.match(remoteSource, /snapshot\.get\("applied_sha"\)/);
assert.match(remoteSource, /rollback refused/);
assert.match(remoteSource, /apply failed; previous service config restored/);
assert.match(workflow, /workflow_dispatch:/);
assert.match(workflow, /github\.ref \}\}' != 'refs\/heads\/main'/);
assert.match(workflow, /github\.sha/);
assert.match(workflow, /APPLY_REGISTRY_MODEL_BINDINGS/);
assert.match(workflow, /expected_current_sha256/);
assert.match(workflow, /if:.*failure\(\)/);
assert.match(workflow, /aws-actions\/configure-aws-credentials@v4/);
assert.match(workflow, /scripts\/apply-production-model-registry\.cjs/);
assert.doesNotMatch(workflow, /pull_request:|push:/, "no unreviewed automatic production apply");
console.log("AWS model sync guarded build, payload, rollback, and workflow contract passed");
