const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  loadWorkerModuleManifest,
} = require("../scripts/deploy-worker-content.cjs");

const workerDirectory = path.join(
  __dirname,
  "../workers/bao-lab-credits-api"
);
const graph = loadWorkerModuleManifest(
  path.join(workerDirectory, "deployment-manifest.json")
);
const actual = graph.modules.flatMap(module => [
  ...module.content.matchAll(
    /^const (Worker[A-Za-z0-9]+) = (?:\(\(\) => \{|Object\.freeze\()/gm
  ),
]).map(match => match[1]);

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
  [...actual].sort(),
  [...expected].sort(),
  "worker boundary additions or removals must update the architecture map deliberately"
);

assert.equal(
  actual.filter(boundary => boundary === "WorkerAccountValidation").length,
  1,
  "the extracted account validation boundary must exist exactly once"
);
assert.equal(
  actual.filter(boundary => boundary === "WorkerChatInput").length,
  1,
  "the extracted chat input boundary must exist exactly once"
);
assert.equal(
  actual.filter(boundary => boundary === "WorkerAdminAuth").length,
  1,
  "the extracted admin auth boundary must exist exactly once"
);
assert.equal(
  actual.filter(boundary => boundary === "WorkerPublicationFormat").length,
  1,
  "the extracted publication format boundary must exist exactly once"
);
assert.equal(
  actual.filter(boundary => boundary === "WorkerGithubPublicationTransport").length,
  1,
  "the extracted GitHub publication transport boundary must exist exactly once"
);
assert.equal(
  actual.filter(boundary => boundary === "WorkerRuntimeConfig").length,
  1,
  "the extracted runtime config boundary must exist exactly once"
);
assert.equal(
  actual.filter(boundary => boundary === "WorkerModelPricing").length,
  1,
  "the extracted model pricing boundary must exist exactly once"
);
assert.equal(
  actual.filter(boundary => boundary === "WorkerProviderRouting").length,
  1,
  "the extracted provider routing boundary must exist exactly once"
);
assert.equal(
  actual.filter(boundary => boundary === "WorkerCrypto").length,
  1,
  "the extracted crypto boundary must exist exactly once"
);
assert.equal(
  actual.filter(boundary => boundary === "WorkerAuthorProfilePublication").length,
  1,
  "the extracted author profile publication boundary must exist exactly once"
);
assert.equal(
  actual.filter(boundary => boundary === "WorkerHttp").length,
  1,
  "the extracted HTTP boundary must exist exactly once"
);
assert.equal(
  actual.filter(boundary => boundary === "WorkerAccountRateLimit").length,
  1,
  "the extracted account rate limit boundary must exist exactly once"
);
assert.equal(
  actual.filter(boundary => boundary === "WorkerAdminPublicationRoutes").length,
  1,
  "the extracted admin publication routes boundary must exist exactly once"
);
assert.equal(
  actual.filter(boundary => boundary === "WorkerAdminUsageRoutes").length,
  1,
  "the extracted admin usage routes boundary must exist exactly once"
);
assert.equal(
  actual.filter(boundary => boundary === "WorkerAdminPlayerDirectoryRoutes").length,
  1,
  "the extracted admin player directory routes boundary must exist exactly once"
);
assert.equal(
  actual.filter(boundary => boundary === "WorkerAdminPlayerMutationRoutes").length,
  1,
  "the extracted admin player mutation routes boundary must exist exactly once"
);
assert.equal(
  actual.filter(boundary => boundary === "WorkerAuthorOwnership").length,
  1,
  "the extracted author ownership boundary must exist exactly once"
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
