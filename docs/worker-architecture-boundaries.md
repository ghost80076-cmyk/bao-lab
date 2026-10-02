# Credits Worker architecture boundaries

This file is the refactor map for `workers/bao-lab-credits-api/worker.js`.

The current Worker is intentionally kept as a **single deployable file** because the present operational flow still supports single-file Cloudflare deployment. Refactors must preserve that constraint until deployment is automated for a multi-module Worker.

The goal is therefore **behavior-preserving separation first, physical file extraction later**.

## Current responsibilities

The Worker currently combines these responsibility groups:

| Boundary | Main responsibilities | Representative functions |
| --- | --- | --- |
| HTTP and transport | JSON responses, request size limits, CORS, response security headers | `withSecurityHeaders`, `readJsonWithLimit`, `validOrigin`, `cors` |
| Crypto and secrets | opaque token generation, hashing, password derivation and constant-time checks | `newOpaqueToken`, `sha256Hex`, `derivePasswordHash`, `constantTimeStringEqual` |
| Session and account auth | cookies, registration, login, logout, recovery, current-account lookup | `sessionTokenFrom`, `createSession`, `authRegister`, `authLogin`, `authLogout`, `authRecover`, `meRoute` |
| Player and wallet access | player resolution, billing mode selection, wallet fields | `playerFor`, `billingModeForPlayer` |
| Model registry and pricing | model allowlist, pricing, long-context rates, output reservation, cost accounting | `modelConfigs`, `modelAllowed`, `resolvedPricingRates`, `reservePlan`, `actualUsageCostMicrousd` |
| Provider routing | hosted route selection, Gemini / OpenRouter / Anthropic request handling | `resolveHostedRoute`, `providerCall`, `providerFailureResponse` |
| Provider controls | provider spend and administrative route controls | `ensureProviderControlTables`, `providerControlSnapshot` |
| Author ownership | account-to-author ownership and public author identity claims | `ensureAuthorOwnerships`, `claimAuthorIdentity`, `accountAuthorRoute` |
| Publication | character/profile sanitization, GitHub PR publication and catalog merging | `prepareCharacterPublication`, `prepareAuthorProfileUpdate`, `createAuthorProfilePr`, `createCharacterPublicationPr` |
| Admin | admin authorization, player events and admin operations | `ensureAdminPlayerEvents`, `adminRoute` |
| Chat billing | raw-token and cost-based hosted chat settlement | `legacyChatRoute`, `costUsdChatRoute`, `chatRoute` |

## Refactor order

The safe order is:

1. **HTTP helpers**
   - Keep signatures unchanged.
   - No database access.
   - No provider access.
   - No business rules.

2. **Crypto helpers**
   - Preserve current algorithms and parameters.
   - Password hashing and session-token hashing are security contracts and must keep regression coverage.

3. **Model/pricing helpers**
   - First separate pure lookup/calculation functions from environment reads.
   - Do not change model IDs, rates or long-context thresholds during structural refactors.

4. **Publication helpers**
   - Keep sanitization and GitHub PR creation behavior identical.
   - Author ownership checks stay outside publication formatting.

5. **Author ownership**
   - Separate ownership persistence from public author profile representation.
   - Never expose account/player identifiers through public author responses.

6. **Provider routing**
   - Split route selection from provider payload construction.
   - Keep Gemini / OpenRouter / Anthropic failure semantics unchanged.

7. **Auth/session**
   - Move only after the security contract tests are in place.
   - Cookie flags, password derivation, token hashing and session expiry are frozen behavior during the refactor.

8. **Admin and chat settlement last**
   - These touch the broadest set of state and money-related behavior.
   - They must not be combined with unrelated cleanup.

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
