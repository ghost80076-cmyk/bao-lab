#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const registryPath = path.join(repoRoot, "data/presets/models.json");
const rolloutDirectory = path.join(
  repoRoot,
  "workers/bao-lab-credits-api/model-rollouts"
);

const MODEL_BINDINGS = ["MODELS_JSON", "MODELS_JSON_EXTRA"];
const PRICE_FIELDS = [
  ["input_microusd_per_million", "input"],
  ["output_microusd_per_million", "output"],
  ["cache_read_microusd_per_million", "cache"],
  ["cache_write_microusd_per_million", "cache_write"],
];

const SAFE_WORKER_METADATA_FIELDS = [
  "input_microusd_per_million",
  "output_microusd_per_million",
  "cache_read_microusd_per_million",
  "cache_write_microusd_per_million",
  "long_context_threshold_tokens",
  "long_context_input_microusd_per_million",
  "long_context_output_microusd_per_million",
  "long_context_cache_read_microusd_per_million",
  "long_context_cache_write_microusd_per_million",
  "openrouter_max_prompt_microusd_per_million",
  "openrouter_max_completion_microusd_per_million",
  "long_context_openrouter_max_prompt_microusd_per_million",
  "long_context_openrouter_max_completion_microusd_per_million",
];

function required(value, name) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function entryKey(entry) {
  return `${String(entry?.provider || "").trim()}:${String(entry?.model || "").trim()}`;
}

function parseBindingArray(bindings, name) {
  const binding = bindings.find(candidate => candidate?.name === name);
  if (!binding) {
    if (name === "MODELS_JSON_EXTRA") return [];
    throw new Error(`production binding is missing: ${name}`);
  }

  if (binding.type === "secret_text") {
    throw new Error(`${name} is secret_text; the read-only audit cannot inspect it safely`);
  }

  let raw;
  if (binding.type === "plain_text") raw = binding.text;
  else if (binding.type === "json") raw = binding.json;
  else throw new Error(`${name} uses unsupported binding type: ${binding.type}`);

  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch (error) {
      throw new Error(`${name} is invalid JSON: ${error.message}`);
    }
  }

  if (!Array.isArray(value)) {
    throw new Error(`${name} must resolve to a JSON array`);
  }

  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`${name}[${index}] must be an object`);
    }
    const provider = String(entry.provider || "").trim();
    const model = String(entry.model || "").trim();
    if (!provider || !model) {
      throw new Error(`${name}[${index}] needs provider + model`);
    }
    return { ...entry, provider, model };
  });
}

function loadRolloutEntries(directory = rolloutDirectory) {
  if (!fs.existsSync(directory)) return [];
  const files = fs
    .readdirSync(directory)
    .filter(name => name.endsWith(".json"))
    .sort();

  return files.flatMap(file => {
    const filePath = path.join(directory, file);
    const entries = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(entries)) {
      throw new Error(`${file} must be a JSON array`);
    }
    return entries.map(entry => ({ ...entry, __source: file }));
  });
}

function registryRoutes(registry) {
  if (registry?.schema !== "bao-model-registry/v1" || !Array.isArray(registry.models)) {
    throw new Error("unsupported model registry schema");
  }

  return registry.models.flatMap(model =>
    (model.routes || [])
      .filter(route => route?.provider && route?.model)
      .map(route => ({
        logical_model_id: model.id,
        route_id: route.id,
        provider: route.provider,
        model: route.model,
        pricing: route.pricing || null,
        hosted: model.hosted?.route_id === route.id,
      }))
  );
}

function expectedMicrousd(pricing, field) {
  const value = pricing?.[field];
  return Number.isFinite(value) ? Math.round(value * 1_000_000) : null;
}

function productionInventory(baseEntries, extraEntries) {
  const summarize = (entry, binding) => {
    const workerMetadata = {};

    for (const field of SAFE_WORKER_METADATA_FIELDS) {
      if (Number.isSafeInteger(entry?.[field]) && entry[field] >= 0) {
        workerMetadata[field] = entry[field];
      }
    }

    return {
      binding,
      key: entryKey(entry),
      fields: Object.keys(entry).sort(),
      worker_metadata: workerMetadata,
    };
  };

  return [
    ...baseEntries.map(entry => summarize(entry, "MODELS_JSON")),
    ...extraEntries.map(entry => summarize(entry, "MODELS_JSON_EXTRA")),
  ];
}

