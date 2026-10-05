const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const scriptPath = path.join(
  __dirname,
  "../scripts/build-aws-relay-config-audit-parameters.cjs"
);
const workflowPath = path.join(
  __dirname,
  "../.github/workflows/aws-relay-model-registry-audit.yml"
);

const parameters = JSON.parse(
  execFileSync(process.execPath, [scriptPath], { encoding: "utf8" })
);

assert.ok(Array.isArray(parameters.commands));
assert.ok(
  parameters.commands.some(command =>
    command.includes("ACTUAL_OPENROUTER_MODELS")
  )
);
assert.ok(
  parameters.commands.some(command =>
    command.includes("FragmentPath")
  )
);
assert.ok(
  parameters.commands.some(command =>
    command.includes("EnvironmentFiles")
  )
);

const joined = parameters.commands.join("\n");
assert.equal(
  joined.includes("cat /"),
  false,
  "relay audit must not dump arbitrary files"
);
assert.equal(
  joined.includes("systemctl restart"),
  false,
  "relay audit must remain read-only"
);
assert.equal(
  joined.includes("systemctl stop"),
  false,
  "relay audit must remain read-only"
);
assert.equal(
  joined.includes("sed -i"),
  false,
  "relay audit must not mutate config"
);
assert.equal(
  joined.includes("rm -"),
  false,
  "relay audit must not delete files"
);

const workflow = fs.readFileSync(workflowPath, "utf8");
assert.match(workflow, /id-token:\s*write/);
assert.match(
  workflow,
  /role-to-assume:\s*arn:aws:iam::746698923199:role\/YoruBayGitHubDeploy/
);
assert.match(workflow, /--instance-ids i-00a22eb7d55a6ea30/);
assert.match(workflow, /--document-name AWS-RunShellScript/);
assert.match(
  workflow,
  /npm run audit:aws-models/
);
assert.equal(
  workflow.includes("systemctl restart"),
  false,
  "live audit workflow must not restart the backend"
);

console.log("AWS relay live audit contract passed");
