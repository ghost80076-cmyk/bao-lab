# Credits Worker architecture boundaries

This file is the refactor map for `workers/bao-lab-credits-api/worker.js`.

The Worker now has fifteen reviewed physical extractions. The production manifest contains the `worker.js` main module plus `modules/account-rate-limit.js`, `modules/account-validation.js`, `modules/chat-input.js`, `modules/admin-auth.js`, `modules/admin-player-directory-routes.js`, `modules/admin-player-mutation-routes.js`, `modules/admin-publication-routes.js`, `modules/admin-usage-routes.js`, `modules/author-ownership.js`, `modules/author-profile-publication.js`, `modules/publication-format.js`, `modules/github-publication-transport.js`, `modules/runtime-config.js`, `modules/crypto.js` and `modules/http.js`; every other responsibility remains in the main file. The first multi-module deployment completed a successful production rollback-and-restore rehearsal on 2026-10-04.

The goal is **behavior-preserving extraction, one low-dependency boundary at a time**.

## Named boundaries now in place

The Worker graph exposes explicit, frozen module-shaped boundaries. The boundary registry is enforced across every declared deployment module by `tests/worker-architecture-boundaries-core.cjs`.

| Responsibility | Named boundaries |
| --- | --- |
| HTTP, crypto and sessions | `WorkerHttp`, `WorkerCrypto`, `WorkerSessionAuth` |
| Account input and runtime configuration | `WorkerAccountValidation`, `WorkerRuntimeConfig`, `WorkerChatInput`, `WorkerAccountRateLimit` |
| Account routes | `WorkerAccountAuth`, `WorkerAccountSelfRoute`, `WorkerAccountAuthorRoutes` |
| Models, providers and controls | `WorkerModelPricing`, `WorkerProviderRouting`, `WorkerProviderControl`, `WorkerProviderTransport` |
| Publication and author identity | `WorkerPublicationFormat`, `WorkerAuthorProfilePublication`, `WorkerAuthorOwnership`, `WorkerGithubPublicationTransport` |
| Admin routing | `WorkerAdminAuth`, `WorkerAdminProviderControlRoutes`, `WorkerAdminPublicationRoutes`, `WorkerAdminUsageRoutes`, `WorkerAdminPlayerDirectoryRoutes`, `WorkerAdminPlayerMutationRoutes`, `WorkerAdminRoutes` |
| Chat settlement and dispatch | `WorkerLegacyChatSettlement`, `WorkerCostChatSettlement`, `WorkerChatDispatch` |

`WorkerAccountRateLimit`, `WorkerAccountValidation`, `WorkerChatInput`, `WorkerAdminAuth`, `WorkerAdminPlayerDirectoryRoutes`, `WorkerAdminPlayerMutationRoutes`, `WorkerAdminPublicationRoutes`, `WorkerAdminUsageRoutes`, `WorkerAuthorOwnership`, `WorkerAuthorProfilePublication`, `WorkerPublicationFormat`, `WorkerGithubPublicationTransport`, `WorkerRuntimeConfig`, `WorkerCrypto` and `WorkerHttp` are separately deployed modules. The remaining boundaries are still architectural seams inside `worker.js`; imported function names preserve the existing call sites and behavior.

## Completed structural sequence

The behavior-preserving isolation sequence is complete for the current top-level helper groups:

1. HTTP, crypto, session and account validation primitives.
2. Runtime environment parsing, model pricing and chat input validation.
3. Account authentication, current-account and author-account routes.
4. Provider routing, provider controls and provider transport.
5. Publication formatting, author ownership and GitHub PR transport.
6. Admin authorization and route families.
7. Legacy and USD-wallet chat settlement plus top-level chat dispatch.

Each boundary was isolated independently after its contract tests and the repository-wide required workflows passed. Physical extraction began with account validation, then chat input, followed by the isolated admin Bearer-auth boundary, publication formatting, GitHub publication transport, runtime configuration parsing, cryptographic helpers, author-profile publication, the shared HTTP/CORS boundary, account credential rate limiting, the admin publication subroutes, the read-only admin usage-history route, admin player-directory routes, admin player-mutation routes and author identity ownership. Rate-limit hashing reuses the extracted crypto boundary, while publication subroutes compose the extracted HTTP and publication modules.

## Remaining work

- Consolidate the browser catalog and the unknown production Worker base allowlist into a single model registry. Versioned deltas now generate one validated Cloudflare/AWS deployment plan, but cannot safely replace the external production base.

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
- the exact reviewed deployment manifest; no undeclared or opportunistic module moves.

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
| Automated Cloudflare module-graph deployment | Complete: the guarded workflow loads, validates and uploads `worker.js` plus the reviewed extracted modules |
| Deployment independent of dashboard copy/paste | Complete: watched Worker changes merged to `main` deploy automatically, with manual dispatch retained as a fallback |
| Security, auth, billing and provider contract coverage | In place for the current named boundaries |
| Documented rollback for a module deployment | Complete: procedure documented and the first production rollback-and-restore rehearsal passed on 2026-10-04 |

Therefore `worker.js` remains the main module while account rate limiting, account validation, chat input, admin auth, admin player directory routes, admin player mutation routes, admin publication routes, admin usage routes, author ownership, author-profile publication, publication formatting, GitHub publication transport, runtime configuration, crypto and HTTP are extracted dependencies. A GitHub merge is source control only unless it changes a path watched by `worker-production-deploy.yml`; watched changes trigger the guarded production deployment automatically.
