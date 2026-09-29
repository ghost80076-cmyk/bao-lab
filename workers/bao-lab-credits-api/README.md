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


## Hosted model catalog rollout

The browser catalog and the two server allowlists must be updated together. A model is not production-ready until all three layers agree:

1. `js/credits-pilot.js` exposes the YoruBay hosted preset.
2. Cloudflare `MODELS_JSON` allows the same `provider + model` and has reviewed pricing.
3. AWS-relayed players have the same OpenRouter model in `OPENROUTER_MODELS`.

The prioritized September 2026 player-facing catalog adds these paid OpenRouter routes:

- `deepseek/deepseek-v4-flash-0731`
- `qwen/qwen3.7-flash`
- `xiaomi/mimo-v2.5`
- `minimax/minimax-m3`

Player-facing Google official routes are:

- `gemini-3-flash-preview`
- `gemini-3.1-pro-preview`

Player-facing OpenRouter high-end routes are:

- `anthropic/claude-sonnet-4.5`
- `anthropic/claude-sonnet-4.6`
- `anthropic/claude-opus-4.6`

The following previously exposed YoruBay Hosted presets are intentionally removed from the player-facing catalog:

- `openrouter/free` — reserved for a separate future Discord mascot/support-assistant backlog rather than normal RP usage
- `gemini-3.1-flash-lite`
- `google/gemini-3.1-pro-preview`
- `anthropic/claude-opus-4.5`

The Worker may retain compatibility code for some removed routes, but the browser must not advertise them as YoruBay Hosted choices.

For the current OpenRouter pricing snapshot already tracked in `data/presets/models.json`, the new Worker `MODELS_JSON` entries should use the same reviewed rates before rollout. Do not assume the browser labels are a billing source of truth; re-check OpenRouter pricing when production configuration changes.

Example AWS relay allowlist after the expansion:

```text
OPENROUTER_MODELS=deepseek/deepseek-v4-flash-0731,qwen/qwen3.7-flash,xiaomi/mimo-v2.5,minimax/minimax-m3,anthropic/claude-sonnet-4.5,anthropic/claude-sonnet-4.6,anthropic/claude-opus-4.6
```

`openrouter/free` is not part of the player-facing Hosted catalog in this rollout. Its existing Worker compatibility behavior can remain until the separate Discord-assistant design is implemented.

## OpenRouter cost guard and long-context pricing

YoruBay Hosted must not depend on an operator manually noticing every upstream price change.

The Worker now treats `MODELS_JSON` as both an allowlist and a **pre-request safety contract**:

1. estimate the request input before sending it;
2. choose the standard or configured long-context pricing tier;
3. reserve Wallet balance against the configured OpenRouter hard ceiling;
4. send OpenRouter `provider.max_price` so an unexpectedly expensive provider is rejected before inference;
5. settle the successful request from OpenRouter's returned `usage.cost`;
6. refund unused reservation when the real cost is lower.

OpenRouter documents `provider.max_price.prompt` and `provider.max_price.completion` in USD per 1M tokens. If all available providers exceed the ceiling, OpenRouter should fail the request instead of silently spending above the configured limit.

### MODELS_JSON fields

Existing fields remain valid:

```json
{
  "provider": "openrouter",
  "model": "example/model",
  "input_microusd_per_million": 100000,
  "output_microusd_per_million": 200000,
  "cache_read_microusd_per_million": 50000,
  "cache_write_microusd_per_million": 125000
}
```

Optional hard-ceiling fields:

```json
{
  "openrouter_max_prompt_microusd_per_million": 150000,
  "openrouter_max_completion_microusd_per_million": 300000
}
```

If these are omitted, the Worker uses the active configured input/output pricing rates as the OpenRouter `max_price` ceiling. This is intentionally fail-closed: a provider price increase may temporarily make the request unavailable, but should not silently turn into an owner-funded overage.

Optional long-context tier:

```json
{
  "long_context_threshold_tokens": 200000,
  "long_context_input_microusd_per_million": 200000,
  "long_context_output_microusd_per_million": 400000,
  "long_context_cache_read_microusd_per_million": 100000,
  "long_context_cache_write_microusd_per_million": 250000,
  "long_context_openrouter_max_prompt_microusd_per_million": 250000,
  "long_context_openrouter_max_completion_microusd_per_million": 500000
}
```

The threshold and tier values are per-model configuration. Do not assume every provider or model uses a 200K boundary.

The current YoruBay Hosted transport still limits normalized prompt payloads to `MAX_PROMPT_BYTES = 96_000`, so a 200K-token tier is not normally reachable today. Tier support is added now so future context-window expansion cannot silently invalidate Wallet reservation logic.

