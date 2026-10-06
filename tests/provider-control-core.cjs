const assert = require("node:assert/strict");
const { loadWorkerTestSource } = require("./helpers/worker-test-source.cjs");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const workerSource = loadWorkerTestSource();
const workerEntrySource = fs.readFileSync(
  path.join(root, "workers/bao-lab-credits-api/worker.js"),
  "utf8"
);
const providerRoutingModuleSource = fs.readFileSync(
  path.join(root, "workers/bao-lab-credits-api/modules/provider-routing.js"),
  "utf8"
);
const providerControlModuleSource = fs.readFileSync(
  path.join(root, "workers/bao-lab-credits-api/modules/provider-control.js"),
  "utf8"
);

assert.match(
  workerEntrySource,
  /from "\.\/modules\/provider-routing\.js";/,
  "the Worker entry must import the extracted provider routing module"
);
assert.doesNotMatch(
  workerEntrySource,
  /const WorkerProviderRouting =/,
  "provider routing implementation must not remain duplicated in worker.js"
);
assert.match(
  providerRoutingModuleSource,
  /const WorkerProviderRouting = \(\(\) => \{/,
  "Hosted route selection helpers must stay grouped behind WorkerProviderRouting"
);
for (const helper of [
  "HOSTED_ROUTE_CONTROL",
  "hostedLogicalModel",
  "readHostedRouteOverride",
  "resolveHostedRoute",
]) {
  assert.match(workerSource, new RegExp("\\b" + helper + "\\b"), "WorkerProviderRouting is missing " + helper);
}

assert.match(
  workerEntrySource,
  /from "\.\/modules\/provider-control\.js";/,
  "the Worker entry must import the extracted provider control module"
);
assert.doesNotMatch(
  workerEntrySource,
  /const WorkerProviderControl =/,
  "provider control implementation must not remain duplicated in worker.js"
);
assert.match(
  providerControlModuleSource,
  /const WorkerProviderControl = \(\(\) => \{/,
  "provider admin-control helpers must stay grouped behind WorkerProviderControl"
);
for (const helper of [
  "PROVIDER_CONTROL",
  "ensureProviderControlTables",
  "providerCumulativeSpendMicrousd",
  "providerControlSnapshot",
]) {
  assert.match(workerSource, new RegExp("\\b" + helper + "\\b"), "WorkerProviderControl is missing " + helper);
}

const instrumented =
  workerSource.replace(
    /export\s+default\s+\{/,
    "const __workerDefault = {"
  ) +
  "\nreturn { HOSTED_ROUTE_CONTROL, PROVIDER_CONTROL, hostedLogicalModel, resolveHostedRoute };";

const {
  HOSTED_ROUTE_CONTROL,
  PROVIDER_CONTROL,
  hostedLogicalModel,
  resolveHostedRoute,
} = new Function(instrumented)();

assert.equal(
  HOSTED_ROUTE_CONTROL["gemini-3-flash"].default_route,
  "google-official"
);
assert.equal(
  HOSTED_ROUTE_CONTROL["gemini-3.1-pro"].default_route,
  "google-official"
);

assert.equal(
  PROVIDER_CONTROL.gemini.balance_mode,
  "native_snapshot"
);
assert.equal(
  PROVIDER_CONTROL.gemini.official_balance_currency,
  "TWD"
);
assert.equal(
  PROVIDER_CONTROL.openrouter.balance_mode,
  "usd_estimate"
);

assert.deepEqual(
  hostedLogicalModel(
    "gemini",
    "gemini-3.1-pro-preview"
  ).modelId,
  "gemini-3.1-pro"
);

assert.deepEqual(
  hostedLogicalModel(
    "openrouter",
    "google/gemini-3.1-pro-preview"
  ).modelId,
  "gemini-3.1-pro"
);

const envBoth = {
  MODELS_JSON: JSON.stringify([
    {
      provider: "gemini",
      model: "gemini-3.1-pro-preview",
      input_microusd_per_million: 2000000,
      output_microusd_per_million: 12000000,
    },
    {
      provider: "openrouter",
      model: "google/gemini-3.1-pro-preview",
      input_microusd_per_million: 2000000,
      output_microusd_per_million: 12000000,
    },
  ]),
};

const dbWithOverride = routeId => ({
  prepare(sql) {
    return {
      bind() {
        return {
          async first() {
            if (/FROM hosted_route_overrides/.test(sql)) {
              return routeId ? { route_id: routeId } : null;
            }
            return null;
          },
        };
      },
    };
  },
});

(async () => {
  const routed = await resolveHostedRoute(
    dbWithOverride("openrouter"),
    envBoth,
    "gemini",
    "gemini-3.1-pro-preview"
  );

  assert.equal(routed.provider, "openrouter");
  assert.equal(routed.model, "google/gemini-3.1-pro-preview");
  assert.equal(routed.route_id, "openrouter");
  assert.equal(routed.overridden, true);
  assert.equal(routed.fallback, false);

  const envGoogleOnly = {
    MODELS_JSON: JSON.stringify([
      {
        provider: "gemini",
        model: "gemini-3.1-pro-preview",
        input_microusd_per_million: 2000000,
        output_microusd_per_million: 12000000,
      },
    ]),
  };

  const safeFallback = await resolveHostedRoute(
    dbWithOverride("openrouter"),
    envGoogleOnly,
    "gemini",
    "gemini-3.1-pro-preview"
  );

  assert.equal(safeFallback.provider, "gemini");
  assert.equal(safeFallback.model, "gemini-3.1-pro-preview");
  assert.equal(safeFallback.route_id, "google-official");
  assert.equal(safeFallback.fallback, true);

  const noTableDb = {
    prepare() {
      return {
        bind() {
          return {
            async first() {
              throw new Error("no such table");
            },
          };
        },
      };
    },
  };

  const unchanged = await resolveHostedRoute(
    noTableDb,
    envGoogleOnly,
    "gemini",
    "gemini-3.1-pro-preview"
  );

  assert.equal(unchanged.provider, "gemini");
  assert.equal(unchanged.model, "gemini-3.1-pro-preview");
  assert.equal(unchanged.route_id, "google-official");
  assert.equal(unchanged.overridden, false);

  assert.match(
    workerSource,
    /CREATE TABLE IF NOT EXISTS hosted_route_overrides/
  );
  assert.match(
    workerSource,
    /CREATE TABLE IF NOT EXISTS provider_balance_anchors/
  );
  assert.match(
    workerSource,
    /CREATE TABLE IF NOT EXISTS provider_native_balance_snapshots/
  );
  assert.match(
    workerSource,
    /\/admin\/provider-control\/route/
  );
  assert.match(
    workerSource,
    /\/admin\/provider-control\/balance/
  );
  assert.match(
    workerSource,
    /balance_minor/
  );
  assert.match(
    workerSource,
    /official_balance_currency/
  );
  assert.match(
    workerSource,
    /billing_mode = \?[^]*COST_BILLING_MODE/,
    "provider spend must only use USD billing records"
  );

  const providerSpendStart = workerSource.indexOf(
    "async function providerCumulativeSpendMicrousd("
  );
  const providerSpendEnd = workerSource.indexOf(
    "async function providerControlSnapshot(",
    providerSpendStart
  );
  const providerSpendSource = workerSource.slice(
    providerSpendStart,
    providerSpendEnd
  );

  assert.match(
    providerSpendSource,
    /WHEN provider_cost_microusd IS NOT NULL[^]*THEN provider_cost_microusd/,
    "known upstream provider cost must be counted even when player settlement was refunded"
  );
  assert.doesNotMatch(
    providerSpendSource,
    /WHERE[^]*billing_mode = \?[^]*AND status IN/,
    "provider balance tracking must not discard refunded or unverified rows with known upstream cost"
  );

  const adminHtml = fs.readFileSync(
    path.join(root, "admin-wallet.html"),
    "utf8"
  );

  assert.match(
    adminHtml,
    /上游供應商與 Hosted 路由/
  );
  assert.match(
    adminHtml,
    /\/admin\/provider-control/
  );
  assert.match(
    adminHtml,
    /重新校正目前官方餘額/
  );
  assert.match(
    adminHtml,
    /Google 官方餘額快照/
  );
  assert.match(
    adminHtml,
    /不換算（TWD \/ USD）/
  );
  assert.match(
    adminHtml,
    /重新校正 Google 官方餘額（NT\$）/
  );
  assert.match(
    adminHtml,
    /balance_minor/
  );
  assert.match(
    adminHtml,
    /估算剩餘（非即時）/
  );
  assert.match(
    adminHtml,
    /玩家已退款但供應商已計費/
  );
  assert.match(
    adminHtml,
    /Gemini Hosted 路由/
  );

  console.log("provider control core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
