#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const registryPath = path.join(repoRoot, "data/presets/models.json");
const ALLOWED_BINDINGS = new Set(["MODELS_JSON", "MODELS_JSON_EXTRA"]);

function routeKey(route) {
  return `${String(route?.provider || "").trim()}:${String(route?.model || "").trim()}`;
}

function toMicrousd(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`);
  }
  const result = Math.round(value * 1_000_000);
  if (!Number.isSafeInteger(result)) {
    throw new Error(`${label} is outside the safe integer range`);
  }
  return result;
}

function optionalMicrousd(target, field, value, label) {
  if (value === undefined || value === null) return;
  target[field] = toMicrousd(value, label);
}

function buildWorkerEntry(model, route) {
  const worker = route?.worker;
  if (!worker || typeof worker !== "object") return null;

  const binding = String(worker.binding || "").trim();
  if (!ALLOWED_BINDINGS.has(binding)) {
    throw new Error(`${routeKey(route)} has unsupported worker binding: ${binding || "(blank)"}`);
  }

  const pricing = worker.pricing;
  if (!pricing || typeof pricing !== "object") {
    throw new Error(`${routeKey(route)} worker.pricing is required`);
  }

  const key = routeKey(route);
  if (!route?.provider || !route?.model) {
    throw new Error(`${model?.id || "unknown"} worker route needs provider + model`);
  }

  const entry = {
    provider: route.provider,
    model: route.model,
    input_microusd_per_million: toMicrousd(pricing.input, `${key} worker.pricing.input`),
    output_microusd_per_million: toMicrousd(pricing.output, `${key} worker.pricing.output`),
  };

  optionalMicrousd(
    entry,
    "cache_read_microusd_per_million",
    pricing.cache,
    `${key} worker.pricing.cache`
  );
  optionalMicrousd(
    entry,
    "cache_write_microusd_per_million",
    pricing.cache_write,
    `${key} worker.pricing.cache_write`
  );

  const maxPrice = worker.openrouter_max_price;
  if (route.provider === "openrouter") {
    if (!maxPrice || typeof maxPrice !== "object") {
      throw new Error(`${key} needs worker.openrouter_max_price`);
    }

    entry.openrouter_max_prompt_microusd_per_million = toMicrousd(
      maxPrice.prompt,
      `${key} worker.openrouter_max_price.prompt`
    );
    entry.openrouter_max_completion_microusd_per_million = toMicrousd(
      maxPrice.completion,
      `${key} worker.openrouter_max_price.completion`
    );

    if (
      entry.openrouter_max_prompt_microusd_per_million <
      entry.input_microusd_per_million
    ) {
      throw new Error(`${key} prompt max price cannot be below input price`);
    }
    if (
      entry.openrouter_max_completion_microusd_per_million <
      entry.output_microusd_per_million
    ) {
      throw new Error(`${key} completion max price cannot be below output price`);
    }
  } else if (maxPrice) {
    throw new Error(`${key} cannot define OpenRouter max price on a non-OpenRouter route`);
  }

  const longContext = worker.long_context;
  if (longContext) {
    if (
      !Number.isSafeInteger(longContext.threshold_tokens) ||
      longContext.threshold_tokens <= 0
    ) {
      throw new Error(`${key} long_context.threshold_tokens must be a positive integer`);
    }

    entry.long_context_threshold_tokens = longContext.threshold_tokens;
    entry.long_context_input_microusd_per_million = toMicrousd(
      longContext.input,
      `${key} worker.long_context.input`
    );
    entry.long_context_output_microusd_per_million = toMicrousd(
      longContext.output,
      `${key} worker.long_context.output`
    );
    optionalMicrousd(
      entry,
      "long_context_cache_read_microusd_per_million",
      longContext.cache,
      `${key} worker.long_context.cache`
    );
    optionalMicrousd(
      entry,
      "long_context_cache_write_microusd_per_million",
      longContext.cache_write,
      `${key} worker.long_context.cache_write`
    );

    const longMax = longContext.max_price;
    if (longMax) {
      if (route.provider !== "openrouter") {
        throw new Error(`${key} long-context max price requires OpenRouter`);
      }
      entry.long_context_openrouter_max_prompt_microusd_per_million = toMicrousd(
        longMax.prompt,
        `${key} worker.long_context.max_price.prompt`
      );
      entry.long_context_openrouter_max_completion_microusd_per_million = toMicrousd(
        longMax.completion,
        `${key} worker.long_context.max_price.completion`
      );

      if (
        entry.long_context_openrouter_max_prompt_microusd_per_million <
        entry.long_context_input_microusd_per_million
      ) {
        throw new Error(`${key} long-context prompt max price cannot be below input price`);
      }
      if (
        entry.long_context_openrouter_max_completion_microusd_per_million <
        entry.long_context_output_microusd_per_million
      ) {
        throw new Error(`${key} long-context completion max price cannot be below output price`);
      }
    }
  }

  if (worker.aws_openrouter_relay && route.provider !== "openrouter") {
    throw new Error(`${key} AWS OpenRouter relay flag requires provider=openrouter`);
  }

  return {
    binding,
    relay: worker.aws_openrouter_relay === true,
    logical_model_id: model.id,
    route_id: route.id,
    entry,
  };
}

function buildModelDeploymentPlan(registry) {
  if (registry?.schema !== "bao-model-registry/v1" || !Array.isArray(registry.models)) {
    throw new Error("unsupported model registry schema");
  }

  const resolvedRoutes = [];
  const seen = new Set();
  const hostedKeys = new Set();

  for (const model of registry.models) {
    const routes = Array.isArray(model.routes) ? model.routes : [];
    if (model.hosted?.route_id) {
      const hosted = routes.find(route => route.id === model.hosted.route_id);
      if (!hosted) {
        throw new Error(`${model.id} hosted route is missing: ${model.hosted.route_id}`);
      }
      hostedKeys.add(routeKey(hosted));
    }

    for (const route of routes) {
      const resolved = buildWorkerEntry(model, route);
      if (!resolved) continue;

      const key = routeKey(resolved.entry);
      if (seen.has(key)) throw new Error(`duplicate Worker model route: ${key}`);
      seen.add(key);
      resolvedRoutes.push(resolved);
    }
  }

  for (const key of hostedKeys) {
    if (!seen.has(key)) {
      throw new Error(`hosted route is missing Worker deployment metadata: ${key}`);
    }
  }

  const bindings = {
    MODELS_JSON: [],
    MODELS_JSON_EXTRA: [],
  };
  const relayModels = [];

  for (const route of resolvedRoutes) {
    bindings[route.binding].push(route.entry);
    if (route.relay) relayModels.push(route.entry.model);
  }

  const uniqueRelayModels = [...new Set(relayModels)];

  return {
    schema: "yorubay-worker-model-deployment-plan/v1",
    source_registry: "data/presets/models.json",
    resolved_routes: resolvedRoutes.map(route => ({
      logical_model_id: route.logical_model_id,
      route_id: route.route_id,
      binding: route.binding,
      relay: route.relay,
      provider: route.entry.provider,
      model: route.entry.model,
    })),
    cloudflare: {
      MODELS_JSON: {
        entries: bindings.MODELS_JSON,
        value_json: JSON.stringify(bindings.MODELS_JSON),
      },
      MODELS_JSON_EXTRA: {
        entries: bindings.MODELS_JSON_EXTRA,
        value_json: JSON.stringify(bindings.MODELS_JSON_EXTRA),
      },
    },
    aws: {
      variable: "OPENROUTER_MODELS",
      entries: uniqueRelayModels,
      value_csv: uniqueRelayModels.join(","),
    },
  };
}

function loadRegistry(file = registryPath) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function main() {
  const plan = buildModelDeploymentPlan(loadRegistry());
  process.stdout.write(JSON.stringify(plan, null, 2) + "\n");
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  ALLOWED_BINDINGS,
  buildModelDeploymentPlan,
  buildWorkerEntry,
  loadRegistry,
  routeKey,
  toMicrousd,
};
