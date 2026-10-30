# YoruBay · Curated game-development agent skills

These files are **Codex project-local instructions**, not a runtime feature, website deployment, or global installation on the developer's PC.

- Upstream: https://github.com/gamedev-skills/awesome-gamedev-agent-skills
- Source commit: `19d93f97c9c1ea0f8b306e77aa81e0d3e352d3e9` (pinned at import)
- Upstream terms: Apache-2.0; see `UPSTREAM-LICENSE` and `UPSTREAM-NOTICE`.
- Installed: `router`, `game-ui-ux`, `visual-novel`, `create-game-assets`, `prototype-fast`, `performance-optimization`.
- Contents include local `SKILL.md` files with their bundled references, assets, scripts, and agent metadata.
- No installer ran on the user's Windows machine. Codex should discover project skills after switching to a working copy containing this commit. For missing router-selected skills, prefer the repository's existing architecture and explain the gap rather than silently installing a new engine.

## YoruBay integration guidance

YoruBay is a custom HTML/CSS/JavaScript Story Engine with a Stage Capability Resolver, safe Gameplay UI and Phone renderer; it does **not** become Godot, Unity or Phaser by installing these files.

Before implementing or changing a player-facing Stage, consult `docs/stage-capability-contract.md`, `docs/player-ui-v2.md`, `js/stage-capability-core.js`, and current tests.

- `game-ui-ux`: review mobile viewport, virtual keyboard, safe areas, focus, return paths, readable content, and overlay navigation.
- `visual-novel`: reference quality-of-life and presentation requirements for an **optional** future Visual Novel Stage; do not replace generative storytelling with fixed Ink/Yarn nodes.
- `create-game-assets`: maintain attribution/provenance, art-direction and asset acceptance; its scripts are optional local tools and must not run against player data.
- `prototype-fast`: build a narrow end-to-end demonstrator before larger Stage changes.
- `performance-optimization`: measure bottlenecks before optimizing and preserve low-motion/static fallbacks.

Do not weaken the existing constraints against untrusted author JavaScript, API-key access, prompt/memory writes, gameplay schema bypasses, or new model requests. Treat Skills as optional developer playbooks, not product authority.

No production runtime, billing, cloud deployment, website assets, or user content is modified by this import.

## Checks

Verify that Codex lists these six project skills when opening a checkout containing this PR. If Codex does not detect them, inspect its project skill discovery settings; do not assume a global Windows install. Validate any subsequent product changes in separate PRs with core and browser regressions.

## Working with Impeccable (PR #873)

- In addition to the six game-development Skills above, the project includes the independently sourced `impeccable` Skill in `.agents/skills/impeccable/` (upstream: https://github.com/pbakaus/impeccable; its own `LICENSE` and `NOTICE.md` apply). It is a **Codex development aid**, not part of YoruBay's runtime.
- Codex's repository-wide coordination rules are in [`AGENTS.md`](../../AGENTS.md). Do not modify the pinned upstream `router/SKILL.md` or `impeccable/SKILL.md` merely to add local routing advice.

### Which Skill owns what?

| Situation | Default selection | Responsibility |
| --- | --- | --- |
| Gameplay HUD/Stage/Phone screen flow, focus or UI-state contracts | `game-ui-ux` (optionally `router`) | Behavior, navigation, safe areas and contract compatibility |
| Visual hierarchy, typography, spacing, contrast, responsive presentation, first-run UX, visual review | `impeccable` | Presentation and independent critique; preserve YoruBay's established design |
| Both interaction and appearance change | `game-ui-ux` **then** `impeccable` | Settle interactions and data boundaries first, review the rendered visuals second |
| Visual Novel mode | `visual-novel` when explicitly relevant | Optional Stage-specific presentation/QoL, not a replacement for LLM-driven storytelling |

Keep Skill loading minimal. An Impeccable `audit` is not a substitute for Playwright functional regressions, and a `game-ui-ux` review is not permission to replace the site's color tokens or typography.

### Impeccable execution boundaries

The official `.codex/hooks.json` may invoke Impeccable's detector after UI edits. Whether Codex trusts/runs those Hooks on a local computer is separate from installing files in GitHub. Do not report Windows execution or Hook activation as verified without observing it. For the first combined task, prefer review-only `impeccable critique` / `impeccable audit`; require a separate, scoped implementation and tests for any fixes.

Use existing `tests/e2e/`, GitHub Actions, screenshot and geometry audits, and the relevant Stage/Phone/Reader contracts as the acceptance baseline. Real-device virtual-keyboard checks remain separate from simulated viewport tests.
