const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_WORKER_DIRECTORY = path.join(
  __dirname,
  "../workers/bao-lab-credits-api"
);
const DEFAULT_WORKER_MANIFEST_PATH = path.join(
  DEFAULT_WORKER_DIRECTORY,
  "deployment-manifest.json"
);
const DEFAULT_MAIN_MODULE = "worker.js";
const WORKER_MANIFEST_SCHEMA_VERSION = 1;
const JAVASCRIPT_MODULE_TYPE = "application/javascript+module";

function required(value, name) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function workerContentUrl(accountId, workerName) {
  const account = required(accountId, "CLOUDFLARE_ACCOUNT_ID");
  const worker = required(workerName, "CLOUDFLARE_WORKER_NAME");

  if (!/^[a-f0-9]{32}$/i.test(account)) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID must be a 32-character hexadecimal ID");
  }

  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/i.test(worker)) {
    throw new Error("CLOUDFLARE_WORKER_NAME contains unsupported characters");
  }

  return (
    "https://api.cloudflare.com/client/v4/accounts/" +
    encodeURIComponent(account) +
    "/workers/scripts/" +
    encodeURIComponent(worker) +
    "/content"
  );
}

function validateWorkerSource(source) {
  const text = String(source || "");
  if (!text.trim()) throw new Error("Worker source is empty");
  if (!/export\s+default\s*\{/.test(text)) {
    throw new Error("Worker source is missing its module export");
  }
  return text;
}

function validateWorkerModuleName(name) {
  const normalized = String(name || "").trim();
  if (!normalized) throw new Error("Worker module name is required");
  if (normalized.length > 256) throw new Error("Worker module name is too long");
  if (
    !/^[a-z0-9][a-z0-9._/-]*$/i.test(normalized) ||
    normalized.toLowerCase() === "metadata" ||
    normalized.includes("//") ||
    normalized.split("/").some(segment => segment === "." || segment === "..")
  ) {
    throw new Error(`Worker module name is unsafe: ${normalized}`);
  }
  return normalized;
}

function parseWorkerModuleManifest(source) {
  let manifest;
  try {
    manifest = JSON.parse(String(source || ""));
  } catch (error) {
    throw new Error(`Worker deployment manifest is invalid JSON: ${error.message}`);
  }

  if (!manifest || Array.isArray(manifest) || typeof manifest !== "object") {
    throw new Error("Worker deployment manifest must be an object");
  }

  const allowedFields = new Set(["schema_version", "main_module", "modules"]);
  const unsupportedField = Object.keys(manifest).find(
    field => !allowedFields.has(field)
  );
  if (unsupportedField) {
    throw new Error(
      `Worker deployment manifest has unsupported field: ${unsupportedField}`
    );
  }

  if (manifest.schema_version !== WORKER_MANIFEST_SCHEMA_VERSION) {
    throw new Error(
      `Worker deployment manifest schema_version must be ${WORKER_MANIFEST_SCHEMA_VERSION}`
    );
  }

  const mainModule = validateWorkerModuleName(manifest.main_module);
  if (!Array.isArray(manifest.modules) || manifest.modules.length === 0) {
    throw new Error("Worker deployment manifest modules must be a non-empty array");
  }

  const seen = new Set();
  const modules = manifest.modules.map(moduleName => {
    if (typeof moduleName !== "string") {
      throw new Error("Worker deployment manifest module names must be strings");
    }
    const name = validateWorkerModuleName(moduleName);
    if (seen.has(name)) {
      throw new Error(`Duplicate Worker manifest module: ${name}`);
    }
    seen.add(name);
    return name;
  });

  if (!seen.has(mainModule)) {
    throw new Error(`Worker manifest main module is missing: ${mainModule}`);
  }

  modules.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return { mainModule, modules };
}

function isPathInside(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return (
    Boolean(relative) &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
}

function loadWorkerModuleManifest(manifestPath = DEFAULT_WORKER_MANIFEST_PATH) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const manifestDirectory = path.dirname(absoluteManifestPath);
  const manifest = parseWorkerModuleManifest(
    fs.readFileSync(absoluteManifestPath, "utf8")
  );
  const realManifestDirectory = fs.realpathSync(manifestDirectory);

  const modules = manifest.modules.map(name => {
    const modulePath = path.resolve(manifestDirectory, ...name.split("/"));
    if (!isPathInside(manifestDirectory, modulePath)) {
      throw new Error(`Worker manifest module escapes its directory: ${name}`);
    }

    let moduleInfo;
    try {
      moduleInfo = fs.lstatSync(modulePath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new Error(`Worker manifest module is missing: ${name}`);
      }
      throw error;
    }
    if (moduleInfo.isSymbolicLink() || !moduleInfo.isFile()) {
      throw new Error(`Worker manifest module must be a regular file: ${name}`);
    }

    const realModulePath = fs.realpathSync(modulePath);
    if (!isPathInside(realManifestDirectory, realModulePath)) {
      throw new Error(`Worker manifest module escapes its directory: ${name}`);
    }

    return {
      name,
      content: fs.readFileSync(realModulePath, "utf8"),
    };
  });

  return normalizeWorkerModules({
    mainModule: manifest.mainModule,
    modules,
  });
}

function normalizeWorkerModules({
  source,
  modules,
  mainModule = DEFAULT_MAIN_MODULE,
}) {
  const normalizedMainModule = validateWorkerModuleName(mainModule);
  if (source !== undefined && modules !== undefined) {
    throw new Error("Provide Worker source or modules, not both");
  }

  const inputModules = modules === undefined
    ? [{ name: normalizedMainModule, content: source }]
    : modules;
  if (!Array.isArray(inputModules) || inputModules.length === 0) {
    throw new Error("Worker module graph is empty");
  }

  const seen = new Set();
  const normalizedModules = inputModules.map(module => {
    const name = validateWorkerModuleName(module?.name);
    if (seen.has(name)) throw new Error(`Duplicate Worker module: ${name}`);
    seen.add(name);

    const content = String(module?.content ?? "");
    if (!content.trim()) throw new Error(`Worker module is empty: ${name}`);

    return {
      name,
      content,
      contentType: JAVASCRIPT_MODULE_TYPE,
    };
  });

  const main = normalizedModules.find(module => module.name === normalizedMainModule);
  if (!main) {
    throw new Error(`Worker main module is missing: ${normalizedMainModule}`);
  }
  validateWorkerSource(main.content);

  return {
    mainModule: normalizedMainModule,
    modules: normalizedModules,
  };
}

function buildWorkerUploadBody(options) {
  const graph = normalizeWorkerModules(options);
  const body = new FormData();
  body.append(
    "metadata",
    JSON.stringify({ main_module: graph.mainModule })
  );
  for (const module of graph.modules) {
    body.append(
      module.name,
      new Blob([module.content], { type: module.contentType }),
      module.name
    );
  }
  return body;
}

async function deployWorkerContent({
  accountId,
  apiToken,
  workerName,
  source,
  modules,
  mainModule = DEFAULT_MAIN_MODULE,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is unavailable");
  }

  const token = required(apiToken, "CLOUDFLARE_API_TOKEN");
  const body = buildWorkerUploadBody({ source, modules, mainModule });

  const response = await fetchImpl(
    workerContentUrl(accountId, workerName),
    {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
      },
      body,
    }
  );

  const responseText = await response.text();
  let payload = null;
  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.success === false) {
    const message =
      payload?.errors?.map(error => error?.message).filter(Boolean).join("; ") ||
      responseText.slice(0, 500) ||
      `HTTP ${response.status}`;
    throw new Error(`Cloudflare content deployment failed: ${message}`);
  }

  return {
    status: response.status,
    etag: String(payload?.result?.etag || ""),
  };
}

async function main() {
  const explicitWorkerPath = String(
    process.env.YORUBAY_WORKER_PATH || ""
  ).trim();
  const explicitManifestPath = String(
    process.env.YORUBAY_WORKER_MANIFEST || ""
  ).trim();
  const deploymentInput = explicitWorkerPath
    ? {
        source: fs.readFileSync(path.resolve(explicitWorkerPath), "utf8"),
        mainModule: DEFAULT_MAIN_MODULE,
      }
    : loadWorkerModuleManifest(
        path.resolve(explicitManifestPath || DEFAULT_WORKER_MANIFEST_PATH)
      );
  const result = await deployWorkerContent({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    workerName: process.env.CLOUDFLARE_WORKER_NAME,
    ...deploymentInput,
  });

  console.log(
    `Cloudflare Worker content deployed successfully (HTTP ${result.status})`
  );
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  buildWorkerUploadBody,
  deployWorkerContent,
  loadWorkerModuleManifest,
  normalizeWorkerModules,
  parseWorkerModuleManifest,
  validateWorkerModuleName,
  validateWorkerSource,
  workerContentUrl,
};
