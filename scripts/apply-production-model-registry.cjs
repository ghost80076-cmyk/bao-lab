#!/usr/bin/env node

const {
  buildModelDeploymentPlan,
  loadRegistry,
} = require("../workers/bao-lab-credits-api/build-model-deployment-plan.cjs");
const {
  auditProductionModelRegistry,
  fetchWorkerSettings,
  parseBindingArray,
  entryKey,
} = require("./audit-production-model-registry.cjs");
const {
  loadWorkerModuleManifest,
} = require("./deploy-worker-content.cjs");

const TARGET_BINDINGS = ["MODELS_JSON", "MODELS_JSON_EXTRA"];
const APPLY_CONFIRMATION = "APPLY_REGISTRY_MODEL_BINDINGS";
const SAFE_VERSION_SETTING_FIELDS = [
  "cache_options",
  "compatibility_date",
  "compatibility_flags",
  "usage_model",
];

function required(value, name) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function workerBaseUrl(accountId, workerName) {
  const account = required(accountId, "CLOUDFLARE_ACCOUNT_ID");
  const worker = required(workerName, "CLOUDFLARE_WORKER_NAME");
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/workers/scripts/${encodeURIComponent(worker)}`;
}

function targetBinding(existing, entries) {
  if (!existing) throw new Error("target binding is missing from production");

  if (existing.type === "plain_text") {
    return {
      name: existing.name,
      type: "plain_text",
      text: JSON.stringify(entries),
    };
  }

  if (existing.type === "json") {
    return {
      name: existing.name,
      type: "json",
      json: entries,
    };
  }

  throw new Error(
    `${existing.name} uses unsupported binding type: ${existing.type}`
  );
}

function summarizeChanges(currentEntries, desiredEntries) {
  const current = new Map(currentEntries.map(entry => [entryKey(entry), entry]));
  const desired = new Map(desiredEntries.map(entry => [entryKey(entry), entry]));

  const added = [...desired.keys()].filter(key => !current.has(key)).sort();
  const removed = [...current.keys()].filter(key => !desired.has(key)).sort();
  const changed = [...desired.keys()]
    .filter(key => current.has(key))
    .filter(
      key =>
        JSON.stringify(current.get(key)) !==
        JSON.stringify(desired.get(key))
    )
    .sort();

  return { added, removed, changed };
}

function buildVersionPlan(settings, plan, graph, commitSha = "") {
  const bindings = Array.isArray(settings?.bindings) ? settings.bindings : [];
  const existingByName = new Map(
    bindings
      .filter(binding => binding?.name)
      .map(binding => [binding.name, binding])
  );

  for (const name of TARGET_BINDINGS) {
    if (!existingByName.has(name)) {
      throw new Error(`production binding is missing: ${name}`);
    }
  }

  const desiredByName = new Map([
    ["MODELS_JSON", plan.cloudflare.MODELS_JSON.entries],
    ["MODELS_JSON_EXTRA", plan.cloudflare.MODELS_JSON_EXTRA.entries],
  ]);

  const changes = {};
  const targetBindings = [];

  for (const name of TARGET_BINDINGS) {
    const currentEntries = parseBindingArray(bindings, name);
    const desiredEntries = desiredByName.get(name);
    const summary = summarizeChanges(currentEntries, desiredEntries);

    if (summary.removed.length) {
      throw new Error(
        `${name} would remove production models: ${summary.removed.join(", ")}`
      );
    }

    changes[name] = {
      ...summary,
      current_count: currentEntries.length,
      desired_count: desiredEntries.length,
    };

    targetBindings.push(
      targetBinding(existingByName.get(name), desiredEntries)
    );
  }

  const inheritedBindings = bindings
    .filter(binding => !TARGET_BINDINGS.includes(binding?.name))
    .map(binding => {
      const name = String(binding?.name || "").trim();
      if (!name) throw new Error("production binding is missing a name");
      return {
        name,
        type: "inherit",
        version_id: "latest",
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  const inheritedTypes = {};
  for (const binding of bindings) {
    if (TARGET_BINDINGS.includes(binding?.name)) continue;
    const type = String(binding?.type || "unknown");
    inheritedTypes[type] = (inheritedTypes[type] || 0) + 1;
  }

  const metadata = {
    main_module: graph.mainModule,
    bindings: [...targetBindings, ...inheritedBindings],
    annotations: {
      "workers/message":
        "Sync YoruBay model bindings from data/presets/models.json",
    },
  };

  if (String(commitSha || "").trim()) {
    metadata.annotations["workers/commit_sha"] =
      String(commitSha).trim().slice(0, 64);
  }

  for (const field of SAFE_VERSION_SETTING_FIELDS) {
    if (settings?.[field] !== undefined && settings[field] !== null) {
      metadata[field] = settings[field];
    }
  }

  return {
    graph,
    metadata,
    changes,
    inherited_binding_count: inheritedBindings.length,
    inherited_binding_types: inheritedTypes,
    target_binding_count: TARGET_BINDINGS.length,
  };
}

function buildVersionUploadBody(versionPlan) {
  const body = new FormData();
  body.append("metadata", JSON.stringify(versionPlan.metadata));

  for (const module of versionPlan.graph.modules) {
    body.append(
      module.name,
      new Blob([module.content], {
        type: module.contentType || "application/javascript+module",
      }),
      module.name
    );
  }

  return body;
}

async function cloudflareJson(response, label) {
  const text = await response.text();
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.success === false || payload?.result == null) {
    const message =
      payload?.errors?.map(error => error?.message).filter(Boolean).join("; ") ||
      text.slice(0, 500) ||
      `HTTP ${response.status}`;
    throw new Error(`${label} failed: ${message}`);
  }

  return payload.result;
}

async function fetchLatestDeployment({
  accountId,
  apiToken,
  workerName,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== "function") throw new Error("fetch is unavailable");
  const token = required(apiToken, "CLOUDFLARE_API_TOKEN");

  const response = await fetchImpl(
    workerBaseUrl(accountId, workerName) + "/deployments?per_page=1",
    {
      headers: {
        authorization: `Bearer ${token}`,
      },
    }
  );

  const result = await cloudflareJson(
    response,
    "Cloudflare deployment lookup"
  );
  const deployments = Array.isArray(result)
    ? result
    : result?.deployments;

  if (!Array.isArray(deployments) || !deployments.length) {
    throw new Error("Cloudflare deployment lookup returned no active deployment");
  }

  return deployments[0];
}

function requireSingleActiveVersion(deployment) {
  const versions = Array.isArray(deployment?.versions)
    ? deployment.versions
    : [];

  if (
    versions.length !== 1 ||
    Number(versions[0]?.percentage) !== 100 ||
    !String(versions[0]?.version_id || "").trim()
  ) {
    throw new Error(
      "apply blocked: production Worker is not on a single 100% version deployment"
    );
  }

  return String(versions[0].version_id);
}

async function fetchWorkerVersion({
  accountId,
  apiToken,
  workerName,
  versionId,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== "function") throw new Error("fetch is unavailable");
  const token = required(apiToken, "CLOUDFLARE_API_TOKEN");
  const version = required(versionId, "versionId");

  const response = await fetchImpl(
    workerBaseUrl(accountId, workerName) +
      "/versions/" +
      encodeURIComponent(version),
    {
      headers: {
        authorization: `Bearer ${token}`,
      },
    }
  );

  return cloudflareJson(response, "Cloudflare version lookup");
}

function comparableRuntime(version) {
  const runtime = version?.resources?.script_runtime || {};
  return {
    compatibility_date: runtime.compatibility_date ?? null,
    compatibility_flags: Array.isArray(runtime.compatibility_flags)
      ? [...runtime.compatibility_flags].sort()
      : [],
    limits: runtime.limits ?? null,
    usage_model: runtime.usage_model ?? null,
  };
}

function assertVersionBehaviorPreserved(currentVersion, candidateVersion) {
  const currentEtag = String(
    currentVersion?.resources?.script?.etag || ""
  ).trim();
  const candidateEtag = String(
    candidateVersion?.resources?.script?.etag || ""
  ).trim();

  if (!currentEtag || !candidateEtag) {
    throw new Error(
      "apply blocked: Cloudflare version response is missing a script etag"
    );
  }

  if (currentEtag !== candidateEtag) {
    throw new Error(
      "apply blocked: candidate Worker code differs from the currently deployed version"
    );
  }

  const currentRuntime = comparableRuntime(currentVersion);
  const candidateRuntime = comparableRuntime(candidateVersion);

  if (JSON.stringify(currentRuntime) !== JSON.stringify(candidateRuntime)) {
    throw new Error(
      "apply blocked: candidate Worker runtime settings differ from the currently deployed version"
    );
  }
}

async function uploadWorkerVersion({
  accountId,
  apiToken,
  workerName,
  versionPlan,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== "function") throw new Error("fetch is unavailable");
  const token = required(apiToken, "CLOUDFLARE_API_TOKEN");

  const response = await fetchImpl(
    workerBaseUrl(accountId, workerName) +
      "/versions?bindings_inherit=strict",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
      },
      body: buildVersionUploadBody(versionPlan),
    }
  );

  const result = await cloudflareJson(response, "Cloudflare version upload");
  const id = String(result?.id || "").trim();

  if (!id) {
    throw new Error("Cloudflare version upload returned no version id");
  }

  return result;
}

async function createWorkerDeployment({
  accountId,
  apiToken,
  workerName,
  versions,
  message,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== "function") throw new Error("fetch is unavailable");
  const token = required(apiToken, "CLOUDFLARE_API_TOKEN");

  const response = await fetchImpl(
    workerBaseUrl(accountId, workerName) + "/deployments",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        strategy: "percentage",
        versions,
        annotations: {
          "workers/message": message,
        },
      }),
    }
  );

  return cloudflareJson(response, "Cloudflare deployment");
}

async function deployProductionModelRegistry(options = {}) {
  const accountId = options.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = options.apiToken ?? process.env.CLOUDFLARE_API_TOKEN;
  const workerName = options.workerName ?? process.env.CLOUDFLARE_WORKER_NAME;
  const confirmation =
    options.confirmation ?? process.env.YORUBAY_MODEL_BINDINGS_APPLY ?? "";
  const commitSha =
    options.commitSha ?? process.env.GITHUB_SHA ?? "";

  const registry = options.registry || loadRegistry();
  const plan = options.plan || buildModelDeploymentPlan(registry);
  const graph = options.graph || loadWorkerModuleManifest();
  const settings =
    options.settings ||
    (await fetchWorkerSettings({
      accountId,
      apiToken,
      workerName,
      fetchImpl: options.fetchImpl,
    }));

  const versionPlan = buildVersionPlan(
    settings,
    plan,
    graph,
    commitSha
  );

  const hasChanges = Object.values(versionPlan.changes).some(
    change => change.added.length || change.changed.length
  );

  const report = {
    schema: "yorubay-production-model-binding-deploy/v2",
    mode: confirmation === APPLY_CONFIRMATION ? "apply" : "dry-run",
    has_changes: hasChanges,
    target_binding_count: versionPlan.target_binding_count,
    inherited_binding_count: versionPlan.inherited_binding_count,
    inherited_binding_types: versionPlan.inherited_binding_types,
    inheritance_mode: "strict",
    changes: versionPlan.changes,
    aws: {
      variable: plan.aws.variable,
      expected_count: plan.aws.entries.length,
      note: "Cloudflare model binding deployment does not mutate the AWS relay allowlist.",
    },
  };

  if (!hasChanges) {
    return {
      ...report,
      applied: false,
      reason: "already_in_sync",
    };
  }

  if (confirmation !== APPLY_CONFIRMATION) {
    return {
      ...report,
      applied: false,
      reason: "dry_run",
    };
  }

  const previousDeployment =
    options.previousDeployment ||
    (await fetchLatestDeployment({
      accountId,
      apiToken,
      workerName,
      fetchImpl: options.fetchImpl,
    }));

  const previousVersionId =
    requireSingleActiveVersion(previousDeployment);

  const currentVersion =
    options.currentVersion ||
    (await fetchWorkerVersion({
      accountId,
      apiToken,
      workerName,
      versionId: previousVersionId,
      fetchImpl: options.fetchImpl,
    }));

  const candidateVersion =
    options.candidateVersion ||
    (await uploadWorkerVersion({
      accountId,
      apiToken,
      workerName,
      versionPlan,
      fetchImpl: options.fetchImpl,
    }));

  assertVersionBehaviorPreserved(
    currentVersion,
    candidateVersion
  );

  const newVersionId = String(candidateVersion.id);
  const deployment = await createWorkerDeployment({
    accountId,
    apiToken,
    workerName,
    versions: [
      {
        percentage: 100,
        version_id: newVersionId,
      },
    ],
    message: "Deploy registry-generated YoruBay model bindings",
    fetchImpl: options.fetchImpl,
  });

  const verification = await auditProductionModelRegistry({
    accountId,
    apiToken,
    workerName,
    registry,
    rolloutEntries: options.rolloutEntries,
    fetchImpl: options.fetchImpl,
  });

  if (!verification.ok) {
    let rollback = null;
    try {
      rollback = await createWorkerDeployment({
        accountId,
        apiToken,
        workerName,
        versions: previousDeployment.versions,
        message:
          "Rollback YoruBay model binding deployment after failed registry audit",
        fetchImpl: options.fetchImpl,
      });
    } catch (rollbackError) {
      throw new Error(
        "post-deploy registry audit failed and automatic rollback also failed: " +
          rollbackError.message
      );
    }

    throw new Error(
      "post-deploy registry audit failed; previous Worker version was restored" +
        (rollback?.id ? ` (rollback deployment ${rollback.id})` : "")
    );
  }

  return {
    ...report,
    applied: true,
    reason: "version_deployed",
    previous_version_id: previousVersionId,
    version_id: newVersionId,
    deployment_id: deployment?.id ?? null,
    verification_ok: true,
  };
}

async function main() {
  const report = await deployProductionModelRegistry();
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  APPLY_CONFIRMATION,
  SAFE_VERSION_SETTING_FIELDS,
  TARGET_BINDINGS,
  assertVersionBehaviorPreserved,
  buildVersionPlan,
  buildVersionUploadBody,
  comparableRuntime,
  createWorkerDeployment,
  deployProductionModelRegistry,
  fetchLatestDeployment,
  fetchWorkerVersion,
  requireSingleActiveVersion,
  summarizeChanges,
  targetBinding,
  uploadWorkerVersion,
  workerBaseUrl,
};
