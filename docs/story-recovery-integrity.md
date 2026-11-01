# Story recovery integrity

Rollback creates a separate chapter from a saved historical checkpoint. It does not call an AI model. The original chapter and its later messages remain available through Story branches.

## Checkpoint isolation

Only a save whose last message is an assistant reply may update that reply's checkpoint. A save ending with a pending player message still updates the current chapter snapshot and message records, but cannot attach its newer state or summary to the preceding assistant checkpoint.

New checkpoints include a versioned message-count and history fingerprint. This is a local consistency marker, not a security signature or evidence that a provider accepts the content. Legacy checkpoints remain usable when their structure is consistent, with an explicit warning that provenance cannot be fully verified.

## Recovery validation

`BAOStoryLibrary.recoveryReport` reads a detached save and returns counts, errors and warnings without story text, API keys, network requests or writes. It checks message identities, checkpoint sequence and provenance, summary bounds, Context Pack bounds and consistency, reconstruction job references, backup summary bounds and branch origin. Pending state updates remain visible as warnings; unmatched pending evidence is flagged for review.

`createBranch` validates the complete, contiguous historical message prefix before creating a new chapter. It rejects invalid summary cursors rather than clamping the cursor while retaining potentially newer summary text. Rollback also validates before confirmation and after restoring the branch; a failed restore returns to the original save. The shared maintenance lock prevents concurrent state/memory work during the switch.

## Player entry point

Memory workbench → Full story rebuild → **檢查故事恢復資料（免費）**. The report lists local message/summary coverage, memory notes, NPC count, Context Pack presence, pending state turns and branch status. It is a structural inventory of saved sources, not a dump or exact reconstruction of the final assembled model prompt. Existing JSON backup, TXT export, reviewed summary and independent rescue-copy actions remain in the same section.

A valid checkpoint restores its saved state directly. If it still contains pending state turns, those remain pending; validation does not manufacture completed state updates. A structurally valid save can still be rejected by an upstream policy filter. No policy probes, automatic paid retries or guarantees of provider acceptance are introduced.

## Verification

Core regression covers pending-turn saves, historical state/notes/Context Pack restoration, modified history, invalid summary cursors, out-of-range source references, failure preservation and diagnostics privacy. Rollback E2E covers a pending-turn save before recovery, desktop/mobile operation, local inspection without model calls and rejection of corrupt historical coverage. The rollback spec also runs in the Firefox/WebKit shared-state CI job.
