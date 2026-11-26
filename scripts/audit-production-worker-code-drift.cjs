#!/usr/bin/env node
"use strict";

// Compare the exact deployed Cloudflare Worker module bytes against the
// reviewed GitHub module manifest. Read only: never uploads or deploys code,
// patches settings, prints source, or reads secret binding values.
const { createHash } = require("node:crypto");
const {
  loadWorkerModuleManifest,
} = require("./deploy-worker-content.cjs");
const {
  fetchLatestDeployment,
  requireSingleActiveVersion,
} = require("./apply-production-model-registry.cjs");

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const required = (value, name) => {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(name + " is required");
  return result;
};

function decodeModuleBase64(source, name) {
  const encoded = required(source, "Cloudflare module content_base64 for " + name);
  const compact = encoded.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    throw new Error("Cloudflare module contains invalid base64: " + name);
  }
  const bytes = Buffer.from(compact, "base64");
  if (!bytes.length || bytes.toString("base64").replace(/=+$/, "") !== compact.replace(/=+$/, "")) {
    throw new Error("Cloudflare module cannot be decoded safely: " + name);
  }
  return bytes;
}

function compareWorkerModules(graph, deployed) {
  if (!graph || !Array.isArray(graph.modules) || !graph.mainModule) {
    throw new Error("Local Worker module graph is incomplete");
  }
  if (!deployed || !Array.isArray(deployed.modules)) {
    throw new Error("Cloudflare version did not include modules; unable to prove code parity");
  }
  const expected = new Map();
  for (const m of graph.modules) {
    const name = required(m.name, "Local Worker module name");
    if (expected.has(name)) throw new Error("Duplicate local Worker module: " + name);
    expected.set(name, { sha256: digest(Buffer.from(m.content, "utf8")), content_type: m.contentType });
  }
  const actual = new Map();
  for (const m of deployed.modules) {
    const name = required(m.name, "Cloudflare Worker module name");
    if (actual.has(name)) throw new Error("Duplicate live Worker module: " + name);
    actual.set(name, { sha256: digest(decodeModuleBase64(m.content_base64, name)), content_type: m.content_type });
  }
  const missing = [...expected.keys()].filter(name => !actual.has(name)).sort();
  const extra = [...actual.keys()].filter(name => !expected.has(name)).sort();
  const different = [...expected.keys()].filter(name =>
    actual.has(name) && expected.get(name).sha256 !== actual.get(name).sha256
  ).sort().map(name => ({
    module: name,
    expected_sha256_prefix: expected.get(name).sha256.slice(0, 12),
    deployed_sha256_prefix: actual.get(name).sha256.slice(0, 12),
  }));
  const mainModule = String(deployed.main_module || "");
  const main_match = mainModule === graph.mainModule;
  return {
    ok: main_match && missing.length === 0 && extra.length === 0 && different.length === 0,
    main_module_matches: main_match,
    expected_main_module: graph.mainModule,
    deployed_main_module: mainModule,
    expected_modules: expected.size,
    deployed_modules: actual.size,
    missing_modules: missing,
    extra_modules: extra,
    differing_modules: different,
  };
}

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
