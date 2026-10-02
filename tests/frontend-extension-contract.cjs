const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const index = read("index.html");
const siteUI = read("js/site-ui.js");
const bridge = read("js/global-bridge.js");
const helper = read("js/helper-api-routing.js");
const repairs = read("js/state-tracker-repairs.js");

const position = (source, token, label = token) => {
  const value = source.indexOf(token);
  assert.ok(value >= 0, `missing ${label}`);
  return value;
};

const increasing = (source, tokens, label) => {
  let previous = -1;
  for (const token of tokens) {
    const current = position(source, token, `${label}: ${token}`);
    assert.ok(current > previous, `${label} order changed around ${token}`);
    previous = current;
  }
};

// Base globals must exist before site-ui starts its asynchronous extension chains.
increasing(index, [
  'src="js/storage.js"',
  'src="js/state.js"',
  'src="js/api.js"',
  'src="js/helper-data.js"',
  'src="js/chat.js"',
  'src="js/character.js"',
  'src="js/app.js"',
  'src="js/site-ui.js'
], "core script");

// World-state chain: the bridge must install its guards before world modules.
increasing(siteUI, [
  'loadBAOScript("js/global-bridge.js")',
  'loadBAOScript("js/world-state.js")',
  'loadBAOScript("js/character-status.js?v=2")',
  'loadBAOScript("js/world-modules.js")',
  'loadBAOScript("js/world-state-hook.js")'
], "world-state extension");

// Story chain: story-tools is installed before prompt/cache orchestration and request lifecycle.
increasing(siteUI, [
  'loadBAOScript("js/storage-write-guard.js?v=2")',
  'loadBAOScript("js/story-tools.js?v=3")',
  'loadBAOScript("js/prompt-cache.js")',
  'loadBAOScript("js/prompt-orchestrator.js")',
  'loadBAOScript("js/streaming-ui.js")',
  'loadBAOScript("js/request-lifecycle.js")'
], "story extension");

// Modules without their own global idempotency guard currently rely on the loader;
// protect against accidentally adding a second loader while the wrapper design is unchanged.
assert.equal(
  siteUI.split('loadBAOScript("js/world-modules.js")').length - 1,
  1,
  "world-modules must be loaded exactly once by site-ui"
);
assert.equal(
  siteUI.split('loadBAOScript("js/story-tools.js?v=3")').length - 1,
  1,
  "story-tools must be loaded exactly once by site-ui"
);

// API / Chat wrappers that can be re-evaluated must keep their idempotency guards.
assert.match(bridge, /!Chat\.__baoContextPresentationGuard/);
assert.match(bridge, /Chat\.__baoContextPresentationGuard\s*=\s*true/);
assert.match(bridge, /!API\.__baoMemoryPresentationGuard/);
assert.match(bridge, /API\.__baoMemoryPresentationGuard\s*=\s*true/);
assert.match(bridge, /const originalSend\s*=\s*API\.send\.bind\(API\)/);
assert.match(bridge, /return originalSend\(config, cleaned, \.\.\.rest\)/);

assert.match(helper, /API\.__helperRoutePatched/);
assert.match(helper, /API\.__helperRoutePatched\s*=\s*true/);
assert.match(helper, /const originalSend\s*=\s*API\.send\.bind\(API\)/);
assert.match(helper, /return originalSend\(effective, messages\)/);

assert.match(repairs, /window\.BAOStateTrackerRepairs/);
assert.match(repairs, /const oldSend\s*=\s*API\.send\.bind\(API\)/);
assert.match(repairs, /return await oldSend\(config, guarded\)/);
assert.match(repairs, /window\.BAOStateTrackerRepairs\s*=\s*\{/);

console.log("frontend-extension-contract: load order and wrapper guards ok");
