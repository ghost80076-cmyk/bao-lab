#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const registryPath = path.join(repoRoot, "data/presets/models.json");
const input = process.argv[2];

if (!input) {
  console.error(
    "usage: node workers/bao-lab-credits-api/build-model-rollout-plan.cjs <rollout.json>"
  );
  process.exit(2);
}

const rolloutPath = path.resolve(process.cwd(), input);
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const entries = JSON.parse(fs.readFileSync(rolloutPath, "utf8"));

if (!Array.isArray(entries) || !entries.length) {
  throw new Error("model rollout must be a non-empty JSON array");
}

const registryRoutes = registry.models.flatMap(model =>
  model.routes.map(route => ({
    logical_model_id: model.id,
    route_id: route.id,
    provider: route.provider,
    model: route.model,
  }))
);

const seen = new Set();
const resolved = entries.map(entry => {
  if (!entry || typeof entry !== "object" || !entry.provider || !entry.model) {
    throw new Error("every rollout entry needs provider and model");
  }

  const key = `${entry.provider}:${entry.model}`;
  if (seen.has(key)) throw new Error(`duplicate rollout entry: ${key}`);
  seen.add(key);

  const route = registryRoutes.find(candidate =>
    candidate.provider === entry.provider && candidate.model === entry.model
  );
  if (!route) throw new Error(`rollout route is missing from models.json: ${key}`);

  for (const field of [
    "input_microusd_per_million",
    "output_microusd_per_million",
  ]) {
    if (!Number.isSafeInteger(entry[field]) || entry[field] < 0) {
      throw new Error(`${key} needs a non-negative integer ${field}`);
    }
  }

  return {
    logical_model_id: route.logical_model_id,
    route_id: route.route_id,
    provider: entry.provider,
    model: entry.model,
  };
});

const openRouterModels = [...new Set(
  entries
    .filter(entry => entry.provider === "openrouter")
    .map(entry => entry.model)
)];

const relative = file => path.relative(repoRoot, file).split(path.sep).join("/");
const plan = {
  schema: "yorubay-worker-model-rollout-plan/v1",
  source_registry: relative(registryPath),
  source_rollout: relative(rolloutPath),
  resolved_routes: resolved,
  cloudflare: {
    binding: "MODELS_JSON_EXTRA",
    entries,
    value_json: JSON.stringify(entries),
  },
  aws: {
    variable: "OPENROUTER_MODELS",
    append: openRouterModels,
    append_csv: openRouterModels.join(","),
  },
};

process.stdout.write(JSON.stringify(plan, null, 2) + "\n");
