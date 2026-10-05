#!/usr/bin/env node

const {
  buildModelDeploymentPlan,
  loadRegistry,
} = require("../workers/bao-lab-credits-api/build-model-deployment-plan.cjs");
const {
  fetchWorkerSettings,
  parseBindingArray,
  entryKey,
} = require("./audit-production-model-registry.cjs");

const TARGET_BINDINGS = ["MODELS_JSON", "MODELS_JSON_EXTRA"];
const APPLY_CONFIRMATION = "APPLY_REGISTRY_MODEL_BINDINGS";

function required(value, name) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function bindingValue(binding) {
  if (binding.type === "plain_text") return binding.text;
  if (binding.type === "json") return binding.json;
  return undefined;
}

function replacementBinding(existing, entries) {
  if (!existing) throw new Error("target binding is missing from production");
  if (existing.type === "secret_text") {
    throw new Error(`${existing.name} is secret_text and cannot be updated by this tool`);
  }
  if (existing.type === "plain_text") {
    return { ...existing, text: JSON.stringify(entries) };
  }
  if (existing.type === "json") {
    return { ...existing, json: entries };
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
    .filter(key => JSON.stringify(current.get(key)) !== JSON.stringify(desired.get(key)))
    .sort();

  return { added, removed, changed };
}

function buildBindingsPatch(settings, plan) {
  const bindings = Array.isArray(settings?.bindings) ? settings.bindings : [];
  const existingByName = new Map(bindings.map(binding => [binding?.name, binding]));

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
  for (const name of TARGET_BINDINGS) {
    const existing = existingByName.get(name);
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
  }

  const nextBindings = bindings.map(binding => {
    if (!TARGET_BINDINGS.includes(binding?.name)) return binding;
    return replacementBinding(binding, desiredByName.get(binding.name));
  });

  return {
    bindings: nextBindings,
    changes,
    target_binding_count: TARGET_BINDINGS.length,
    preserved_binding_count: bindings.length - TARGET_BINDINGS.length,
  };
}

async function patchWorkerSettings({
  accountId,
  apiToken,
  workerName,
  bindings,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== "function") throw new Error("fetch is unavailable");

  const account = required(accountId, "CLOUDFLARE_ACCOUNT_ID");
  const token = required(apiToken, "CLOUDFLARE_API_TOKEN");
  const worker = required(workerName, "CLOUDFLARE_WORKER_NAME");

  const response = await fetchImpl(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/workers/scripts/${encodeURIComponent(worker)}/settings`,
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        bindings,
        annotations: {
          "workers/message": "Sync YoruBay model bindings from data/presets/models.json",
        },
      }),
    }
  );

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.success === false || !payload?.result) {
    const message =
      payload?.errors?.map(error => error?.message).filter(Boolean).join("; ") ||
      text.slice(0, 300) ||
      `HTTP ${response.status}`;
    throw new Error(`Cloudflare Worker settings patch failed: ${message}`);
  }

  return payload.result;
}

async function deployProductionModelRegistry(options = {}) {
  const accountId = options.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = options.apiToken ?? process.env.CLOUDFLARE_API_TOKEN;
  const workerName = options.workerName ?? process.env.CLOUDFLARE_WORKER_NAME;
  const confirmation =
    options.confirmation ?? process.env.YORUBAY_MODEL_BINDINGS_APPLY ?? "";

  const registry = options.registry || loadRegistry();
  const plan = options.plan || buildModelDeploymentPlan(registry);
  const settings =
    options.settings ||
    (await fetchWorkerSettings({
      accountId,
      apiToken,
      workerName,
      fetchImpl: options.fetchImpl,
    }));

  const patch = buildBindingsPatch(settings, plan);
  const hasChanges = Object.values(patch.changes).some(
    change => change.added.length || change.changed.length
  );

  const report = {
    schema: "yorubay-production-model-binding-deploy/v1",
    mode: confirmation === APPLY_CONFIRMATION ? "apply" : "dry-run",
    has_changes: hasChanges,
    target_binding_count: patch.target_binding_count,
    preserved_binding_count: patch.preserved_binding_count,
    changes: patch.changes,
    aws: {
      variable: plan.aws.variable,
      expected_count: plan.aws.entries.length,
      note: "Cloudflare binding deploy does not mutate the AWS relay allowlist.",
    },
  };

  if (!hasChanges) {
    return { ...report, applied: false, reason: "already_in_sync" };
  }

  if (confirmation !== APPLY_CONFIRMATION) {
    return { ...report, applied: false, reason: "dry_run" };
  }

  await patchWorkerSettings({
    accountId,
    apiToken,
    workerName,
    bindings: patch.bindings,
    fetchImpl: options.fetchImpl,
  });

  return { ...report, applied: true, reason: "patched" };
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
  TARGET_BINDINGS,
  bindingValue,
  buildBindingsPatch,
  deployProductionModelRegistry,
  patchWorkerSettings,
  replacementBinding,
  summarizeChanges,
};
