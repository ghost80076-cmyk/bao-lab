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
