#!/usr/bin/env node
"use strict";

// Compare the exact deployed Cloudflare Worker module bytes against the
// reviewed GitHub module manifest. Read only: never uploads or deploys code,
// patches settings, prints source, or reads secret binding values.
const { compareWorkerModules, decodeModuleBase64, required } = require("./worker-module-parity-core.cjs");
const {
  loadWorkerModuleManifest,
} = require("./deploy-worker-content.cjs");
const {
  fetchLatestDeployment,
  requireSingleActiveVersion,
} = require("./apply-production-model-registry.cjs");

async function auditProductionWorkerCodeDrift(options = {}) {
  const accountId = required(options.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID, "CLOUDFLARE_ACCOUNT_ID");
  const workerName = required(options.workerName ?? process.env.CLOUDFLARE_WORKER_NAME, "CLOUDFLARE_WORKER_NAME");
  const token = required(options.apiToken ?? process.env.CLOUDFLARE_API_TOKEN, "CLOUDFLARE_API_TOKEN");
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("fetch is unavailable");
  const deployment = options.previousDeployment ?? await fetchLatestDeployment({
    accountId, workerName, apiToken: token, fetchImpl,
  });
  const activeVersion = requireSingleActiveVersion(deployment);
  const graph = options.graph ?? loadWorkerModuleManifest();
  // Cloudflare's version-specific GET supports include=modules, returning module
  // content_base64. Never use "latest": latest uploaded may not be deployed.
  const url = "https://api.cloudflare.com/client/v4/accounts/" +
    encodeURIComponent(accountId) + "/workers/workers/" +
    encodeURIComponent(workerName) + "/versions/" +
    encodeURIComponent(activeVersion) + "?include=modules";
  const response = await fetchImpl(url, { method: "GET", headers: { authorization: "Bearer " + token } });
  if (!response.ok) {
    throw new Error("Read-only Cloudflare version modules API failed (HTTP " + response.status + "); not safe to deploy");
  }
  const payload = await response.json();
  if (payload?.success !== true || !payload?.result) {
    throw new Error("Read-only Cloudflare version modules API returned no successful result; not safe to deploy");
  }
  const report = compareWorkerModules(graph, payload.result);
  return {
    schema: "yorubay-worker-live-code-parity/v1",
    mode: "read-only",
    active_version_id: activeVersion,
    ...report,
  };
}

async function main() {
  const report = await auditProductionWorkerCodeDrift();
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (!report.ok) process.exitCode = 1;
}
if (require.main === module) {
  main().catch(error => {
    console.error("Worker code parity could not be verified: " + error.message);
    process.exitCode = 1;
  });
}
module.exports = { auditProductionWorkerCodeDrift, compareWorkerModules, decodeModuleBase64 };
