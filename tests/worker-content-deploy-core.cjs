const assert = require("node:assert/strict");

const {
  deployWorkerContent,
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

(async () => {
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
