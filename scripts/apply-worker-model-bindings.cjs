#!/usr/bin/env node

const crypto = require("node:crypto");
const {
  buildModelDeploymentPlan,
  loadRegistry,
} = require("../workers/bao-lab-credits-api/build-model-deployment-plan.cjs");
const {
  compareProductionModelRegistry,
  fetchWorkerSettings,
  loadRolloutEntries,
  parseBindingArray,
} = require("./audit-production-model-registry.cjs");

const TARGET_BINDINGS = ["MODELS_JSON", "MODELS_JSON_EXTRA"];

function required(value, name) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, canonical(value[key])])
  );
}

function entryKey(entry) {
  return `${String(entry?.provider || "").trim()}:${String(entry?.model || "").trim()}`;
}

function sortedEntries(entries) {
  return [...entries]
    .map(entry => canonical(entry))
    .sort((a, b) => entryKey(a).localeCompare(entryKey(b)));
}

function targetBindingSnapshot(settings) {
  const bindings = Array.isArray(settings?.bindings) ? settings.bindings : [];
  return TARGET_BINDINGS.map(name => {
    const binding = bindings.find(candidate => candidate?.name === name);
    if (!binding) throw new Error(`production binding is missing: ${name}`);
    if (!["plain_text", "json"].includes(binding.type)) {
      throw new Error(`${name} must remain plain_text or json, got ${binding.type}`);
    }

    return {
      name,
      type: binding.type,
      entries: sortedEntries(parseBindingArray(bindings, name)),
    };
  });
}

function fingerprintSnapshot(snapshot) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(snapshot)))
    .digest("hex");
}

function currentTargetFingerprint(settings) {
  return fingerprintSnapshot(targetBindingSnapshot(settings));
}

function desiredTargetSnapshot(settings, plan) {
  const bindings = Array.isArray(settings?.bindings) ? settings.bindings : [];

  return TARGET_BINDINGS.map(name => {
    const current = bindings.find(candidate => candidate?.name === name);
    if (!current) throw new Error(`production binding is missing: ${name}`);
    if (!["plain_text", "json"].includes(current.type)) {
      throw new Error(`${name} must remain plain_text or json, got ${current.type}`);
    }

    return {
      name,
      type: current.type,
      entries: sortedEntries(plan.cloudflare[name].entries),
    };
  });
}

function desiredTargetFingerprint(settings, plan) {
  return fingerprintSnapshot(desiredTargetSnapshot(settings, plan));
}

function configMap(snapshot) {
  const map = new Map();
  for (const binding of snapshot) {
    for (const entry of binding.entries) {
      map.set(entryKey(entry), {
        binding: binding.name,
        entry,
      });
    }
  }
  return map;
}

function summarizeTargetDiff(currentSnapshot, desiredSnapshot) {
  const current = configMap(currentSnapshot);
  const desired = configMap(desiredSnapshot);
  const added = [];
  const removed = [];
  const changed = [];
  const moved = [];

  for (const [key, wanted] of desired) {
    const actual = current.get(key);
    if (!actual) {
      added.push(key);
      continue;
    }

    if (actual.binding !== wanted.binding) {
      moved.push({
        key,
        from: actual.binding,
        to: wanted.binding,
      });
    }

    if (JSON.stringify(canonical(actual.entry)) !== JSON.stringify(canonical(wanted.entry))) {
      changed.push(key);
    }
  }

  for (const key of current.keys()) {
    if (!desired.has(key)) removed.push(key);
  }

  return {
    added: added.sort(),
    removed: removed.sort(),
    changed: changed.sort(),
    moved: moved.sort((a, b) => a.key.localeCompare(b.key)),
  };
}

function replacementBinding(currentBinding, desiredEntries) {
  if (currentBinding.type === "plain_text") {
    return {
      name: currentBinding.name,
      type: "plain_text",
      text: JSON.stringify(desiredEntries),
    };
  }

  if (currentBinding.type === "json") {
    return {
      name: currentBinding.name,
      type: "json",
      json: desiredEntries,
    };
  }

  throw new Error(
    `${currentBinding.name} must remain plain_text or json, got ${currentBinding.type}`
  );
}

function preservedAnnotations(settings, desiredFingerprint) {
  const annotations = {};
  const current = settings?.annotations;

  if (typeof current?.["workers/tag"] === "string" && current["workers/tag"]) {
    annotations["workers/tag"] = current["workers/tag"];
  }

  annotations["workers/message"] =
    `YoruBay model registry apply ${desiredFingerprint.slice(0, 12)}`;

  return annotations;
}

function buildSafeSettingsPatch(settings, plan, desiredFingerprint) {
  const bindings = Array.isArray(settings?.bindings) ? settings.bindings : [];
  if (!bindings.length) throw new Error("production Worker has no bindings");

  const seen = new Set();
  const output = [];
  const replaced = new Set();

  for (const binding of bindings) {
    const name = String(binding?.name || "").trim();
    if (!name) throw new Error("every production binding must have a name");
    if (seen.has(name)) throw new Error(`duplicate production binding name: ${name}`);
    seen.add(name);

    if (TARGET_BINDINGS.includes(name)) {
      output.push(replacementBinding(binding, plan.cloudflare[name].entries));
      replaced.add(name);
    } else {
      output.push({
        name,
        type: "inherit",
      });
    }
  }

  for (const name of TARGET_BINDINGS) {
    if (!replaced.has(name)) throw new Error(`production binding is missing: ${name}`);
  }

  return {
    annotations: preservedAnnotations(settings, desiredFingerprint),
    bindings: output,
  };
}

