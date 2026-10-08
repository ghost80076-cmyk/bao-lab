const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const cost = fs.readFileSync(path.join(root, "js/cost-control.js"), "utf8");
const routing = fs.readFileSync(path.join(root, "js/model-routing.js"), "utf8");

assert.match(
  cost,
  /if \(window\.BAOCostControl\) return;/,
  "cost-control must refuse duplicate installation"
);
assert.match(cost, /window\.BAOCostControl\s*=\s*\{/);
assert.match(cost, /API\.__budgetPatched/);

assert.match(
  routing,
  /if \(window\.BAOModelRouting \|\| typeof App === "undefined"\) return;/,
  "model-routing must refuse duplicate installation"
);
assert.match(
  routing,
  /window\.BAOModelRouting\s*=\s*Object\.freeze\(\{ installed: true \}\)/,
  "model-routing must publish an installation marker"
);
assert.match(routing, /App\.__providerHintPatched/);
assert.match(routing, /loadExtra\("js\/helper-api-routing\.js\?v=\d+"\)/);

console.log("control-routing-idempotency: control modules install once");
