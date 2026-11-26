"use strict";
const assert = require("node:assert/strict");
const { auditProductionWorkerCodeDrift, compareWorkerModules } = require("../scripts/audit-production-worker-code-drift.cjs");

const graph = {
  mainModule: "worker.js",
  modules: [
    { name: "worker.js", content: "export default { fetch() {} };", contentType: "application/javascript+module" },
    { name: "modules/helper.js", content: "export const hi = 1;", contentType: "application/javascript+module" },
  ],
};
const asCloudflare = () => ({
  main_module: "worker.js",
  modules: graph.modules.map(m => ({
    name: m.name,
    content_type: m.contentType,
    content_base64: Buffer.from(m.content).toString("base64"),
  })),
});
assert.equal(compareWorkerModules(graph, asCloudflare()).ok, true);
{
  const changed = asCloudflare(); changed.modules[1].content_base64 = Buffer.from("export const hi = 2;").toString("base64");
  const result = compareWorkerModules(graph, changed);
  assert.equal(result.ok, false);
  assert.deepEqual(result.differing_modules.map(m => m.module), ["modules/helper.js"]);
  assert.equal(result.differing_modules[0].deployed_sha256_prefix.length, 12);
}
{
  const changed = asCloudflare(); changed.modules.pop(); changed.modules.push({ name: "secret-untracked.js", content_base64: Buffer.from("test").toString("base64") });
  const result = compareWorkerModules(graph, changed);
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing_modules, ["modules/helper.js"]);
  assert.deepEqual(result.extra_modules, ["secret-untracked.js"]);
}
assert.throws(() => compareWorkerModules(graph, { main_module: "worker.js" }), /did not include modules/);
assert.throws(() => compareWorkerModules(graph, { main_module: "worker.js", modules: [{ name: "worker.js", content_base64: "%%%%" }] }), /invalid base64/);

async function main() {
  const calls = [];
  const result = await auditProductionWorkerCodeDrift({
    accountId: "a".repeat(32),
    workerName: "bao-lab-credits-api",
    apiToken: "test-secret",
    graph,
    previousDeployment: { versions: [{ percentage: 100, version_id: "466aeeb9-deployed" }] },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      assert.equal(options.method, "GET");
      assert.ok(url.includes("/versions/466aeeb9-deployed?include=modules"));
      assert.ok(url.includes("/workers/workers/bao-lab-credits-api/"));
      return new Response(JSON.stringify({ success: true, result: asCloudflare() }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, "read-only");
  assert.equal(result.active_version_id, "466aeeb9-deployed");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.authorization, "Bearer test-secret");
  assert.equal(JSON.stringify(result).includes("test-secret"), false);
  assert.equal(JSON.stringify(result).includes("export const hi"), false);
  await assert.rejects(
    auditProductionWorkerCodeDrift({
      accountId: "a".repeat(32), workerName: "bao-lab-credits-api", apiToken: "test-secret", graph,
      previousDeployment: { versions: [{ percentage: 50, version_id: "one" }, { percentage: 50, version_id: "two" }] },
      fetchImpl: async () => { throw new Error("must not fetch"); },
    }), /single 100% version/
  );
  console.log("read-only deployed Worker code parity audit core passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
