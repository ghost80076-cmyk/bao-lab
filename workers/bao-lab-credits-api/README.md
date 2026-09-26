# YoruBay / BAO LAB credits Worker

This directory is the version-controlled backup/reference for the production Cloudflare Worker behind `bao-lab-credits-api`.

## Production hotfix snapshot — 2026-09-26

The checked-in `worker.js` is reconstructed from the saved **YoruBay_Worker_v6.2.js** source plus the production fixes verified on 2026-09-26:

- Cloudflare upstream timeout: **75 seconds**
- AWS relay application timeout: **65 seconds**
- Gunicorn timeout on EC2: **90 seconds**
- Gemini relay/network ambiguity is recorded as `unverified` instead of `failed`
- `unverified` cost-USD requests keep the conservative reservation held instead of refunding it immediately
- explicit provider failures continue through the existing `failed` + refund path
- successful requests still settle from actual token usage

The AWS Gunicorn 90-second value is a runtime/systemd setting and is documented here; it is not configured by this Worker source.

## Important deployment rule

GitHub does **not** automatically deploy this file to Cloudflare. Treat the Cloudflare dashboard deployment as production until an explicit Worker CI/deploy workflow is introduced.

Do not commit Cloudflare/AWS secrets. Keep `ADMIN_TOKEN`, `BAO_INTERNAL_TOKEN`, provider API keys, and other credentials in their platform secret stores.

## Verification performed

After the production hotfix, D1 showed normal `ok` settlement with exact wallet arithmetic, including:

- Gemini 3.1 Flash-Lite: `994423 - 1305 = 993118`
- Gemini 3.1 Pro: `3994510 - 52104 = 3942406`

The `unverified` branch is intended for ambiguous transport/usage outcomes and should be inspected through D1 when it occurs.
