# YoruBay · Codex project guidance

These instructions apply to Codex working in this repository. They coordinate the project-local Skills imported in PR #871 and PR #873; they are **not** instructions for the YoruBay website runtime. For details and upstream provenance, see [`.agents/skills/README.md`](.agents/skills/README.md).

## Authority and scope

- Start with the user's actual task, the existing YoruBay source code and tests, and relevant project contracts. Skills are advisory playbooks, **not** authority to redesign the product or replace its architecture.
- YoruBay uses a custom HTML/CSS/JavaScript story engine and Stage Capability / Gameplay UI / Phone renderers. Do not introduce Unity, Godot, Phaser, Ink, Yarn, or a competing state/UI engine just because a Skill uses it in an example.
- Preserve existing story and author-content behavior, schema and save compatibility, local-first storage, API-key isolation, rendering sandbox, model-request boundaries, and the separation between author HTML and first-party UI.
- For gameplay UI changes, first read `docs/stage-capability-contract.md`, `docs/player-ui-v2.md`, `js/stage-capability-core.js`, and the tests for the affected surface. For visual changes, respect `docs/yorubay-visual-direction-audit.md`, `docs/ui-style-ownership-2026-10-18.md`, and the existing `--yoru-*` CSS tokens.

## Choose the smallest useful Skill set

| Work requested | Primary Skill | When to combine |
| --- | --- | --- |
| Story/Stage/Phone/RPG HUD, menus, interaction, focus and return paths | `game-ui-ux` (use `router` if selection is unclear) | Add `impeccable` for visual hierarchy, readability, responsive critique, and polish |
| Existing website layout, typography, colors, visual QA, onboarding, accessibility review | `impeccable` | Add `game-ui-ux` only if gameplay states/navigation are affected |
| Optional Visual Novel Stage behavior | `visual-novel` plus existing Stage contracts | Add `game-ui-ux` for controls and `impeccable` for presentation, only when needed |
| Image and game assets | `create-game-assets` | Add `impeccable` only for placement and presentation in actual UI |
| Small feature prototype | `prototype-fast` | Add the relevant domain Skill; do not use a prototype to justify replacing runtime |
| Measured performance problem | `performance-optimization` | Use `impeccable optimize` only for front-end presentation/perceived performance concerns |

- For combined UI work, **first** establish YoruBay's existing interactions and data/state contracts with `game-ui-ux`; **then** use `impeccable` for design review. Do not let either Skill independently overwrite the other's area of responsibility.
- Prefer one focused review per phase. Existing Playwright runs, screenshots, geometry records, and CI are evidence; avoid repeating equivalent audits with no distinct question.
- Do not edit vendored upstream Skill files just to coordinate them. Keep any repo-specific cross-Skill rules here and in `.agents/skills/README.md`.

## Verification and execution boundaries

- Keep UI changes scoped; verify relevant Chromium/Firefox/WebKit tests, desktop/mobile viewports, keyboard/focus/overlay behavior, theme contrast, and affected screenshot evidence. Report what was run; browser viewport simulation is **not** physical Android/iPhone keyboard validation.
- `.codex/hooks.json` comes from Impeccable. Its local execution/trust is controlled by the developer's Codex environment; simply storing it in GitHub does not imply Hooks or downloaded executables have run on Windows.
- Do not run optional asset-generation scripts, alter production infrastructure, deploy, or merge solely because a Skill suggests doing so. Follow the explicit user request and normal review/CI process.

## Cross-PR correctness and completion

- Before proposing a PR, inspect the full diff and list directly affected and connected domains. Changes to story memory, revision, branches/rollback, state/status, API/provider routing, storage and billing can affect other tools even when modified file paths do not overlap.
- Consult scripts/pr-regression-gate.cjs and docs/pr-regression-contract.md for executable checks; never claim a subsystem was verified just because AGENTS.md or an AI prompt required it.
- Report actual CI job results, failed/skipped/pending checks, unverified surfaces and rollback strategy. The regression-impact job adds cross-feature checks but does not replace Core tests or Playwright.
- A handoff must distinguish source changed, tests passed, PR merged, production deployed and production smoke verified. These are separate observable events.
