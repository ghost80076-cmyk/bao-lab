const assert = require("node:assert/strict");

const {
  compareProductionModelRegistry,
  fetchWorkerSettings,
  parseBindingArray,
} = require("../scripts/audit-production-model-registry.cjs");

const registry = {
  schema: "bao-model-registry/v1",
  models: [
    {
      id: "gemini-flash",
      routes: [
        {
          id: "google-official",
          provider: "gemini",
          model: "gemini-3-flash-preview",
          pricing: { input: 0.5, output: 3, cache: 0.05 },
        },
      ],
      hosted: { route_id: "google-official" },
    },
    {
      id: "claude-haiku",
      routes: [
        {
          id: "openrouter",
          provider: "openrouter",
          model: "anthropic/claude-haiku-4.5",
          pricing: { input: 1, output: 5, cache: 0.1 },
        },
      ],
      hosted: { route_id: "openrouter" },
    },
  ],
};

const settings = {
  bindings: [
    {
      type: "plain_text",
      name: "MODELS_JSON",
      text: JSON.stringify([
        {
          provider: "gemini",
          model: "gemini-3-flash-preview",
          input_microusd_per_million: 500000,
          output_microusd_per_million: 3000000,
          cache_read_microusd_per_million: 50000,
          long_context_threshold_tokens: 200000,
        },
      ]),
    },
    {
      type: "plain_text",
      name: "MODELS_JSON_EXTRA",
      text: JSON.stringify([
        {
          provider: "openrouter",
          model: "anthropic/claude-haiku-4.5",
          input_microusd_per_million: 1000000,
          output_microusd_per_million: 5000000,
          cache_read_microusd_per_million: 100000,
          openrouter_max_prompt_microusd_per_million: 1000000,
          openrouter_max_completion_microusd_per_million: 5000000,
        },
      ]),
    },
  ],
};

const report = compareProductionModelRegistry({
  settings,
  registry,
  rolloutEntries: [
    {
      provider: "openrouter",
      model: "anthropic/claude-haiku-4.5",
      __source: "rollout.json",
    },
  ],
});

assert.equal(report.ok, true);
assert.equal(report.production.base_count, 1);
assert.equal(report.production.extra_count, 1);
assert.equal(report.production.combined_count, 2);
assert.deepEqual(
  report.production.inventory.map(item => ({
    binding: item.binding,
    key: item.key,
    worker_metadata: item.worker_metadata,
  })),
  [
    {
      binding: "MODELS_JSON",
      key: "gemini:gemini-3-flash-preview",
      worker_metadata: {
        long_context_threshold_tokens: 200000,
      },
    },
    {
      binding: "MODELS_JSON_EXTRA",
      key: "openrouter:anthropic/claude-haiku-4.5",
      worker_metadata: {
        openrouter_max_prompt_microusd_per_million: 1000000,
        openrouter_max_completion_microusd_per_million: 5000000,
      },
    },
  ]
);
assert.ok(
  report.production.inventory[0].fields.includes("input_microusd_per_million")
);
assert.ok(
  !JSON.stringify(report.production.inventory).includes("test-token"),
  "production inventory must never contain credentials"
);
assert.equal(report.registry.logical_model_count, 2);
assert.equal(report.registry.hosted_route_count, 2);
assert.deepEqual(report.findings.production_missing_from_registry, []);
assert.deepEqual(report.findings.hosted_missing_from_production, []);
assert.deepEqual(report.findings.rollout_missing_from_production, []);
assert.deepEqual(report.findings.pricing_drift, []);

const drift = compareProductionModelRegistry({
  settings: {
    bindings: [
      settings.bindings[0],
      {
        ...settings.bindings[1],
        text: JSON.stringify([
          {
            provider: "openrouter",
            model: "anthropic/claude-haiku-4.5",
            input_microusd_per_million: 999,
            output_microusd_per_million: 5000000,
          },
          {
            provider: "openrouter",
            model: "server-only/model",
            input_microusd_per_million: 1,
            output_microusd_per_million: 1,
          },
        ]),
      },
    ],
  },
  registry,
  rolloutEntries: [],
});

assert.equal(drift.ok, false);
assert.deepEqual(drift.findings.production_missing_from_registry, [
  "openrouter:server-only/model",
]);
assert.deepEqual(drift.findings.pricing_drift, [
  {
    key: "openrouter:anthropic/claude-haiku-4.5",
    field: "input_microusd_per_million",
    expected: 1000000,
    actual: 999,
  },
]);

assert.throws(
  () =>
    parseBindingArray(
      [
        {
          type: "secret_text",
          name: "MODELS_JSON",
          text: "should-not-be-read",
        },
      ],
      "MODELS_JSON"
    ),
  /secret_text/
);

(async () => {
  let requestedUrl = "";
  let authorization = "";

  const result = await fetchWorkerSettings({
    accountId: "a".repeat(32),
    apiToken: "test-token",
    workerName: "bao-lab-credits-api",
    async fetchImpl(url, init) {
      requestedUrl = url;
      authorization = init.headers.authorization;
      return new Response(
        JSON.stringify({
          success: true,
          result: settings,
        }),
        { status: 200 }
      );
    },
  });

  assert.match(
    requestedUrl,
    /\/accounts\/a{32}\/workers\/scripts\/bao-lab-credits-api\/settings$/
  );
  assert.equal(authorization, "Bearer test-token");
  assert.deepEqual(result, settings);

  await assert.rejects(
    fetchWorkerSettings({
      accountId: "a".repeat(32),
      apiToken: "test-token",
      workerName: "bao-lab-credits-api",
      async fetchImpl() {
        return new Response(
          JSON.stringify({
            success: false,
            errors: [{ message: "denied" }],
          }),
          { status: 403 }
        );
      },
    }),
    /denied/
  );

  console.log("production model registry audit core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
