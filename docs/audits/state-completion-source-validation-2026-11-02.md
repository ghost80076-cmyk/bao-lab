# P1: state completion and source validation

Baseline: main `4202d9682a044465abe3b35a4b7f2d135119c06c` (includes #919, #920, #921).

## Recent PR alignment

- #919: shared fictional-data task contract and maintenance lock; retained.
- #920: executable cross-feature regression gate; extended with state completion tests and a world-modules path rule.
- #921: independent discussion/import split; unchanged, existing core test passes.
- #915–917: author composer; unaffected runtime; existing creator/gameplay core regressions pass.
- #918: still open at inspection; traffic archival is unrelated and not included.

## Verified gaps

`site-ui.js` loads world-state, then world-modules, then world-state-cost. world-modules replaces update rather than delegating to the base implementation. Its system message therefore missed #919's taskSystem contract. Its completion filter already covered most truncation/block reasons, but missed IMAGE_SAFETY. Both incremental implementations lacked source/configuration checks after awaiting the provider; the modular implementation checked owner identity only. The base implementation also lacked completion validation.

## Changes

Both implementations capture the owner, transcript, request configuration and current App configuration, then validate them before parsing/diagnostic writes/applying state. Completion validation uses BAOMemoryCore.completionError when available, with an equivalent legacy fallback. Modular requests now use taskSystem. Existing schema validation, coverage checks, gameplay-action reconciliation, queue ownership and retry rules remain responsible for their existing decisions.

Source rejection returns null: the queue wrapper retains pending evidence and reports failure; no automatic extra request is introduced. Explicit scene fields parsed directly from visible story text keep their existing behavior independently of the model PATCH.

## Validation

The new VM regression loads the real base and modular implementations plus the real queue wrapper. Mock provider/schema adapter; no paid requests. It tests parseable JSON with four truncation reasons and four block reasons, with and without the shared core, successful retry, retained pending turns, changed owner, modified transcript, changed route and replaced App configuration. The initial test on unmodified base failed because LENGTH JSON was applied; after changes it passes. Modular task prompts are asserted to contain the shared contract.

Local regression-impact: 19 suites passed. Additional memory orchestration, truncation recovery, Context Pack resume, story discussion, helper context, state cost/rebuild and 12 gate-selection tests passed. CI/browser results are reported separately in the PR; local VM tests do not prove live provider or production behavior.

## Boundaries and rollback

This is the first focused P1 repair, not completion of all P1–P4 proposals. No new memory store, save migration, embeddings, extra model call or continuity model. No Worker, AWS, wallet, author data or deployment changes. Revert this PR and its cache versions to restore the old behavior; existing save formats are unchanged. Source changes conservatively retain pending evidence for later reconciliation. Cross-browser and production smoke remain separate acceptance evidence.
