const assert = require("node:assert/strict");

const {
  buildModelDeploymentPlan,
} = require("../workers/bao-lab-credits-api/build-model-deployment-plan.cjs");
const {
  buildSafeSettingsPatch,
  currentTargetFingerprint,
  parseCliArgs,
  runModelBindingApply,
  summarizeTargetDiff,
  targetBindingSnapshot,
} = require("../scripts/apply-worker-model-bindings.cjs");

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
          worker: {
            binding: "MODELS_JSON",
            pricing: {
              input: 0.5,
              output: 3,
              cache: 0.05,
            },
          },
        },
      ],
      hosted: {
        route_id: "google-official",
      },
    },
    {
      id: "claude-haiku",
      routes: [
        {
          id: "openrouter",
          provider: "openrouter",
          model: "anthropic/claude-haiku-4.5",
          worker: {
            binding: "MODELS_JSON_EXTRA",
            pricing: {
              input: 1,
              output: 5,
              cache: 0.1,
              cache_write: 1.25,
            },
            openrouter_max_price: {
              prompt: 1,
              completion: 5,
            },
            aws_openrouter_relay: true,
          },
        },
      ],
      hosted: {
        route_id: "openrouter",
      },
    },
  ],
};

const plan = buildModelDeploymentPlan(registry);

const currentSettings = {
  annotations: {
    "workers/message": "old message",
    "workers/tag": "stable",
    "workers/triggered_by": "upload",
  },
  bindings: [
    {
      name: "DB",
      type: "d1",
      id: "d1-secretish-id",
    },
    {
      name: "ADMIN_TOKEN",
      type: "secret_text",
    },
    {
      name: "MODELS_JSON",
      type: "plain_text",
      text: JSON.stringify([
        {
          provider: "gemini",
          model: "gemini-3-flash-preview",
          input_microusd_per_million: 400000,
          output_microusd_per_million: 3000000,
          cache_read_microusd_per_million: 50000,
        },
      ]),
    },
    {
      name: "MODELS_JSON_EXTRA",
      type: "plain_text",
      text: JSON.stringify([
        {
          provider: "openrouter",
          model: "anthropic/claude-haiku-4.5",
          input_microusd_per_million: 1000000,
          output_microusd_per_million: 5000000,
          cache_read_microusd_per_million: 100000,
          cache_write_microusd_per_million: 1250000,
          openrouter_max_prompt_microusd_per_million: 1000000,
          openrouter_max_completion_microusd_per_million: 5000000,
        },
      ]),
    },
  ],
};

function desiredSettingsFrom(current) {
  const clone = structuredClone(current);
  const byName = new Map(clone.bindings.map(binding => [binding.name, binding]));

  byName.get("MODELS_JSON").text = plan.cloudflare.MODELS_JSON.value_json;
  byName.get("MODELS_JSON_EXTRA").text =
    plan.cloudflare.MODELS_JSON_EXTRA.value_json;

  return clone;
}

const desiredSettings = desiredSettingsFrom(currentSettings);

const currentFingerprint = currentTargetFingerprint(currentSettings);
assert.match(currentFingerprint, /^[a-f0-9]{64}$/);
assert.notEqual(currentFingerprint, currentTargetFingerprint(desiredSettings));

const reordered = structuredClone(currentSettings);
reordered.bindings.reverse();
assert.equal(
  currentTargetFingerprint(reordered),
  currentFingerprint,
  "binding order must not change the optimistic-lock fingerprint"
);

const currentSnapshot = targetBindingSnapshot(currentSettings);
const desiredSnapshot = targetBindingSnapshot(desiredSettings);
assert.deepEqual(summarizeTargetDiff(currentSnapshot, desiredSnapshot), {
  added: [],
  removed: [],
  changed: ["gemini:gemini-3-flash-preview"],
  moved: [],
});

const patch = buildSafeSettingsPatch(
  currentSettings,
  plan,
  currentTargetFingerprint(desiredSettings)
);

assert.deepEqual(
  patch.bindings.find(binding => binding.name === "DB"),
  {
    name: "DB",
    type: "inherit",
  }
);
assert.deepEqual(
  patch.bindings.find(binding => binding.name === "ADMIN_TOKEN"),
  {
    name: "ADMIN_TOKEN",
    type: "inherit",
  },
  "secret bindings must be inherited without reading or reproducing secret text"
);
assert.equal(
  Object.prototype.hasOwnProperty.call(
    patch.bindings.find(binding => binding.name === "ADMIN_TOKEN"),
    "text"
  ),
  false
);
assert.equal(
  patch.bindings.find(binding => binding.name === "MODELS_JSON").type,
  "plain_text"
);
assert.equal(
  patch.bindings.find(binding => binding.name === "MODELS_JSON").text,
  plan.cloudflare.MODELS_JSON.value_json
);
assert.equal(patch.annotations["workers/tag"], "stable");
assert.match(
  patch.annotations["workers/message"],
  /^YoruBay model registry apply [a-f0-9]{12}$/
);
assert.equal(
  Object.prototype.hasOwnProperty.call(
    patch.annotations,
    "workers/triggered_by"
  ),
  false,
  "read-only annotations must never be sent back"
);

