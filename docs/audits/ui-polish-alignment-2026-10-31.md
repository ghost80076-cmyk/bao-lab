# YoruBay UI／UX — 2026-10-31 baseline and Explore polish

## Current main, before this PR

Project-local design workflow is already established:
- #871: game-ui-ux and related skills, advisory to Codex, not a site runtime.
- #873: Impeccable project-level skill, not a globally enabled hook or verified Windows runner.
- #877: AGENTS.md coordination, `game-ui-ux` for interaction contracts before Impeccable visual refinement.
- #878: four Story/Stage header touch targets fixed at 320/390px; do not duplicate it.

Experience architecture is already established:
- #850–#858: Story / Stage / Control Center, responsive Stage capabilities and single-purpose controls.
- #864–#866: author focus flow, contextual mascot guidance, real-journey audit of eight UX areas.
- #875: mobile author discovery.
- #879–#892: state/memory reliability changes; **out of scope** for purely visual PRs.

Read `AGENTS.md`, `docs/yorubay-visual-direction-audit.md`, `docs/ui-style-ownership-2026-10-18.md`, `docs/audits/full-journey-ux-2026-10-29.md`, and affected CSS/E2E tests first. The documented complete journey browser audit exists and must not be described as unperformed; physical Android/iOS soft keyboard remains a separate verification gap.

## This phase: Explore / find-a-work

Ownership: `css/explore-discovery.css` (loaded in `index.html`) for search and filters; `css/bao-editorial-cinema.css` / `js/bao-gallery-focus.js` for the existing gallery heading and late stylesheet cache load; `js/explore-discovery.js` (existing actions) remains unchanged. Poster artwork and card composition remain unchanged.

Confirmed source-level issues, distinct from the completed journey audit:
- Search input forcibly removes its own outline, while its parent has no keyboard focus affordance.
- A conditional search clear control has no guaranteed 44px hit size.
- Favorites are rendered as 34px circles (32px at <=700px) and also suppress visible focus outlines.
- Active filter chips are 30px tall; filter choices are 38px tall; mobile filter trigger is 42px.
- Search results and empty-state supporting text fall to 10–11px on phones.
- Reviewing the PR's first 390×900 Chromium journey capture shows the first poster row starts around **y=619px**: the large multi-line heading and stacked search/filter controls leave relatively little artwork in the initial viewport, contrary to the intended Poster-first discovery hierarchy.

Changes:
1. Preserve poster images, catalog/card composition, the existing search/filter logic, local favorites, preview modal and content gating.
2. Give search a visible focus-within outline; make placeholders and supporting text easier to read.
3. Enlarge **actual** hit boxes for clear, favorite, filter trigger/choices/active chips to >=44 CSS px; provide visible keyboard focus styling.
4. Allow narrow badge rows to wrap beside the larger favorite control instead of hiding image badges or overlaying the favorite.
5. Keep the mobile Explore heading editorial but more compact, and keep search + filter on one row at 390px while stacking at <=360px. This improves artwork visibility without hiding category, import, or search functions. Update the existing cinema style owner and loader cache version rather than appending a competing override.
6. Bump stylesheet cache versions, without adding a new cascade layer.
7. Extend Playwright at 320×568, 390×844, 1180×820 to check action geometry, focus, favorite toggling, filter selection, badge separation, horizontal overflow, and screenshot evidence.

These sizes are product touch comfort targets, **not claims of WCAG violations**. Do not change the authored character HTML/JS sandbox, BYOK, storage schema, memory pipeline, model calls, mobile Story shell or Stage renderer.

## Verification / sign-off boundary

- Static code review and existing audits establish what changed; the Impeccable local binary/context and real browser screenshot execution are not available to this GitHub-only editing session.
- Require the PR's existing Playwright/CI jobs (including the modified Explore suite), inspect failure logs/artifacts and correct regressions before merge.
- Browser viewports are not physical iOS/Android devices. Physical keyboard/gesture acceptance remains open and is not introduced as a false blocker for unrelated Explore changes.
- Do not claim rollout or production deployment until explicitly performed.

## Recommended order after this focused PR

1. **Home + work detail**: hero/featured poster, one clear continue/start action, desktop/mobile content hierarchy, five-theme contrast. Evidence: journey captures 01/05 and new visual snapshots, not speculative rework.
2. **Story + Stage**: long-form reading contrast/measure and control chrome across 820/821, 1080/1081, 1279/1280, 1429/1430; avoid modifying new memory logic or authored work styles.
3. **Creator + Control Center**: reduce competing tool emphasis, confirm label clarity, focus/empty/long-form states without changing existing handlers.
4. **Final responsive visual QA**: compare 320/390/820/1280/1440, keyboard focus, themes, screenshot review and physical-device manual checklist. Only consolidate CSS with selector/cascade evidence.

Each phase is a separate reviewable PR with scoped ownership, screenshots, functional regression, and no automatic merge.
