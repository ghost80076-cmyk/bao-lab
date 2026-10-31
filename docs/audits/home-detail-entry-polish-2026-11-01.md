# YoruBay · Home → work detail reading-entry polish · 2026-11-01

## Baseline and evidence

Started from `main` at `958d30d661ec100cf763e4502a4ab7de2078ff1d`, after merged #894. Existing completed reviews: `docs/audits/full-journey-ux-2026-10-29.md`, `docs/audits/ui-polish-alignment-2026-10-31.md`. Respect `AGENTS.md`, the game-ui-ux interaction boundary, Impeccable visual principles, and `docs/yorubay-visual-direction-audit.md`.

Previous Journey visual evidence for `390-01-home` shows the new-player Explore action already visible at y≈420px (390×900), so no arbitrary hero shrinking is justified. The `390-05-work-detail` capture shows the back link and portrait occupying most of the first viewport, with the work's start control not visible. On desktop, the first Start action is already visible at 1440px. These captures are browser evidence, not real iOS/Android hardware.

## Scope and rationale

- Home: Preserve the new-player cinematic hero and Explore-first order. When `#home-continue` is actually visible, show that existing action as the primary lamplight action *before* Explore; retain both handlers, button nodes, user text, local save/continue logic and beginner guide. Accomplished via scoped CSS `:has(#home-continue:not(.hidden))` without creating a duplicate CTA.
- Detail: Preserve the real cover without cropping, title, original description, quote, tags, content rating and the original `#detail-start` handler. On <=700px use a compact, contained poster and present the original Start / beginner guide / supported-mode text immediately after the title, with full editorial description, quote and tags still below. Give the existing back button a comfortable 44px hit area. Desktop remains unchanged.
- Respect first-party scope: no changes to authored story HTML, content catalog, Story/Stage, BYOK, memory, account, pricing, Worker, APIs, navigation handlers or storage schema.
- Existing responsible style owners: `css/bao-cinematic-home.css` (Home) and the intentionally late `css/bao-editorial-cinema.css` (Detail). Bump their loader query versions rather than injecting another stylesheet.

## Verification and follow-up

- `tests/e2e/editorial-visual.spec.cjs`: 320×568, 390×844, 1280×900 test new/returning home CTA presentation, detail cover height/ordering, back target, no horizontal overflow and actual Start → builder transition. Existing editorial test continues to verify home poster/captions, discover → preview → detail and bookshelf continuity. Screenshots `test-results/editorial/home-detail-entry-*.png`.
- Require full PR CI (particularly BAO editorial review, Fast Browser E2E and Journey visual audit) and inspect changed-surface screenshots before merge.
- Browser viewport simulations do not prove iOS/Android soft-keyboard performance. Multiple first-party appearance themes should be confirmed in screenshot/visual QA, and existing specialized character detail variants may keep their own presentation.
- Do not automatically merge or deploy as part of this polish PR.
