# Narrative memory and Canon knowledge boundaries

Baseline: main `72ab78d117c4e5728b70fc6ce5458f8cd47aa777` (#924).

## Findings and changes

1. Automatic summaries and confirmed Context Packs remain free text. Reading a background fact does not mean every character learned it. A shared narrative contract now reaches actual summary, Context Pack and selected Canon prompts, preserving claims versus facts, explicit knowledge differences and directional relationships. Characters may still infer from their own known clues; the existing player-agency authorization remains authoritative for everyday portrayal.
2. Canon's stored/UI format already had `knowledge_scope` and `known_by`, but its extraction and merge response schemas omitted them. Both JSON instructions and provider response schemas now carry the fields. The extraction prompt requires explicit knowledge evidence rather than presence/character tags; intermediate and final merge instructions retain distinct audiences and forbid unioning knowledge lists.
3. Newly parsed AI books with absent/invalid permission fields default to `actors` with an empty audience. A contradictory `shared` plus explicit names becomes actor-scoped. Such books remain in the reviewable draft and cannot load into story prompts until the player supplies an authorized audience or explicitly reviews their scope. Existing category-knowledge matrices remain player-only. Completion text points out books awaiting a knowledge audience.
4. Existing player-confirmed legacy Canon keeps its historical shared default; no old books, messages, summaries or save fields are rewritten. This distinction is deliberate: the parser handles new AI output, while the legacy normalizer still reads existing saves.
5. Canon job fingerprints/checkpoints advance to protocol 2. A pre-upgrade in-progress job cannot reuse a candidate generated without the new metadata contract. This can require repeating that old Canon extraction/merge once; current protocol jobs retain their existing resume behavior. No provider call is added to a normal run.
6. The shared guard uses its own fixed header and is placed after Context Pack data. Actual prompt-cache assembly verifies that changing a pack leaves the stable prefix unchanged and does not move pack content into that prefix. A simultaneous pack and Canon reuse the same stable guard. Context previews include the summary guard as well.

## Limits

This does **not** infer per-sentence access controls for old free-text summaries or Context Packs. Their content is still sent as narrative context; the guard is a model instruction, not cryptographic or deterministic isolation. No claim is made that a model cannot misclassify a private fact as explicitly shared, invent an audience or ignore the instruction. Structural permission validation and whole-cast filtering apply to Canon's explicit fields. Fine-grained old-summary isolation needs original evidence plus reviewed structured claims, not guessed names or silent deletion.

There is no new database/schema migration, relationship engine, automatic paid repair call, provider-route change, worker change or wallet/billing change. Runtime cache versions are advanced. Normal summary/full/rounds selection, player confirmation, branch/rollback and local-first save compatibility are retained.

## Validation

- `tests/memory-knowledge-boundaries-core.cjs` loads the real App, Chat, helper data, story tools, Canon and prompt-cache implementations. It checks the assembled request, draft exclusion, missing/malformed/contradictory AI permissions, mixed-cast denial, JSON reload, unchanged summaries/cursors, full-history selection, stable prefix placement, extraction/final-merge schema fields, progress notice and unchanged normal call count.
- Running that regression against the baseline Canon implementation fails on the missing-permission case. Existing Canon tests also assert the fields are required in actual extraction/merge requests.
- Regression-impact gate: 36 suites pass, including memory checkpoints, source ownership, rollback/revision, storage recovery, Canon/Context Pack, prompt cache, NPC source/alias handling and frontend contracts. The new suite and connected final-prompt/cache tests are included in the memory gate; Core tests also execute the new suite.
- Additional prompt-orchestrator and revision-pipeline checks pass; modified runtime scripts pass syntax checks and the diff passes whitespace checks. Remote CI/browser results are recorded in the PR. No live paid model or physical-device test is implied.

## Rollback

Revert this PR and its cache references. No migration needs reversal. New actor-scoped books remain compatible with the preceding version's existing permission gate; old code may ignore protocol-2 checkpoints and regenerate them. Reverting restores the prior absent-field AI default and weaker narrative framing. Original stories and source messages are untouched.
