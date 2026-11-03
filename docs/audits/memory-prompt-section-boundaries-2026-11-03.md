# Memory data boundaries in prompt partitioning

Baseline: main `91c38ea4c1db843a3b90022f9567e95966384fb5` (#927).

## Finding and behavior

The cache assembler split the complete system prompt on blank-line `【heading】` patterns. A second manual note title, a heading in a note/Context Pack, or a heading inside core/relevant Canon could be reclassified independently of its actual source. Unknown headings became stable system text; names matching other platform headers could move pieces between memory and the dynamic user block. Editing narrative data could therefore invalidate the stable prefix or give relevant data a different message placement. The existing per-role selector still ran first; this was not evidence that a denied note bypassed that selector.

Manual notes, confirmed Context Pack data, and selected Canon now append through a transient typed-section helper. The producer specifies memory or dynamic placement and records the exact UTF-16 range in its resulting prefix. The assembler captures those records only while synchronously building the actual request. Each prefix must occur exactly once in the final prompt, and the resulting ranges cannot overlap. Inner headings are treated as data. Independent trusted platform blocks outside these ranges continue through the existing classifier. No tokens, delimiters or opaque placeholders enter a model request or a readable `buildSystemPrompt()` preview.

Outer wrappers may prepend/append trusted text without changing the section proof. If an outer wrapper rewrites or duplicates a registered prefix so the proof is unavailable/ambiguous, retain the complete prompt in a system-memory message, leaving the stable part empty, instead of guessing or deleting data. This conservative fallback can reduce cache reuse; it adds no model request. Nested captures and exceptions restore the parent collector and cannot retain another story's metadata. The collector is not persisted or retained across asynchronous requests.

The shared narrative knowledge guard remains outside opaque data and in the stable system prefix. Pack preview/export text remains readable and unchanged. Draft Pack confirmation and Canon/manual-note role filtering still run before registration. Old/mixed-cache callers without the new helper retain their previous plain-string behavior; runtime asset and parent loader versions advance together. The old `partitionSystemPrompt(string)` API remains available as a best-effort legacy text classifier; actual request assembly uses the captured producer boundaries.

## Scope and compatibility

This explicitly covers manual-note bodies/titles, confirmed Context Pack fields, and core/relevant Canon data. It does not infer per-sentence audiences for old free-text summaries, add semantic embeddings, rewrite saved narrative data, sanitize prose into instructions, or claim general model prompt-injection immunity. Automatic Chat summaries already arrive as separate context system messages and are not split by this parser. Other unannotated platform producers retain their existing text-classification contract.

No story/config/schema migration, local storage rewrite, extra summary/retrieval/model call, Worker/AWS/provider routing/wallet change, or visual layout change. Connected domains include memory/summary/Pack/Canon, per-role scope, request construction/cache prefixes, revision/rollback/status ownership and local save/backup compatibility. Revert the runtime and loader changes to restore prior classification; no persisted data needs reversal. Reverting restores the original heading-classification defect.

## Verification

- `tests/memory-prompt-sections-core.cjs` loads real App/Chat/player settings/workbench/Pack/Canon/cache implementations. Baseline fails with note/Pack/Canon data in the stable prefix. The revised source passes embedded fixed/memory/dynamic headings, multiple notes, Unicode, stable-prefix equality after data edits, exact intact data placement, mixed-cast denial, unconfirmed Pack rejection, read-only saved state and readable previews.
- The same executable checks trusted outer prefixes/suffixes, rewritten/ambiguous prefix fallback without data loss, nested builds, exception cleanup and the legacy public partition API. No provider calls.
- The memory regression-impact group now explicitly recognizes prompt-cache source and executes this suite; Core CI includes it. Local **39 suites pass**, with syntax and whitespace checks. The two source-shape wrapper fixtures were updated for typed append while retaining confirmation/once-only base-call assertions; full real-source integration independently checks their behavior.
- Existing memory workbench browser cases now assert that an authorized note with an embedded fixed heading is absent from the first stable message. The same cases already run on Chromium/Firefox/WebKit at mobile/desktop widths with scope/edit/reload/keyboard/geometry checks. No new visual surface requires a second equivalent screenshot audit.
- CI, merge, Pages deployment and live smoke are separate release evidence recorded in the PR. Mocked request checks do not establish real provider cache hits, billing improvement or physical-device behavior.
