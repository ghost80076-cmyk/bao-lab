const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workerSource = fs.readFileSync(
  path.join(__dirname, "../workers/bao-lab-credits-api/worker.js"),
  "utf8"
);

const actual = [...workerSource.matchAll(/^const (Worker[A-Za-z0-9]+) = \(\(\) => \{/gm)]
  .map(match => match[1]);

const expected = [
  "WorkerHttp",
  "WorkerCrypto",
  "WorkerSessionAuth",
  "WorkerAccountValidation",
  "WorkerRuntimeConfig",
  "WorkerModelPricing",
  "WorkerChatInput",
  "WorkerAccountRateLimit",
  "WorkerAccountAuth",
  "WorkerAccountSelfRoute",
  "WorkerProviderRouting",
  "WorkerProviderControl",
  "WorkerPublicationFormat",
  "WorkerAuthorProfilePublication",
  "WorkerAuthorOwnership",
  "WorkerAccountAuthorRoutes",
  "WorkerGithubPublicationTransport",
  "WorkerAdminAuth",
  "WorkerAdminProviderControlRoutes",
  "WorkerAdminPublicationRoutes",
  "WorkerAdminUsageRoutes",
  "WorkerAdminPlayerDirectoryRoutes",
  "WorkerAdminPlayerMutationRoutes",
  "WorkerAdminRoutes",
  "WorkerProviderTransport",
  "WorkerLegacyChatSettlement",
  "WorkerCostChatSettlement",
  "WorkerChatDispatch",
];

assert.deepEqual(
  actual,
  expected,
  "worker boundary additions, removals or reorderings must update the architecture map deliberately"
);

const architecture = fs.readFileSync(
  path.join(__dirname, "../docs/worker-architecture-boundaries.md"),
  "utf8"
);

for (const boundary of expected) {
  assert.match(
    architecture,
    new RegExp("`" + boundary + "`"),
    boundary + " is missing from the architecture map"
  );
}

assert.match(
  architecture,
  /GitHub merge is source control only/,
  "the architecture map must preserve the source-control versus production-deployment distinction"
);

console.log("worker architecture boundary registry test passed");
