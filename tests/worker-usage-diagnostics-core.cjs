const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const modulePath = path.join(
  __dirname,
  "../workers/bao-lab-credits-api/modules/usage-diagnostics.js"
);
const source = fs.readFileSync(modulePath, "utf8");
const costSource = fs.readFileSync(
  path.join(__dirname, "../workers/bao-lab-credits-api/modules/cost-chat-settlement.js"),
  "utf8"
);
const legacySource = fs.readFileSync(
  path.join(__dirname, "../workers/bao-lab-credits-api/modules/legacy-chat-settlement.js"),
  "utf8"
);
const adminSource = fs.readFileSync(
  path.join(__dirname, "../workers/bao-lab-credits-api/modules/admin-usage-routes.js"),
  "utf8"
);
const adminHtml = fs.readFileSync(
  path.join(__dirname, "../admin-wallet.html"),
  "utf8"
);

assert.match(source, /CREATE TABLE IF NOT EXISTS api_usage_diagnostics/);
assert.match(source, /ON CONFLICT\(request_id\) DO UPDATE/);
assert.doesNotMatch(
  source,
  /error_body|raw_error|response_body|JSON\.stringify\(result/,
  "diagnostics must not persist raw provider error bodies"
);
assert.match(costSource, /recordUsageFailure/);
assert.match(costSource, /"usage_metadata_unverified"/);
assert.match(legacySource, /recordUsageFailure/);
assert.match(adminSource, /LEFT JOIN api_usage_diagnostics AS d/);
assert.match(adminHtml, /失敗診斷/);
assert.match(adminHtml, /failure_code/);
assert.match(adminHtml, /transport_failure/);
assert.match(adminHtml, /rate_limit_scope/);

(async () => {
  const {
    normalizeUsageDiagnostic,
    recordUsageFailure,
  } = await import(pathToFileURL(modulePath).href);

  assert.deepEqual(
    normalizeUsageDiagnostic(
      "provider_rate_limited",
      {
        upstreamStatus: 429,
        providerStatus: "RESOURCE_EXHAUSTED",
        route: "aws_relay",
        transportFailure: "timeout",
        rateLimitScope: "quota",
        retryAfterSeconds: 30,
        requestBytes: 12345,
        elapsedMs: 170000,
        transportTimeoutMs: 170000,
        raw: "must never be stored",
      }
    ),
    {
      failure_code: "provider_rate_limited",
      upstream_http_status: 429,
      provider_status: "RESOURCE_EXHAUSTED",
      route: "aws_relay",
      transport_failure: "timeout",
      rate_limit_scope: "quota",
      retry_after_seconds: 30,
      request_bytes: 12345,
      elapsed_ms: 170000,
      timeout_ms: 170000,
      finish_reason: null,
      prompt_block_reason: null,
      response_shape: null,
      candidate_count: null,
      observed_input_tokens: null,
      observed_output_tokens: null,
    }
  );

  const sanitized = normalizeUsageDiagnostic(
    "../../bad code",
    {
      upstreamStatus: 999,
      providerStatus: "bad status",
      route: "https://secret.example",
      transportFailure: "stacktrace",
      rateLimitScope: "everything",
      retryAfterSeconds: 99999,
      requestBytes: -1,
      elapsedMs: -1,
      transportTimeoutMs: 0,
    }
  );
  assert.equal(sanitized.failure_code, "provider_request_failed");
  assert.equal(sanitized.upstream_http_status, null);
  assert.equal(sanitized.provider_status, null);
  assert.equal(sanitized.route, null);
  assert.equal(sanitized.transport_failure, null);
  assert.equal(sanitized.rate_limit_scope, null);
  assert.equal(sanitized.retry_after_seconds, null);
  assert.equal(sanitized.request_bytes, null);
  assert.equal(sanitized.elapsed_ms, null);
  assert.equal(sanitized.timeout_ms, null);
  assert.equal(sanitized.finish_reason, null);
  assert.equal(sanitized.response_shape, null);
  assert.equal(sanitized.observed_output_tokens, null);
  const empty = normalizeUsageDiagnostic("provider_empty_text", {
    finishReason: "MAX_TOKENS", promptBlockReason: "SAFETY",
    responseShape: "thought_only", candidateCount: 1, input: 128, output: 64,
    rawProviderResponse: "never persist",
  });
  assert.equal(empty.finish_reason, "MAX_TOKENS");
  assert.equal(empty.prompt_block_reason, "SAFETY");
  assert.equal(empty.response_shape, "thought_only");
  assert.equal(empty.candidate_count, 1);
  assert.equal(empty.observed_input_tokens, 128);
  assert.equal(empty.observed_output_tokens, 64);

  const queries = [];
  const binds = [];
  const db = {
    prepare(sql) {
      queries.push(sql);
      if (/PRAGMA table_info\(api_usage_diagnostics\)/.test(sql)) {
        // Simulate an existing D1 table from before the additive columns.
        return { all: async () => ({ results: [{ name: "request_id" }] }) };
      }
      return {
        bind(...values) {
          binds.push(values);
          return {
            async run() {
              return { meta: { changes: 1 } };
            },
          };
        },
        async run() {
          return { meta: { changes: 1 } };
        },
      };
    },
  };

  assert.equal(
    await recordUsageFailure(
      db,
      "req-test",
      "google_bad_request_generation_config",
      {
        upstreamStatus: 400,
        providerStatus: "INVALID_ARGUMENT",
        route: "aws_relay",
        rateLimitScope: "unknown",
        requestBytes: 4567,
      }
    ),
    true
  );
  assert.equal(queries.length, 9, "old D1 tables get six additive migrations");
  assert.match(queries[0], /CREATE TABLE IF NOT EXISTS api_usage_diagnostics/);
  assert.match(queries[1], /PRAGMA table_info/);
  assert.equal(queries.filter(q => /ALTER TABLE api_usage_diagnostics ADD COLUMN/.test(q)).length, 6);
  assert.match(queries[8], /INSERT INTO api_usage_diagnostics/);
  assert.deepEqual(
    binds[0],
    [
      "req-test",
      "google_bad_request_generation_config",
      400,
      "INVALID_ARGUMENT",
      "aws_relay",
      null,
      "unknown",
      null,
      4567,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]
  );

  const failingDb = {
    prepare() {
      throw new Error("D1 unavailable");
    },
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(
      await recordUsageFailure(
        failingDb,
        "req-fail",
        "relay_network_error",
        { route: "aws_relay", transportFailure: "network" }
      ),
      false,
      "diagnostic persistence must never block billing/refund behavior"
    );
  } finally {
    console.error = originalError;
  }

  console.log("worker usage diagnostics core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
