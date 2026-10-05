const assert = require("node:assert/strict");

const {
  APPLY_CONFIRMATION,
  buildBindingsPatch,
  deployProductionModelRegistry,
  patchWorkerSettings,
  summarizeChanges,
} = require("../scripts/apply-production-model-registry.cjs");

const plan = {
  cloudflare: {
    MODELS_JSON: {
      entries: [
        {
          provider: "gemini",
          model: "gemini-3-flash-preview",
          input_microusd_per_million: 500000,
          output_microusd_per_million: 3000000,
        },
      ],
    },
    MODELS_JSON_EXTRA: {
      entries: [
        {
          provider: "openrouter",
          model: "anthropic/claude-haiku-4.5",
          input_microusd_per_million: 1000000,
          output_microusd_per_million: 5000000,
        },
      ],
    },
  },
  aws: {
    variable: "OPENROUTER_MODELS",
    entries: ["anthropic/claude-haiku-4.5"],
  },
};

const unrelatedBinding = {
  name: "DB",
  type: "d1",
  database_id: "db-id",
};

const settings = {
  bindings: [
    unrelatedBinding,
    {
      name: "MODELS_JSON",
      type: "plain_text",
      text: JSON.stringify([
        {
          provider: "gemini",
          model: "gemini-3-flash-preview",
          input_microusd_per_million: 400000,
          output_microusd_per_million: 3000000,
        },
      ]),
    },
    {
      name: "MODELS_JSON_EXTRA",
      type: "plain_text",
      text: JSON.stringify([]),
    },
  ],
};

const patch = buildBindingsPatch(settings, plan);
assert.equal(patch.target_binding_count, 2);
assert.equal(patch.preserved_binding_count, 1);
assert.deepEqual(patch.bindings[0], unrelatedBinding);
assert.deepEqual(patch.changes.MODELS_JSON.added, []);
assert.deepEqual(patch.changes.MODELS_JSON.changed, [
  "gemini:gemini-3-flash-preview",
]);
assert.deepEqual(patch.changes.MODELS_JSON_EXTRA.added, [
  "openrouter:anthropic/claude-haiku-4.5",
]);

const nextBase = JSON.parse(
  patch.bindings.find(binding => binding.name === "MODELS_JSON").text
);
assert.equal(nextBase[0].input_microusd_per_million, 500000);

assert.deepEqual(
  summarizeChanges(
    [
      { provider: "openrouter", model: "a" },
      { provider: "openrouter", model: "b" },
    ],
    [{ provider: "openrouter", model: "a" }]
  ).removed,
  ["openrouter:b"]
);

assert.throws(
  () =>
    buildBindingsPatch(
      {
        bindings: [
          {
            name: "MODELS_JSON",
            type: "plain_text",
            text: JSON.stringify([
              { provider: "gemini", model: "legacy-model" },
            ]),
          },
          {
            name: "MODELS_JSON_EXTRA",
            type: "plain_text",
            text: "[]",
          },
        ],
      },
      plan
    ),
  /would remove production models/
);

assert.throws(
  () =>
    buildBindingsPatch(
      {
        bindings: [
          {
            name: "MODELS_JSON",
            type: "secret_text",
          },
          {
            name: "MODELS_JSON_EXTRA",
            type: "plain_text",
            text: "[]",
          },
        ],
      },
      plan
    ),
  /secret_text/
);

(async () => {
  let captured = null;

  await patchWorkerSettings({
    accountId: "a".repeat(32),
    apiToken: "test-token",
    workerName: "yorubay-credits-pilot",
    bindings: patch.bindings,
    async fetchImpl(url, init) {
      captured = { url, init };
      return new Response(
        JSON.stringify({
          success: true,
          result: { bindings: patch.bindings },
        }),
        { status: 200 }
      );
    },
  });

  assert.match(
    captured.url,
    /\/accounts\/a{32}\/workers\/scripts\/yorubay-credits-pilot\/settings$/
  );
  assert.equal(captured.init.method, "PATCH");
  assert.equal(captured.init.headers.authorization, "Bearer test-token");
  const body = JSON.parse(captured.init.body);
  assert.ok(Array.isArray(body.bindings));
  assert.equal(body.settings, undefined);
  assert.equal(
    body.annotations["workers/message"],
    "Sync YoruBay model bindings from data/presets/models.json"
  );
  assert.deepEqual(
    body.bindings.find(binding => binding.name === "DB"),
    unrelatedBinding
  );

  let dryRunPatchCalls = 0;
  const dryRun = await deployProductionModelRegistry({
    accountId: "a".repeat(32),
    apiToken: "test-token",
    workerName: "yorubay-credits-pilot",
    registry: { schema: "fixture" },
    plan,
    settings,
    confirmation: "",
    async fetchImpl() {
      dryRunPatchCalls += 1;
      throw new Error("dry-run must not issue a PATCH");
    },
  });
  assert.equal(dryRun.mode, "dry-run");
  assert.equal(dryRun.applied, false);
  assert.equal(dryRun.reason, "dry_run");
  assert.equal(dryRunPatchCalls, 0);

  let applyCalls = 0;
  const applied = await deployProductionModelRegistry({
    accountId: "a".repeat(32),
    apiToken: "test-token",
    workerName: "yorubay-credits-pilot",
    registry: { schema: "fixture" },
    plan,
    settings,
    confirmation: APPLY_CONFIRMATION,
    async fetchImpl(_url, init) {
      applyCalls += 1;
      assert.equal(init.method, "PATCH");
      return new Response(
        JSON.stringify({ success: true, result: { bindings: patch.bindings } }),
        { status: 200 }
      );
    },
  });
  assert.equal(applied.mode, "apply");
  assert.equal(applied.applied, true);
  assert.equal(applied.reason, "patched");
  assert.equal(applyCalls, 1);

  console.log("production model binding deploy core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