function workerSettingsUrl(accountId, workerName) {
  const account = required(accountId, "CLOUDFLARE_ACCOUNT_ID");
  const worker = required(workerName, "CLOUDFLARE_WORKER_NAME");
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/workers/scripts/${encodeURIComponent(worker)}/settings`;
}

async function patchWorkerSettings({
  accountId,
  apiToken,
  workerName,
  settingsPatch,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== "function") throw new Error("fetch is unavailable");
  const token = required(apiToken, "CLOUDFLARE_API_TOKEN");

  const response = await fetchImpl(workerSettingsUrl(accountId, workerName), {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(settingsPatch),
  });

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
    throw new Error(`Cloudflare Worker settings patch failed: ${message}`);
  }

  return payload.result;
}

function parseCliArgs(argv) {
  let apply = false;
  let expectedCurrentFingerprint = "";

  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg.startsWith("--expect-current=")) {
      expectedCurrentFingerprint = arg.slice("--expect-current=".length).trim();
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  if (
    expectedCurrentFingerprint &&
    !/^[a-f0-9]{64}$/i.test(expectedCurrentFingerprint)
  ) {
    throw new Error("--expect-current must be a 64-character SHA-256 fingerprint");
  }

  return {
    apply,
    expectedCurrentFingerprint: expectedCurrentFingerprint.toLowerCase(),
  };
}

async function runModelBindingApply(options = {}) {
  const accountId = options.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = options.apiToken ?? process.env.CLOUDFLARE_API_TOKEN;
  const workerName = options.workerName ?? process.env.CLOUDFLARE_WORKER_NAME;
  const fetchImpl = options.fetchImpl;
  const registry = options.registry || loadRegistry();
  const plan = options.plan || buildModelDeploymentPlan(registry);

  const currentSettings =
    options.settings ||
    (await fetchWorkerSettings({
      accountId,
      apiToken,
      workerName,
      fetchImpl,
    }));

  const currentSnapshot = targetBindingSnapshot(currentSettings);
  const desiredSnapshot = desiredTargetSnapshot(currentSettings, plan);
  const currentFingerprint = fingerprintSnapshot(currentSnapshot);
  const desiredFingerprint = fingerprintSnapshot(desiredSnapshot);
  const diff = summarizeTargetDiff(currentSnapshot, desiredSnapshot);
  const noOp = currentFingerprint === desiredFingerprint;

  const summary = {
    schema: "yorubay-worker-model-binding-apply/v1",
    mode: options.apply ? "apply" : "dry-run",
    no_op: noOp,
    current_fingerprint: currentFingerprint,
    desired_fingerprint: desiredFingerprint,
    production_binding_count: Array.isArray(currentSettings?.bindings)
      ? currentSettings.bindings.length
      : 0,
    model_bindings: {
      MODELS_JSON: plan.cloudflare.MODELS_JSON.entries.length,
      MODELS_JSON_EXTRA: plan.cloudflare.MODELS_JSON_EXTRA.entries.length,
    },
    diff,
  };

  if (!options.apply || noOp) {
    return {
      ...summary,
      applied: false,
    };
  }

  const expected = String(options.expectedCurrentFingerprint || "").toLowerCase();
  if (!expected) {
    throw new Error(
      `apply requires --expect-current=${currentFingerprint} from a fresh dry-run`
    );
  }
  if (expected !== currentFingerprint) {
    throw new Error(
      `current fingerprint changed: expected ${expected}, got ${currentFingerprint}`
    );
  }

  const settingsPatch = buildSafeSettingsPatch(
    currentSettings,
    plan,
    desiredFingerprint
  );

  await patchWorkerSettings({
    accountId,
    apiToken,
    workerName,
    settingsPatch,
    fetchImpl,
  });

  const verifiedSettings = await fetchWorkerSettings({
    accountId,
    apiToken,
    workerName,
    fetchImpl,
  });
  const verifiedFingerprint = currentTargetFingerprint(verifiedSettings);

  if (verifiedFingerprint !== desiredFingerprint) {
    throw new Error(
      `post-apply fingerprint mismatch: expected ${desiredFingerprint}, got ${verifiedFingerprint}`
    );
  }

  const verification = compareProductionModelRegistry({
    settings: verifiedSettings,
    registry,
    rolloutEntries: options.rolloutEntries || loadRolloutEntries(),
  });

  if (!verification.ok) {
    throw new Error("post-apply production model registry audit failed");
  }

  return {
    ...summary,
    applied: true,
    verified_fingerprint: verifiedFingerprint,
    verified_ok: true,
  };
}

async function main() {
  const cli = parseCliArgs(process.argv.slice(2));
  const result = await runModelBindingApply({
    ...cli,
  });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  TARGET_BINDINGS,
  buildSafeSettingsPatch,
  canonical,
  currentTargetFingerprint,
  desiredTargetFingerprint,
  desiredTargetSnapshot,
  fingerprintSnapshot,
  parseCliArgs,
  patchWorkerSettings,
  preservedAnnotations,
  replacementBinding,
  runModelBindingApply,
  sortedEntries,
  summarizeTargetDiff,
  targetBindingSnapshot,
  workerSettingsUrl,
};
