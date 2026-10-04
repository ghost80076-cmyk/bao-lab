# Credits Worker architecture boundaries

This file is the refactor map for `workers/bao-lab-credits-api/worker.js`.

The current Worker is intentionally kept as a **single deployable file** because the present operational flow still supports single-file Cloudflare deployment. Refactors must preserve that constraint until deployment is automated for a multi-module Worker.

The goal is therefore **behavior-preserving separation first, physical file extraction later**.

## Named boundaries now in place

The single file now exposes explicit, frozen module-shaped boundaries. The boundary registry is enforced by `tests/worker-architecture-boundaries-core.cjs`.

| Responsibility | Named boundaries |
| --- | --- |
| HTTP, crypto and sessions | `WorkerHttp`, `WorkerCrypto`, `WorkerSessionAuth` |
| Account input and runtime configuration | `WorkerAccountValidation`, `WorkerRuntimeConfig`, `WorkerChatInput`, `WorkerAccountRateLimit` |
| Account routes | `WorkerAccountAuth`, `WorkerAccountSelfRoute`, `WorkerAccountAuthorRoutes` |
| Models, providers and controls | `WorkerModelPricing`, `WorkerProviderRouting`, `WorkerProviderControl`, `WorkerProviderTransport` |
| Publication and author identity | `WorkerPublicationFormat`, `WorkerAuthorProfilePublication`, `WorkerAuthorOwnership`, `WorkerGithubPublicationTransport` |
| Admin routing | `WorkerAdminAuth`, `WorkerAdminProviderControlRoutes`, `WorkerAdminPublicationRoutes`, `WorkerAdminUsageRoutes`, `WorkerAdminPlayerDirectoryRoutes`, `WorkerAdminPlayerMutationRoutes`, `WorkerAdminRoutes` |
| Chat settlement and dispatch | `WorkerLegacyChatSettlement`, `WorkerCostChatSettlement`, `WorkerChatDispatch` |

These are architectural seams, not separately deployed modules. Existing function aliases remain available inside `worker.js` so call sites and behavior stay unchanged.

## Completed structural sequence

The behavior-preserving isolation sequence is complete for the current top-level helper groups:

1. HTTP, crypto, session and account validation primitives.
2. Runtime environment parsing, model pricing and chat input validation.
3. Account authentication, current-account and author-account routes.
4. Provider routing, provider controls and provider transport.
5. Publication formatting, author ownership and GitHub PR transport.
6. Admin authorization and route families.
7. Legacy and USD-wallet chat settlement plus top-level chat dispatch.

Each boundary was merged independently after its contract tests and the repository-wide required workflows passed. Physical extraction was deliberately not included.

## Remaining work

- Automate Cloudflare Worker module-graph deployment and document rollback before extracting files.
- Consolidate the browser catalog and the unknown production Worker base allowlist into a single model registry. Versioned deltas now generate one validated Cloudflare/AWS deployment plan, but cannot safely replace the external production base.
- Promote the guarded content-only production workflow from manual dispatch to automatic deployment only after a supervised credentialed run has passed.

## Non-negotiable compatibility rules

Structural refactors must not change:

- public request paths;
- response JSON shapes;
- session cookie name or security attributes;
- D1 table/column meaning;
- model IDs or provider routing decisions;
- wallet balances or settlement calculations;
- GitHub publication mode (PR-only);
- author ownership/public identity separation;
- CORS origin allowlist behavior;
- current single-file deployment until multi-module deployment is explicitly automated.

## Pull request size rule

Worker cleanup should be delivered in small PRs with **one responsibility boundary per PR**.

A structural PR should not also:
- add a new provider;
- change pricing;
- alter account UX;
- modify D1 schema;
- change player-facing copy;
- change publication policy.

If a behavioral change is needed, it should follow as a separate PR after the structural refactor is merged and green.

## Exit condition for multi-file extraction

Physical extraction from `worker.js` into modules should begin only when all of the following are true:

1. Cloudflare deployment is automated for module graphs.
2. The deployment path no longer depends on copying one Worker file manually.
3. Core security, auth, billing and provider-routing contracts have automated coverage.
4. A rollback path to the previous single-file Worker is documented.

Until then, the project can reduce technical debt by clarifying boundaries, consolidating tests and isolating pure functions without changing deployment mechanics.

### Current status

| Exit condition | Status |
| --- | --- |
| Automated Cloudflare module-graph deployment | Blocked: the guarded workflow currently replaces only the single-file module content |
| Deployment independent of dashboard copy/paste | Prepared: manual GitHub workflow awaits a supervised credentialed run |
| Security, auth, billing and provider contract coverage | In place for the current named boundaries |
| Documented rollback for a module deployment | Partial: Cloudflare Worker Versions covers the single-file workflow; multi-module rollback remains blocked |

Therefore `worker.js` must remain the production-compatible single-file artifact. A GitHub merge is source control only and must not be described as a Cloudflare production deployment.
