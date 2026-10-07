const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildWorkerUploadBody,
  deployWorkerContent,
  loadWorkerModuleManifest,
  normalizeWorkerModules,
  parseWorkerModuleManifest,
  validateWorkerModuleName,
  validateWorkerSource,
  workerContentUrl,
} = require("../scripts/deploy-worker-content.cjs");

const accountId = "a".repeat(32);

assert.equal(
  workerContentUrl(accountId, "yorubay-credits-pilot"),
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/yorubay-credits-pilot/content`
);
assert.throws(
  () => workerContentUrl("not-an-account", "yorubay-credits-pilot"),
  /32-character hexadecimal/
);
assert.throws(
  () => workerContentUrl(accountId, "bad worker name"),
  /unsupported characters/
);
assert.throws(() => validateWorkerSource(""), /empty/);
assert.throws(() => validateWorkerSource("console.log('no export')"), /module export/);
assert.equal(validateWorkerModuleName("modules/http.js"), "modules/http.js");
for (const unsafeName of [
  "../secret.js",
  "/root.js",
  "modules\\http.js",
  "modules//http.js",
  "metadata",
]) {
  assert.throws(() => validateWorkerModuleName(unsafeName), /unsafe/);
}

assert.deepEqual(
  parseWorkerModuleManifest(JSON.stringify({
    schema_version: 1,
    main_module: "worker.js",
    modules: ["worker.js", "modules/health.js"],
  })),
  {
    mainModule: "worker.js",
    modules: ["modules/health.js", "worker.js"],
  }
);
assert.throws(
  () => parseWorkerModuleManifest("not JSON"),
  /invalid JSON/
);
assert.throws(
  () => parseWorkerModuleManifest(JSON.stringify({
    schema_version: 2,
    main_module: "worker.js",
    modules: ["worker.js"],
  })),
  /schema_version must be 1/
);
assert.throws(
  () => parseWorkerModuleManifest(JSON.stringify({
    schema_version: 1,
    main_module: "worker.js",
    modules: ["worker.js", "worker.js"],
  })),
  /Duplicate Worker manifest module/
);
assert.throws(
  () => parseWorkerModuleManifest(JSON.stringify({
    schema_version: 1,
    main_module: "worker.js",
    modules: ["../worker.js"],
  })),
  /unsafe/
);
assert.throws(
  () => parseWorkerModuleManifest(JSON.stringify({
    schema_version: 1,
    main_module: "worker.js",
    modules: ["worker.js"],
    deploy_everything: true,
  })),
  /unsupported field/
);

const fixtureDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "worker-deployment-manifest-")
);
fs.mkdirSync(path.join(fixtureDirectory, "modules"));
fs.writeFileSync(
  path.join(fixtureDirectory, "worker.js"),
  "import { ok } from './modules/health.js'; export default { fetch: ok };"
);
fs.writeFileSync(
  path.join(fixtureDirectory, "modules/health.js"),
  "export function ok() { return new Response('ok'); }"
);
const fixtureManifestPath = path.join(fixtureDirectory, "deployment-manifest.json");
fs.writeFileSync(
  fixtureManifestPath,
  JSON.stringify({
    schema_version: 1,
    main_module: "worker.js",
    modules: ["worker.js", "modules/health.js"],
  })
);
const fixtureGraph = loadWorkerModuleManifest(fixtureManifestPath);
assert.equal(fixtureGraph.mainModule, "worker.js");
assert.deepEqual(
  fixtureGraph.modules.map(module => module.name),
  ["modules/health.js", "worker.js"]
);

fs.writeFileSync(
  fixtureManifestPath,
  JSON.stringify({
    schema_version: 1,
    main_module: "worker.js",
    modules: ["worker.js", "modules/missing.js"],
  })
);
assert.throws(
  () => loadWorkerModuleManifest(fixtureManifestPath),
  /module is missing: modules\/missing\.js/
);
fs.rmSync(fixtureDirectory, { recursive: true, force: true });

const productionWorkerDirectory = path.join(
  __dirname,
  "../workers/bao-lab-credits-api"
);
const productionGraph = loadWorkerModuleManifest(
  path.join(productionWorkerDirectory, "deployment-manifest.json")
);
assert.equal(productionGraph.mainModule, "worker.js");
assert.deepEqual(
  productionGraph.modules.map(module => module.name),
  ["modules/account-auth.js", "modules/account-author-routes.js", "modules/account-rate-limit.js", "modules/account-self-route.js", "modules/account-validation.js", "modules/admin-auth.js", "modules/admin-player-directory-routes.js", "modules/admin-player-mutation-routes.js", "modules/admin-provider-control-routes.js", "modules/admin-publication-routes.js", "modules/admin-routes.js", "modules/admin-usage-routes.js", "modules/author-ownership.js", "modules/author-profile-publication.js", "modules/billing-constants.js", "modules/chat-input.js", "modules/crypto.js", "modules/github-publication-transport.js", "modules/http.js", "modules/model-pricing.js", "modules/number-utils.js", "modules/provider-control.js", "modules/provider-routing.js", "modules/provider-transport.js", "modules/publication-format.js", "modules/runtime-config.js", "modules/session-auth.js", "worker.js"],
  "production must contain only the reviewed extracted boundaries"
);
assert.equal(
  productionGraph.modules.find(module => module.name === "worker.js").content,
  fs.readFileSync(path.join(productionWorkerDirectory, "worker.js"), "utf8")
);
const productionBody = buildWorkerUploadBody(productionGraph);
assert.equal(productionBody.get("metadata"), '{"main_module":"worker.js"}');
assert.ok(
  productionBody.get("modules/account-auth.js"),
  "the extracted account auth module must be included in the upload"
);
assert.ok(
  productionBody.get("modules/account-author-routes.js"),
  "the extracted account author routes module must be included in the upload"
);
assert.ok(
  productionBody.get("modules/account-rate-limit.js"),
  "the extracted account rate limit module must be included in the upload"
);
assert.ok(
  productionBody.get("modules/account-self-route.js"),
  "the extracted account self route module must be included in the upload"
);
assert.ok(
  productionBody.get("modules/account-validation.js"),
  "the extracted account validation module must be included in the upload"
);
assert.ok(
  productionBody.get("modules/admin-auth.js"),
  "the extracted admin auth module must be included in the upload"
);
assert.ok(
  productionBody.get("modules/admin-player-directory-routes.js"),
  "the extracted admin player directory routes module must be included in the upload"
);
assert.ok(
  productionBody.get("modules/admin-player-mutation-routes.js"),
  "the extracted admin player mutation routes module must be included in the upload"
);
assert.ok(
  productionBody.get("modules/admin-provider-control-routes.js"),
  "the extracted admin provider control routes module must be included in the upload"
);
assert.ok(
  productionBody.get("modules/admin-publication-routes.js"),
  "the extracted admin publication routes module must be included in the upload"
);
assert.ok(
  productionBody.get("modules/admin-routes.js"),
  "the extracted admin dispatcher module must be included in the upload"
);
assert.ok(
  productionBody.get("modules/admin-usage-routes.js"),
  "the extracted admin usage routes module must be included in the upload"
);
assert.ok(
  productionBody.get("modules/author-profile-publication.js"),
  "the extracted author profile publication module must be included in the upload"
);
assert.ok(
  productionBody.get("modules/author-ownership.js"),
  "the extracted author ownership module must be included in the upload"
);
assert.ok(
  productionBody.get("modules/billing-constants.js"),
  "the shared billing constants module must be included in the upload"
);
assert.ok(
  productionBody.get("modules/chat-input.js"),
  "the extracted chat input module must be included in the upload"
);
assert.ok(
  productionBody.get("modules/crypto.js"),
  "the extracted crypto module must be included in the upload"
);
assert.ok(
  productionBody.get("modules/github-publication-transport.js"),
  "the extracted GitHub publication transport module must be included in the upload"
);
assert.ok(
  productionBody.get("modules/http.js"),
  "the extracted HTTP module must be included in the upload"
);
assert.ok(
  productionBody.get("modules/model-pricing.js"),
  "the extracted model pricing module must be included in the upload"
);
assert.ok(
  productionBody.get("modules/number-utils.js"),
  "the extracted numeric helper module must be included in the upload"
);
assert.ok(
  productionBody.get("modules/provider-control.js"),
  "the extracted provider control module must be included in the upload"
);
assert.ok(
  productionBody.get("modules/provider-transport.js"),
  "the extracted provider transport module must be included in the upload"
);
assert.ok(
  productionBody.get("modules/publication-format.js"),
  "the extracted publication format module must be included in the upload"
);
assert.ok(
  productionBody.get("modules/provider-routing.js"),
  "the extracted provider routing module must be included in the upload"
);
assert.ok(
  productionBody.get("modules/runtime-config.js"),
  "the extracted runtime config module must be included in the upload"
);
assert.ok(
  productionBody.get("modules/session-auth.js"),
  "the extracted session auth module must be included in the upload"
);
assert.ok(productionBody.get("worker.js"), "the main Worker module must be included");

const moduleBody = buildWorkerUploadBody({
  mainModule: "worker.js",
  modules: [
    {
      name: "worker.js",
      content: "import { ok } from './modules/health.js'; export default { fetch: ok };",
    },
    {
      name: "modules/health.js",
      content: "export function ok() { return new Response('ok'); }",
    },
  ],
});
assert.equal(moduleBody.get("metadata"), '{"main_module":"worker.js"}');

assert.throws(
  () => normalizeWorkerModules({
    mainModule: "worker.js",
    modules: [{ name: "modules/health.js", content: "export const ok = true;" }],
  }),
  /main module is missing/
);
assert.throws(
  () => normalizeWorkerModules({
    modules: [
      { name: "worker.js", content: "export default {};" },
      { name: "worker.js", content: "export const duplicate = true;" },
    ],
  }),
  /Duplicate Worker module/
);
assert.throws(
  () => normalizeWorkerModules({
    source: "export default {};",
    modules: [{ name: "worker.js", content: "export default {};" }],
  }),
  /not both/
);
assert.throws(
  () => normalizeWorkerModules({ modules: [] }),
  /module graph is empty/
);
assert.throws(
  () => normalizeWorkerModules({
    modules: [{ name: "worker.js", content: "" }],
  }),
  /module is empty/
);

(async () => {
  assert.match(await moduleBody.get("worker.js").text(), /import \{ ok \}/);
  assert.match(
    await moduleBody.get("modules/health.js").text(),
    /export function ok/
  );

  let captured;
  const source = "export default { async fetch() { return new Response('ok'); } };";
  const result = await deployWorkerContent({
    accountId,
    apiToken: "test-token",
    workerName: "yorubay-credits-pilot",
    source,
    async fetchImpl(url, init) {
      captured = { url, init };
      return new Response(
        JSON.stringify({ success: true, result: { etag: "worker-etag" } }),
        { status: 200 }
      );
    },
  });

  assert.equal(captured.init.method, "PUT");
  assert.equal(captured.init.headers.authorization, "Bearer test-token");
  assert.equal(captured.url, workerContentUrl(accountId, "yorubay-credits-pilot"));
  assert.equal(captured.init.body.get("metadata"), '{"main_module":"worker.js"}');
  assert.equal(await captured.init.body.get("worker.js").text(), source);
  assert.deepEqual(result, { status: 200, etag: "worker-etag" });

  let moduleGraphBody;
  await deployWorkerContent({
    accountId,
    apiToken: "test-token",
    workerName: "yorubay-credits-pilot",
    mainModule: "worker.js",
    modules: [
      { name: "worker.js", content: "export default { fetch() {} };" },
      { name: "modules/config.js", content: "export const version = 1;" },
    ],
    async fetchImpl(_url, init) {
      moduleGraphBody = init.body;
      return new Response(JSON.stringify({ success: true, result: {} }), {
        status: 200,
      });
    },
  });
  assert.equal(moduleGraphBody.get("metadata"), '{"main_module":"worker.js"}');
  assert.equal(
    await moduleGraphBody.get("modules/config.js").text(),
    "export const version = 1;"
  );

  await assert.rejects(
    deployWorkerContent({
      accountId,
      apiToken: "test-token",
      workerName: "yorubay-credits-pilot",
      source: "export default {};",
      async fetchImpl() {
        return new Response(
          JSON.stringify({
            success: false,
            errors: [{ message: "deployment denied" }],
          }),
          { status: 403 }
        );
      },
    }),
    /deployment denied/
  );

  console.log("worker content deploy core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
