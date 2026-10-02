const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "../workers/bao-lab-credits-api/worker.js"),
  "utf8"
);

assert.match(
  source,
  /const WorkerRuntimeConfig = \(\(\) => \{/,
  "runtime binding parsing must stay behind WorkerRuntimeConfig"
);

const instrumented =
  source.replace(
    /export\s+default\s+\{/,
    "const __workerDefault = {"
  ) +
  "\nreturn { WorkerRuntimeConfig, LEGACY_BILLING_MODE, COST_BILLING_MODE, DEFAULT_SESSION_TTL_DAYS };";

const {
  WorkerRuntimeConfig,
  LEGACY_BILLING_MODE,
  COST_BILLING_MODE,
  DEFAULT_SESSION_TTL_DAYS,
} = new Function(instrumented)();

const primaryDb = { name: "primary" };
const aliasDb = { name: "alias" };
assert.equal(WorkerRuntimeConfig.getDb({ DB: primaryDb }), primaryDb);
assert.equal(
  WorkerRuntimeConfig.getDb({ "資料庫": aliasDb, DB: primaryDb }),
  aliasDb
);

assert.equal(WorkerRuntimeConfig.globalBillingMode({}), LEGACY_BILLING_MODE);
assert.equal(
  WorkerRuntimeConfig.globalBillingMode({ BILLING_MODE: COST_BILLING_MODE }),
  COST_BILLING_MODE
);
assert.equal(
  WorkerRuntimeConfig.globalBillingMode({ BILLING_MODE: "invalid" }),
  LEGACY_BILLING_MODE
);

assert.deepEqual(
  [...WorkerRuntimeConfig.billingV2TestPlayers({
    BILLING_V2_TEST_PLAYERS: " player-1, Public_2, ,player-1 ",
  })],
  ["PLAYER-1", "PUBLIC_2"]
);
assert.deepEqual(
  [...WorkerRuntimeConfig.awsOpenRouterPlayers({
    AWS_OPENROUTER_PLAYERS: " account-1, NightPilot ",
  })],
  ["ACCOUNT-1", "NIGHTPILOT"]
);

const awsEnv = { AWS_OPENROUTER_PLAYERS: "P-1, PUBLIC-2, NIGHTPILOT" };
assert.equal(
  WorkerRuntimeConfig.playerUsesAwsOpenRouter(awsEnv, { id: "p-1" }),
  true
);
assert.equal(
  WorkerRuntimeConfig.playerUsesAwsOpenRouter(awsEnv, { public_id: "public-2" }),
  true
);
assert.equal(
  WorkerRuntimeConfig.playerUsesAwsOpenRouter(awsEnv, { username: "nightpilot" }),
  true
);
assert.equal(WorkerRuntimeConfig.playerUsesAwsOpenRouter(awsEnv, null), false);
assert.equal(
  WorkerRuntimeConfig.playerUsesAwsOpenRouter({}, { id: "p-1" }),
  false
);

assert.equal(
  WorkerRuntimeConfig.billingModeForPlayer({}, {
    auth_type: "session",
    wallet_billing_mode: COST_BILLING_MODE,
  }),
  COST_BILLING_MODE
);
assert.equal(
  WorkerRuntimeConfig.billingModeForPlayer(
    { BILLING_MODE: COST_BILLING_MODE },
    { id: "legacy-player" }
  ),
  COST_BILLING_MODE
);
assert.equal(
  WorkerRuntimeConfig.billingModeForPlayer(
    { BILLING_V2_TEST_PLAYERS: "P-1,PUBLIC-2" },
    { id: "p-1" }
  ),
  COST_BILLING_MODE
);
assert.equal(
  WorkerRuntimeConfig.billingModeForPlayer(
    { BILLING_V2_TEST_PLAYERS: "P-1,PUBLIC-2" },
    { public_id: "public-2" }
  ),
  COST_BILLING_MODE
);
assert.equal(
  WorkerRuntimeConfig.billingModeForPlayer(
    { BILLING_V2_TEST_PLAYERS: "P-1" },
    { id: "p-2" }
  ),
  LEGACY_BILLING_MODE
);

for (const mode of ["closed", "invite", "open"]) {
  assert.equal(WorkerRuntimeConfig.registrationMode({ REGISTRATION_MODE: mode }), mode);
}
assert.equal(WorkerRuntimeConfig.registrationMode({}), "closed");
assert.equal(
  WorkerRuntimeConfig.registrationMode({ REGISTRATION_MODE: "OPEN" }),
  "open"
);
assert.equal(
  WorkerRuntimeConfig.registrationMode({ REGISTRATION_MODE: "unknown" }),
  "closed"
);

assert.equal(WorkerRuntimeConfig.sessionTtlDays({}), DEFAULT_SESSION_TTL_DAYS);
assert.equal(WorkerRuntimeConfig.sessionTtlDays({ SESSION_TTL_DAYS: "1" }), 1);
assert.equal(WorkerRuntimeConfig.sessionTtlDays({ SESSION_TTL_DAYS: "365" }), 365);
assert.equal(
  WorkerRuntimeConfig.sessionTtlDays({ SESSION_TTL_DAYS: "0" }),
  DEFAULT_SESSION_TTL_DAYS
);
assert.equal(
  WorkerRuntimeConfig.sessionTtlDays({ SESSION_TTL_DAYS: "366" }),
  DEFAULT_SESSION_TTL_DAYS
);
assert.equal(
  WorkerRuntimeConfig.sessionTtlDays({ SESSION_TTL_DAYS: "1.5" }),
  DEFAULT_SESSION_TTL_DAYS
);

console.log("worker runtime config core test passed");
