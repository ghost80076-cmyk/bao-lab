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
| `js/helper-api-routing.js` | Redirects helper tasks such as memory/state work to configured helper routes. |
| `js/state-tracker-repairs.js` | Intercepts state-related requests and compatibility behavior. |
| `js/api.js` | Owns the underlying provider request / retry / stream behavior. |

Risk: behavior depends on wrapper installation order. A future refactor should expose an explicit request pipeline instead of repeated reassignment of `API.send`.

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
│  ├─ helper-api-routing helper-model routing
│  └─ state-tracker-repairs state compatibility
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
