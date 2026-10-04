const path = require("node:path");

const {
  loadWorkerModuleManifest,
} = require("../../scripts/deploy-worker-content.cjs");

const WORKER_DIRECTORY = path.join(
  __dirname,
  "../../workers/bao-lab-credits-api"
);

function removeModuleSyntax(source) {
  return source
    .replace(
      /^import\s+\{[\s\S]*?\}\s+from\s+["'][^"']+["'];\s*$/gm,
      ""
    )
    .replace(/^export\s+\{[\s\S]*?\};\s*$/gm, "")
    .replace(/^export\s+(?=(?:const|function|class)\b)/gm, "");
}

function loadWorkerTestSource() {
  const graph = loadWorkerModuleManifest(
    path.join(WORKER_DIRECTORY, "deployment-manifest.json")
  );
  const mainModule = graph.modules.find(
    module => module.name === graph.mainModule
  );
  const dependencyModules = graph.modules.filter(
    module => module.name !== graph.mainModule
  );

  return [
    ...dependencyModules.map(module => removeModuleSyntax(module.content)),
    removeModuleSyntax(mainModule.content),
  ].join("\n");
}

module.exports = { loadWorkerTestSource };
