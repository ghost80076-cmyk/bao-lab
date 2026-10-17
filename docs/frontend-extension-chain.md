# Frontend extension chain

This document maps the current behavior-extension chain around the core `App`, `Chat`, `API` and `GameState` objects.

The purpose is to make future refactors behavior-preserving. It does **not** change runtime code.

## Core ownership

### `js/app.js`

The base `App` object still owns the primary player flow:

- app startup and catalog/model loading;
- character selection and builder entry;
- story start / resume;
- chat shell rendering;
- message send flow;
- base system prompt;
- save / restore UI transitions.

The current send path is broadly:

```text
player input
  -> App.sendMessage
  -> App.buildMessages (when installed) or base system/context
  -> App.applyProviderContext (when installed)
  -> API.send
  -> Chat.add
  -> GameState / memory / save hooks
```

## Known method wrapping

### `API.send`

The following modules currently participate in or wrap the transport path:

| Module | Purpose |
| --- | --- |
| `js/global-bridge.js` | Sanitizes memory-task request copies without mutating stored/displayed messages. |
| `js/credits-pilot.js` | Handles YoruBay-hosted account transport and hosted-context adaptation. |
| `js/cost-control.js` | Applies budget/output caps and usage-cost accounting around requests. |
| `js/helper-api-routing.js` | Redirects helper tasks such as memory/state work to configured helper routes. |
| `js/same-model-state-merge.js` | Merges eligible world/state output into the main story request. |
| `js/prompt-cache.js` | Guards memory-summary requests and cache-aware prompt behavior. |
| `js/state-tracker-repairs.js` | Intercepts state-related requests and compatibility behavior. |
| `js/streaming-ui.js` | Adds main-story streaming/preview behavior around the transport call. |
| `js/api.js` | Owns the underlying provider request / retry / stream behavior. |

Risk: behavior depends on wrapper installation order. A future refactor should expose an explicit request pipeline instead of repeated reassignment of `API.send`.

### `App.sendMessage`

The send-message path is also wrapped by several modules:

| Module | Purpose |
| --- | --- |
| `js/chat-api-settings.js` | Prevents sends when the active story connection is incomplete and opens the connection UI. |
| `js/world-state-hook.js` | Runs world/state follow-up work after the base story turn. |
| `js/streaming-ui.js` | Coordinates pending/streaming UI state around the send. |
| `js/request-lifecycle.js` | Owns request cancellation and in-flight request lifecycle state. |

These wrappers are loaded in different extension chains. Their relative timing must not be assumed unless the loader explicitly guarantees it.

### `Chat.context`

`js/global-bridge.js` wraps `Chat.context` so copies sent to models can be cleaned without changing `Chat.messages` used for display, editing or backups.

This behavior is important and must remain before/inside prompt assembly after refactor.

### `App.renderChatShell`

Known wrappers/extensions include:

| Module | Purpose |
| --- | --- |
| `js/state-tracker-repairs.js` | Restores/decorates state-related UI after the base shell renders. |
| `js/story-tools.js` | Adds story-tool behavior after the base chat shell renders. |

Risk: both features assume the base shell has already been created.

### `App.renderUIPanel`

`js/state-tracker-repairs.js` wraps this to repaint or decorate state UI after existing handlers complete.

### `App.openCharacter`

`js/state-tracker-repairs.js` wraps character opening to ensure state schema installation for relevant cards.

### `App.buildSystemPrompt`

`js/story-tools.js` extends the base system prompt. This means prompt behavior is currently split between the base App and later-installed modules.

### `GameState.create` / `GameState.applyUpdate`

`js/world-modules.js` wraps these methods to initialize and synchronize modular world-state data.

This is stateful and must not be refactored in the same PR as chat transport or account work.

## Current dependency shape

```text
App (base UI / story flow)
├─ Chat
│  └─ Chat.context
│     └─ global-bridge sanitation
│
├─ API.send
│  ├─ global-bridge memory sanitation
│  ├─ credits-pilot hosted transport
│  ├─ cost-control budget / usage caps
│  ├─ helper-api-routing helper-model routing
│  ├─ same-model-state-merge state coalescing
│  ├─ prompt-cache memory request guard
│  ├─ state-tracker-repairs state compatibility
│  └─ streaming-ui main-story streaming
│
├─ App.sendMessage
│  ├─ chat-api-settings connection readiness
│  ├─ world-state-hook after-turn state update
│  ├─ streaming-ui pending/paint coordination
│  └─ request-lifecycle cancellation / in-flight state
│
├─ App.renderChatShell
│  ├─ state-tracker-repairs
│  └─ story-tools
│
├─ App.buildSystemPrompt
│  └─ story-tools
│
└─ GameState
   ├─ world-modules create hook
   └─ world-modules update hook
```

The diagram is conceptual. Actual behavior still depends on script load order and the wrapper each module captures as its "original" function.

## Indirect loader relationships

Not every wrapper appears directly in `site-ui.js`.

- `site-ui.js` loads `model-routing.js`; `model-routing.js` dynamically loads `helper-api-routing.js?v=3`.
- `site-ui.js` loads `world-state-hook.js`; `world-state-hook.js` dynamically loads `state-tracker-repairs.js`.
- `global-bridge.js` dynamically loads `credits-pilot.js`.
- `site-ui.js` loads `story-tools.js`, then `prompt-cache.js`, `prompt-orchestrator.js`, `streaming-ui.js`, and `request-lifecycle.js` in one sequential story chain.
- `site-ui.js` loads `global-bridge.js`, `world-modules.js`, `same-model-state-merge.js`, and `world-state-hook.js` in the world-state chain.
- `cost-control.js` belongs to a separate provider/control chain and therefore should not depend on the story-chain finishing first.

