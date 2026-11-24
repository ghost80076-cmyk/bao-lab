# PR #973: scene prompt load-order regression

## Baselines and observed failure

- main: `e21bc81f0bd6e78fc82dabe367178f4e241fd3e6`
- PR head before this fix: `98200d05b7193a9dd7724f749981e05b9802042c`
- CI evidence: https://github.com/ghost80076-cmyk/bao-lab/actions/runs/45387429190/job/138435942412
- The original 390px assertion failed before the second restore, after disabling scene fidelity. The received system prompt lacked the entire `【玩家排版偏好】` block and its status-output instruction. The scene-fidelity rules were not the differing text.

## Root cause and deterministic reproduction

`index.html` loaded `chat-markup.js` before `character-ui.js`. Markup dynamically injects `scene-html-modes.js`, which wraps `App.buildSystemPrompt`. If that request completes before the parser executes character-ui, character-ui's base-function assignment discards the scene wrapper. Browser/network cache timing can therefore make initial load and reload produce different prompts even after both readiness checks pass.

Executing the actual two source files in a Node VM, with a stub base composer and identical `{mode: 'efficient', status: 'native'}` preferences, gives the same results on both main and the original PR head:

| Execution order | Scene preference block |
| --- | --- |
| scene-html-modes → character-ui | Missing |
| character-ui → scene-html-modes | Present exactly once |

This is a pre-existing product initialization race, not evidence of corrupted saved settings or a scene-fidelity rule defect. Neither of those source files nor the narrative E2E test differs between these baselines.

The enhanced `tests/scene-html-request-isolation.cjs` follows the actual entrypoint order and simulates immediate completion of the injected scene script. It failed before the fix with `0 !== 1` for the scene block, then passed with the reordered entrypoint, including all three presentation modes and the existing author-template isolation assertion.

## Minimal change and coverage

Move the existing chat-markup script tag immediately after character-ui. No runtime JavaScript, prompt text, provider routing or save schema is changed by this final fix. Add the ordering contract and strengthen the existing 390px/1440px E2E cases to require a scene block in the baseline and identical scene preferences after restoration. The original byte-for-byte prompt assertions and all timeouts remain unchanged.

Local verification: existing scene preference, narrative prompt pipeline, scene context, provider payload, memory isolation and maintenance checks; the full PR Regression Impact Gate. Full Core and GitHub browser results are recorded on the PR's final commit checks. The narrative E2E change also triggers the existing Scene fidelity acceptance matrix (Chromium/Firefox/WebKit).

Local Playwright could not launch the installed Chromium because this environment denies its singleton socket; Playwright browser downloads returned HTTP 403. Local launch failures are not product failures or successful E2E runs. Use the actual GitHub Actions results for browser acceptance.

## Connected domains and rollback

The entrypoint change restores the existing presentation contract. No saved-data migration, model call, backend, wallet, memory or world-state change is introduced by this final fix. Existing PR Phone authoring, read isolation and mobile branch positioning remain covered by their own checks. Revert this commit to restore the previous entrypoint; reverting all of #973 requires no data migration. Merge, Pages deployment and live smoke are separate events and must be confirmed after CI completes.
