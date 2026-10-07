const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const workerPath = path.join(
  __dirname,
  "../workers/bao-lab-credits-api/worker.js"
);
const modulePath = path.join(
  __dirname,
  "../workers/bao-lab-credits-api/modules/health-route.js"
);
const workerSource = fs.readFileSync(workerPath, "utf8");
const moduleSource = fs.readFileSync(modulePath, "utf8");

assert.match(
  workerSource,
  /from "\.\/modules\/health-route\.js";/,
  "the Worker entry must import the extracted health route"
);
assert.doesNotMatch(
  workerSource,
  /security_contract_version:/,
  "health response construction must not remain duplicated in worker.js"
);
assert.match(
  moduleSource,
  /const WorkerHealthRoute = \(\(\) => \{/,
  "health diagnostics must stay grouped behind WorkerHealthRoute"
);

(async () => {
  const {
    WorkerHealthRoute,
    healthRoute,
  } = await import(pathToFileURL(modulePath).href);
  const {
    default: worker,
  } = await import(pathToFileURL(workerPath).href);

  assert.equal(WorkerHealthRoute.healthRoute, healthRoute);

  const queries = [];
  const db = {
    prepare(sql) {
      queries.push(sql);
      return {
        async first() {
          return { id: 1 };
        },
      };
    },
  };
  const env = {
    AWS_RELAY_URL: "https://relay.example.test",
    BAO_INTERNAL_TOKEN: "test-token",
    AWS_OPENROUTER_PLAYERS: "PLAYER-1,PLAYER-2",
    BILLING_V2_TEST_PLAYERS: "PLAYER-3",
    BILLING_MODE: "raw_tokens_v1",
    PRICING_VERSION: "test-pricing-v1",
    REGISTRATION_MODE: "open",
    SESSION_TTL_DAYS: "45",
    AUTH_RATE_LIMITER: {
      async limit() {
        return { success: true };
      },
    },
  };

  const expectedHealth = {
    ok: true,
    service: "yorubay-credits-pilot",
    providers: ["gemini", "openrouter", "anthropic"],
    gemini_route: "aws_sydney_relay",
    aws_relay_configured: true,
    aws_openrouter_players_configured: 2,
    anthropic_configured: false,
    default_billing_mode: "raw_tokens_v1",
    billing_v2_test_players_configured: true,
    billing_modes_available: ["raw_tokens_v1", "cost_usd_v2"],
    pricing_version: "test-pricing-v1",
    registration_mode: "open",
    auth_rate_limit_configured: true,
    public_registration_protected: true,
    security_contract_version: "2026-10-04-1",
    session_ttl_days: 45,
    usage_storage: "cache_usage_v2",
    daily_chat_limit_enabled: false,
    diagnostic_version: "2026-09-29-7.1",
  };

  const response = await healthRoute(env, db);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), expectedHealth);
  assert.equal(queries.length, 1);
  assert.match(queries[0], /FROM players/);

  const routedResponse = await worker.fetch(
    new Request("https://api.example.test/health"),
    {
      ...env,
      DB: db,
    }
  );

  assert.equal(routedResponse.status, 200);
  assert.deepEqual(await routedResponse.json(), expectedHealth);
  assert.equal(queries.length, 2);

  console.log("worker health route standalone ES module test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
