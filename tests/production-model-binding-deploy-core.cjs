const assert = require("node:assert/strict");

const {
  buildModelDeploymentPlan,
} = require("../workers/bao-lab-credits-api/build-model-deployment-plan.cjs");
const {
  APPLY_CONFIRMATION,
  assertVersionBehaviorPreserved,
  buildVersionPlan,
  buildVersionUploadBody,
  deployProductionModelRegistry,
  requireSingleActiveVersion,
  summarizeChanges,
} = require("../scripts/apply-production-model-registry.cjs");

const registry = {
  schema: "bao-model-registry/v1",
  models: [
    {
      id: "gemini-flash",
      routes: [
        {
          id: "official",
          provider: "gemini",
          model: "gemini-3-flash-preview",
          worker: {
            binding: "MODELS_JSON",
            pricing: {
              input: 0.5,
              output: 3,
            },
          },
        },
      ],
      hosted: { route_id: "official" },
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
            },
            openrouter_max_price: {
              prompt: 1,
              completion: 5,
            },
            aws_openrouter_relay: true,
          },
        },
      ],
      hosted: { route_id: "openrouter" },
    },
  ],
};

const plan = buildModelDeploymentPlan(registry);
const graph = {
  mainModule: "worker.js",
  modules: [
    {
      name: "worker.js",
      content: "export default { async fetch() { return new Response('ok'); } };",
      contentType: "application/javascript+module",
    },
    {
      name: "modules/helper.js",
      content: "export const helper = true;",
      contentType: "application/javascript+module",
    },
  ],
};

const currentBase = [
  {
    provider: "gemini",
    model: "gemini-3-flash-preview",
    input_microusd_per_million: 400000,
    output_microusd_per_million: 3000000,
  },
];

const settings = {
  cache_options: {
    enabled: false,
    cross_version_cache: true,
  },
  compatibility_date: "2026-09-01",
  compatibility_flags: ["nodejs_compat"],
  usage_model: "standard",
  bindings: [
    {
      name: "DB",
      type: "d1",
      database_id: "db-id",
    },
    {
      name: "OPENROUTER_API_KEY",
      type: "secret_text",
    },
    {
      name: "MODELS_JSON",
      type: "plain_text",
      text: JSON.stringify(currentBase),
    },
    {
      name: "MODELS_JSON_EXTRA",
      type: "plain_text",
      text: "[]",
    },
  ],
};

const versionPlan = buildVersionPlan(
  settings,
  plan,
  graph,
  "a".repeat(40)
);

assert.equal(versionPlan.target_binding_count, 2);
assert.equal(versionPlan.inherited_binding_count, 2);
assert.deepEqual(versionPlan.inherited_binding_types, {
  d1: 1,
  secret_text: 1,
});
assert.deepEqual(versionPlan.changes.MODELS_JSON.changed, [
  "gemini:gemini-3-flash-preview",
]);
assert.deepEqual(versionPlan.changes.MODELS_JSON_EXTRA.added, [
  "openrouter:anthropic/claude-haiku-4.5",
]);

const metadataBindings = versionPlan.metadata.bindings;
const secretInheritance = metadataBindings.find(
  binding => binding.name === "OPENROUTER_API_KEY"
);
assert.deepEqual(secretInheritance, {
  name: "OPENROUTER_API_KEY",
  type: "inherit",
  version_id: "latest",
});
assert.equal("text" in secretInheritance, false);

const d1Inheritance = metadataBindings.find(
  binding => binding.name === "DB"
);
assert.equal(d1Inheritance.type, "inherit");
assert.equal(d1Inheritance.version_id, "latest");

const nextBaseBinding = metadataBindings.find(
  binding => binding.name === "MODELS_JSON"
);
assert.equal(nextBaseBinding.type, "plain_text");
assert.equal(
  JSON.parse(nextBaseBinding.text)[0].input_microusd_per_million,
  500000
);

assert.deepEqual(versionPlan.metadata.cache_options, settings.cache_options);
assert.equal(
  versionPlan.metadata.compatibility_date,
  settings.compatibility_date
);
assert.deepEqual(
  versionPlan.metadata.compatibility_flags,
  settings.compatibility_flags
);
assert.equal(versionPlan.metadata.usage_model, "standard");
assert.equal(
  versionPlan.metadata.annotations["workers/commit_sha"],
  "a".repeat(40)
);

