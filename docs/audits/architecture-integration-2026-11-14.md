# Architecture repair integration candidate — 2026-11-14

Base: `38e22b1b9bf13443f4dd9dd996f053b7b1628f40` (main rechecked before construction).

This candidate integrates the reviewed fixes from:

| Source PR | Reviewed head |
|---|---|
| #953 | `585c24ccc03d61d2ea8c865de12d97662a9d4258` |
| #954 | `3559968c305f01d25fa9f739bba0a69099795b93` |
| #955 | `5cf001cc62ca7ad5b462b1c8a1c170c1a50c53da` |

The original PRs remain separate review history. This integration candidate is the proposed next merge target; do not blindly merge the three original loader variants as well.

## Conflict resolution

- `index.html`: retain app v15; use site-ui v206.
- `js/site-ui.js`: retain Drive v2, branch v5 and request-lifecycle v8 without changing load order.
- `tests/frontend-extension-contract.cjs`: align site-ui v206, app v15 and lifecycle v8 assertions.
- `tests/story-reader-core.cjs`: retain lifecycle v8 assertion.
- `browser-e2e.yml`: keep the exit persistence spec in Chromium Story controls and Firefox/WebKit smoke. Keep the durable branch focused tests and add sync failure/recovery cases to the same three browsers. The Chromium Story controls timeout is 8 minutes to accommodate the combined suites; no tests or protections are skipped.

Runtime files from each source PR are retained verbatim. Additional changes in this candidate are integration test coverage, workflow composition and documentation, not new story behavior or a competing state manager.

## Data flow and invariants

App/Chat/GameState -> existing ordered request pipeline -> provider -> committed turn -> memory/state hooks -> Storage autosave and Story Library. Exit waits for completion and owner validation. Branch restore requires the source story's durable write and unchanged messages/derived state. Drive refuses transient active-turn snapshots and reports failed per-story writes, including first writes without metadata.

The task Set tracks unsettled promises only. Source signatures are ephemeral guards. Neither is a second persisted story state. No save schema, author work, memory algorithm, HTTP/Worker contract, wallet settlement, AWS code or migration changes are included.

## Verification

Execute against the actual integration head, not a source PR head:

```bash
node scripts/pr-regression-gate.cjs --base 38e22b1b9bf13443f4dd9dd996f053b7b1628f40 --head FULL_HEAD_SHA
node --test tests/pr-regression-gate.test.cjs
node tests/story-branch-api-core.cjs
node tests/request-lifecycle-core.cjs
node tests/google-drive-sync-core.cjs
node scripts/build-public-works.cjs --check
npx playwright test tests/e2e/story-exit-persistence.spec.cjs --project=chromium
npx playwright test tests/e2e/story-branch-tree.spec.cjs --grep 'failed source writes|sync write failures' --project=chromium
```

Repeat the browser commands with firefox and webkit. CI must run Core tests, Maintenance core, Regression impact gate and all Fast Browser E2E jobs on this candidate. Source PR green checks are not a substitute.

The browser scenarios cover: cancel -> exit -> autosave/Library equality -> reload -> retry; branch write failure -> original progress retained -> successful retry -> reload; sync write failure -> no upload -> successful retry -> persisted message/summary/location consistency after reload. Provider, OAuth and Drive responses are fixtures; Library/IndexedDB and the loaded application are real browser code.

## Release limits and rollback

No production environment is changed by preparing this PR. Merge and deployment require the user's later authorization. This is a frontend release with no Worker/AWS migration dependency; after authorization, deploy the frontend and verify production smoke. Roll back by reverting the integration change and advancing cache versions; do not rewrite existing saves.

Live Google authorization, multi-device Drive GET-version/PATCH races, paid provider/accounting, physical-phone behavior and production smoke remain separate release evidence. Main branch protection cannot be confirmed through the existing integration (prior read returned 403); inspect the actual named jobs, not only workflow presence.