### AWS relay requirement

Selected AWS-routed OpenRouter players must receive the same hard ceiling as direct Worker -> OpenRouter traffic.

The Worker now sends this extra field to `AWS_RELAY_URL/v1/chat`:

```json
{
  "provider": "openrouter",
  "model": "anthropic/claude-sonnet-4.6",
  "messages": [{"role":"user","content":"..."}],
  "max_output_tokens": 2048,
  "openrouter_provider": {
    "max_price": {
      "prompt": 3,
      "completion": 15
    }
  }
}
```

The EC2 relay must validate `openrouter_provider.max_price` as non-negative finite numbers and forward it to OpenRouter as the request body's `provider` object. Until the relay does this, AWS-routed OpenRouter requests do **not** have the upstream hard-price guarantee and PR #61 must remain Draft.

Do not accept arbitrary browser-supplied provider routing. The browser never sends this field; the Worker derives it from the server-side `MODELS_JSON` entry.


## Admin provider control

The authenticated `admin-wallet.html` page can manage two owner-side concerns without exposing them to players:

1. **Provider balance anchors** for `gemini` and `openrouter`.
   - The admin enters the provider's current real balance in USD and a low-balance warning threshold.
   - The Worker stores that balance together with the cumulative YoruBay USD-billing spend at that moment.
   - Future estimated remaining balance is calculated as `anchor balance - YoruBay provider spend since the anchor`.
   - This is an internal estimate, not a live query to Google or OpenRouter. Re-anchor whenever the upstream account is topped up or manually adjusted.

2. **Hosted Gemini route overrides**.
   - `gemini-3-flash-preview` and `gemini-3.1-pro-preview` default to the existing Google Gemini route.
   - The admin can switch either logical model to its OpenRouter equivalent.
   - Players keep the same YoruBay model choice and story settings; the Worker resolves the actual upstream server-side.
   - If a saved override is no longer permitted by `MODELS_JSON`, the Worker falls back to the existing Google route instead of sending an unpriced request.

The control tables are created lazily after an authenticated admin request:

- `hosted_route_overrides`
- `provider_balance_anchors`

Admin endpoints:

- `GET /admin/provider-control`
- `POST /admin/provider-control/route`
- `POST /admin/provider-control/balance`

All three require `Authorization: Bearer <ADMIN_TOKEN>`.

### OpenRouter Gemini prerequisite

The OpenRouter route can only be selected when the Worker `MODELS_JSON` already contains a reviewed pricing entry for the matching provider/model pair:

```json
[
  {
    "provider": "openrouter",
    "model": "google/gemini-3-flash-preview"
  },
  {
    "provider": "openrouter",
    "model": "google/gemini-3.1-pro-preview"
  }
]
```

Real pricing fields must also be present in production. The admin page deliberately marks an unconfigured route unavailable rather than bypassing the server-side allowlist.

This control is separate from BYOK. A player using their own Google Gemini or OpenRouter API key continues to call their selected provider directly and is not affected by the YoruBay Hosted route override.

## Admin character publication

The existing `ADMIN_TOKEN` also protects the character publication endpoints:

- `GET /admin/characters/publish-status`
- `POST /admin/characters/publish-pr`

Publication is intentionally **pull-request only**. The Worker creates a new branch and GitHub PR; it never writes directly to `main`.

Community publication is stored for scale:

- character JSON: `data/characters/community/<hash-bucket>/<id>.json`
- cover: `assets/community/<hash-bucket>/<id>.<webp|png>`
- browse catalog: bounded 48-item pages under `data/character-catalog/community/`
- manifest: `data/character-catalog/community/manifest.json`

The browser loads only the newest community catalog page initially; older pages are fetched only when the player requests more works. Full character JSON is still fetched only when the player opens that work.

Required Worker secret:

- `GITHUB_TOKEN` — use a fine-grained GitHub personal access token scoped only to `ghost80076-cmyk/bao-lab`, with **Contents: Read and write** and **Pull requests: Read and write**.

Optional Worker variables:

- `GITHUB_REPO` — defaults to `ghost80076-cmyk/bao-lab`.
- `GITHUB_BASE_BRANCH` — defaults to `main`.

Do not put `GITHUB_TOKEN` in the browser, Pages environment, localStorage, or the admin HTML. The browser sends only the parsed publication payload through the existing admin Worker connection.

The endpoint requires explicit rights confirmation, rejects duplicate published IDs, strips `preserved_source`, redacts credential-like object fields, limits card/cover sizes, validates PNG/WebP signatures, and removes the temporary branch if PR creation fails. BAO-native `meta`, `content`, `gameplay`, and `presentation` extension fields are preserved so later platform features can evolve without republishing every card.

