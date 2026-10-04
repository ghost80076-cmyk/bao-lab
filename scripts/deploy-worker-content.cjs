const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_WORKER_PATH = path.join(
  __dirname,
  "../workers/bao-lab-credits-api/worker.js"
);
const DEFAULT_MAIN_MODULE = "worker.js";
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
  const workerPath = path.resolve(
    process.env.YORUBAY_WORKER_PATH || DEFAULT_WORKER_PATH
  );
  const source = fs.readFileSync(workerPath, "utf8");
  const result = await deployWorkerContent({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    workerName: process.env.CLOUDFLARE_WORKER_NAME,
    source,
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
  normalizeWorkerModules,
  validateWorkerModuleName,
  validateWorkerSource,
  workerContentUrl,
};
