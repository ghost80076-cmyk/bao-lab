# Story state panels and manual rebuild

## One navigation entry per complete read view

The custom Gameplay UI and generic world-module renderer read the same story state.
`modulePanelCoverage` checks normalized read paths, including nested archive tabs.
A complete authored read panel replaces its generic module tab. Matching panel IDs or
labels alone, round-diff/history summaries, and builder/actions do not establish coverage.
Extra fields or truncated lists keep the generic view reachable; when a matching custom
panel exists, the fallback is labelled `完整資料`. Cards without Gameplay UI keep generic tabs.
This only changes navigation, never card or saved module data.

Legacy object fields declared as `collection` represent bounded string lists and normalize
to the existing `tags` validator (up to 12 strings, 80 characters each). They must not be
coerced to text or interpreted as arbitrary nested objects. Top-level collection modules
retain their existing item schema and validation.

## Rebuild source and scope

- Source: the currently loaded `Chat.messages`; no prior manual save is required.
- Recent: last 12 user/assistant messages, up to 20,000 characters.
- Deep: last 32 messages, up to 48,000 characters, plus up to 16,000 characters of older
  summary/event evidence. Neither mode claims to replay the complete story.
- Time/location/NPC state is rebuilt from evidence; tracked character fields and all
  non-manual module definitions are supplied through existing whitelist validation.
- Module objects apply evidence-based field patches. Omitted fields remain unchanged.
  Collection records update by ID/name and preserve unseen items; empty output cannot
  clear a collection. Unconfirmed numeric character values are not reset to zero.
- Manual modules, unrelated fields, authored settings, prose and historical records stay
  intact. Internal module names must not leak through the visible result report.

Each click still makes one auxiliary state-model request. Its output ceiling is 4,096
Tokens by default, respects a smaller configured limit, and never exceeds 8,192 Tokens.
Ordinary incremental state extraction retains its 2,400-Token limit. Actual API usage can
increase for a larger rebuild; no automatic paid retry or extra request is introduced.

## Results, concurrency and persistence

A missing module object, malformed or blocked/truncated response fails without applying
state. A usable but incomplete module result is `partial`, listing unconfirmed public
modules rather than claiming full synchronization. A pre-rebuild backup includes modules.
Source/config/module changes during the request invalidate the result. Pending turns
outside the bounded source window, and turns with incomplete module/character recovery,
remain queued. Rebuild waits for storage flushing and persistence verification; storage
failure preserves the repaired in-memory data and asks the player to export it.

## Per-turn module integrity

Every active, nonmanual module schema is offered to both merged and separate
state routes. Module `context` controls narrative context inclusion, not whether
its data can be updated. A prose renderer does not disable authored gameplay
tracking. Manual-only modules do not turn on tracking. The separate route keeps
its configured request interval; merged mode still uses one story request.

`modules` object fields are absolute updated values, including zero. Collection
updates merge by existing `id`, falling back to unique `name`; unseen entries and
player fields survive. `module_checks` explicitly lists reviewed unchanged
object fields; collection `true` acknowledges review of the whole collection.
A valid JSON response, one changed field, or one changed module does not certify
all pages. Missing/invalid coverage is reported as partial and retains pending
turns. The next story prompt warns of stale snapshots even in short/smart stories.
Both routes prioritize newer completed evidence over older waiting batches.

`module_removals` supports completed consumption/delivery/discard without
requiring a full inventory replacement. Each entry identifies one existing item
and quotes a verbatim assistant-story sentence containing its name. Unknown or
ambiguous identifiers, invented quotes, player-only intent, and removal quotes
followed by a newer mention are rejected conservatively. The model must still
interpret completion versus negation, hypothetical actions, and failed attempts;
structural validation is not an independent semantic inventory ledger.

Rebuild uses the same protocol, with collection identity references only (not old
balances/quantities). It keeps the existing bounded recent/deep evidence window;
it does not replay the whole story or invent missing accounting history. A
collection can become empty through validated removals; merely returning `[]`
does not erase unmentioned possessions. Explicit zeros remain zeros. Reapplying
an absolute balance cannot deduct a transaction twice. Unresolved history stays
visible as partial, and existing rebuild backups/persistence checks remain active.

For authored gameplay, `scene_checks` explicitly acknowledges unchanged `time`
and/or `location`; returned scene values or the current response's explicit scene
appendix cover changed fields. Missing scene review also produces partial status.

Legacy `tracking: high/medium/low` values stay save-compatible and now order
review priority rather than skipping automatic module checks. Player settings
label these as automatic priority/general/secondary; `manual` remains excluded.
The `ui_only` context description distinguishes narrative-background omission
from opted-in state tracking, which still needs module data to validate updates.

## Resumable historical pending-state recovery

An accumulated pendingStateTurns queue is **not** fixed by a 12/32-message
manual rebuild. The player can choose "分批掃描待補輪次" in Context Health:

- Each explicit click makes at most four auxiliary state-model calls, covering
  at most four chronological pending turns per call. When source text exceeds
  16,000 characters, the batch is reduced; a single oversized turn fails
  visibly without being skipped. The source always stays on-device except for
  the deliberately sent paid model request.
- Each verified response must confirm reviewed_turns and contain no more than
  eight short evidence facts. Each successful batch saves a local stateRecovery
  checkpoint and verifies storage flush. A failed or blocked batch never advances
  its checkpoint. The original pending queue and current NPCs, balances, scene,
  authored modules, player text and story history stay unchanged throughout
  scanning.
- The checkpoint is bound to an ordered source fingerprint; a modified or
  removed covered turn disables resume. Reset discards **only** scanned facts
  and progress, never pending turns or story state. Appending unrelated later
  turns does not invalidate previously scanned source text.
- When all pending turns have been scanned, the player must explicitly authorize
  one further **paid deep rebuild**. Its input includes the chronological
  evidence and current recent story; newer confirmed facts override old
  evidence. Only full validated module, character, scene and phone coverage
  may clear the complete backlog. Partial/blocked/truncated/invalid results
  leave all unresolved historical work intact.
- Provider content blocks are shown and stop the scan. No unrequested model
  switch, safety bypass, hidden retries or automatic payments are performed.

This is evidence-assisted recovery, not an independent semantic accounting
ledger: the model can still omit or misinterpret a fact. The checkpoint records
what was scanned and the final validation records which fields remain uncertain;
neither constitutes proof of perfect reconstruction. Backup before remediation.
