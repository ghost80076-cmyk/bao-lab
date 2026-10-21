#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { buildModelDeploymentPlan, loadRegistry } = require("../workers/bao-lab-credits-api/build-model-deployment-plan.cjs");

const remotePath = path.resolve(__dirname, "aws-model-allowlist-remote.py");
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const isHash = value => /^[a-f0-9]{64}$/.test(value || "");
const isModelId = value => /^[a-z0-9][a-z0-9._:-]*\/[a-z0-9][a-z0-9._:-]*$/.test(value);

function buildParameters({ mode, expectedCurrentSha = "", plan, remoteSource }) {
  if (!["dry-run", "apply", "rollback"].includes(mode)) throw new Error("unsupported sync mode");
  const csv = plan?.aws?.value_csv;
  const entries = plan?.aws?.entries;
  if (!Array.isArray(entries) || !entries.length || entries.length > 100 || entries.some(x => !isModelId(x)) ||
      new Set(entries).size !== entries.length || csv !== entries.join(",")) {
    throw new Error("invalid AWS OpenRouter model deployment plan");
  }
  if (mode === "apply" && !isHash(expectedCurrentSha)) {
    throw new Error("apply requires an exact 64-character expected live model fingerprint");
  }
  if (!remoteSource || !remoteSource.includes('UNIT = "bao-backend.service"')) {
    throw new Error("the reviewed remote sync implementation is required");
  }
  const payload = {
    desired_csv: csv,
    desired_sha: sha256(csv),
    ...(mode === "apply" ? { expected_current_sha: expectedCurrentSha } : {}),
  };
  const encodedSource = Buffer.from(remoteSource).toString("base64");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64");
  const fragments = encodedSource.match(/.{1,2000}/g) || [];
  const commands = [
    "set -eu",
    "TMP=$(mktemp /tmp/yorubay-model-registry.XXXXXXXX)",
    'trap \'rm -f "$TMP"\' EXIT',
    ...fragments.map(part => `printf '%s' '${part}' >> "$TMP"`),
    `base64 -d "$TMP" | python3 - ${mode} '${encodedPayload}'`,
  ];
  if (commands.some(command => command.length > 2048)) throw new Error("SSM shell command is too long");
  return { commands };
}

if (require.main === module) {
  try {
    const mode = process.argv[2];
    const expectedCurrentSha = process.argv[3] || "";
    const plan = buildModelDeploymentPlan(loadRegistry());
    const remoteSource = fs.readFileSync(remotePath, "utf8");
    process.stdout.write(JSON.stringify(buildParameters({ mode, expectedCurrentSha, plan, remoteSource })) + "\n");
  } catch (error) {
    process.stderr.write(error.message + "\n");
    process.exitCode = 2;
  }
}

module.exports = { buildParameters, isModelId, sha256 };
