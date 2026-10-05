const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const registryPath = path.join(root, "data/presets/models.json");
const pricingPath = path.join(root, "workers/bao-lab-credits-api/modules/model-pricing.js");
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const pricingSource = fs.readFileSync(pricingPath, "utf8");

assert.equal(registry.schema, "bao-model-registry/v1");
assert.ok(Array.isArray(registry.models) && registry.models.length > 0, "model registry must contain logical models");

const logicalIds = new Set();
const hostedRoutes = [];
for (const model of registry.models) {
  assert.ok(model.id && !logicalIds.has(model.id), `duplicate logical model id: ${model.id}`);
  logicalIds.add(model.id);
  assert.ok(Array.isArray(model.routes) && model.routes.length > 0, `${model.id} must contain routes`);

  const routeIds = new Set();
  for (const route of model.routes) {
    assert.ok(route.id && !routeIds.has(route.id), `duplicate route id ${route.id} in ${model.id}`);
    routeIds.add(route.id);
    assert.ok(route.provider, `${model.id}/${route.id} missing provider`);
    assert.equal(typeof route.model, "string", `${model.id}/${route.id} missing model id`);
  }

  if (model.hosted) {
    assert.ok(model.hosted.route_id, `${model.id} hosted route_id is required`);
    const route = model.routes.find((candidate) => candidate.id === model.hosted.route_id);
    assert.ok(route, `${model.id} hosted route must reference an existing route`);
    hostedRoutes.push({ logicalId: model.id, route });
  }
}

assert.ok(hostedRoutes.length > 0, "registry must declare hosted selections");
assert.match(pricingSource, /env\.MODELS_JSON/);
assert.match(pricingSource, /env\.MODELS_JSON_EXTRA/);

// Phase 1 is intentionally behavior-preserving: the browser registry describes
// logical/BYOK/hosted selections, while the Worker environment remains the
// production security allowlist until the external base is captured exactly.
assert.match(registry.note, /Worker MODELS_JSON remains an independent server-side allowlist\/security boundary/);

console.log(`model registry contract ok: ${registry.models.length} logical models, ${hostedRoutes.length} hosted selections`);