function compareProductionModelRegistry({
  settings,
  registry,
  rolloutEntries = [],
}) {
  const bindings = Array.isArray(settings?.bindings) ? settings.bindings : [];
  const baseEntries = parseBindingArray(bindings, "MODELS_JSON");
  const extraEntries = parseBindingArray(bindings, "MODELS_JSON_EXTRA");
  const productionEntries = [...baseEntries, ...extraEntries];

  const routes = registryRoutes(registry);
  const registryByKey = new Map(routes.map(route => [entryKey(route), route]));
  const productionKeys = new Set();
  const duplicateProductionKeys = [];
  const productionMissingFromRegistry = [];
  const pricingDrift = [];

  for (const entry of productionEntries) {
    const key = entryKey(entry);
    if (productionKeys.has(key)) duplicateProductionKeys.push(key);
    productionKeys.add(key);

    const route = registryByKey.get(key);
    if (!route) {
      productionMissingFromRegistry.push(key);
      continue;
    }

    for (const [workerField, registryField] of PRICE_FIELDS) {
      if (entry[workerField] == null) continue;
      const expected = expectedMicrousd(route.pricing, registryField);
      if (expected == null) continue;
      if (entry[workerField] !== expected) {
        pricingDrift.push({
          key,
          field: workerField,
          expected,
          actual: entry[workerField],
        });
      }
    }
  }

  const hostedMissingFromProduction = routes
    .filter(route => route.hosted)
    .map(entryKey)
    .filter(key => !productionKeys.has(key));

  const rolloutMissingFromProduction = rolloutEntries
    .map(entry => ({ key: entryKey(entry), source: entry.__source || "rollout" }))
    .filter(item => !productionKeys.has(item.key));

  const report = {
    schema: "yorubay-production-model-registry-audit/v1",
    binding_names_checked: MODEL_BINDINGS,
    production: {
      base_count: baseEntries.length,
      extra_count: extraEntries.length,
      combined_count: productionEntries.length,
      inventory: productionInventory(baseEntries, extraEntries),
    },
    registry: {
      logical_model_count: registry.models.length,
      routable_route_count: routes.length,
      hosted_route_count: routes.filter(route => route.hosted).length,
    },
    rollout_entry_count: rolloutEntries.length,
    findings: {
      duplicate_production_keys: duplicateProductionKeys,
      production_missing_from_registry: productionMissingFromRegistry,
      hosted_missing_from_production: hostedMissingFromProduction,
      rollout_missing_from_production: rolloutMissingFromProduction,
      pricing_drift: pricingDrift,
    },
  };

  report.ok = Object.values(report.findings).every(items => items.length === 0);
  return report;
}

async function fetchWorkerSettings({
  accountId,
  apiToken,
  workerName,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== "function") throw new Error("fetch is unavailable");

  const account = required(accountId, "CLOUDFLARE_ACCOUNT_ID");
  const token = required(apiToken, "CLOUDFLARE_API_TOKEN");
  const worker = required(workerName, "CLOUDFLARE_WORKER_NAME");

  const response = await fetchImpl(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/workers/scripts/${encodeURIComponent(worker)}/settings`,
    {
      headers: {
        authorization: `Bearer ${token}`,
      },
    }
  );

  const text = await response.text();
  let payload;
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
    throw new Error(`Cloudflare Worker settings read failed: ${message}`);
  }

  return payload.result;
}

async function auditProductionModelRegistry(options = {}) {
  const registry = options.registry || JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const rolloutEntries = options.rolloutEntries || loadRolloutEntries();
  const settings =
    options.settings ||
    (await fetchWorkerSettings({
      accountId: options.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: options.apiToken ?? process.env.CLOUDFLARE_API_TOKEN,
      workerName: options.workerName ?? process.env.CLOUDFLARE_WORKER_NAME,
      fetchImpl: options.fetchImpl,
    }));

  return compareProductionModelRegistry({
    settings,
    registry,
    rolloutEntries,
  });
}

async function main() {
  const report = await auditProductionModelRegistry();
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  auditProductionModelRegistry,
  compareProductionModelRegistry,
  entryKey,
  fetchWorkerSettings,
  loadRolloutEntries,
  parseBindingArray,
  productionInventory,
  registryRoutes,
};