const uploadBody = buildVersionUploadBody(versionPlan);
const uploadMetadata = JSON.parse(uploadBody.get("metadata"));
assert.equal(uploadMetadata.main_module, "worker.js");
assert.equal(uploadBody.get("worker.js").name, "worker.js");
assert.equal(
  uploadBody.get("modules/helper.js").name,
  "modules/helper.js"
);

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
    buildVersionPlan(
      {
        ...settings,
        bindings: settings.bindings.map(binding =>
          binding.name === "MODELS_JSON"
            ? {
                ...binding,
                text: JSON.stringify([
                  { provider: "gemini", model: "legacy-model" },
                ]),
              }
            : binding
        ),
      },
      plan,
      graph
    ),
  /would remove production models/
);

assert.equal(
  requireSingleActiveVersion({
    versions: [
      {
        percentage: 100,
        version_id: "old-version",
      },
    ],
  }),
  "old-version"
);

assert.throws(
  () =>
    requireSingleActiveVersion({
      versions: [
        { percentage: 50, version_id: "a" },
        { percentage: 50, version_id: "b" },
      ],
    }),
  /not on a single 100% version/
);

const currentVersion = {
  id: "old-version",
  resources: {
    script: {
      etag: "same-code-etag",
    },
    script_runtime: {
      compatibility_date: "2026-09-01",
      compatibility_flags: ["nodejs_compat"],
      limits: null,
      usage_model: "standard",
    },
  },
};

const candidateVersion = {
  id: "new-version",
  resources: {
    script: {
      etag: "same-code-etag",
    },
    script_runtime: {
      compatibility_date: "2026-09-01",
      compatibility_flags: ["nodejs_compat"],
      limits: null,
      usage_model: "standard",
    },
  },
};

assert.doesNotThrow(() =>
  assertVersionBehaviorPreserved(currentVersion, candidateVersion)
);

assert.throws(
  () =>
    assertVersionBehaviorPreserved(currentVersion, {
      ...candidateVersion,
      resources: {
        ...candidateVersion.resources,
        script: { etag: "different-code" },
      },
    }),
  /candidate Worker code differs/
);

assert.throws(
  () =>
    assertVersionBehaviorPreserved(currentVersion, {
      ...candidateVersion,
      resources: {
        ...candidateVersion.resources,
        script_runtime: {
          ...candidateVersion.resources.script_runtime,
          compatibility_date: "2026-10-01",
        },
      },
    }),
  /runtime settings differ/
);

function jsonResponse(result, status = 200) {
  return new Response(
    JSON.stringify({
      success: status >= 200 && status < 300,
      result,
      errors: [],
    }),
    {
      status,
      headers: {
        "content-type": "application/json",
      },
    }
  );
}

function syncedSettings() {
  return {
    ...settings,
    bindings: settings.bindings.map(binding => {
      if (binding.name === "MODELS_JSON") {
        return {
          ...binding,
          text: plan.cloudflare.MODELS_JSON.value_json,
        };
      }

      if (binding.name === "MODELS_JSON_EXTRA") {
        return {
          ...binding,
          text: plan.cloudflare.MODELS_JSON_EXTRA.value_json,
        };
      }

      return binding;
    }),
  };
}

