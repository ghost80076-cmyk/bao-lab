const assert = require("node:assert/strict");

const {
  buildWorkerUploadBody,
  deployWorkerContent,
  normalizeWorkerModules,
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
