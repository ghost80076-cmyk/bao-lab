const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const workerSource = fs.readFileSync(
  path.join(root, "workers/bao-lab-credits-api/worker.js"),
  "utf8"
);

const instrumented =
  workerSource.replace(
    /export\s+default\s+\{/,
    "const __workerDefault = {"
  ) +
  "\nreturn { HOSTED_ROUTE_CONTROL, hostedLogicalModel, resolveHostedRoute };";

const {
  HOSTED_ROUTE_CONTROL,
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
    /\/admin\/provider-control\/route/
  );
  assert.match(
    workerSource,
    /\/admin\/provider-control\/balance/
  );
  assert.match(
    workerSource,
    /billing_mode = \?[^]*COST_BILLING_MODE/,
    "provider spend must only use USD billing records"
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
    /Gemini Hosted 路由/
  );

  console.log("provider control core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