assert.deepEqual(parseCliArgs([]), {
  apply: false,
  expectedCurrentFingerprint: "",
});
assert.deepEqual(
  parseCliArgs(["--apply", `--expect-current=${currentFingerprint}`]),
  {
    apply: true,
    expectedCurrentFingerprint: currentFingerprint,
  }
);
assert.throws(
  () => parseCliArgs(["--expect-current=bad"]),
  /64-character SHA-256/
);
assert.throws(() => parseCliArgs(["--unknown"]), /unknown argument/);

(async () => {
  const requests = [];
  const dryRun = await runModelBindingApply({
    accountId: "a".repeat(32),
    apiToken: "test-token",
    workerName: "yorubay-credits-pilot",
    registry,
    plan,
    rolloutEntries: [],
    async fetchImpl(url, init = {}) {
      requests.push({
        url,
        method: init.method || "GET",
      });
      return new Response(
        JSON.stringify({
          success: true,
          result: currentSettings,
        }),
        { status: 200 }
      );
    },
  });

  assert.equal(dryRun.mode, "dry-run");
  assert.equal(dryRun.applied, false);
  assert.equal(dryRun.no_op, false);
  assert.equal(dryRun.current_fingerprint, currentFingerprint);
  assert.deepEqual(dryRun.diff.changed, [
    "gemini:gemini-3-flash-preview",
  ]);
  assert.deepEqual(
    requests.map(request => request.method),
    ["GET"],
    "dry-run must never send PATCH"
  );

  let call = 0;
  let patchBody = null;
  const applied = await runModelBindingApply({
    accountId: "a".repeat(32),
    apiToken: "test-token",
    workerName: "yorubay-credits-pilot",
    registry,
    plan,
    rolloutEntries: [],
    apply: true,
    expectedCurrentFingerprint: currentFingerprint,
    async fetchImpl(url, init = {}) {
      call += 1;
      const method = init.method || "GET";

      if (call === 1) {
        assert.equal(method, "GET");
        return new Response(
          JSON.stringify({
            success: true,
            result: currentSettings,
          }),
          { status: 200 }
        );
      }

      if (call === 2) {
        assert.equal(method, "PATCH");
        assert.equal(init.headers.authorization, "Bearer test-token");
        assert.equal(init.headers["content-type"], "application/json");
        patchBody = JSON.parse(init.body);
        return new Response(
          JSON.stringify({
            success: true,
            result: {
              bindings: patchBody.bindings,
            },
          }),
          { status: 200 }
        );
      }

      assert.equal(call, 3);
      assert.equal(method, "GET");
      return new Response(
        JSON.stringify({
          success: true,
          result: desiredSettings,
        }),
        { status: 200 }
      );
    },
  });

  assert.equal(applied.applied, true);
  assert.equal(applied.verified_ok, true);
  assert.equal(
    applied.verified_fingerprint,
    currentTargetFingerprint(desiredSettings)
  );
  assert.ok(patchBody);
  assert.deepEqual(
    patchBody.bindings.find(binding => binding.name === "ADMIN_TOKEN"),
    {
      name: "ADMIN_TOKEN",
      type: "inherit",
    }
  );
  assert.equal(
    JSON.stringify(patchBody).includes("d1-secretish-id"),
    false,
    "non-target binding details must not be copied into the patch"
  );

  let mismatchCalls = 0;
  await assert.rejects(
    runModelBindingApply({
      accountId: "a".repeat(32),
      apiToken: "test-token",
      workerName: "yorubay-credits-pilot",
      registry,
      plan,
      rolloutEntries: [],
      apply: true,
      expectedCurrentFingerprint: "0".repeat(64),
      async fetchImpl() {
        mismatchCalls += 1;
        return new Response(
          JSON.stringify({
            success: true,
            result: currentSettings,
          }),
          { status: 200 }
        );
      },
    }),
    /current fingerprint changed/
  );
  assert.equal(
    mismatchCalls,
    1,
    "fingerprint mismatch must abort before PATCH"
  );

  let noOpCalls = 0;
  const noOp = await runModelBindingApply({
    accountId: "a".repeat(32),
    apiToken: "test-token",
    workerName: "yorubay-credits-pilot",
    registry,
    plan,
    rolloutEntries: [],
    apply: true,
    async fetchImpl() {
      noOpCalls += 1;
      return new Response(
        JSON.stringify({
          success: true,
          result: desiredSettings,
        }),
        { status: 200 }
      );
    },
  });
  assert.equal(noOp.no_op, true);
  assert.equal(noOp.applied, false);
  assert.equal(
    noOpCalls,
    1,
    "an already-matching production config must never PATCH"
  );

  console.log("guarded Worker model binding apply core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