Because several chains begin from the same `DOMContentLoaded` handler, cross-chain ordering is not guaranteed. Future pipeline work should remove those hidden timing assumptions instead of relying on them.

## Refactor target

Do not replace all wrappers at once.

The safe target is an explicit pipeline such as:

```text
player input
  -> input normalization
  -> context assembly
  -> memory injection
  -> world/status injection
  -> prompt rules
  -> helper-route selection
  -> provider request
  -> response processing
  -> state/memory after-turn hooks
  -> persistence/UI refresh
```

Each stage should have one defined interface and ordered registration rather than overwriting another module's function.

## Safe migration order

1. Inventory wrapper installation order in the actual script loader.
2. Add regression tests for the current order before changing it.
3. Introduce a small hook/pipeline registry without moving behavior.
4. Migrate one wrapper family at a time.
5. Remove direct method reassignment only after equivalent tests pass.

Recommended first candidate: `API.send`, because transport routing and helper-task routing already have clear boundaries.

Recommended last candidates: `App.renderChatShell` and `GameState`, because they touch visible UI and story-state continuity.

## Non-negotiable compatibility rules

A structural refactor must not change:

- stored `Chat.messages`;
- backup/import formats;
- story resume behavior;
- helper-model selection semantics;
- provider routing;
- memory-task and state-task isolation;
- world-state initialization;
- visible chat rendering;
- mobile/desktop story entry behavior.

Structural cleanup and player-facing UX changes should stay in separate PRs.

## AI request pipeline foundation (2026-10-17)

`API.wrapSend` now composes named stage snapshots rather than an opaque chain of
captured wrappers. The interface and execution order remain compatible: the most
recently registered stage enters first and exits last. Each snapshot closes over
its terminal and stage list, so retained send functions and in-flight requests do
not pick up later registrations.

This is the first migration step, **not** a fixed global phase order. Existing
modules still register in loader order. Direct `API.send` assignments start a new
segment on the next registration. Its terminal captures the legacy function once;
reusing a mutable global dispatcher there would recurse through the function the
legacy module captured earlier.

`API.inspectSendPipeline()` returns only stage IDs:

- `activeSegment`: execution order in the most recent segment, if it is still the
  public send function;
- `registered`: all IDs accepted through `wrapSend`, in registration order;
- `legacyWrapperOnTop`: whether a direct assignment replaced that segment.

The terminal may contain earlier segments and legacy behavior. This inspection is
not a complete trace of the request, and intentionally contains no messages,
connection settings, keys, or executable functions.

Regression coverage: `tests/api-send-pipeline-core.cjs` exercises retained
snapshots, concurrent registration, legacy interleaving, duplicate IDs, error and
response identity, short circuits, and the real memory sanitation/helper routing
modules in both installation orders. It runs in Core tests alongside existing
provider, retry, streaming and wrapper contracts.

### Remaining migration queue

| Priority | Work | Acceptance gate |
| --- | --- | --- |
| P0 | Provider/hosted routing and cost accounting | Provider contracts, no additional hosted retry or usage settlement, task isolation |
| P0 | Local storage and backup baseline | Existing migration, backup recovery and credential sanitation tests |
| P1 | Move remaining direct send assignments into named registrations | Preserve captured-send behavior; test each wrapper before migration |
| P1 | Define explicit phase dependencies across loader chains | Test routing before the affected transport/budget stages under alternate load orders |
| P1 | Memory/world/state after-turn ownership | Same-model state merge and separate helper concurrency contracts |
| P2 | UI/CSS and CI duplication | Separate from request transport changes |

Additional direct-send owners to inventory before changing global order include
`status-usage-integrity.js`,
`story-revision-state.js`, and `lm-studio.js`. The earlier table is a conceptual
map, not an exhaustive ordering specification. `world-module-ui.js` also registers
a named internal-state echo stage. Do not infer global phase order from these
lists.

Next PRs should migrate one direct owner at a time, then introduce explicit phase
ordering only after combined hosted/helper/cost and streaming tests establish the
required dependencies. Keep `GameState`, backup formats and player-facing UX out
of those structural PRs.


### Chat usage observer migration (2026-10-17)

`chat.js` now registers `chat:request-usage` through `API.wrapSend`, with a
fallback for older cached API code. Installation timing and the existing
`__baoUsageWrapped` guard remain unchanged. This observer still records only
successful, non-diagnostic requests; helper categories do not replace the main
story's context-budget usage. Hosted results already recorded by the transport
continue to use the existing idempotent ledger marker.

`tests/chat-usage-pipeline-core.cjs` first established the behavior on the old
wrapper, then verifies named installation, repeated initialization, all helper
categories, hosted actual charges without double counting, missing usage,
transport failures, cancellation, overlapping requests and the legacy fallback.
It runs in Core tests. Remaining direct-send owners above are still separate
migration work; this change does not impose global stage ordering.


### Reading position observer migration (2026-10-17)

`chat-reading-scroll.js` now registers its API observer as
`chat-reading-scroll:before-commit`. Its existing `finally` still captures the
active main turn's reading position immediately before App commits a response,
including failed or cancelled requests. Memory, state, story tools, auxiliary
requests and connection diagnostics cannot replace that snapshot. The
`App.sendMessage` adapter remains unchanged and is outside this API migration.
An older cached API still uses the legacy fallback with its original receiver.

`tests/chat-reading-pipeline-core.cjs` established the old behavior before the
migration. It covers main/helper completion interleaving, errors and cancellation,
placeholder cleanup, extra arguments and duplicate installation through both the
named pipeline and fallback. The existing reading test continues to cover the
player anchor, manually changed scroll position and empty input. Both tests run
in the reading workflow, whose production check requires the named observer and
versioned controller loader.
