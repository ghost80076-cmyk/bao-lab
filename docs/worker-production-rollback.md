# Production Worker rollback

This runbook covers the first multi-module deployment of Cloudflare Worker
`bao-lab-credits-api`. Its reviewed graph contains `worker.js` and the pure
`modules/account-validation.js` dependency. Use this procedure both for an
incident and for the supervised first-extraction rollback rehearsal.

## Immediate rollback

1. Open Cloudflare **Workers & Pages** and select `bao-lab-credits-api`.
2. Open **Deployments**.
3. Find the most recent known-good single-file version immediately before the
   account-validation extraction, open its three-dot menu and select
   **Rollback**.
4. Confirm both production health endpoints return HTTP 200 and `"ok": true`:
   - `https://api.yorubay.com/health`
   - `https://bao-lab-credits-api.ghost80076.workers.dev/health`
5. Run `npm run audit:production-security` from a clean checkout of `main`.

Cloudflare documents that rollback creates a new active deployment from the
selected version. Connected resources and bindings are not changed by the
rollback, but old code can still be incompatible with a later data or resource
change. Structural cleanup PRs must therefore continue to avoid D1 schema and
binding changes.

Official reference:
<https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/>

## Reconcile source control

Dashboard rollback restores production availability; it does not repair
`main`. Create a focused revert PR for the faulty Worker commit. When that PR is
merged, `.github/workflows/worker-production-deploy.yml` will validate and
deploy the reverted source so GitHub and production agree again.

Do not repair a code-only regression by changing Variables, Secrets, D1,
`AUTH_RATE_LIMITER`, routes or observability settings. Those are production
configuration and remain outside the content-only deployment boundary.

## Acceptance after rollback

- `GET /health` reports `ok: true`.
- `auth_rate_limit_configured` and `public_registration_protected` remain true.
- The production security audit passes.
- The revert PR's Worker contract tests pass.
- The GitHub `Deploy production Worker` run for the revert is green.

For the supervised rehearsal, confirm the single-file rollback passes every
acceptance check above. Then select the reviewed two-module deployment from the
deployment history and use **Rollback** again to restore it. Repeat the health
and security checks. Do not extract a second boundary until both directions
have been verified.
