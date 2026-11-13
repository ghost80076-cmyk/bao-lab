# Integration, regression and failure handling — 2026-11-13

Baseline: main aaefdce10eeecdaf20ead41c262d7e0b23798c28 (#951); local baseline tree verified against GitHub: d5c2f1be91445a22037cec2f3e0fdc3843bbbb19.

## Findings and fixes

- LM Studio JSON transport still substituted a successful-looking message for empty output. It now uses API.requireVisibleResult, with an empty-output rejection fallback for older cached API versions. HTTP 200 bodies containing error are rejected. Diagnostic usage and finish reason survive empty failures.
- Real local pipeline tests cover whitespace/empty JSON and SSE responses, usage retention, HTTP 200 error envelopes, no retry and no cloud fallback. App failure integration adds local transport: unchanged history, restored input, no save/world event/memory processing. Existing cancellation and HTTP errors remain covered.
- The regression impact map now includes local transport source/tests and executes local unit and pipeline contracts. Its own selection test guards this coverage.
- Scheduled Full Browser E2E run 43327161593: 11 of 12 browser shards passed. WebKit shard 1 failed character-import persistence twice. Both traces show successful import and save, followed by a 39-second reload. Network trace identifies picsum.photos default avatar taking 38,978 ms and returning 522. The fixture now specifies a local avatar; save/reload/restore assertions are retained. Character import and LM Studio browser specs are also included in existing Firefox/WebKit PR smoke jobs.
- Scheduled Traffic Evidence run 43271689425 failed due to missing TRAFFIC_READ_TOKEN; five logic tests passed. This needs repository secret configuration and is unrelated to runtime correctness. No fabricated credential or silent success is introduced.

## Validation and limits

312 core/gate Node test files passed locally. After final edits, affected tests and impact gate passed (22 selected files); gate selection tests: 15 passed. Browser launch was blocked locally by missing WebKit shared libraries; install-deps could not elevate. GitHub browser CI is the verification path. Provider tests use mocks; no live paid model requests were made.

## Release and rollback

Source changes require frontend deployment only. Script cache versions advance through the existing loader chain. No Worker/AWS changes or data migration. Revert and redeploy frontend to roll back. These changes do not repair previously saved synthetic replies. PR creation and test status are distinct from merging and deployment.
