# P1 memory maintenance consistency closure

Baseline: main `77939ceeb16f369784f0951199620362f13fbbb8` (#922). This PR continues P1; it does not implement P2 knowledge/relationship features.

## Audit and changes

| Path | Existing protection | Verified gap and change |
| --- | --- | --- |
| Automatic summary / JSON repair | Completion errors, bounded truncation retries, source/summary/cursor ownership | Reject in-place configuration changes; preserve original summary/cursor. Existing App save/write-warning lifecycle stays in charge of automatic story persistence. |
| AI notes workbench | Shared request/foldText, source fingerprint, lock | Await accepted save, flush, exact tool-field readback and durability check. Roll back only owned tool fields on failure. Keep complete checkpoint until final draft save succeeds, so final-save retry after reload sends no model request. |
| Context Pack | Source prefix fingerprint, chunk/merge cursors, lock | Same durable checkpoint contract; deep-copy work state so local merge mutations cannot advance persisted cursors before confirmation. Reject missing required output fields and in-place settings changes. A final-save retry reconstructs from paid merge evidence without another request. |
| Canon | Shared request completion checks and source/draft checks | Missing maintenance lock and taskSystem contract; now uses both. Validate notebooks shape. Await every paid/deterministic progress save. Preserve a completed candidate checkpoint until final draft persistence succeeds. Existing jobs without candidate continue normally. |
| Full history rebuild | Staged extraction/merge, source plan, verified save, explicit apply/rollback | Reject in-place settings changes. Check owner after save flush; failed apply/rollback from an old story cannot overwrite a newly opened story's global Chat. Original candidate remains available. |
| Imported-setting split (#921) | foldText, source identity, lock, flush and write guard | Add in-place configuration check to existing request guard. |
| State rebuild / pending scan | Owner/source/config signatures, blocked/truncated output checks, persistence rollback | Retained existing behavior; #922 base/modular state completion test remains part of regression. |

## Shared persistence contract

BAOMemoryCore.commitState receives caller-owned save/flush/load/verify adapters. It checks current source, applies only the requested tool fields, waits for flush, checks source/field ownership again, verifies exact state fields in the readback and the storage write guard. Rejection restores prior fields only when the transaction still owns them; a replacement job is not overwritten. It never persists request configuration or keys.

On an unconfirmed *batch* write, progress does not advance and a future run may need to repeat that unconfirmed batch. Only successfully persisted evidence can survive reload. The no-additional-model-call guarantee applies specifically to completed evidence whose **final draft save** fails. The core cannot make unavailable storage durable.

## Executable evidence

- New `memory-checkpoint-persistence-core.cjs`: save rejection, flush failure, stale readback, durability failure, source invalidation, replacement ownership and flush waiting.
- New `memory-workbench-persistence-core.cjs`: real workbench handler + foldText + shared lock, failed writes, reload and zero-call final retry, configuration mutation.
- Expanded Canon and Context Pack runtime suites: incomplete valid JSON, lock collision, failed checkpoint/final save, persisted resume and zero-call final retry, in-place setting changes.
- Expanded full-history runtime: 100-round source planning/rebuild, failed persistence and switching stories during apply flush without overwriting the new Chat.
- Expanded automatic-summary ownership test for in-place model changes.
- Existing memory-recovery browser scenarios include a 91-round source, budget-bounded resume and desktop/mobile widths. New browser test uses real Storage across reload and mocks only model transport/final-save rejection; the old save spy now delegates to real Storage where durable checkpoints are expected.
- Regression-impact includes these suites plus branch/rollback/revision, status ownership, storage fallback and backup recovery. Core CI independently runs the new tests.

Local Node results and actual remote browser/CI results are reported in the PR. No live paid model, player data, wallet, physical-device keyboard or production smoke is implied by these mocks.

## Compatibility and rollback

No official memory/state schema migration, NPC knowledge rewrite, relationship graph, extra model request, Worker, AWS, pricing, author content or visual-layout change. Canon jobs gain an optional completed candidate; existing jobs remain supported. Cache URLs are updated together. Revert this PR to restore runtime behavior; saved optional candidates may remain as inert job data. Existing raw transcript and player confirmation boundaries remain intact. Browser/CI failure must be resolved before merge/deploy.
