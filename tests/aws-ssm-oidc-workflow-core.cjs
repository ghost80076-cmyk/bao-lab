const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workflowPath = path.join(
  __dirname,
  "../.github/workflows/aws-ssm-oidc-audit.yml"
);
const source = fs.readFileSync(workflowPath, "utf8");

assert.match(source, /id-token:\s*write/);
assert.match(
  source,
  /role-to-assume:\s*arn:aws:iam::746698923199:role\/YoruBayGitHubDeploy/
);
assert.match(source, /aws-region:\s*ap-southeast-2/);
assert.match(source, /--instance-ids i-00a22eb7d55a6ea30/);
assert.match(source, /--document-name AWS-RunShellScript/);
assert.match(source, /systemctl is-active bao-backend\.service/);
assert.match(source, /systemctl is-active amazon-ssm-agent/);
assert.match(source, /aws ssm get-command-invocation/);

assert.match(source, /ACTIONS_ID_TOKEN_REQUEST_URL/);
assert.match(source, /ACTIONS_ID_TOKEN_REQUEST_TOKEN/);
assert.match(source, /url\.searchParams\.set\("audience", "sts\.amazonaws\.com"\)/);
assert.match(source, /sub:\s*claims\.sub/);
assert.match(source, /repository:\s*claims\.repository/);
assert.match(source, /ref:\s*claims\.ref/);
assert.equal(
  source.includes("console.log(jwt)"),
  false,
  "OIDC diagnostic must never print the raw JWT"
);
assert.equal(
  source.includes("console.log(requestToken)"),
  false,
  "OIDC diagnostic must never print the OIDC request token"
);

for (const forbidden of [
  "systemctl restart",
  "systemctl stop",
  "systemctl disable",
  "rm -",
  "sed -i",
  "tee /etc/",
  "shutdown",
  "reboot",
]) {
  assert.equal(
    source.includes(forbidden),
    false,
    `read-only audit must not contain mutating command: ${forbidden}`
  );
}

console.log("AWS SSM OIDC workflow contract passed");
