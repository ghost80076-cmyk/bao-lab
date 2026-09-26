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


## Selected-player OpenRouter AWS routing

The Worker supports an optional comma-separated environment variable:

`AWS_OPENROUTER_PLAYERS`

Entries may be a player's internal `id`, stable `public_id`, or `username` (matching is case-insensitive).

When a matched player requests an allowed `openrouter` model, the Worker sends the request to the existing AWS relay at `AWS_RELAY_URL/v1/chat` using `BAO_INTERNAL_TOKEN`. The relay is expected to accept:

```json
{
  "provider": "openrouter",
  "model": "google/gemini-3.1-pro-preview",
  "messages": [{"role":"user","content":"..."}],
  "max_output_tokens": 2048
}
```

Unmatched players continue to call OpenRouter directly from the Worker with `OPENROUTER_API_KEY`.

This switch is server-side only: the browser cannot choose the route. Model allowlisting and Wallet settlement remain in the Worker, and the AWS relay returns the raw OpenRouter response so existing `usage.cost` settlement continues to work.


## OpenRouter free-model Wallet behavior

The cost-USD billing path supports zero-priced models. When a model is configured with zero input/output rates and OpenRouter reports `usage.cost = 0`:

- the Worker creates the usage record but reserves **$0** from the player's Wallet;
- a successful request settles at **$0** and leaves the Wallet balance unchanged;
- the player still needs an enabled YoruBay Wallet/account;
- if the upstream unexpectedly reports a non-zero `usage.cost`, the existing actual-cost settlement path applies instead of silently treating it as free.

Example `MODELS_JSON` entry for the OpenRouter free router:

```json
{
  "provider": "openrouter",
  "model": "openrouter/free",
  "input_microusd_per_million": 0,
  "output_microusd_per_million": 0,
  "cache_read_microusd_per_million": 0,
  "cache_write_microusd_per_million": 0
}
```

For players routed through the AWS OpenRouter relay, also add `openrouter/free` to the relay's `OPENROUTER_MODELS` allowlist before enabling the preset in production.
