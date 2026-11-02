# P2 memory evidence and character knowledge

Baseline: main `5c7e7ca485776557dce99b99c8965694c98a7919` (P1 #923).

## Findings and behavior

- Re-extracting an existing event replaced all later knowledge records. Retain dated history only when the origin evidence (IDs and signatures) matches exactly. A rewritten origin cannot inherit that history.
- Appending knowledge mutated event objects retained by earlier state snapshots. Replace the affected event rather than mutating the previous state.
- Duplicate source IDs previously selected the last message silently. Ingest, recall, the player knowledge inspector and the extraction event index now share validation that rejects every occurrence of an ambiguous ID. Only user/assistant story messages can serve as evidence.
- Reordering unchanged source messages could allow knowledge before the event. New later observations carry optional `afterEvent: true` and require all observation sources after the complete origin evidence. Existing initial/legacy observations must not predate the beginning of the event. The live Chat ingestion passes the complete current history, rejecting stale branch origins before adding updates. Legacy three-argument ingestion remains compatible; recall still validates against current history.
- Extraction event indexes now exclude missing, rewritten and ambiguous source evidence. Explicit corrections may target an earlier event within the same source chunk when chronology proves the ordering.
- An objective correction no longer automatically deletes an absent character's evidenced old belief. The old event is excluded as objective public fact, while its explicit character claims remain labelled `角色認知` with their witnessed/told/rumor/inferred mode. A later valid knowledge update supersedes that actor's belief in normal chronological selection. Other speakers never inherit it.
- Oversized or malformed private audiences fail closed, rather than truncating away an unauthorized speaker. Model recall resolves aliases to the same identity, while the player inspector preserves original actor labels for exact source review.
- Summary, event extraction and both Canon extraction/merge requests explicitly preserve relationship direction: A trusting B does not imply B trusting A or mutual trust. This is an extraction instruction, not a deterministic semantic guarantee about model output.

## Compatibility and affected domains

No new database, relationship graph, model request or network dependency. Existing version-1 episodic state and source signatures remain readable; `afterEvent` is an additive optional field. The normal 4-event / 2,400-character recall bounds remain intact. Summary strings, Canon schema and user confirmation flow stay compatible. Cache versions are advanced for changed runtime assets.

Connected domains: automatic summary, character knowledge, Canon, worldbook scoped-read permissions, branch/rollback and snapshot ownership, JSON save/reload, helper request isolation and frontend loaders. No provider routing, wallet settlement, worker, migration, renderer or gameplay UI changes.

## Evidence

- New `tests/episodic-memory-permissions-core.cjs` exercises snapshot isolation, replay preservation, duplicate IDs (same/different content), source rewrite, source reordering, portable reload, alias consistency, oversized audiences, rollback, stale extraction indexes and corrected facts versus old beliefs. Running it against baseline fails on snapshot mutation; it passes on the revised implementation.
- Existing episodic integration verifies actual Chat ingestion, final request injection, source invalidation, bounded recall and unchanged model-call count. Added actual-request assertions for relationship-direction instructions in summary, episode extraction and Canon extraction/merge.
- Local regression-impact gate: 31 suites passed, covering memory maintenance/checkpoints, full rebuild, backup/storage recovery, rollback/revision/status ownership and frontend contracts. Existing helper-context and gate-selection tests also pass; modified runtime JavaScript passes syntax checks and `git diff --check`.
- The new P2 suite runs in Core tests and the memory regression-impact group. The gate also includes existing episodic and worldbook asynchronous ownership tests, and now recognizes Chat/helper-data and recall-ownership paths as memory impacts.
- The first remote request-observability run caught an inspector contract regression: merging alias labels prevented explicit source selection. Restored the original per-label inspector contract while keeping normalized model recall, and added NPC timeline source/resolution plus actor alias tests to the memory gate.
- Refreshed both checked-in recall evidence reports for the revised source hash, and updated the mutation probe to target the new public-fact guard. The acceptance runner still proves that empty recall, incorrect provenance and scope leaks fail; it is included in the memory gate. All 52 supported base cases and 7 supported held-out cases pass. Each suite retains one explicitly unsupported diagnostic false negative.
- Remote CI/browser results are tracked in the PR. No paid live-provider test, physical-device verification, merge or production deployment is implied by local tests.

## Rollback

Revert the PR to restore the prior runtime and cache references. No migration or destructive save rewrite is required; older code ignores the optional observation marker. Reverting also restores the preexisting evidence/history defects. Lost knowledge from saves created before this fix cannot be reconstructed without the original extraction history.
