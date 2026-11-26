# YoruBay production model catalog rollout

The single source of truth is `data/presets/models.json`. Neither modifying the
file nor merging a PR automatically changes Cloudflare Worker model bindings or
the AWS relay's `OPENROUTER_MODELS` process environment.

## Safe rollout (maintainer only)

1. Review/merge the model catalog PR into `main` once all checks pass.
2. Actions → **Coordinated production model registry sync** → Run workflow on
   **main**, mode `dry-run`. Read the `REVIEWED_MAIN_SHA`, AWS
   `CURRENT_SHA256`, `ALIGNED`, and the Cloudflare binding plan. Investigate
   unexpected differences before applying.
3. On the **same reviewed main SHA**, launch mode `apply`, entering:
   - `expected_commit_sha` = the complete `REVIEWED_MAIN_SHA`.
   - `expected_current_sha256` = exact `CURRENT_SHA256` from the fresh dry-run.
   - `confirmation` = `APPLY_REGISTRY_MODEL_BINDINGS`.
4. The workflow updates the AWS relay first, verifies live systemd process
   environment, then deploys a strict-inherit Cloudflare Worker version. The
   Cloudflare deploy performs its own live registry audit and automatic version
   rollback on post-deploy verification failure. If the Cloudflare step fails,
   the workflow compensates by rolling AWS back to the previously running list.
5. Run the production model audit / AWS relay audit again and verify a normal
   hosted request for the newly enabled model. A paid live request is **not**
   part of the automated workflow.

## Safety boundaries

- The AWS step runs through the existing short-lived GitHub OIDC role and SSM;
  it never commits, logs or transfers a relay API key.
- It owns only `95-yorubay-model-registry.conf` and
  `95-yorubay-model-registry.env` in the systemd service override directory.
  No existing systemd unit, environment file, or provider credential is edited.
- Dry-run does not change production settings. Apply refuses stale SHA values,
  malformed/duplicate model identifiers, unexpected managed files, and an
  unrecognized rollback snapshot.
- AWS restart is followed by a systemd and process-environment check. On an
  unsuccessful update it restores the prior managed files and restarts the
  previous configuration. An incomplete SSM run or failed compensation must be
  inspected manually before attempting another rollout.
- Cloudflare sync and AWS relay sync do not silently change stored story model
  IDs, players' BYOK keys, account credits, or billing rules.
- This is deliberately **not** push-triggered: prices and live model access
  require maintainer approval after PR review.
- A service health check here validates `systemctl is-active` and the live
  process allowlist. It does not prove the upstream provider will successfully
  answer a paid inference request.

## Cloudflare per-binding text capacity (2026-11-26)
- One `plain_text` model JSON binding is limited to roughly 5.1 KB by Cloudflare.
- `build-model-deployment-plan.cjs` now fails at 5000 UTF-8 bytes per binding, before a real AWS or Cloudflare update.
- The new GLM-5.2, DeepSeek V4.1, Gemini 4 Hydrogen and Neon entries have been rebalanced to the existing `MODELS_JSON` binding. The two new GPT-6 hosted models remain in `MODELS_JSON_EXTRA`.
- This rebalancing does not remove model IDs, alter billing rates, change Worker runtime code, or modify credentials.
- If apply fails following a completed AWS update, verify automatic AWS compensation before rerunning.
- After merging a capacity repair, run a **new main dry-run** and use its fresh `REVIEWED_MAIN_SHA` and `CURRENT_SHA256`. Never reuse values from a prior commit.

## Live Worker source parity gate (2026-11-26)

A past coordinated apply failed after updating AWS because Cloudflare returned
`candidate Worker code differs from the currently deployed version`. This is
**not** a model pricing error and **not** evidence that a dashboard status
label indicates active traffic. The script's source ETag check stays enabled.

The coordinated workflow now performs a **read-only** check of the exact
100%-deployed Worker version **before** any AWS update. The auditor calls
Cloudflare's version-specific `GET /workers/workers/{name}/versions/{id}?include=modules`
and compares SHA-256 of each deployed module with the reviewed GitHub
`deployment-manifest.json` module contents. Only module names and 12-char
digest prefixes are printed for mismatches, never source or secret values.

If the check fails:
- Do not run `apply` again or overwrite the live Worker.
- Inspect the listed differing/missing/unexpected module names. Check whether
  there is a production-only hotfix; preserve it before considering code deploy.
- If all live module bytes match but the Cloudflare upload ETag still differs,
  investigate Cloudflare version canonicalization/metadata. Keep the ETag gate
  until that path is safely proven.
- Cloudflare's *latest uploaded* version may be different from the active
  deployment. Only compare against the single version receiving 100% traffic.

Cloudflare docs: https://developers.cloudflare.com/api/typescript/resources/workers/subresources/beta/subresources/workers/subresources/versions/methods/get/

The read-only parity gate can return a non-success status when the endpoint
is not accessible; this intentionally fails closed without changing production.
