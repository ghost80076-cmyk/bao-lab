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
