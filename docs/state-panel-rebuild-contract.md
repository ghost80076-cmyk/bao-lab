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
