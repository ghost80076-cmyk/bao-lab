# Full browser acceptance repair

Baseline: main `25e1d889a79217f14b7863453bfe5b3357d6c9b8` (#930).

The scheduled run 41734969642 exceeded the existing 20-minute limit in Chromium, Firefox and WebKit. It also reported failures before cancellation; timeout does not establish that the remaining cases passed.

## Execution and test fixtures

Each browser is split into four Playwright shards, using the same pinned 1.63.0 image as the existing Fast suite. The 20-minute job limit, retries, assertions and complete suite remain intact. Six matrix jobs run at once; a new commit cancels superseded work. `scripts/check-full-browser-shards.cjs` compares actual discovery for every browser to the disjoint union of all four shards and rejects missing, duplicated, empty or failed discovery. Per-shard reports have distinct artifact names. Changes to this workflow or its discovery script exercise the complete suite on PR and main push; the existing daily schedule/manual entry remains. Live Pages acceptance is production-only and is skipped on PRs, separately from local browser results.

Two fixtures called the asynchronous `App.openCharacter` without waiting before `openBuilder`, causing a null active character. The auxiliary-request fixture now waits for the existing story/world extension readiness signals before seeding the request pipeline. The external-media fixture contained an IDAT CRC mismatch; it now serves a valid one-pixel PNG, retaining both the denial-before-permission and decoded-image-after-permission assertions.

The Gemini SSE success fixture did not include a completion reason and was correctly rejected by the transport. It now ends with `finishReason: STOP`; the production incomplete-stream rejection remains unchanged. Cancellation compares the entire original history, including the saved greeting, rather than incorrectly requiring an empty story. Both scenarios run at 390px and 1440px.

## Runtime finding: stored greeting versus transient feedback

Current stories save a greeting as `Chat.messages[0].greeting`. Several readers retained compatibility with an older standalone greeting outside history. On cancellation or protocol error, the player turn is removed but the temporary assistant feedback can remain until the error handler moves it into system notices. Readers saw one extra DOM node and treated the already-saved greeting as an additional standalone greeting, repainting the feedback with duplicate opening text.

The legacy offset is now allowed only when the first saved message is not a greeting. This preserves aligned stored histories and legacy standalone openings while leaving transient nodes for the existing feedback handler. The connected markup, scene, avatar, streaming and integrity adapters use the same distinction. No model request, error policy, committed history, memory, status, branch, wallet or save format changes. Loader versions advance together.

`tests/greeting-render-alignment-core.cjs` executes the actual streaming and integrity adapters against stored-greeting/transient-feedback, stored-greeting/committed and legacy standalone histories. The baseline fails the transient-feedback assertion; the repaired adapters pass without mutating history. Core and the UI regression-impact group run this check. Browser cancellation reproduces the complete pipeline and retains the exact history, restored draft, single provider call and system-only notice assertions.

## Release evidence and rollback

The first complete sharded attempt exposed further obsolete test entry points (preview before detail, Control Center before actor/tools dialogs, and explicit advanced/provider selection). These fixtures now use the current public UI and retain their state, request-count, persistence, geometry and permission assertions. The old top-navigation and mint-accent assertions were migrated to the current mobile bottom navigation and YoruBay violet/lamplight contract. Two image fixtures had corrupt PNG CRCs; both now contain decodable image data. Scrolling-only authoring fixtures request reduced motion while retaining real click/check actions.

The Canon layout cases also exposed a runtime omission: the book's advanced `details` created a `summary` but never appended it. The visible, keyboard-accessible “進階資料” summary is now attached. The original desktop/mobile layout cases are retained and exercise that disclosure. Memory regression-impact checks therefore remain mandatory for this change.

Mocked browser requests must not be served behind a service worker invisible to `page.route`. The default browser-test context now blocks service workers; the controlled offline-shell suite explicitly opts back into `allow`, and retains its real controller/cache/offline-shell assertions. This changes test isolation, not production service-worker behavior. Reference: https://playwright.dev/docs/api/class-page#page-route.

PR #931 records actual final workflow, browser, merge, Pages deployment and live verification results. None are implied by this document. Local browser runs use a separately packaged Chromium 153 with fake API transport; definitive Chromium/Firefox/WebKit evidence comes from CI. No physical-device, real-provider or paid-wallet verification is claimed.

Revert the runtime adapters and loader versions to undo the display repair, or revert the workflow/fixture changes to undo acceptance changes. There is no persistent-data migration. The baseline display bug would return after a runtime rollback; original story records remain intact.

## Follow-up runtime findings (2026-11-04)

- Revision detection previously treated a lazily attached original variant ID as a changed reply. The queued reconcile could replay a pre-turn snapshot and overwrite the mainline during branch creation. Detection now compares story lineage, reply identity, content, and established variant identities. Regression cases cover both lazy initialization and restored chapters sharing message IDs; real content/variant revision tests remain intact.
- WebKit could fail when IndexedDB serialized Blob/File media. Imported covers, portable work assets and scene-gallery images now persist byte-backed optional fields, rehydrate Blob values on reads, and preserve existing device-backup/work-package formats. Legacy Blob records remain readable. Keep these compatible readers if rolling back other fixes; an older client can otherwise hide newly stored media until upgraded again, without deleting the stored bytes.
- Studio blur and checkbox focus could reveal/hide sticky controls during a pointer gesture, moving the intended Save/Apply/participant control. Editing chrome now waits for pointer completion, and controls without a text keyboard do not enter text-editing layout. Existing mobile save, NPC application and multi-contact phone-builder assertions verify the resulting data.
- WebKit could initialize a new dialog with old inherited theme tokens immediately after changing the root theme. Resolving the themed body before dialog creation prevents the stale inheritance. Drawer verification uses the supported theme API and still covers all five themes and all six viewport widths.
- The worker watchdog fixture now routes a deliberately unresponsive worker: JSC may optimize a nominally catastrophic regex before the timeout. The main thread must remain interactive, the watchdog must fire, and raw history/usage must remain unchanged; other fixtures still execute real author regex.

Validation is recorded per exact PR head in the PR description and Actions. Local regression-impact selection runs 53 connected suites. Targeted Chromium, Firefox and pinned WebKit runs reproduce the failures and verify the fixes; they do not substitute for the complete official browser matrix, production Pages deployment or live smoke. No paid model calls, Worker/AWS changes, billing changes or story-state schema migration are introduced.


## Final acceptance follow-up

The complete matrix exposed additional races rather than story-engine changes: startup completion could navigate back home after the player already entered Explore/Builder/Chat; a previous copy-success timeout could clear newer clipboard-denied feedback; and tests could sample a search before its scheduled paint or compare equivalent opaque RGB/RGBA serializations. Startup now preserves the active destination (four deterministic delayed-load unit cases, included in Core and the baseline regression gate). Clipboard failure feedback remains with the manual-copy fallback and stale success timers are invalidated. Search tests await actual nonempty category results in one browser turn; theme tests compare identical channels/opacity while retaining non-opaque values. Settings-preservation fixtures await both extension groups before constructing their baseline. Existing result assertions, browser matrix, deadlines and retries remain.


## Settings reads and versioned loader acceptance

The completed matrix also exposed read-side writes: commentary/interpretation summaries and quick-command reads initialized optional defaults in GameState while the control center was opening or deferred rendering ran. Reads now return normalized defaults without assigning them; explicit command/setting saves remain the only writers. The existing whole-state equality and request-count assertions are retained. Control-center fixtures wait for complete story/world initialization before seeding their baseline. Slow-load fixtures use the script URL actually inserted by the page, including its cache version, and still assert shared pending identity, a single script, readiness after release and zero provider requests.
