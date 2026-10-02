const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const registry = JSON.parse(
  fs.readFileSync(path.join(root, "data/presets/models.json"), "utf8")
);

assert.equal(registry.schema, "bao-model-registry/v1");
assert.ok(Array.isArray(registry.models) && registry.models.length > 0);

const ids = new Set();
const routes = [];
for (const model of registry.models) {
  assert.ok(model && typeof model === "object");
  assert.ok(model.id, "every model needs an id");
  assert.ok(!ids.has(model.id), `duplicate model id: ${model.id}`);
  ids.add(model.id);

  assert.ok(Array.isArray(model.routes) && model.routes.length > 0, `${model.id} needs routes`);
  const routeIds = new Set();

  for (const route of model.routes) {
    assert.ok(route.id, `${model.id} route needs id`);
    assert.ok(!routeIds.has(route.id), `duplicate route id ${model.id}/${route.id}`);
    routeIds.add(route.id);
    assert.ok(route.provider, `${model.id}/${route.id} needs provider`);
    assert.ok(route.model, `${model.id}/${route.id} needs upstream model`);
    routes.push({ registryId: model.id, ...route });
  }

  if (model.hosted) {
    assert.ok(model.hosted.route_id, `${model.id} hosted entry needs route_id`);
    const target = model.routes.find(route => route.id === model.hosted.route_id);
    assert.ok(target, `${model.id} hosted route_id does not exist: ${model.hosted.route_id}`);
    assert.ok(target.provider, `${model.id} hosted route needs provider`);
    assert.ok(target.model, `${model.id} hosted route needs upstream model`);
  }
}

const rolloutDir = path.join(root, "workers/bao-lab-credits-api/model-rollouts");
const rolloutFiles = fs.readdirSync(rolloutDir).filter(name => name.endsWith(".json")).sort();
assert.ok(rolloutFiles.length > 0, "expected at least one versioned model rollout");

const rolloutKeys = new Set();
for (const file of rolloutFiles) {
  const entries = JSON.parse(fs.readFileSync(path.join(rolloutDir, file), "utf8"));
  assert.ok(Array.isArray(entries), `${file} must be an array`);

  for (const entry of entries) {
    assert.ok(entry.provider && entry.model, `${file} entry needs provider + model`);
    const key = `${entry.provider}:${entry.model}`;
    assert.ok(!rolloutKeys.has(key), `duplicate rollout entry across files: ${key}`);
    rolloutKeys.add(key);

    const route = routes.find(item => item.provider === entry.provider && item.model === entry.model);
    assert.ok(route, `${file} rollout model is missing from models.json: ${key}`);

    const pricing = route.pricing;
    if (pricing && Number.isFinite(pricing.input)) {
      assert.equal(
        entry.input_microusd_per_million,
        Math.round(pricing.input * 1_000_000),
        `${key} input pricing drift between registry and rollout`
      );
    }
    if (pricing && Number.isFinite(pricing.output)) {
      assert.equal(
        entry.output_microusd_per_million,
        Math.round(pricing.output * 1_000_000),
        `${key} output pricing drift between registry and rollout`
      );
    }
    if (pricing && Number.isFinite(pricing.cache) && entry.cache_read_microusd_per_million != null) {
      assert.equal(
        entry.cache_read_microusd_per_million,
        Math.round(pricing.cache * 1_000_000),
        `${key} cache-read pricing drift between registry and rollout`
      );
    }
    if (pricing && Number.isFinite(pricing.cache_write) && entry.cache_write_microusd_per_million != null) {
      assert.equal(
        entry.cache_write_microusd_per_million,
        Math.round(pricing.cache_write * 1_000_000),
        `${key} cache-write pricing drift between registry and rollout`
      );
    }

    if (entry.openrouter_max_prompt_microusd_per_million != null) {
      assert.ok(
        entry.openrouter_max_prompt_microusd_per_million >= entry.input_microusd_per_million,
        `${key} prompt hard ceiling cannot be below configured input price`
      );
    }
    if (entry.openrouter_max_completion_microusd_per_million != null) {
      assert.ok(
        entry.openrouter_max_completion_microusd_per_million >= entry.output_microusd_per_million,
        `${key} completion hard ceiling cannot be below configured output price`
      );
    }
  }
}

console.log(
  `model-registry-contract: ${registry.models.length} logical models, ${routes.length} routes, ${rolloutKeys.size} rollout entries ok`
);
