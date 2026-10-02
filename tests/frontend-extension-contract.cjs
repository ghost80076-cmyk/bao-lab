const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const index = read("index.html");
const siteUI = read("js/site-ui.js");
const appSource = read("js/app.js");
const bridge = read("js/global-bridge.js");
const helper = read("js/helper-api-routing.js");
const repairs = read("js/state-tracker-repairs.js");
const storyTools = read("js/story-tools.js");

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
assert.match(bridge, /API\.wrapSend\("global-bridge:memory-presentation", memoryPresentationWrapper\)/);
assert.match(bridge, /return next\(config, cleaned, \.\.\.rest\)/);

assert.match(helper, /API\.__helperRoutePatched/);
assert.match(helper, /API\.__helperRoutePatched\s*=\s*true/);
assert.match(helper, /API\.wrapSend\("helper-api-routing:route", helperRouteWrapper\)/);
assert.match(helper, /return next\(effective, messages, \.\.\.rest\)/);

assert.match(repairs, /window\.BAOStateTrackerRepairs/);
assert.match(repairs, /API\.wrapSend\('state-tracker-repairs:presence-guard', stateTrackerWrapper\)/);
assert.match(repairs, /return await next\(config, guarded, \.\.\.rest\)/);
assert.match(repairs, /App\.wrapRenderChatShell\("state-tracker-repairs:schema", stateShellWrapper\)/);
assert.match(repairs, /return next\(\.\.\.args\)/);
assert.match(repairs, /App\.wrapRenderUIPanel\("state-tracker-repairs:decorate", statePanelWrapper\)/);
assert.match(repairs, /if \(panel === 'npc'\) \{ decorateNPCPresence\(\); return result; \}/);
assert.match(repairs, /window\.BAOStateTrackerRepairs\s*=\s*\{/);

assert.match(storyTools, /App\.wrapRenderChatShell\("story-tools:inject", storyToolsShellWrapper\)/);
assert.match(storyTools, /next\(fresh\)/);
assert.match(storyTools, /setTimeout\(inject, 0\)/);
assert.match(storyTools, /App\.wrapBuildSystemPrompt\("story-tools:context-pack", contextPackPromptWrapper\)/);
assert.match(storyTools, /return pack\?\.playerConfirmed \? base \+ "\\n\\n" \+ packPrompt\(pack\) : base;/);


// Additional wrappers currently participating in API.send / App.sendMessage.
const costControl = read("js/cost-control.js");
const promptCache = read("js/prompt-cache.js");
const promptOrchestrator = read("js/prompt-orchestrator.js");
const sameModelStateMerge = read("js/same-model-state-merge.js");
const streamingUI = read("js/streaming-ui.js");
const creditsPilot = read("js/credits-pilot.js");
const requestLifecycle = read("js/request-lifecycle.js");
const worldStateHook = read("js/world-state-hook.js");
const chatAPISettings = read("js/chat-api-settings.js");
const modelRouting = read("js/model-routing.js");

assert.match(costControl, /API\.__budgetPatched/);
assert.match(costControl, /API\.__budgetPatched\s*=\s*true/);
assert.match(costControl, /const original\s*=\s*API\.send\.bind\(API\)/);

assert.match(promptCache, /Chat\.__memoryRequestGuardPatched/);
assert.match(promptCache, /Chat\.__memoryRequestGuardPatched\s*=\s*true/);
assert.match(promptCache, /API\.wrapSend\("prompt-cache:memory-request-guard", memoryRequestWrapper\)/);
assert.match(promptCache, /return await next\(\{ \.\.\.config, signal: controller\.signal \}, messages, \.\.\.rest\)/);

assert.match(promptOrchestrator, /App\.wrapBuildMessages\("prompt-orchestrator:rules", orchestratorWrapper\)/);
assert.match(promptOrchestrator, /const messages = await next\(config\)/);
assert.match(promptOrchestrator, /App\.__promptOrchestratorPatched\s*=\s*true/);

assert.match(sameModelStateMerge, /window\.BAOSameModelStateMerge/);
assert.match(sameModelStateMerge, /API\.wrapSend\('same-model-state-merge:main-story', sameModelStateWrapper\)/);
assert.match(sameModelStateMerge, /const result = await next\(effective, prepared, \.\.\.rest\)/);
assert.match(sameModelStateMerge, /window\.BAOSameModelStateMerge\s*=\s*\{/);

assert.match(appSource, /wrapSendMessage\(id, wrapper\)/);
assert.match(appSource, /wrapRenderChatShell\(id, wrapper\)/);
assert.match(appSource, /wrapRenderUIPanel\(id, wrapper\)/);
assert.match(appSource, /wrapBuildSystemPrompt\(id, wrapper\)/);
assert.match(appSource, /wrapBuildMessages\(id, wrapper\)/);
assert.match(streamingUI, /API\.__streamingUIPatched/);
assert.match(streamingUI, /API\.__streamingUIPatched\s*=\s*true/);
assert.match(streamingUI, /API\.wrapSend\("streaming-ui:main-story", streamingWrapper\)/);
assert.match(streamingUI, /return await next\(\{ \.\.\.config, stream: true, onDelta \}, messages, \.\.\.rest\)/);
assert.match(streamingUI, /App\.wrapSendMessage\("streaming-ui:committed-paint", committedPaintWrapper\)/);
assert.match(streamingUI, /App\.wrapRenderChatShell\("streaming-ui:committed-paint", shellCommittedPaintWrapper\)/);
assert.match(streamingUI, /const result = next\(\.\.\.args\)/);

assert.match(creditsPilot, /window\.BAOCreditsPilot/);
assert.match(creditsPilot, /API\.wrapSend\("credits-pilot:hosted-transport", hostedCreditsWrapper\)/);
assert.match(creditsPilot, /return next\(config, messages, \.\.\.rest\)/);
assert.match(creditsPilot, /window\.BAOCreditsPilot\s*=\s*Object\.freeze\(\{/);

assert.match(requestLifecycle, /App\.__requestLifecyclePatched/);
assert.match(requestLifecycle, /App\.__requestLifecyclePatched\s*=\s*true/);
assert.match(requestLifecycle, /App\.wrapSendMessage\("request-lifecycle:pending", requestLifecycleWrapper\)/);
assert.match(requestLifecycle, /return await next\(\.\.\.args\)/);

assert.match(worldStateHook, /App\.__worldStateHooked/);
assert.match(worldStateHook, /App\.__worldStateHooked\s*=\s*true/);
assert.match(worldStateHook, /App\.wrapSendMessage\("world-state-hook:after-turn", worldStateWrapper\)/);
assert.match(worldStateHook, /await next\(\)/);

assert.match(chatAPISettings, /window\.BAOChatAPISettings/);
assert.match(chatAPISettings, /App\.wrapSendMessage\("chat-api-settings:connection-gate", sendGateWrapper\)/);
assert.match(chatAPISettings, /return next\(\.\.\.args\)/);
assert.match(chatAPISettings, /App\.wrapRenderChatShell\("chat-api-settings:entries", chatApiShellWrapper\)/);
assert.match(chatAPISettings, /const result = next\(\.\.\.args\)/);
assert.match(chatAPISettings, /window\.BAOChatAPISettings\s*=\s*\{/);

assert.match(
  modelRouting,
  /loadExtra\("js\/helper-api-routing\.js\?v=3"\)/,
  "model-routing must continue to load helper-api-routing"
);
assert.match(
  worldStateHook,
  /'js\/state-tracker-repairs\.js'/,
  "world-state-hook must continue to load state-tracker-repairs"
);

console.log("frontend-extension-contract: load order and wrapper guards ok");
