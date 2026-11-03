# Manual note knowledge scope

Baseline: main `4da1a31590657b146377334c7a8d5f07efced3f6` (#925).

## Problem and behavior

Enabled long-term notes previously entered the story prompt without checking a role audience, and the editor rebuilt note objects using only id/title/text/enabled. Permission metadata supplied by imports or future tools was ignored during recall and removed by edits.

Each note now has an optional `knowledge_scope` (`shared` or `actors`) and `known_by` list. Existing notes without scope remain shared. The existing workbench card adds an expandable, labelled scope selector and actor-name field. Shared scope is an explicit player choice; previously entered names may remain stored while that scope is selected. No migration rewrites old notes simply by opening the desk.

`BAOMemoryWorkbench.promptSlots()` is the common selector for real story prompts and the Context preview. Actor-only notes require an active story and the existing episodic audience/canRead resolver: formal names and unambiguous registered aliases, all current speakers authorized, world titles excluded, no private data for an empty/ambiguous/oversized audience. An empty or over-30 allowlist is not loaded; the UI explains this. Invalid explicit scope values do not become shared. Missing newer workbench/resolver capabilities fail closed for private notes.

The editor preserves scope, actor names and unrelated future note metadata when titles or text change. AI overwrites retain an existing target's permission metadata. AI-created new notes start actor-only with no audience, visibly awaiting a player scope decision; free text is not used to guess an audience. Manual new notes retain the existing shared default. AI writes and manual edit/delete/add/scope actions from a desk belonging to another story are rejected before changing anything. Closing that stale desk also cancels its pending save without saving the newly selected story.

Selected notes also receive the existing narrative knowledge guard from #925. Permissions apply to the particular note; an independent copy of the same fact in raw dialogue, old summaries, Context Packs or another shared source is not removed. This is not a global guarantee that a model cannot learn a secret from other sources. Explicit AI maintenance using “all dialogue + notes” still reads the player-selected source as a data task; the role gate applies to story recall, not to hiding data from an explicitly requested organizer.

The existing text-based prompt partitioner remains unchanged. Arbitrary headings inside authorized note text may affect its cache classification. Permission filtering precedes serialization; tests include embedded headings and prove denied notes cannot reappear in a different prompt section.

## Interface and compatibility

Existing workbench layout, theme tokens, focus trap, Escape/return focus, local-first saves and API boundaries remain. New controls use the existing theme palette and at least 44px targets. Context preview uses the same role selection as the actual prompt. Stored version/schema numbers do not change; fields are additive and travel through existing story/JSON backups.

No worker, AWS, provider routing, wallet or database migration change. No model request is added. Old application versions ignore these additive permissions, so rolling back can restore the former all-enabled-notes behavior; scoped notes must be treated accordingly during a rollback.

## Evidence

- `tests/manual-memory-knowledge-core.cjs` loads actual App, Chat, player settings, workbench, episodic core, story tools and prompt-cache implementations. It verifies final request contents, shared legacy behavior, private scope, alias ambiguity, present/absent/mixed/world/oversized cast, unknown/over-limit permissions, read-only selection, JSON reload, missing-module fallbacks, Context preview and AI overwrite/new/stale-story actions. Baseline source fails because excluded note content still reaches the prompt.
- `tests/e2e/memory-workbench-theme.spec.cjs` checks scope-control colors across four site palettes, and adds 390px/1280px editing, alias access, mixed-cast denial, empty audience, metadata retention, Escape, geometry, screenshots and actual Storage payload/restore cases.
- Local regression-impact gate: 37 suites pass. Existing AI workbench persistence and send-hook tests also pass. Core tests and the memory impact group include the new regression; player-settings source is now explicitly mapped to memory impact. Runtime JavaScript and browser tests pass syntax/whitespace checks.
- Remote CI, browser results and screenshot review are recorded in the PR. No paid live-model or physical-device verification is implied.

## Rollback

Revert this PR and its asset versions; no save migration needs reversal. Existing note text and unrelated data are preserved. Prior code does not enforce the added note permissions, which is a material rollback limitation.
