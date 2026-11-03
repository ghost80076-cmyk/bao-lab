# Optional summary knowledge review

Date: 2026-11-04. Baseline: `1fdda06c789a2618ab2a2b851bc3b21c8f96aefa` (#928).

The memory overview adds **摘要知情審閱（選用）**. The player can inspect the compressed summary and its complete covered source prefix, then assign each immutable fragment to named actors, all actors, or exclusion from the story model. New fragments require explicit scope. Registered aliases are resolved to formal names at approval; ambiguous names fail. This is a manual assertion, not factual verification or a sentence-to-evidence attribution engine. The source viewer is local, escaped and paginated in groups of ten.

With an active review, smart-mode Chat context and its preview use the same selection and whole-cast audience check as scoped episodic memory. All other summary behavior stays opt-in. Full/round modes retain their existing raw-history behavior. This filter covers this compressed summary only: recent raw history, notes, Canon and Packs remain independent sources and may contain the same information.

A review binds summary text, cursor, ordered source IDs and fingerprints of role/content/context_content. Changed, deleted, reordered or duplicate sources invalidate it. If automatic summarization advances, the previous reviewed summary remains in use and raw context remains available from its reviewed cursor. The newly generated summary is pending review; it cannot silently trim that raw context. Source mismatch blocks smart-mode story submission until review or explicit deactivation. Automatic summarization itself remains unchanged, so retained raw context may increase normal request usage. Review requires no additional model request.

## Persistence, ownership and rollback

`state.summaryKnowledge` and `state.summaryKnowledgeBackup` are additive optional fields. Existing schema/storage payloads, summary text, cursor, state.memory and source messages are preserved. Apply/undo/off use the existing maintenance lock and durable memory commit helper, including save/flush/readback and failed-save restoration. Owner/config changes, busy requests and stale drafts reject writes. Undo requires the exact applied review fingerprint and unchanged summary/source snapshot; it cannot overwrite a later automatic summary. Deactivation explicitly restores ordinary summary behavior.

Old saves have no review and retain ordinary behavior. Loading a pre-activation checkpoint or using an older application version also restores/ignores this optional field and can restore ordinary summary exposure. An active review with mismatched restored sources blocks until re-reviewed or disabled. Reverting this feature therefore removes its summary-specific filtering; export/backup before rollback when that distinction matters. No migration, Worker, AWS relay, wallet, provider routing, API-key, renderer or stage-engine changes are required.

## Verification

- Local regression-impact gate: 40 selected suites passed, including the new summary core suite and connected rollback, revision, ownership, storage, request and frontend contracts.
- Core coverage: exact fragment preservation; scope/alias ambiguity and reassignment; mixed casts; missing/reordered/rewritten/duplicate sources; stale drafts and undo; JSON persistence; actual Chat context, App prompt and Context preview; pending summary retains raw history; legacy/full/round modes; read-only 6,000-message source stress.
- Browser coverage added at 390px and 1280px: local evidence view, invalid scope, apply, real save/restore, undo, pending summary/raw retention, source rewrite block, failed-save recovery, deactivation, stale owner, maintenance lock, touch target and overflow checks. Existing four-theme checks include the review surface. CI supplies Chromium/Firefox/WebKit and screenshots; no physical-device or paid-provider claim.
- PR and production workflow evidence is recorded in the PR after execution. Core/regression checks do not replace browser CI or Pages/live smoke verification.

### Fixed 120-turn continuation acceptance

`node tests/summary-knowledge-longplay-core.cjs` now runs in both Core tests and the memory regression-impact group. Its independent VM uses the actual `Chat.afterTurn`, `App.buildMessages`, prompt-cache wrapper, maintenance lock, summary review selector and Storage payload/sanitization/restore methods. Database bootstrap is excluded here; IndexedDB durability and UI behavior remain covered by their separate suites.

The deterministic story executes 120 completed turns with 29 mocked automatic-summary requests on the existing four-turn schedule, 108 pending-review turns, four manual re-approvals and three payload reload/source-rewrite/rewind-and-return cycles. Assertions inspect the actual prompt for every retained raw message, exclude withheld summary fragments, require a mixed cast to lose actor-private scope, preserve the fixed prefix and verify that review/build operations add no transport call. JSON-portable saves omit the fixture API key, restore exact review data and reject attaching a future review to an earlier history. Fault injections that remove raw history or leak excluded summary text must make this acceptance fail.

This replaces the previous one-off longplay check with a repeatable gate. Mocked summary outputs do not measure extraction quality, model obedience, real-device behavior, provider cost or general all-source secrecy.