(async () => {
  let dryRunCalls = 0;
  const dryRun = await deployProductionModelRegistry({
    accountId: "a".repeat(32),
    apiToken: "test-token",
    workerName: "yorubay-credits-pilot",
    registry,
    plan,
    graph,
    settings,
    confirmation: "",
    fetchImpl: async () => {
      dryRunCalls += 1;
      throw new Error("dry-run must not issue a production write");
    },
  });

  assert.equal(dryRun.mode, "dry-run");
  assert.equal(dryRun.applied, false);
  assert.equal(dryRun.reason, "dry_run");
  assert.equal(dryRunCalls, 0);

  const requests = [];
  const apply = await deployProductionModelRegistry({
    accountId: "a".repeat(32),
    apiToken: "test-token",
    workerName: "yorubay-credits-pilot",
    registry,
    plan,
    graph,
    settings,
    confirmation: APPLY_CONFIRMATION,
    commitSha: "b".repeat(40),
    rolloutEntries: [],
    fetchImpl: async (url, init = {}) => {
      const method = init.method || "GET";
      requests.push({ url, method, init });

      if (method === "GET" && /\/deployments\?per_page=1$/.test(url)) {
        return jsonResponse({
          deployments: [
            {
              id: "deployment-old",
              versions: [
                {
                  percentage: 100,
                  version_id: "old-version",
                },
              ],
            },
          ],
        });
      }

      if (method === "GET" && /\/versions\/old-version$/.test(url)) {
        return jsonResponse(currentVersion);
      }

      if (
        method === "POST" &&
        /\/versions\?bindings_inherit=strict$/.test(url)
      ) {
        assert.ok(init.body instanceof FormData);
        const metadata = JSON.parse(init.body.get("metadata"));
        assert.equal(metadata.main_module, "worker.js");
        assert.ok(
          metadata.bindings.some(
            binding =>
              binding.name === "OPENROUTER_API_KEY" &&
              binding.type === "inherit" &&
              binding.version_id === "latest"
          )
        );
        assert.equal(
          metadata.bindings.some(
            binding =>
              binding.name === "OPENROUTER_API_KEY" &&
              Object.prototype.hasOwnProperty.call(binding, "text")
          ),
          false
        );
        return jsonResponse(candidateVersion);
      }

      if (method === "POST" && /\/deployments$/.test(url)) {
        const body = JSON.parse(init.body);
        assert.deepEqual(body.versions, [
          {
            percentage: 100,
            version_id: "new-version",
          },
        ]);
        return jsonResponse({
          id: "deployment-new",
          versions: body.versions,
        });
      }

      if (method === "GET" && /\/settings$/.test(url)) {
        return jsonResponse(syncedSettings());
      }

      throw new Error(`unexpected request: ${method} ${url}`);
    },
  });

  assert.equal(apply.applied, true);
  assert.equal(apply.reason, "version_deployed");
  assert.equal(apply.previous_version_id, "old-version");
  assert.equal(apply.version_id, "new-version");
  assert.equal(apply.deployment_id, "deployment-new");
  assert.equal(apply.verification_ok, true);

  assert.equal(
    requests.some(
      request =>
        request.method === "PATCH" &&
        /\/settings$/.test(request.url)
    ),
    false,
    "the safe deploy path must never PATCH /settings"
  );

  let deploymentPosts = 0;
  await assert.rejects(
    deployProductionModelRegistry({
      accountId: "a".repeat(32),
      apiToken: "test-token",
      workerName: "yorubay-credits-pilot",
      registry,
      plan,
      graph,
      settings,
      confirmation: APPLY_CONFIRMATION,
      rolloutEntries: [],
      fetchImpl: async (url, init = {}) => {
        const method = init.method || "GET";

        if (method === "GET" && /\/deployments\?per_page=1$/.test(url)) {
          return jsonResponse({
            deployments: [
              {
                id: "deployment-old",
                versions: [
                  {
                    percentage: 100,
                    version_id: "old-version",
                  },
                ],
              },
            ],
          });
        }

        if (method === "GET" && /\/versions\/old-version$/.test(url)) {
          return jsonResponse(currentVersion);
        }

        if (
          method === "POST" &&
          /\/versions\?bindings_inherit=strict$/.test(url)
        ) {
          return jsonResponse(candidateVersion);
        }

        if (method === "POST" && /\/deployments$/.test(url)) {
          deploymentPosts += 1;
          const body = JSON.parse(init.body);

          if (deploymentPosts === 1) {
            assert.equal(body.versions[0].version_id, "new-version");
            return jsonResponse({ id: "deployment-new" });
          }

          assert.deepEqual(body.versions, [
            {
              percentage: 100,
              version_id: "old-version",
            },
          ]);
          return jsonResponse({ id: "deployment-rollback" });
        }

        if (method === "GET" && /\/settings$/.test(url)) {
          return jsonResponse(settings);
        }

        throw new Error(`unexpected rollback test request: ${method} ${url}`);
      },
    }),
    /previous Worker version was restored/
  );

  assert.equal(
    deploymentPosts,
    2,
    "failed post-deploy audit must trigger a rollback deployment"
  );

  console.log("production model binding inherit deploy core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
