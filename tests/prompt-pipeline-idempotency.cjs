const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const cache = fs.readFileSync(path.join(root, "js/prompt-cache.js"), "utf8");
const orchestrator = fs.readFileSync(path.join(root, "js/prompt-orchestrator.js"), "utf8");

assert.match(
  cache,
  /if \(window\.BAOPromptCache \|\| typeof App === "undefined" \|\| typeof Chat === "undefined"\) return;/,
  "prompt-cache must refuse duplicate installation"
);
assert.match(cache, /window\.BAOPromptCache\s*=\s*\{/);
assert.match(cache, /App\.buildMessages\s*=\s*async function/);
assert.match(cache, /App\.applyProviderContext\s*=\s*function/);

assert.match(
  orchestrator,
  /if \(window\.BAOPromptOrchestrator \|\| typeof App === "undefined"\) return;/,
  "prompt-orchestrator must refuse duplicate installation"
);
assert.match(orchestrator, /App\.__promptOrchestratorPatched/);
assert.match(orchestrator, /window\.BAOPromptOrchestrator\s*=\s*\{/);

console.log("prompt-pipeline-idempotency: prompt modules install once");
